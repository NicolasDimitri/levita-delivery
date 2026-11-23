import { adaptWebhookRequest } from './adapter.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
if (!supabaseUrl) throw new Error('SUPABASE_URL não configurada');
const legacyUrl = Deno.env.get('VITE_SUPABASE_URL');
if (legacyUrl && legacyUrl !== supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL aponta para outro projeto Supabase');
}

const { default: handler } = await import('../../../api/ifood/webhook.js');

Deno.serve((request) => adaptWebhookRequest(request, handler));
