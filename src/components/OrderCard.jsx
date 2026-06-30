// src/components/OrderCard.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';

const STATUS_LABELS = {
  recebido: { label: 'Novo pedido', color: 'bg-gray-100 text-gray-700' },
  em_preparo: { label: 'Em preparo', color: 'bg-amber-100 text-amber-700' },
  a_caminho: { label: 'A caminho', color: 'bg-blue-100 text-blue-700' },
  entregue: { label: 'Entregue', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' }
};

export default function OrderCard({ order, drivers, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [error, setError] = useState('');

  const status = STATUS_LABELS[order.status] || STATUS_LABELS.recebido;

  async function callApi(path, body) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro na requisição');
    return json;
  }

  async function handleAccept() {
    setLoading(true);
    setError('');
    try {
      await callApi('/api/ifood/confirm', { orderId: order.id });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDispatch() {
    if (!selectedDriver) {
      setError('Selecione um entregador primeiro');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await callApi('/api/ifood/dispatch', { orderId: order.id, driverId: selectedDriver });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="font-semibold">{order.customer_name}</p>
          <p className="text-sm text-gray-500">
            {order.street}, {order.street_number} - {order.neighborhood}
          </p>
          {order.display_id && <p className="text-xs text-gray-400">Pedido #{order.display_id}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>{status.label}</span>
      </div>

      <ul className="mb-2 space-y-1 text-sm text-gray-700">
        {order.order_items?.map((item) => (
          <li key={item.id}>
            {item.quantity}x {item.name}
            {item.order_item_additions?.length > 0 && (
              <ul className="ml-4 list-disc text-xs text-gray-500">
                {item.order_item_additions.map((add) => (
                  <li key={add.id}>
                    {add.quantity}x {add.name}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium">Total: R$ {Number(order.total_value).toFixed(2)}</span>
        <span className="text-gray-500 capitalize">{order.payment_category}</span>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {order.status === 'recebido' && (
        <button
          onClick={handleAccept}
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? 'Aceitando...' : 'Aceitar pedido'}
        </button>
      )}

      {order.status === 'em_preparo' && (
        <div className="flex gap-2">
          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">Selecione o entregador</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleDispatch}
            disabled={loading}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? 'Enviando...' : 'Despachar'}
          </button>
        </div>
      )}

      {order.status === 'a_caminho' && (
        <p className="text-sm text-gray-500">
          Entregador: {drivers.find((d) => d.id === order.driver_id)?.name || '—'}
        </p>
      )}
    </div>
  );
}
