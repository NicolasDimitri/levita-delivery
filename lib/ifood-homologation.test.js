import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHomologationAccessToken } from './ifood-homologation.js';

function saveEnvironment() {
  const keys = ['IFOOD_MERCHANT_IDS', 'IFOOD_CLIENT_ID', 'IFOOD_CLIENT_SECRET'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  return () => keys.forEach((key) => {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  });
}

test('bloqueia a homologação quando IFOOD_MERCHANT_IDS contém mais de uma loja', async () => {
  const restore = saveEnvironment();
  try {
    process.env.IFOOD_MERCHANT_IDS = 'store-1,store-2,store-3';
    await assert.rejects(getHomologationAccessToken(), /exatamente 1 merchantId/);
  } finally {
    restore();
  }
});

test('usa as credenciais existentes quando há exatamente uma loja de teste', async () => {
  const restore = saveEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    process.env.IFOOD_MERCHANT_IDS = 'test-store';
    process.env.IFOOD_CLIENT_ID = 'test-client';
    process.env.IFOOD_CLIENT_SECRET = 'test-secret';
    globalThis.fetch = async (url, options) => {
      assert.match(url, /oauth\/token$/);
      assert.match(options.body, /clientId=test-client/);
      assert.match(options.body, /clientSecret=test-secret/);
      return { ok: true, json: async () => ({ accessToken: 'test-token', expiresIn: 3600 }) };
    };

    assert.equal(await getHomologationAccessToken(), 'test-token');
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});
