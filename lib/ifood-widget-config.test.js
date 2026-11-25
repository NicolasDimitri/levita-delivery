import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWidgetConfig } from './ifood-widget-config.js';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function supabase({ user = { id: 'user' }, role = 'admin', profileError = null } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({
      data: { role }, error: profileError,
    }) }) }) }),
  };
}

test('returns configured store IDs only to authenticated administrators', async () => {
  const req = { method: 'GET', headers: { authorization: 'Bearer token' } };
  const res = response();
  await getWidgetConfig(req, res, supabase(), ' store-one, store-two , ');
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.body, { merchantIds: ['store-one', 'store-two'] });

  for (const [client, status] of [[supabase({ user: null }), 401], [supabase({ role: 'driver' }), 403]]) {
    const denied = response();
    await getWidgetConfig(req, denied, client, 'store-one');
    assert.equal(denied.code, status);
    assert.equal(denied.body.merchantIds, undefined);
  }
});

test('rejects invalid configuration and methods', async () => {
  const req = { method: 'GET', headers: {} };
  for (const value of ['', Array(11).fill('store').join(',')]) {
    const res = response();
    await getWidgetConfig(req, res, supabase(), value);
    assert.equal(res.code, 503);
  }
  const res = response();
  await getWidgetConfig({ ...req, method: 'POST' }, res, supabase(), 'store');
  assert.equal(res.code, 405);
});
