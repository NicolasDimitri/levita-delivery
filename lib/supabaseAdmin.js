// lib/supabaseAdmin.js
// Cliente Supabase com a service_role key — ignora RLS.
// Usado SOMENTE dentro de /api (servidor). Nunca importe isso no /src (frontend).

import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);
