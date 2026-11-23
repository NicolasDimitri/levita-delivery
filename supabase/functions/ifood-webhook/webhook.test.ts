import { createHmac } from 'node:crypto';
import { adaptWebhookRequest } from './adapter.js';

const secret = 'test-secret';
Deno.env.set('VITE_SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
Deno.env.set('IFOOD_CLIENT_ID', 'test-client');
Deno.env.set('IFOOD_CLIENT_SECRET', secret);

let duplicate = false;
let failLookup = false;
let simulatePlaced = false;
let calls: string[] = [];

globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (simulatePlaced && url.hostname === 'merchant-api.ifood.com.br') {
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname === '/authentication/v1.0/oauth/token') {
      return Promise.resolve(Response.json({ accessToken: 'test-token', expiresIn: 3600 }));
    }
    if (url.pathname === '/order/v1.0/orders/order-1') {
      return Promise.resolve(Response.json({ id: 'order-1', displayId: '1', items: [] }));
    }
    throw new Error('Unexpected iFood request');
  }
  if (url.hostname !== 'test.supabase.co') throw new Error('Unexpected network request');
  calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
  if (simulatePlaced && url.pathname.endsWith('/orders')) {
    if (init?.method === 'GET') return Promise.resolve(Response.json(null));
    if (init?.method === 'POST') {
      return Promise.resolve(Response.json({ id: 'local-1', subtotal: { id: 'order-1' } }, { status: 201 }));
    }
  }
  if (url.pathname.endsWith('/webhook_events') && init?.method === 'GET') {
    if (failLookup) return Promise.resolve(new Response('database unavailable', { status: 503 }));
    return Promise.resolve(new Response(duplicate ? '{"id":"event-1"}' : 'null', {
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  return Promise.resolve(new Response(null, { status: 201 }));
};

const { default: handler } = await import('../../../api/ifood/webhook.js');

function request(body: string, signature = createHmac('sha256', secret).update(body).digest('hex')) {
  return new Request('https://example.test/functions/v1/ifood-webhook?token=private', {
    method: 'POST',
    headers: { 'x-ifood-signature': signature },
    body
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('validates methods, signatures and JSON before accessing the database', async () => {
  calls = [];
  const get = await adaptWebhookRequest(new Request('https://example.test'), handler);
  assert(get.status === 405, 'GET must be rejected');
  const invalidSignature = await adaptWebhookRequest(request('{}', 'wrong'), handler);
  assert(invalidSignature.status === 401, 'Invalid signatures must be rejected');
  const invalidJson = await adaptWebhookRequest(request('{'), handler);
  assert(invalidJson.status === 400, 'Invalid JSON must be rejected');
  assert(calls.length === 0, 'Invalid requests must not access the database');
});

Deno.test('processes signed KEEPALIVE events and detects duplicates', async () => {
  calls = [];
  duplicate = false;
  const body = JSON.stringify({ id: 'event-1', code: 'KEEPALIVE' });
  const response = await adaptWebhookRequest(request(body), handler);
  assert(response.status === 202, 'Valid events must be accepted');
  assert(calls.filter((call) => call === 'POST /rest/v1/ifood_webhook_attempts').length === 2, 'Attempts must be recorded');
  assert(calls.includes('POST /rest/v1/webhook_events'), 'Event must be recorded for deduplication');

  calls = [];
  duplicate = true;
  const repeated = await adaptWebhookRequest(request(body), handler);
  assert(repeated.status === 202, 'Duplicate events must be accepted');
  assert(!calls.includes('POST /rest/v1/webhook_events'), 'Duplicate events must not be inserted again');
});

Deno.test('returns an error when event lookup fails', async () => {
  calls = [];
  duplicate = false;
  failLookup = true;
  try {
    const body = JSON.stringify({ id: 'event-1', code: 'KEEPALIVE' });
    const response = await adaptWebhookRequest(request(body), handler);
    assert(response.status === 500, 'Database errors must not be acknowledged as success');
  } finally {
    failLookup = false;
  }
});

Deno.test('processes a signed PLACED event through the adapter', async () => {
  calls = [];
  duplicate = false;
  simulatePlaced = true;
  try {
    const body = JSON.stringify({ id: 'event-2', code: 'PLACED', orderId: 'order-1' });
    const response = await adaptWebhookRequest(request(body), handler);
    assert(response.status === 202, 'The order event must be accepted');
    assert(calls.includes('POST /authentication/v1.0/oauth/token'), 'iFood authentication must be requested');
    assert(calls.includes('GET /order/v1.0/orders/order-1'), 'Order details must be fetched');
    assert(calls.includes('POST /rest/v1/orders'), 'The order must be created');
    assert(calls.includes('POST /rest/v1/webhook_events'), 'The event must be recorded for deduplication');
  } finally {
    simulatePlaced = false;
  }
});
