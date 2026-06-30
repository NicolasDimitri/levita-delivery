// src/components/OrderCard.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import CountdownTimer from './CountdownTimer';

const STATUS_LABELS = {
  recebido: { label: 'Novo pedido', color: 'bg-gray-100 text-gray-700' },
  em_preparo: { label: 'Em preparo', color: 'bg-amber-100 text-amber-700' },
  entregue: { label: 'Entregue', color: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' }
};

export default function OrderCard({ order, drivers, onChanged }) {
  const [loadingAccept, setLoadingAccept] = useState(false);
  const [loadingDispatch, setLoadingDispatch] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(order.driver_id || '');
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
    setLoadingAccept(true);
    setError('');
    try {
      await callApi('/api/ifood/confirm', { orderId: order.id });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAccept(false);
    }
  }

  async function handleDispatchToIfood() {
    setLoadingDispatch(true);
    setError('');
    try {
      await callApi('/api/ifood/dispatch', { orderId: order.id });
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDispatch(false);
    }
  }

  // Atribuir entregador é só uma escrita direta no Supabase — não chama o
  // iFood, então não precisa passar por uma function serverless. O RLS já
  // libera isso pro admin (veja "admin acesso total a orders" no schema).
  async function handleAssignDriver() {
    if (!selectedDriver) {
      setError('Selecione um entregador primeiro');
      return;
    }
    setLoadingAssign(true);
    setError('');
    const { error: updateError } = await supabase
      .from('orders')
      .update({ driver_id: selectedDriver, assigned_at: new Date().toISOString() })
      .eq('id', order.id);

    setLoadingAssign(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged?.();
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

      {order.status === 'recebido' && (
        <CountdownTimer
          target={new Date(new Date(order.created_at).getTime() + 8 * 60 * 1000)}
          label="Tempo p/ aceitar"
        />
      )}
      {order.status === 'em_preparo' && order.delivery_date_time && (
        <CountdownTimer target={order.delivery_date_time} label="Previsão de entrega" />
      )}

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
          disabled={loadingAccept}
          className="w-full rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loadingAccept ? 'Aceitando...' : 'Aceitar pedido'}
        </button>
      )}

      {order.status === 'em_preparo' && (
        <div className="space-y-2">
          {/* Ação 1: avisar o iFood que o pedido saiu (independente do entregador) */}
          {order.ifood_dispatched_at ? (
            <p className="rounded-lg bg-gray-50 py-2 text-center text-sm text-gray-500">
              ✓ Já despachado pro iFood
            </p>
          ) : (
            <button
              onClick={handleDispatchToIfood}
              disabled={loadingDispatch}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loadingDispatch ? 'Despachando...' : 'Despachar pro iFood'}
            </button>
          )}

          {/* Ação 2: atribuir entregador (independente do despacho pro iFood) */}
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
              onClick={handleAssignDriver}
              disabled={loadingAssign}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {loadingAssign ? 'Salvando...' : order.driver_id ? 'Trocar' : 'Atribuir'}
            </button>
          </div>
          {order.driver_id && (
            <p className="text-sm text-gray-500">
              Entregador atribuído: {drivers.find((d) => d.id === order.driver_id)?.name || '—'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
