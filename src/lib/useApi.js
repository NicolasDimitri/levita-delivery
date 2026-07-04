// src/lib/useApi.js
// Hook que centraliza chamadas autenticadas à API serverless (/api/*).
// Elimina a repetição de "pegar o token + fetch + checar erro" em todos os componentes.
import { useCallback } from 'react';
import { supabase } from '../supabaseClient';

export function useApi() {
  const call = useCallback(async (path, { method = 'POST', body } = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
    return json;
  }, []);

  return { call };
}
