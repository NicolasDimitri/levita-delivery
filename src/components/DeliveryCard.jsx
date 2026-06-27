// src/components/DeliveryCard.jsx
import { useState } from 'react';
import PaymentBadge from './PaymentBadge';
import ConfirmDeliveryModal from './ConfirmDeliveryModal';

export default function DeliveryCard({ order, onChanged }) {
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fullAddress = [
    order.street && `${order.street}, ${order.street_number || ''}`,
    order.neighborhood,
    order.complement,
    order.reference && `(${order.reference})`
  ]
    .filter(Boolean)
    .join(' - ');

  async function handleCopyAddress() {
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigator.clipboard pode falhar em http (não-https) ou navegadores antigos
      alert('Não foi possível copiar automaticamente. Endereço: ' + fullAddress);
    }
  }

  // pendingValue: valor a cobrar na entrega, quando não é pago online
  const pendingValue =
    order.payment_category !== 'online' ? Number(order.payment_raw?.pending ?? order.total_value) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="font-semibold">{order.customer_name}</p>
        <p className="text-sm text-gray-600">{fullAddress}</p>
      </div>

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

      <div className="flex gap-2">
        <button
          onClick={handleCopyAddress}
          className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? 'Endereço copiado!' : 'Copiar endereço'}
        </button>
        <button
          onClick={() => setShowModal(true)}
          className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Confirmar entrega
        </button>
      </div>

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
