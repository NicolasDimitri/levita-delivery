import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordersForActiveColumn } from './activeOrders.js';

test('em preparo prioriza a previsão mais próxima e coloca previsões ausentes ou inválidas no fim', () => {
  const orders = [
    { id: 'sem-previsao', status: 'em_preparo', delivery_date_time: null },
    { id: 'mais-tarde', status: 'em_preparo', delivery_date_time: '2026-11-18T15:00:00Z' },
    { id: 'atrasado', status: 'em_preparo', delivery_date_time: '2026-11-18T10:00:00Z' },
    { id: 'invalida', status: 'em_preparo', delivery_date_time: 'invalida' },
    { id: 'mais-cedo', status: 'em_preparo', delivery_date_time: '2026-11-18T09:00:00-03:00' },
    { id: 'mesmo-horario', status: 'em_preparo', delivery_date_time: '2026-11-18T12:00:00Z' },
    { id: 'novo', status: 'recebido', delivery_date_time: '2026-11-18T08:00:00Z' }
  ];
  assert.deepEqual(ordersForActiveColumn(orders, 'em_preparo').map(order => order.id), [
    'atrasado', 'mais-cedo', 'mesmo-horario', 'mais-tarde', 'sem-previsao', 'invalida'
  ]);
  assert.equal(orders[0].id, 'sem-previsao');
});

test('outras colunas preservam a ordem original', () => {
  const orders = [
    { id: 'novo-recente', status: 'recebido', delivery_date_time: '2026-11-18T15:00:00Z' },
    { id: 'preparo', status: 'em_preparo', delivery_date_time: '2026-11-18T10:00:00Z' },
    { id: 'novo-antigo', status: 'recebido', delivery_date_time: '2026-11-18T09:00:00Z' }
  ];
  assert.deepEqual(ordersForActiveColumn(orders, 'recebido').map(order => order.id), ['novo-recente', 'novo-antigo']);
});
