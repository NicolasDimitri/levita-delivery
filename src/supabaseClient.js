// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const frontendEnvStatus = Object.fromEntries(
  Object.entries({
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey
  }).map(([name, value]) => [name, value?.trim() ? 'defined' : 'undefined'])
);

console.info('[ENV CHECK] Frontend variables:', frontendEnvStatus);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
