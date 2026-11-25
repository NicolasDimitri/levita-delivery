import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { adaptWebhookRequest } from '../supabase/functions/ifood-webhook/adapter.js';

test('importação reaproveita somente a correção do último pedido com endereço e coordenadas iguais', async () => {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.IFOOD_CLIENT_ID = 'test-client';
  process.env.IFOOD_CLIENT_SECRET = 'test-secret';

  const originalFetch = globalThis.fetch;
  const previous = {
    street: 'Rua das Flores', street_number: null, neighborhood: 'Centro',
    complement: null, reference: null, city: 'Campina Grande', state: 'PB',
    postal_code: '58000000', latitude: -7.23, longitude: -35.87,
    route_label: 'Rua das Flores, 123', route_latitude: -7.24, route_longitude: -35.88
  };
  let deliveryAddress;
  let inserted;
  let failPreviousLookup = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init.method || 'GET';
    if (url.hostname === 'merchant-api.ifood.com.br') {
      if (url.pathname.includes('/authentication/')) {
        return Response.json({ accessToken: 'test-token', expiresIn: 3600 });
      }
      return Response.json({
        id: 'ifood-order', customer: { id: 'customer-1', name: 'Cliente' },
        merchant: { id: 'merchant-1' }, delivery: { deliveryAddress }, items: []
      });
    }
    if (url.hostname !== 'test.supabase.co') throw new Error('Requisição inesperada');
    if (url.pathname.endsWith('/webhook_events') && method === 'GET') return Response.json(null);
    if (url.pathname.endsWith('/orders') && method === 'GET') {
      if (url.searchParams.has('ifood_order_id')) return Response.json(null);
      if (failPreviousLookup) return new Response('Banco indisponível', { status: 503 });
      return Response.json(previous);
    }
    if (url.pathname.endsWith('/orders') && method === 'POST') {
      inserted = JSON.parse(init.body);
      return Response.json({ id: 'order-1', subtotal: { id: 'ifood-order' } }, { status: 201 });
    }
    return new Response(null, { status: 201 });
  };

  try {
    const { default: handler } = await import('../api/ifood/webhook.js');
    async function send() {
      inserted = null;
      const body = JSON.stringify({ id: 'event-1', code: 'PLACED', orderId: 'ifood-order' });
      const signature = createHmac('sha256', 'test-secret').update(body).digest('hex');
      return adaptWebhookRequest(new Request('https://example.test', {
        method: 'POST', headers: { 'x-ifood-signature': signature }, body
      }), handler);
    }
    deliveryAddress = {
      streetName: previous.street, neighborhood: previous.neighborhood,
      city: previous.city, state: previous.state, postalCode: previous.postal_code,
      coordinates: { latitude: previous.latitude, longitude: previous.longitude }
    };
    assert.equal((await send()).status, 202);
    assert.equal(inserted.route_label, previous.route_label);
    assert.equal(inserted.latitude, previous.latitude);
    assert.equal(inserted.longitude, previous.longitude);
    assert.equal(inserted.route_latitude, previous.route_latitude);
    assert.equal(inserted.route_longitude, previous.route_longitude);

    deliveryAddress.coordinates.longitude = -35.88;
    assert.equal((await send()).status, 202);
    assert.equal(inserted.route_label, undefined);
    assert.equal(inserted.route_latitude, undefined);
    assert.equal(inserted.longitude, -35.88);

    deliveryAddress.coordinates.longitude = previous.longitude;
    deliveryAddress.streetNumber = '456';
    assert.equal((await send()).status, 202);
    assert.equal(inserted.route_label, undefined);
    assert.equal(inserted.street_number, '456');

    delete deliveryAddress.coordinates;
    assert.equal((await send()).status, 202);
    assert.equal(inserted.route_label, undefined);

    deliveryAddress.coordinates = { latitude: previous.latitude, longitude: previous.longitude };
    failPreviousLookup = true;
    assert.equal((await send()).status, 500);
    assert.equal(inserted, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
