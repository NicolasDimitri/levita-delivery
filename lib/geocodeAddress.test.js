import test from 'node:test';
import assert from 'node:assert/strict';

test('busca endereços somente para administradores autenticados', async () => {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.ORS_API_KEY = 'geocode-key';
  const originalFetch = globalThis.fetch;
  let role = 'admin';
  let geocodeRequest;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-1' });
    if (url.pathname.endsWith('/profiles')) return Response.json({ role });
    if (url.hostname === 'api.openrouteservice.org') {
      geocodeRequest = { url, headers: init.headers };
      return Response.json({ features: [
        { properties: { label: 'Rua das Flores, 123' }, geometry: { coordinates: [-35.88, -7.24] } }
      ] });
    }
    throw new Error('Requisição inesperada');
  };
  try {
    const { default: handler } = await import('./geocodeAddress.js');
    const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { address: 'Rua das Flores, 123' } };
    const res = {
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler(req, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.results, [{ label: 'Rua das Flores, 123', latitude: -7.24, longitude: -35.88 }]);
    assert.equal(geocodeRequest.url.searchParams.get('text'), req.body.address);
    assert.equal(geocodeRequest.headers.Authorization, 'geocode-key');

    role = 'driver';
    geocodeRequest = undefined;
    await handler(req, res);
    assert.equal(res.code, 403);
    assert.equal(geocodeRequest, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
