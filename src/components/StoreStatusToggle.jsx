// src/components/StoreStatusToggle.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

async function callApi(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Erro na requisição');
  return json;
}

export default function StoreStatusToggle() {
  const [open, setOpen] = useState(null); // null = ainda não sabemos
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus() {
    try {
      const result = await callApi('/api/ifood/store-hours-status', { method: 'GET' });
      setOpen(result.allOpen);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleToggle() {
    setLoading(true);
    setError('');
    const action = open ? 'close' : 'open';
    try {
      await callApi('/api/ifood/toggle-store-hours', { method: 'POST', body: JSON.stringify({ action }) });
      setOpen(action === 'open');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleToggle}
        disabled={loading || open === null}
        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
          open ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        {loading ? 'Atualizando...' : open === null ? 'Verificando...' : open ? 'Aberto' : 'Fechado'}
      </button>
      {error && <p className="max-w-[220px] text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
