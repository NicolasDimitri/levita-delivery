// src/components/OrderCard.jsx
import { useEffect, useState } from 'react';
import { useApi } from '../lib/useApi';
import { Button, Badge, SectionLabel, ErrorMsg } from '../lib/ui';
import CountdownTimer from './CountdownTimer';
import { ORDER_STATUS, fmtBRL, fmtDate } from '../lib/constants';
import { supabase } from '../supabaseClient';
import { getOrderDestinationCoordinates, parseCoordinatePair } from '../../lib/deliveryAddress';
import OrderDiscounts from './OrderDiscounts';
import CallCustomer from './CallCustomer';

export { ORDER_STATUS };

function getCancellationCode(reason) {
  return reason.cancelCodeId ?? reason.cancellationCode ?? reason.code ?? reason.id ?? '';
}

export default function OrderCard({ order, drivers, onChanged }) {
  const { call } = useApi();
  const [loadingKey, setLoadingKey] = useState(null);
  const [showDriverSelector, setShowDriverSelector] = useState(false);
  const [cancellationReasons, setCancellationReasons] = useState([]);
  const [selectedCancellation, setSelectedCancellation] = useState('');
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [coordinateInput, setCoordinateInput] = useState('');
  const [error, setError] = useState('');
  const [cancellationPending, setCancellationPending] = useState(false);
  const [showProblemEditor, setShowProblemEditor] = useState(false);
  const [problemReason, setProblemReason] = useState('');

  useEffect(() => {
    const coordinates = getOrderDestinationCoordinates(order);
    setCoordinateInput(coordinates ? `${coordinates.latitude}, ${coordinates.longitude}` : '');
  }, [order.latitude, order.longitude, order.route_latitude, order.route_longitude]);

  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.recebido;
  const coordinates = getOrderDestinationCoordinates(order);
  const canEditCoordinates = !['entregue', 'cancelado'].includes(order.status);

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
      'Aguarde pelo menos 30 segundos após o início do despacho e confirme no Gestor de Pedidos do iFood que este pedido NÃO foi despachado. Só então libere uma nova tentativa.'
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

  const saveCoordinates = (restore = false) => run('coordinates', async () => {
    const value = restore ? null : parseCoordinatePair(coordinateInput);
    if (!restore && !value) throw new Error('Informe latitude e longitude válidas, separadas por vírgula.');
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ route_latitude: value?.latitude ?? null, route_longitude: value?.longitude ?? null })
      .eq('id', order.id)
      .in('status', ['recebido', 'em_preparo', 'pronto', 'em_rota'])
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error('O pedido foi finalizado ou não está mais disponível para alteração.');
    setShowCoordinates(false);
  });

  const saveCustomerProblem = () => run('customer-problem', async () => {
    if (!order.ifood_customer_id) throw new Error('Este pedido não tem um cliente identificado pelo iFood.');
    const { error: updateError } = await supabase
      .from('clientes')
      .update({
        problematic: true,
        motivo_problematico: problemReason.trim() || null
      })
      .eq('ifood_customer_id', order.ifood_customer_id)
      .select('ifood_customer_id')
      .single();
    if (updateError) throw updateError;
    setProblemReason('');
    setShowProblemEditor(false);
  });

  const clearCustomerProblem = () => run('customer-problem', async () => {
    if (!order.ifood_customer_id) throw new Error('Este pedido não tem um cliente identificado pelo iFood.');
    const { error: updateError } = await supabase
      .from('clientes')
      .update({ problematic: false, motivo_problematico: null })
      .eq('ifood_customer_id', order.ifood_customer_id)
      .select('ifood_customer_id')
      .single();
    if (updateError) throw updateError;
  });

  const assignDriver = (driverId) => {
    run('assign', async () => {
      await call('/api/ifood/assign-driver', {
        body: { orderId: order.id, driverId }
      });
      setShowDriverSelector(false);
    });
  };
  const unassignDriver = () => {
    if (!window.confirm(
      'Desvincular este pedido do entregador atual? O pedido ficará disponível para todos os entregadores aceitarem. Se já foi despachado ao iFood, ele não será despachado novamente.'
    )) return;
    run('unassign', () => call('/api/ifood/assign-driver', {
      body: { orderId: order.id, driverId: null }
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

      {order.cliente?.problematic && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">Cliente marcado como problemático</p>
          {order.cliente.motivo_problematico && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-red-700">{order.cliente.motivo_problematico}</p>
          )}
        </div>
      )}
      {order.ifood_customer_id && (
        <div className="space-y-2">
          {order.cliente?.problematic ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={clearCustomerProblem}
              disabled={loading('customer-problem')}
              className="w-full"
            >
              {loading('customer-problem') ? 'Removendo alerta...' : 'Remover marcação de cliente problemático'}
            </Button>
          ) : showProblemEditor ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <label className="block text-xs font-medium text-gray-600" htmlFor={`problem-reason-${order.id}`}>
                Motivo (opcional)
              </label>
              <textarea
                id={`problem-reason-${order.id}`}
                value={problemReason}
                onChange={event => setProblemReason(event.target.value)}
                maxLength={500}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="Descreva o ocorrido para orientar a equipe"
              />
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={saveCustomerProblem}
                  disabled={loading('customer-problem')}
                  className="flex-1"
                >
                  {loading('customer-problem') ? 'Salvando...' : 'Marcar como problemático'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowProblemEditor(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowProblemEditor(true)}
              className="w-full"
            >
              Marcar cliente como problemático
            </Button>
          )}
        </div>
      )}

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
      <OrderDiscounts benefits={order.benefits_raw} total={order.benefits_value} />
      {!['entregue', 'cancelado'].includes(order.status) && <CallCustomer order={order} />}

      <ErrorMsg message={error} />
      {canEditCoordinates && (
        <div className="space-y-2">
          {!coordinates && <p className="text-xs text-red-700">Coordenadas indisponíveis; informe a localização correta.</p>}
          {order.route_latitude != null && <p className="text-xs text-amber-700">Localização corrigida pelo administrador.</p>}
          <Button variant="secondary" onClick={() => setShowCoordinates(value => !value)}>
            {showCoordinates ? 'Fechar localização' : 'Alterar localização'}
          </Button>
          {showCoordinates && (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <label className="block text-xs text-gray-600" htmlFor={`coordinates-${order.id}`}>
                Latitude, longitude em graus decimais
              </label>
              <input
                id={`coordinates-${order.id}`}
                type="text"
                value={coordinateInput}
                onChange={event => setCoordinateInput(event.target.value)}
                placeholder="-7.223361, -35.936778"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500">A correção será usada na rota e no cálculo do repasse.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveCoordinates()} disabled={loading('coordinates')}>
                  {loading('coordinates') ? 'Salvando...' : 'Salvar localização'}
                </Button>
                {order.route_latitude != null && (
                  <Button variant="secondary" onClick={() => saveCoordinates(true)} disabled={loading('coordinates')}>
                    Usar localização do iFood
                  </Button>
                )}
              </div>
            </div>
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
          <p className="text-xs text-gray-500">
            Entregador: <span className="font-medium text-gray-700">{driverName || 'Indisponível'}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowDriverSelector(value => !value)}
              disabled={Boolean(order.ifood_dispatching_at && order.status === 'pronto')}
              className="flex-1"
            >
              {showDriverSelector ? 'Cancelar troca' : 'Trocar'}
            </Button>
            <Button
              variant="danger"
              onClick={unassignDriver}
              disabled={loading('unassign') || Boolean(order.ifood_dispatching_at)}
              className="flex-1"
            >
              {loading('unassign') ? 'Desvinculando...' : 'Desvincular'}
            </Button>
          </div>
          {showDriverSelector && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => !loading('assign') && setShowDriverSelector(false)}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={`driver-selector-title-${order.id}`}
                className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={event => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-gray-100 p-4">
                  <div>
                    <h2 id={`driver-selector-title-${order.id}`} className="font-semibold text-gray-800">
                      Trocar entregador
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Pedido {order.display_id ? `#${order.display_id}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDriverSelector(false)}
                    disabled={loading('assign')}
                    aria-label="Fechar seleção de entregador"
                    className="rounded-full px-3 py-1 text-xl text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
                <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
                  {drivers.filter(driver => driver.id !== order.driver_id).length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500">
                      Não há outros entregadores cadastrados para selecionar.
                    </p>
                  ) : drivers.filter(driver => driver.id !== order.driver_id).map(driver => (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => assignDriver(driver.id)}
                      disabled={loading('assign') || Boolean(order.ifood_dispatching_at && order.status === 'pronto')}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>
                        <span className="block text-sm font-medium text-gray-800">{driver.name}</span>
                        {driver.phone && <span className="mt-0.5 block text-xs text-gray-500">{driver.phone}</span>}
                      </span>
                      {loading('assign') && <span className="text-xs text-gray-500">Trocando...</span>}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
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
