import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderSettlement, weekFor } from './orderSettlement.js';

const order = (pending = 0, benefits = [], totalBenefits = 0) => ({
  order_total: { subTotal: 21, deliveryFee: 5, benefits: totalBenefits },
  payment_pending: pending,
  benefits_raw: benefits
});
const benefit = (merchant, ifood) => ({
  value: merchant + ifood,
  sponsorshipValues: [{ name: 'MERCHANT', value: merchant }, { name: 'IFOOD', value: ifood }]
});

test('pedido online exclui taxa de serviço e calcula comissão sobre itens e entrega', () => {
  const result = calculateOrderSettlement(order());
  assert.equal(result.gross, 2600);
  assert.equal(result.commission, 312);
  assert.equal(result.net, 2288);
  assert.equal(result.payout, 2288);
});

test('pagamento direto pode deixar saldo negativo ou positivo com incentivo iFood', () => {
  assert.equal(calculateOrderSettlement(order(26.99)).payout, -411);
  const subsidized = calculateOrderSettlement(order(2, [benefit(0, 20)], 20));
  assert.equal(subsidized.net, 2288);
  assert.equal(subsidized.payout, 2088);
});

test('pagamento misto e vários incentivos não duplicam subsídio iFood', () => {
  const result = calculateOrderSettlement(order(10, [benefit(3, 5), benefit(2, 1)], 11));
  assert.equal(result.merchant, 500);
  assert.equal(result.ifood, 600);
  assert.equal(result.net, 1788);
  assert.equal(result.payout, 788);
});

test('não estima pedidos com campos incompletos ou descontos inconsistentes', () => {
  assert.ok(calculateOrderSettlement({ ...order(), payment_pending: null }).error);
  assert.ok(calculateOrderSettlement({ ...order(), order_total: { subTotal: 21, deliveryFee: 5 } }).error);
  assert.ok(calculateOrderSettlement(order(0, [], 5)).error);
  assert.ok(calculateOrderSettlement(order(0, [benefit(2, 3)], 4)).error);
  assert.ok(calculateOrderSettlement(order(0, [{
    value: 1, sponsorshipValues: [{ name: 'EXTERNAL', value: 1 }]
  }], 1)).error);
});

test('semana é de segunda a domingo, com repasse na quarta seguinte', () => {
  assert.deepEqual(weekFor('2026-12-31'), {
    start: '2026-12-28', last: '2027-01-03', end: '2027-01-04', payout: '2027-01-06'
  });
  assert.equal(weekFor('2027-01-03').start, '2026-12-28');
  assert.equal(weekFor('2027-01-04').start, '2027-01-04');
});
