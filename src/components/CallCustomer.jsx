import { useState } from 'react';
import { getCustomerPhone } from '../lib/customerPhone';

export default function CallCustomer({ order }) {
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const contact = getCustomerPhone(order, checkedAt);

  if (!contact) {
    return <p className="text-xs text-gray-500">Telefone do cliente indisponível ou expirado. Use o chat do iFood.</p>;
  }

  return (
    <div className="space-y-1">
      {contact.localizer && (
        <p className="text-xs text-gray-600">
          Quando o iFood solicitar, confirme o envio do localizador no celular. Se necessário, digite: <strong>{contact.localizer}</strong>
        </p>
      )}
      <a
        href={contact.href}
        onClick={(event) => {
          if (!getCustomerPhone(order)) {
            event.preventDefault();
            setCheckedAt(Date.now());
          }
        }}
        aria-label={`Ligar para o cliente do pedido ${order.display_id || order.id}`}
        className="block rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Ligar para o cliente
      </a>
    </div>
  );
}
