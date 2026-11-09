// src/components/DeliveryCard.jsx
import { useEffect, useState } from 'react';
import PaymentBadge from './PaymentBadge';
import ConfirmDeliveryModal from './ConfirmDeliveryModal';
import CountdownTimer from './CountdownTimer';
import { buildWazeDestinationUrl, getOrderNavigationAddress } from '../../lib/deliveryAddress';
import { useApi } from '../lib/useApi';
import OrderDiscounts from './OrderDiscounts';

export default function DeliveryCard({ order, navigationApp, onChanged }) {
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [hasStoredCode, setHasStoredCode] = useState(false);
  const { call } = useApi();

  useEffect(() => {
    let active = true;
    setHasStoredCode(false);
    if (order.status !== 'em_rota') return () => { active = false; };

    call(`/api/ifood/order-meta?orderId=${order.id}`, { method: 'GET' })
      .then(({ hasStoredCode: storedCode }) => {
        if (active) setHasStoredCode(Boolean(storedCode));
      })
      .catch((error) => {
        console.error('Não foi possível verificar se o pedido tem código salvo', {
          orderId: order.id,
          error
        });
      });

    return () => { active = false; };
  }, [call, order.id, order.status]);

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
  const statusLabel = order.status === 'em_rota'
    ? 'Em rota'
    : order.status === 'recebido'
      ? 'Aguardando aceite/preparo'
      : order.status === 'em_preparo'
        ? 'Aguardando ficar pronto'
        : order.ifood_dispatching_at
          ? 'Despacho em processamento'
          : order.ifood_dispatched_at
            ? 'Aguardando confirmação do iFood'
            : 'Pronto para despachar';

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
  const cashPayment = order.payment_raw?.methods?.find(
    (method) => method.type === 'OFFLINE' && method.method === 'CASH'
  );
  const cashChangeFor = Number(cashPayment?.cash?.changeFor);
  const cashChange = cashChangeFor - pendingValue;
  const hasCashChangeFor = order.payment_category === 'dinheiro' &&
    Number.isFinite(cashChangeFor) &&
    cashChangeFor > 0;
  const formatCurrency = (value) => Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{order.customer_name}</p>
          <p className="whitespace-pre-line text-sm text-gray-600">
            {order.route_address || fullAddress || 'Endereço não informado'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            order.status === 'em_rota'
              ? 'bg-blue-100 text-blue-700'
              : order.status === 'pronto'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-amber-100 text-amber-700'
          }`}>
            {statusLabel}
          </span>
          {order.status === 'em_rota' && hasStoredCode && (
            <span
              title="Pode confirmar a entrega sem digitar o código"
              className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700"
            >
              Código salvo
            </span>
          )}
        </div>
      </div>

      {order.status === 'em_rota' && order.delivery_date_time && (
        <div className="mb-3">
          <CountdownTimer target={order.delivery_date_time} label="Previsão de entrega" size="lg" />
        </div>
      )}

      <div className="mb-3">
        <PaymentBadge category={order.payment_category} value={pendingValue} />
        <OrderDiscounts benefits={order.benefits_raw} total={order.benefits_value} className="mt-2" />
        {hasCashChangeFor && (
          <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-center text-sm text-blue-900">
            <p>Cliente vai entregar: <strong>R$ {formatCurrency(cashChangeFor)}</strong></p>
            {Number.isFinite(cashChange) && cashChange > 0 && (
              <p>Troco: <strong>R$ {formatCurrency(cashChange)}</strong></p>
            )}
          </div>
        )}
      </div>

      <ul className="mb-3 space-y-1 text-sm text-gray-700">
        {order.order_items?.map((item) => (
          <li key={item.id}>
            {item.quantity}x {item.name}
          </li>
        ))}
      </ul>

      {order.status === 'em_rota' && (
        <div className="space-y-2">
          {navigationApp === 'waze' && (
            navigationAddress
              ? (
                  <a
                    href={buildWazeDestinationUrl(navigationAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-lg bg-blue-600 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Iniciar rota
                  </a>
                )
              : (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg bg-gray-300 py-2 text-sm font-semibold text-gray-600"
                  >
                    Iniciar rota
                  </button>
                )
          )}
          <div className="flex gap-2">
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
          </div>
        </div>
      )}

      {showModal && (
        <ConfirmDeliveryModal
          order={order}
          hasStoredCode={hasStoredCode}
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
