import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderSettlement, weekFor } from './orderSettlement.js';

const benefit = (merchant, ifood) => ({
  value: merchant + ifood,
  sponsorshipValues: [{ name: 'MERCHANT', value: merchant }, { name: 'IFOOD', value: ifood }]
});
const order = (pending = 0, benefits = [], totalBenefits = 0) => ({
  order_total: {
    subTotal: 21, deliveryFee: 5, additionalFees: 1,
    benefits: totalBenefits, orderAmount: 27 - totalBenefits
  },
  payment_pending: pending,
  benefits_raw: benefits
});

const cases = [
  {
    name: '4359 online com entrega e dois incentivos',
    total: [42.80, 3, 0.99, 12.96, 33.83],
    benefits: [benefit(4.99, 4.97), benefit(3, 0)], pending: 0,
    commission: 454, onlineFee: 121, net: 3206, payout: 3206
  },
  {
    name: '7423 online com incentivo do iFood',
    total: [36.90, 0, 0.99, 9.96, 27.93],
    benefits: [benefit(4.99, 4.97)], pending: 0,
    commission: 383, onlineFee: 102, net: 2706, payout: 2706
  },
  {
    name: '8022 online com taxa de conveniência',
    total: [39.90, 0, 5.94, 10, 35.84],
    benefits: [benefit(5, 5)], pending: 0,
    commission: 419, onlineFee: 112, net: 2959, payout: 2959
  },
  {
    name: '7530 online com incentivo elevado do iFood',
    total: [31.90, 0, 0.99, 31, 1.89],
    benefits: [benefit(5, 26)], pending: 0,
    commission: 323, onlineFee: 86, net: 2281, payout: 2281
  },
  {
    name: '4854 online com desconto da loja',
    total: [37.90, 0, 0.99, 8, 30.89],
    benefits: [benefit(8, 0)], pending: 0,
    commission: 359, onlineFee: 96, net: 2535, payout: 2535
  },
  {
    name: '4854 na entrega com incentivo do iFood',
    total: [31.90, 0, 0.99, 12.76, 20.13],
    benefits: [benefit(4.99, 7.77)], pending: 20.13,
    commission: 323, onlineFee: 0, net: 2368, payout: 355
  },
  {
    name: '8268 na entrega com saldo negativo',
    total: [33.90, 0, 0.99, 8, 26.89],
    benefits: [benefit(8, 0)], pending: 26.89,
    commission: 311, onlineFee: 0, net: 2279, payout: -410
  },
  {
    name: '5962 na entrega sem ajuste financeiro disponível',
    total: [31.90, 0, 0.99, 8, 24.89],
    benefits: [benefit(8, 0)], pending: 24.89,
    commission: 287, onlineFee: 0, net: 2103, payout: -386
  }
];

for (const fixture of cases) {
  test(`estima pedido ${fixture.name}`, () => {
    const [subTotal, deliveryFee, additionalFees, benefits, orderAmount] = fixture.total;
    const result = calculateOrderSettlement({
      order_total: { subTotal, deliveryFee, additionalFees, benefits, orderAmount },
      payment_pending: fixture.pending,
      benefits_raw: fixture.benefits
    });
    assert.equal(result.commission, fixture.commission);
    assert.equal(result.onlineFee, fixture.onlineFee);
    assert.equal(result.net, fixture.net);
    assert.equal(result.payout, fixture.payout);
  });
}

test('não estima pedidos com campos incompletos, valores inconsistentes ou pagamento parcial', () => {
  assert.ok(calculateOrderSettlement({ ...order(), payment_pending: null }).error);
  assert.ok(calculateOrderSettlement({ ...order(), order_total: { subTotal: 21, deliveryFee: 5 } }).error);
  assert.ok(calculateOrderSettlement({
    ...order(), order_total: { ...order().order_total, additionalFees: 'inválido' }
  }).error);
  assert.ok(calculateOrderSettlement({
    ...order(), order_total: { ...order().order_total, orderAmount: 28 }
  }).error);
  assert.ok(calculateOrderSettlement(order(10)).error);
  assert.ok(calculateOrderSettlement(order(0, [benefit(0, 27)], 27)).error);
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
