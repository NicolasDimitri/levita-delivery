// src/pages/DriverPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import DeliveryCard from '../components/DeliveryCard';
import AvailableOrderCard from '../components/AvailableOrderCard';
import { useApi } from '../lib/useApi';
import {
  buildGoogleMapsRouteBatches,
  getGoogleMapsDestination,
  STORE_RETURN_ADDRESS
} from '../../lib/deliveryAddress';

export default function DriverPage() {
  const { signOut, profile, session } = useAuth();
  const { call } = useApi();
  const [tab, setTab] = useState('ativas');
  const [orders, setOrders] = useState([]);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [finishedOrders, setFinishedOrders] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [withdrawNote, setWithdrawNote] = useState('');
  const [ordersError, setOrdersError] = useState('');
  const [availableOrdersError, setAvailableOrdersError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState('');

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('driver_id', session.user.id)
      .in('status', ['recebido', 'em_preparo', 'pronto', 'em_rota'])
      .order('assigned_at', { ascending: true });
    if (error) {
      setOrdersError('Não foi possível carregar suas entregas. Atualize a página ou tente novamente.');
      setLoading(false);
      return;
    }
    setOrdersError('');
    setOrders(data || []);
    setLoading(false);
  }, [session]);

  const loadAvailableOrders = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_available_delivery_orders');
    if (error) {
      console.error('Não foi possível carregar os pedidos disponíveis', error);
      setAvailableOrdersError('Não foi possível carregar os pedidos disponíveis. Atualize a página ou tente novamente.');
      return;
    }
    setAvailableOrdersError('');
    setAvailableOrders(data || []);
  }, []);

  const loadFinishedOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('driver_id', session.user.id)
      .eq('status', 'entregue')
      .order('delivered_at', { ascending: false })
      .limit(30);
    setFinishedOrders(data || []);
  }, [session]);

  const loadBalance = useCallback(async () => {
    const [{ data: hist, error: historyError }, { data: wdr, error: withdrawalsError }] = await Promise.all([
      supabase
        .from('delivery_history')
        .select('valor_entrega')
        .eq('driver_id', session.user.id),
      supabase
        .from('withdrawals')
        .select('valor')
        .eq('driver_id', session.user.id)
    ]);

    if (historyError || withdrawalsError) {
      console.error('Não foi possível carregar o saldo do entregador', historyError || withdrawalsError);
      setBalanceError('Não foi possível atualizar o saldo. Tente atualizar a página.');
      return;
    }

    const earned = (hist || []).reduce((s, r) => s + Number(r.valor_entrega), 0);
    const withdrawn = (wdr || []).reduce((s, r) => s + Number(r.valor), 0);

    setBalanceError('');
    setTotalWithdrawn(withdrawn);
    setBalance(Math.max(0, earned - withdrawn));
  }, [session]);

  const loadWithdrawals = useCallback(async () => {
    const { data } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('driver_id', session.user.id)
      .order('paid_at', { ascending: false })
      .limit(20);
    setWithdrawals(data || []);
  }, [session]);

  useEffect(() => {
    loadOrders();
    loadAvailableOrders();
    loadBalance();
    const channel = supabase
      .channel('driver-orders')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadOrders();
          loadAvailableOrders();
          loadBalance();
          if (tab === 'finalizadas') loadFinishedOrders();
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_history', filter: `driver_id=eq.${session.user.id}` },
        () => loadBalance()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawals', filter: `driver_id=eq.${session.user.id}` },
        () => { loadBalance(); if (tab === 'saque') loadWithdrawals(); }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadOrders, loadAvailableOrders, loadBalance, loadFinishedOrders, loadWithdrawals, session, tab]);

  useEffect(() => {
    if (tab === 'finalizadas') loadFinishedOrders();
    if (tab === 'saque') loadWithdrawals();
  }, [tab, loadFinishedOrders, loadWithdrawals]);

  useEffect(() => {
    if (tab !== 'disponiveis') return undefined;
    const intervalId = window.setInterval(loadAvailableOrders, 10000);
    return () => window.clearInterval(intervalId);
  }, [tab, loadAvailableOrders]);

  const tabs = [
    { id: 'disponiveis', label: `Disponíveis${availableOrders.length > 0 ? ` (${availableOrders.length})` : ''}` },
    { id: 'ativas',     label: `Minhas entregas${orders.length > 0 ? ` (${orders.length})` : ''}` },
    { id: 'finalizadas', label: 'Finalizadas' },
    { id: 'saque',      label: 'Carteira' },
  ];

  const routeOrders = orders.filter((order) => ['pronto', 'em_rota'].includes(order.status));
  const readyOrdersToDispatch = orders.filter((order) =>
    order.status === 'pronto' && !order.ifood_dispatched_at && !order.ifood_dispatching_at
  );
  const ordersWaitingForReady = orders.filter((order) => ['recebido', 'em_preparo'].includes(order.status));
  const routeStops = routeOrders.map((order) => ({
    order,
    ...getGoogleMapsDestination(order)
  }));
  const ordersWithoutAddress = routeStops.filter((stop) => !stop.destination).length;
  const route = routeOrders.length === 0 || ordersWithoutAddress
    ? { batches: [], failedIndex: -1 }
    : buildGoogleMapsRouteBatches([
      ...routeStops.map((stop) => stop.destination),
      STORE_RETURN_ADDRESS
    ]);

  async function dispatchReadyOrders() {
    const orderIds = readyOrdersToDispatch.map((order) => order.id);
    if (orderIds.length === 0 || orderIds.length > 3) return;

    setDispatching(true);
    setDispatchMessage('');
    try {
      const { results = [] } = await call('/api/ifood/dispatch', { body: { orderIds } });
      const dispatchedCount = results.filter((result) => result.status === 'dispatched').length;
      const pendingResults = results.filter((result) => result.status === 'pending' || result.status === 'uncertain');
      const failedResults = results.filter((result) => result.status === 'failed');
      const parts = [`Despachados ao iFood: ${dispatchedCount}.`];
      if (pendingResults.length) {
        parts.push(`${pendingResults.length} aguardando conferência no iFood.`);
      }
      if (failedResults.length) {
        parts.push(`${failedResults.length} falha(s): ${failedResults.map((item) => item.error).join(' ')}`);
      }
      setDispatchMessage(parts.join(' '));
      await loadOrders();
      await loadAvailableOrders();
    } catch (error) {
      setDispatchMessage(error.message);
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* cabeçalho */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <p className="text-base font-semibold leading-tight">Minhas entregas</p>
            <p className="text-xs text-gray-400">Olá, {profile?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-400">Saldo</p>
              <p className="text-sm font-bold text-green-700">R$ {balance.toFixed(2)}</p>
              {balanceError && <p className="max-w-32 text-xs text-red-600">{balanceError}</p>}
            </div>
            <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-700">Sair</button>
          </div>
        </div>

        {/* abas */}
        <div className="mx-auto mt-2 flex max-w-md gap-0 border-b border-gray-100">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-xs font-medium transition ${
                tab === t.id
                  ? 'border-b-2 border-brand-500 text-brand-600'
                  : 'text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4">
        {tab === 'disponiveis' && (
          <div className="space-y-3">
            {availableOrdersError && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{availableOrdersError}</p>
            )}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              Aceite pedidos disponíveis. Cada entregador pode ficar com até 3 pedidos ativos; pedidos ainda não prontos ficam aguardando na sua lista.
            </div>
            {orders.length >= 3 && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Você já atingiu o limite de 3 pedidos ativos.
              </p>
            )}
            {availableOrders.length === 0
              ? <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                  <p className="text-sm text-gray-400">Nenhum pedido disponível no momento.</p>
                </div>
              : availableOrders.map((order) => (
                  <AvailableOrderCard
                    key={order.id}
                    order={order}
                    activeCount={orders.length}
                    onAccepted={() => { loadOrders(); loadAvailableOrders(); }}
                  />
                ))}
          </div>
        )}

        {/* aba: em rota */}
        {tab === 'ativas' && (
          <>
            {ordersError && (
              <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{ordersError}</p>
            )}
            {loading && <p className="text-sm text-gray-400">Carregando...</p>}
            {orders.length > 0 && (
              <div className="mb-3">
                {readyOrdersToDispatch.length > 0 && (
                  <div className="mb-3 space-y-2">
                    <button
                      type="button"
                      onClick={dispatchReadyOrders}
                      disabled={dispatching}
                      className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60"
                    >
                      {dispatching
                        ? 'Despachando seus pedidos...'
                        : `Despachar ${readyOrdersToDispatch.length} pedido(s) pronto(s) ao iFood`}
                    </button>
                    <p className="text-center text-xs text-gray-500">
                      Serão enviados apenas pedidos prontos atribuídos a você.
                    </p>
                  </div>
                )}
                {dispatchMessage && (
                  <p className="mb-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{dispatchMessage}</p>
                )}
                {routeOrders.length > 0 && route.batches.length > 0 && route.failedIndex < 0 ? (
                  <div className="space-y-2">
                    {route.batches.map((batch, index) => (
                      <a
                        key={`${index}-${batch.url}`}
                        href={batch.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Abrir rota no Google Maps
                        {route.batches.length > 1 ? ` (${index + 1}/${route.batches.length})` : ''}
                        {' '}· {batch.stops.length} paradas
                      </a>
                    ))}
                  </div>
                ) : routeOrders.length > 0 ? (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg bg-gray-300 py-2.5 text-sm font-semibold text-gray-600"
                  >
                    Rota indisponível: verifique os endereços
                  </button>
                ) : null}
                {routeOrders.length > 0 && (
                  <p className="mt-1 text-center text-xs text-gray-500">
                    Início na sua localização atual; entregas prontas/em rota e retorno à loja no final.
                  </p>
                )}
                {ordersWithoutAddress > 0 && (
                  <p className="mt-1 text-center text-xs text-red-600">
                    {ordersWithoutAddress} entrega(s) aguardando endereço correto cadastrado pelo administrador.
                  </p>
                )}
                {route.failedIndex >= 0 && (
                  <p className="mt-1 text-center text-xs text-red-600">
                    Não foi possível criar a rota a partir da parada {route.failedIndex + 1}; confira o tamanho ou conteúdo do endereço.
                  </p>
                )}
                {ordersWaitingForReady.length > 0 && (
                  <p className="mt-1 text-center text-xs text-amber-700">
                    {ordersWaitingForReady.length} pedido(s) aguardando o despacho marcar como pronto.
                  </p>
                )}
              </div>
            )}
            {!loading && orders.length === 0 && (
              <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-sm text-gray-400">Você ainda não aceitou entregas.</p>
              </div>
            )}
            <div className="space-y-3">
              {orders.map(o => <DeliveryCard key={o.id} order={o} onChanged={loadOrders} />)}
            </div>
          </>
        )}

        {/* aba: finalizadas */}
        {tab === 'finalizadas' && (
          <div className="space-y-2">
            {finishedOrders.length === 0 && (
              <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-sm text-gray-400">Nenhuma entrega finalizada ainda.</p>
              </div>
            )}
            {finishedOrders.map(o => (
              <div key={o.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{o.customer_name}</p>
                    <p className="truncate text-xs text-gray-400">{o.street}, {o.street_number} — {o.neighborhood}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Entregue
                  </span>
                </div>
                {o.delivered_at && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    {new Date(o.delivered_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* aba: carteira / saque */}
        {tab === 'saque' && (
          <div className="space-y-4">
            {/* resumo */}
            <div className="rounded-2xl bg-green-600 p-5 text-white shadow">
              <p className="text-xs font-medium uppercase tracking-wide opacity-80">Saldo disponível</p>
              <p className="mt-1 text-4xl font-bold">R$ {balance.toFixed(2)}</p>
              <p className="mt-1 text-xs opacity-70">Total sacado: R$ {totalWithdrawn.toFixed(2)}</p>
              {balanceError && <p className="mt-2 text-sm text-white">{balanceError}</p>}
            </div>

            {/* instrução */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Para solicitar o saque, informe seu nome e envie uma mensagem para o administrador. O valor será transferido manualmente e seu saldo será zerado.
            </div>

            {/* histórico de saques */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Histórico de saques</p>
              {withdrawals.length === 0 && (
                <p className="text-sm text-gray-400">Nenhum saque realizado ainda.</p>
              )}
              {withdrawals.map(w => (
                <div key={w.id} className="mb-2 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">R$ {Number(w.valor).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(w.paid_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">Pago</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
