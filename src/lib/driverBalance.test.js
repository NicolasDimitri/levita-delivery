import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDriverBalance } from './driverBalance.js';

test('saldo inclui créditos, descontos e pagamentos sem perder centavos', () => {
  assert.equal(calculateDriverBalance(
    [{ valor_entrega: '230.00' }],
    [{ valor: '10.00' }],
    [{ amount: '35.00' }, { amount: '10.00' }, { amount: '7.11' }, { amount: '-2.50' }]
  ), 269.61);
});

test('saldo negativo é compensado por entregas futuras', () => {
  const adjustments = [{ amount: '-12.00' }];
  assert.equal(calculateDriverBalance([{ valor_entrega: '5.00' }], [], adjustments), -7);
  assert.equal(calculateDriverBalance([{ valor_entrega: '5.00' }, { valor_entrega: '5.00' }], [], adjustments), -2);
  assert.equal(calculateDriverBalance([{ valor_entrega: '15.00' }], [], adjustments), 3);
});

test('ajustes acrescentam diferença das entregas e reembolsos ao saldo existente', () => {
  assert.equal(calculateDriverBalance(
    [{ valor_entrega: '230.00' }],
    [],
    [{ amount: '35.00' }, { amount: '10.00' }, { amount: '7.11' }]
  ), 282.11);
});
