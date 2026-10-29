import { useState } from 'react';
import { ORDER_STATUS } from '../lib/constants';
import { Button, Badge, ErrorMsg } from '../lib/ui';
import { supabase } from '../supabaseClient';

export default function AvailableOrderCard({ order, activeCount, onAccepted }) {
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.recebido;
  const atCapacity = activeCount >= 3;

  async function acceptOrder() {
    setAccepting(true);
    setError('');
    try {
      const { error: acceptError } = await supabase.rpc('accept_delivery_order', {
        p_order_id: order.id
      });
      if (acceptError) throw acceptError;
      onAccepted?.();
    } catch (acceptError) {
      setError(acceptError.message || 'Não foi possível aceitar este pedido. Tente novamente.');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm text-gray-800">{order.customer_name}</p>
          <p className="text-sm text-gray-600">
            {order.route_address || [order.street, order.street_number, order.neighborhood].filter(Boolean).join(', ') || 'Endereço pendente'}
          </p>
          {order.display_id && <p className="text-xs text-gray-400">Pedido #{order.display_id}</p>}
        </div>
        <Badge color={status.color}>{status.label}</Badge>
      </div>

      <ul className="space-y-0.5 text-xs text-gray-600">
        {order.order_items?.map((item) => (
          <li key={item.id}>{item.quantity}x {item.name}</li>
        ))}
      </ul>

      <ErrorMsg message={error} />
      {atCapacity && (
        <p className="text-xs text-amber-700">Você já está com 3 pedidos ativos. Finalize uma entrega para aceitar outra.</p>
      )}
      <Button
        variant="primary"
        size="lg"
        onClick={acceptOrder}
        disabled={accepting || atCapacity}
        className="w-full"
      >
        {accepting ? 'Aceitando...' : 'Aceitar entrega'}
      </Button>
    </div>
  );
}
