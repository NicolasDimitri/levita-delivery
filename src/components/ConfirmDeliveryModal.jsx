// src/components/ConfirmDeliveryModal.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

async function callApi(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Erro na requisição');
  return json;
}

export default function ConfirmDeliveryModal({ order, onClose, onConfirmed }) {
  const [hasStoredCode, setHasStoredCode] = useState(false);
  const [checkingStoredCode, setCheckingStoredCode] = useState(true);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    callApi(`/api/ifood/order-meta?orderId=${order.id}`, { method: 'GET' })
      .then((res) => setHasStoredCode(res.hasStoredCode))
      .catch(() => setHasStoredCode(false))
      .finally(() => setCheckingStoredCode(false));
  }, [order.id]);

  async function handleConfirm({ useStoredCode }) {
    setLoading(true);
    setError('');
    try {
      const result = await callApi('/api/ifood/verify-delivery', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, code: useStoredCode ? undefined : code, useStoredCode })
      });

      if (!result.valid) {
        setError('Código incorreto. Peça o código novamente ao cliente.');
        setLoading(false);
        return;
      }

      onConfirmed();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">Confirmar entrega</h2>
        <p className="mb-4 text-sm text-gray-500">Pedido de {order.customer_name}</p>

        {checkingStoredCode && <p className="text-sm text-gray-400">Verificando...</p>}

        {!checkingStoredCode && hasStoredCode && (
          <button
            onClick={() => handleConfirm({ useStoredCode: true })}
            disabled={loading}
            className="mb-3 w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? 'Confirmando...' : 'Confirmar entrega sem código'}
          </button>
        )}

        {!checkingStoredCode && hasStoredCode && (
          <p className="mb-3 text-center text-xs text-gray-400">ou digite um novo código abaixo</p>
        )}

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium">Código de confirmação do cliente</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Peça o código ao cliente"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => handleConfirm({ useStoredCode: false })}
            disabled={loading || !code}
            className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? 'Confirmando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
