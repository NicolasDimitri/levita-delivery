// lib/supabaseAdmin.js
// Cliente Supabase com a service_role key — ignora RLS.
// Usado SOMENTE dentro de /api (servidor). Nunca importe isso no /src (frontend).

import { createClient } from '@supabase/supabase-js';

const serverEnvStatus = Object.fromEntries(
  Object.entries({
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    IFOOD_CLIENT_ID: process.env.IFOOD_CLIENT_ID,
    IFOOD_CLIENT_SECRET: process.env.IFOOD_CLIENT_SECRET,
    IFOOD_MERCHANT_IDS: process.env.IFOOD_MERCHANT_IDS,
    CRON_SECRET: process.env.CRON_SECRET
  }).map(([name, value]) => [name, value?.trim() ? 'defined' : 'undefined'])
);

console.info('[ENV CHECK] Server variables:', serverEnvStatus);

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);
