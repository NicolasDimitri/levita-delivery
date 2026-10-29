// src/components/OrderCard.jsx
import { useEffect, useState } from 'react';
import { useApi } from '../lib/useApi';
import { Button, Badge, SectionLabel, ErrorMsg } from '../lib/ui';
import CountdownTimer from './CountdownTimer';
import { ORDER_STATUS, fmtBRL, fmtDate } from '../lib/constants';
import { supabase } from '../supabaseClient';
import { isMissingStreetNumber } from '../../lib/deliveryAddress';

export { ORDER_STATUS };

function getCancellationCode(reason) {
  return reason.cancelCodeId ?? reason.cancellationCode ?? reason.code ?? reason.id ?? '';
}

export default function OrderCard({ order, drivers, onChanged }) {
  const { call } = useApi();
  const [loadingKey, setLoadingKey] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(order.driver_id || '');
  const [cancellationReasons, setCancellationReasons] = useState([]);
  const [selectedCancellation, setSelectedCancellation] = useState('');
  const [routeAddress, setRouteAddress] = useState(order.route_address || '');
  const [error, setError] = useState('');
  const [cancellationPending, setCancellationPending] = useState(false);

  useEffect(() => {
    setSelectedDriver(order.driver_id || '');
  }, [order.driver_id]);

  useEffect(() => {
    setRouteAddress(order.route_address || '');
  }, [order.route_address]);

  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.recebido;
  const needsRouteAddress = !order.street || isMissingStreetNumber(order.street_number);
  const routeAddressChanged = routeAddress.trim() !== (order.route_address || '');

  async function run(key, fn) {
    setLoadingKey(key);
    setError('');
    try { await fn(); onChanged?.(); }
    catch (e) { setError(e.message); }
    finally { setLoadingKey(null); }
  }

  const accept   = () => run('accept',  () => call('/api/ifood/confirm',  { body: { orderId: order.id } }));
  const reconcileDispatch = () => {
    if (window.confirm(
      'Confirme que este pedido já aparece como despachado ou em rota no Gestor de Pedidos do iFood. Esta ação só atualizará o status nesta aplicação.'
    )) {
      run('reconcile', () => call('/api/ifood/dispatch', {
        body: { orderId: order.id, action: 'reconcile-dispatch' }
      }));
    }
  };
  const releaseDispatch = () => {
    if (window.confirm(
      'Confirme no Gestor de Pedidos do iFood que este pedido NÃO foi despachado. Só então libere uma nova tentativa.'
    )) {
      run('release-dispatch', () => call('/api/ifood/dispatch', {
        body: { orderId: order.id, action: 'release-dispatch' }
      }));
    }
  };
  const loadCancellationReasons = () => run('reasons', async () => {
    const result = await call(`/api/ifood/cancel-reasons?orderId=${encodeURIComponent(order.id)}`, { method: 'GET' });
    setCancellationReasons(result.reasons || []);
  });
  const cancelOrder = () => {
    const selected = cancellationReasons.find((reason) => {
      return String(getCancellationCode(reason)) === selectedCancellation;
    });
    if (!selected) return setError('Selecione um motivo de cancelamento.');
    const code = getCancellationCode(selected);
    const text = selected.description || selected.reason || selected.name || String(code);
    return run('cancel', async () => {
      await call('/api/ifood/cancel', {
        body: { orderId: order.id, reason: text, cancellationCode: String(code) }
      });
      setCancellationPending(true);
    });
  };

  const markReady = () => run('ready', () => call('/api/ifood/dispatch', {
    body: { orderId: order.id, action: 'ready' }
  }));

  const saveRouteAddress = () => run('route-address', async () => {
    const value = routeAddress.trim();
    if (!value) throw new Error('Informe um endereço ou nome de local para a rota.');

    const { error: updateError } = await supabase
      .from('orders')
      .update({ route_address: value })
      .eq('id', order.id)
      .select('id')
      .single();
    if (updateError) throw updateError;
  });

  const assignDriver = () => {
    if (!selectedDriver) return setError('Selecione um entregador primeiro.');
    run('assign', () => call('/api/ifood/assign-driver', {
      body: { orderId: order.id, driverId: selectedDriver }
    }));
  };

  const driverName = drivers.find(d => d.id === order.driver_id)?.name;
  const loading = (k) => loadingKey === k;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm text-gray-800">{order.customer_name}</p>
          <p className="truncate text-xs text-gray-400">
            {[order.street, order.street_number, order.neighborhood].filter(Boolean).join(', ')}
          </p>
          {order.display_id && <p className="text-xs text-gray-300">#{order.display_id}</p>}
        </div>
        <Badge color={status.color}>{status.label}</Badge>
      </div>

      {/* temporizador */}
      {order.status === 'recebido' && (
        <CountdownTimer target={new Date(new Date(order.created_at).getTime() + 8 * 60 * 1000)} label="Aceitar em" />
      )}
      {['em_preparo', 'pronto', 'em_rota'].includes(order.status) && order.delivery_date_time && (
        <CountdownTimer target={order.delivery_date_time} label="Previsão" />
      )}

      {/* itens */}
      <ul className="text-xs text-gray-600 space-y-0.5">
        {order.order_items?.map(item => (
          <li key={item.id}>
            {item.quantity}x {item.name}
            {item.order_item_additions?.length > 0 && (
              <span className="text-gray-400"> + {item.order_item_additions.map(a => `${a.quantity}x ${a.name}`).join(', ')}</span>
            )}
          </li>
        ))}
      </ul>

      {/* total + pagamento */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-800">R$ {fmtBRL(order.total_value)}</span>
        <Badge color={order.payment_category === 'online' ? 'green' : order.payment_category === 'credito' ? 'red' : order.payment_category === 'debito' ? 'amber' : 'blue'}>
          {order.payment_category}
        </Badge>
      </div>

      <ErrorMsg message={error} />
      {needsRouteAddress && !['entregue', 'cancelado'].includes(order.status) && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Endereço incompleto: informe o destino correto para a rota.
          </p>
          <p className="text-xs text-amber-800">
            Pode ser “Rua, número” ou o nome do hotel, pousada, empresa ou comércio.
          </p>
          <input
            type="text"
            value={routeAddress}
            onChange={(event) => setRouteAddress(event.target.value)}
            maxLength={300}
            placeholder="Ex.: Rua das Flores, 123 ou Hotel Central"
            aria-label={`Endereço correto para a rota do pedido ${order.display_id || order.id}`}
            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
          <Button
            variant="primary"
            onClick={saveRouteAddress}
            disabled={!routeAddress.trim() || !routeAddressChanged || loading('route-address')}
          >
            {loading('route-address') ? 'Salvando endereço...' : 'Salvar endereço para a rota'}
          </Button>
          {order.route_address && !routeAddressChanged && (
            <p className="text-xs text-green-700">Endereço personalizado salvo para a rota e para cópia.</p>
          )}
        </div>
      )}
      {cancellationPending && order.status !== 'cancelado' && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
          Cancelamento solicitado; aguardando confirmação do iFood.
        </p>
      )}

      {order.driver_id && ['recebido', 'em_preparo', 'pronto', 'em_rota'].includes(order.status) && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex gap-2">
            <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
              disabled={Boolean(order.ifood_dispatching_at && order.status === 'pronto')}
              className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-gray-100">
              <option value="">Selecionar entregador</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <Button variant="primary" onClick={assignDriver}
              disabled={loading('assign') || !selectedDriver || Boolean(order.ifood_dispatching_at && order.status === 'pronto')}>
              {loading('assign') ? 'Salvando...' : order.driver_id ? 'Trocar' : 'Atribuir'}
            </Button>
          </div>
          <p className="text-xs text-gray-400">Entregador: {driverName || 'Indisponível'}</p>
        </div>
      )}
      {!order.driver_id && ['recebido', 'em_preparo', 'pronto'].includes(order.status) && (
        <p className="border-t border-gray-100 pt-3 text-xs text-amber-700">
          Aguardando um entregador aceitar este pedido.
        </p>
      )}

      {/* ações por status */}
      {['recebido', 'em_preparo', 'pronto'].includes(order.status) && (
        <div className="space-y-2">
          {order.status === 'recebido' && (
            <Button variant="primary" size="lg" onClick={accept} disabled={loading('accept')}>
              {loading('accept') ? 'Aceitando...' : 'Aceitar pedido'}
            </Button>
          )}
          {cancellationReasons.length === 0 ? (
            <Button variant="danger" size="lg" onClick={loadCancellationReasons} disabled={loading('reasons')}>
              {loading('reasons') ? 'Consultando motivos...' : 'Cancelar pedido'}
            </Button>
          ) : (
            <div className="space-y-2">
              <select value={selectedCancellation} onChange={e => {
                setSelectedCancellation(e.target.value);
                setError('');
              }}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
                <option value="">Selecione o motivo no iFood</option>
                {cancellationReasons.map((reason, index) => {
                  const code = getCancellationCode(reason);
                  const text = reason.description || reason.reason || reason.name || code;
                  return <option key={`${code}-${index}`} value={String(code)}>{code} - {text}</option>;
                })}
              </select>
              <Button variant="danger" size="lg" onClick={cancelOrder}
                disabled={loading('cancel') || cancellationPending}>
                {loading('cancel') ? 'Cancelando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          )}
        </div>
      )}

      {order.status === 'em_preparo' && (
        <Button variant="blue" size="lg" onClick={markReady} disabled={loading('ready')}
          className="w-full !bg-purple-600 hover:!bg-purple-700">
          {loading('ready') ? 'Atualizando...' : 'Marcar como pronto'}
        </Button>
      )}

      {order.status === 'pronto' && (
        <div className="space-y-2">
          {order.ifood_dispatching_at && !order.ifood_dispatched_at && (
            <p className="text-xs text-amber-700">
              Não foi possível confirmar a resposta do iFood. Confira o pedido no Gestor de Pedidos antes de escolher uma ação.
            </p>
          )}
          {order.ifood_dispatched_at && (
            <p className="text-xs text-amber-700">Despacho solicitado ao iFood; aguardando confirmação.</p>
          )}
          {(order.ifood_dispatched_at || order.ifood_dispatching_at) && (
            <div className="space-y-2">
              <Button variant="blue" size="lg" onClick={reconcileDispatch}
                disabled={loading('reconcile') || loading('release-dispatch')}>
                {loading('reconcile') ? 'Sincronizando...' : 'Confirmar despacho no iFood'}
              </Button>
              {order.ifood_dispatching_at && !order.ifood_dispatched_at && (
                <Button variant="danger" onClick={releaseDispatch}
                  disabled={loading('reconcile') || loading('release-dispatch')}>
                  {loading('release-dispatch') ? 'Liberando...' : 'Liberar nova tentativa'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {order.status === 'em_rota' && (
        <p className="text-xs text-gray-400">Em rota com {driverName ?? '—'} · aguardando confirmação</p>
      )}

      {order.status === 'entregue' && order.delivered_at && (
        <p className="text-xs text-gray-400">Entregue em {fmtDate(order.delivered_at)}{driverName ? ` por ${driverName}` : ''}</p>
      )}

      {order.status === 'cancelado' && <p className="text-xs text-red-400">Pedido cancelado.</p>}
    </div>
  );
}
