import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllInventoryRows, parseInventoryQuantity, submitInventoryMovement } from './inventory.js';

test('accepts positive quantities with up to three decimal places', () => {
  for (const [input, expected] of [['1', '1'], [' 1,125 ', '1.125'], ['0,001', '0.001']]) {
    assert.equal(parseInventoryQuantity(input), expected);
  }
  for (const input of ['', '0', '-1', '1,2345', '1.000,5', '1e3', '1000000000000']) {
    assert.equal(parseInventoryQuantity(input), null);
  }
});

test('loads every page and propagates query errors', async () => {
  const pages = [Array.from({ length: 1000 }, (_, id) => ({ id })), [{ id: 1000 }]];
  const ranges = [];
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (start, end) => {
            ranges.push([start, end]);
            return { data: pages.shift(), error: null };
          },
        }),
      }),
    }),
  };
  assert.equal((await fetchAllInventoryRows(client, 'inventory_items', 'id')).length, 1001);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  const failing = { from: () => ({ select: () => ({ order: () => ({ range: async () => ({ error: new Error('offline') }) }) }) }) };
  await assert.rejects(fetchAllInventoryRows(failing, 'inventory_items', 'id'), /offline/);
});

test('reconciles an uncertain response and never reports an unconfirmed operation as successful', async () => {
  const operation = { params: { p_operation: 'operation-id' } };
  const makeClient = (rpcError, lookupData, lookupError = null) => ({
    rpc: async (_name, params) => {
      assert.equal(params.p_operation, operation.params.p_operation);
      return { error: rpcError };
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lookupData, error: lookupError }) }) }) }),
  });
  assert.equal((await submitInventoryMovement(makeClient(null), operation)).status, 'success');
  assert.equal((await submitInventoryMovement(makeClient({ message: 'network' }, { id: 'operation-id' }), operation)).status, 'success');
  assert.equal((await submitInventoryMovement(makeClient({ message: 'network' }, null), operation)).status, 'unknown');
  assert.equal((await submitInventoryMovement(makeClient({ code: '23505', message: 'duplicate' }, null), operation)).status, 'unknown');
  assert.equal((await submitInventoryMovement(makeClient({ code: 'P0001', message: 'Saldo insuficiente' }, null), operation)).status, 'rejected');
  assert.equal((await submitInventoryMovement(makeClient({ code: 'P0001', message: 'rejected' }, null, { message: 'offline' }), operation)).status, 'unknown');
});
