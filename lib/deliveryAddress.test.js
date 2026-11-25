import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviousRouteAddress, getOrderNavigationAddress, getGoogleMapsDestination } from './deliveryAddress.js';

const address = {
  street: 'Rua das Flores',
  street_number: null,
  neighborhood: 'Centro',
  complement: 'Casa',
  reference: null,
  city: 'Campina Grande',
  state: 'PB',
  postal_code: '58000000',
  latitude: -7.23,
  longitude: -35.87
};

function database(previous, failure = null) {
  const calls = [];
  const query = {
    select(value) { calls.push(['select', value]); return this; },
    eq(...args) { calls.push(['eq', ...args]); return this; },
    order(...args) { calls.push(['order', ...args]); return this; },
    limit(value) { calls.push(['limit', value]); return this; },
    async maybeSingle() { return { data: previous, error: failure }; }
  };
  return { calls, from(name) { calls.push(['from', name]); return query; } };
}

test('reaproveita a correção do último pedido com o mesmo endereço e coordenadas', async () => {
  const db = database({ ...address, latitude: '-7.230', route_address: ' Rua das Flores, 123 ', corrected_latitude: -7.24, corrected_longitude: -35.88 });
  const correction = await getPreviousRouteAddress(db, 'cliente-1', address);
  assert.deepEqual(correction, { route_address: 'Rua das Flores, 123', corrected_latitude: -7.24, corrected_longitude: -35.88 });
  assert.equal(getOrderNavigationAddress({ ...address, ...correction }), correction.route_address);
  assert.equal(getGoogleMapsDestination({ ...address, ...correction }).destination, '-7.24,-35.88');
  assert.deepEqual(db.calls.slice(-3), [
    ['order', 'created_at', { ascending: false }],
    ['order', 'id', { ascending: false }],
    ['limit', 1]
  ]);
  assert.ok(db.calls.some(call => call[0] === 'eq' && call[1] === 'ifood_customer_id' && call[2] === 'cliente-1'));
});

test('não reaproveita se endereço, coordenadas ou correção anterior forem diferentes ou ausentes', async () => {
  const previous = { ...address, route_address: 'Rua das Flores, 123' };
  for (const changed of [
    { ...address, latitude: -7.23001 },
    { ...address, longitude: null },
    { ...address, street: 'Outra rua' },
    { ...address, street_number: '456' },
    { ...address, complement: 'Apartamento' }
  ]) {
    assert.equal(await getPreviousRouteAddress(database(previous), 'cliente-1', changed), null);
  }
  assert.equal(await getPreviousRouteAddress(database({ ...previous, latitude: null }), 'cliente-1', address), null);
  assert.equal(await getPreviousRouteAddress(database({ ...previous, route_address: null }), 'cliente-1', address), null);
  assert.equal(await getPreviousRouteAddress(database(null), 'cliente-1', address), null);
  const db = database(previous);
  assert.equal(await getPreviousRouteAddress(db, null, address), null);
  assert.equal(db.calls.length, 0);
});

test('falha na consulta ao pedido anterior não é ignorada', async () => {
  const failure = new Error('Banco indisponível');
  await assert.rejects(getPreviousRouteAddress(database(null, failure), 'cliente-1', address), failure);
});
