import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCustomerPhone } from './customerPhone.js';

const now = Date.parse('2026-11-24T12:00:00Z');
const order = (phone, extra = {}) => ({ subtotal: { customer: { phone } }, ...extra });

test('prepares the iFood phone with a wait and localizer, preserving leading zeros', () => {
  assert.deepEqual(getCustomerPhone(order({
    number: '0800 705 3040', localizer: '00123456', localizerExpiration: '2026-11-24T13:00:00Z'
  }), now), { number: '0800 705 3040', localizer: '00123456', href: 'tel:08007053040%3B00123456' });
  assert.equal(getCustomerPhone(order({ number: '+55 (83) 99999-9999' }), now).href, 'tel:+5583999999999');
});

test('does not offer missing, malformed, expired or incomplete contact information', () => {
  for (const phone of [
    null, { number: '0800 705 3040' }, { number: '0800 705 3040', localizer: '12#' },
    { number: '123;99999999' }, { number: '0800 705 3040', localizer: '123', localizerExpiration: 'invalid' },
    { number: '0800 705 3040', localizer: '123', localizerExpiration: '2026-11-24T12:00:00Z' },
  ]) assert.equal(getCustomerPhone(order(phone), now), null);
  assert.equal(getCustomerPhone(order({ number: '83999999999' }, {
    delivery_date_time: '2026-11-24T09:00:00Z'
  }), now), null);
});
