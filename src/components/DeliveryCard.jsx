// src/components/DeliveryCard.jsx
import { useState } from 'react';
import PaymentBadge from './PaymentBadge';
import ConfirmDeliveryModal from './ConfirmDeliveryModal';
import CountdownTimer from './CountdownTimer';
import { getOrderNavigationAddress } from '../../lib/deliveryAddress';

export default function DeliveryCard({ order, onChanged }) {
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const navigationAddress = getOrderNavigationAddress(order);
  const streetAddress = [order.street, order.street_number].filter(Boolean).join(', ');
  const locality = [
    order.neighborhood,
    [order.city, order.state].filter(Boolean).join(' - '),
    order.postal_code && `CEP ${order.postal_code}`
  ].filter(Boolean).join(', ');
  const addressLines = [
    streetAddress,
    locality,
    order.complement && `Complemento: ${order.complement}`,
    order.reference && `Referência: ${order.reference}`
  ].filter(Boolean);
  const fullAddress = addressLines.join('\n');

  async function handleCopyAddress() {
    if (!navigationAddress) return;
    try {
      await navigator.clipboard.writeText(navigationAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigator.clipboard pode falhar em http (não-https) ou navegadores antigos
      alert('Não foi possível copiar automaticamente. Endereço: ' + navigationAddress);
    }
  }

  // pendingValue: valor a cobrar na entrega, quando não é pago online
  const pendingValue =
    order.payment_category !== 'online' ? Number(order.payment_raw?.pending ?? order.total_value) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{order.customer_name}</p>
          <p className="whitespace-pre-line text-sm text-gray-600">{fullAddress || 'Endereço não informado'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          order.status === 'em_rota'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {order.status === 'em_rota' ? 'Em rota' : 'Aguardando despacho'}
        </span>
      </div>

      {order.status === 'em_rota' && order.delivery_date_time && (
        <div className="mb-3">
          <CountdownTimer target={order.delivery_date_time} label="Previsão de entrega" size="lg" />
        </div>
      )}

      <div className="mb-3">
        <PaymentBadge category={order.payment_category} value={pendingValue} />
      </div>

      <ul className="mb-3 space-y-1 text-sm text-gray-700">
        {order.order_items?.map((item) => (
          <li key={item.id}>
            {item.quantity}x {item.name}
          </li>
        ))}
      </ul>

      {order.status === 'em_rota' && <div className="flex gap-2">
        <button
          onClick={handleCopyAddress}
          disabled={!navigationAddress}
          className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? 'Endereço copiado!' : navigationAddress ? 'Copiar endereço' : 'Endereço pendente'}
        </button>
        <button
          onClick={() => setShowModal(true)}
          className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Confirmar entrega
        </button>
      </div>}

      {showModal && (
        <ConfirmDeliveryModal
          order={order}
          onClose={() => setShowModal(false)}
          onConfirmed={() => {
            setShowModal(false);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
