import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePendingEarnings, earningsForDistance, getRouteEarnings, recordDriverEarnings } from './driverRouteEarnings.js';

test('usa a distância exata nos limites de cada faixa', () => {
  for (const [meters, amount] of [[0, 5], [2500, 5], [2500.1, 6], [3500, 6], [3500.1, 7], [4500, 7], [4500.1, 8], [8845, 8]]) {
    assert.equal(earningsForDistance(meters), amount);
  }
  for (const invalid of [-1, NaN, Infinity, null, '2500']) {
    assert.throws(() => earningsForDistance(invalid));
  }
});

test('solicita rota mais curta de carro com longitude antes da latitude', async () => {
  let request;
  const result = await getRouteEarnings({ latitude: '-7.23', longitude: '-35.87' }, {
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ routes: [{ summary: { distance: 2500.1 } }] }) };
    }
  });
  assert.match(request.url, /directions\/driving-car$/);
  assert.deepEqual(JSON.parse(request.options.body), {
    coordinates: [[-35.868339, -7.224483], [-35.87, -7.23]],
    preference: 'shortest'
  });
  assert.equal(request.options.headers.Authorization, 'test-key');
  assert.deepEqual(result, { distance: 2500.1, amount: 6 });
});

test('usa o ponto corrigido para o repasse e não usa coordenadas antigas quando falta confirmação', async () => {
  let coordinates;
  const fetchImpl = async (url, options) => {
    coordinates = JSON.parse(options.body).coordinates;
    return { ok: true, json: async () => ({ routes: [{ summary: { distance: 3500.1 } }] }) };
  };
  const result = await getRouteEarnings({
    latitude: -7.23, longitude: -35.87, route_address: 'Destino corrigido',
    corrected_latitude: -7.24, corrected_longitude: -35.88
  }, { apiKey: 'test', fetchImpl });
  assert.deepEqual(coordinates, [[-35.868339, -7.224483], [-35.88, -7.24]]);
  assert.equal(result.amount, 7);
  await assert.rejects(getRouteEarnings({
    latitude: -7.23, longitude: -35.87, route_address: 'Correção antiga'
  }, { apiKey: 'test', fetchImpl }), /sem coordenadas confirmadas/);
});

test('rejeita coordenadas ausentes, chave ausente e resposta inválida', async () => {
  await assert.rejects(getRouteEarnings({ latitude: null, longitude: 0 }, { apiKey: 'x' }), /Coordenadas/);
  await assert.rejects(getRouteEarnings({ latitude: 0, longitude: 0 }, { apiKey: '' }), /ORS_API_KEY/);
  await assert.rejects(getRouteEarnings({ latitude: 0, longitude: 0 }, {
    apiKey: 'x', fetchImpl: async () => ({ ok: false, status: 429 })
  }), /HTTP 429/);
  await assert.rejects(getRouteEarnings({ latitude: 0, longitude: 0 }, {
    apiKey: 'x', fetchImpl: async () => ({ ok: true, json: async () => ({ routes: [] }) })
  }), /Distância/);
});

function fakeHistoryDb(initial = null) {
  let row = initial;
  return {
    get row() { return row; },
    from() {
      return {
        async upsert(data) {
          if (!row) row = { ...data, id: 'history-1' };
          return { error: null };
        },
        select() {
          return { eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) };
        },
        update(values) {
          return { eq: () => ({ is: async () => {
            if (row.valor_entrega === null) Object.assign(row, values);
            return { error: null };
          } }) };
        }
      };
    }
  };
}

test('falha deixa crédito pendente, nova tentativa credita uma vez e preserva histórico', async () => {
  const db = fakeHistoryDb();
  const order = { id: 'order-1', driver_id: 'driver-1' };
  const pending = await recordDriverEarnings(db, order, async () => { throw new Error('HTTP 429'); });
  assert.equal(pending.pending, true);
  assert.equal(db.row.valor_entrega, null);
  assert.equal(db.row.route_error, 'HTTP 429');
  await calculatePendingEarnings(db, order, async () => ({ distance: 3500.1, amount: 7 }));
  assert.equal(db.row.valor_entrega, 7);
  assert.equal(db.row.route_distance_meters, 3500.1);
  assert.equal(db.row.route_error, null);
  await recordDriverEarnings(db, order, async () => { throw new Error('Não deve recalcular'); });
  assert.equal(db.row.valor_entrega, 7);
  const old = fakeHistoryDb({ id: 'old', order_id: order.id, valor_entrega: 5 });
  await recordDriverEarnings(old, order, async () => { throw new Error('Não deve recalcular'); });
  assert.equal(old.row.valor_entrega, 5);
});
