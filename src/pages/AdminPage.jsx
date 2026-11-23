// src/pages/AdminPage.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { TabBar, Button, EmptyState, Badge, ErrorMsg, Sheet, CurrencyInput, Input, ToggleGroup } from '../lib/ui';
import { fmtBRL } from '../lib/constants';
import { ordersForActiveColumn } from '../lib/activeOrders';
import { calculateDriverBalance } from '../lib/driverBalance';
import { useApi } from '../lib/useApi';
import OrderCard from '../components/OrderCard';
import StoreStatusToggle from '../components/StoreStatusToggle';

const ACTIVE_COLUMNS = [
  { status: 'recebido',   title: 'Novos pedidos' },
  { status: 'em_preparo', title: 'Em preparo'    },
  { status: 'pronto',     title: 'Pronto'        },
  { status: 'em_rota',    title: 'Em rota'       },
];

const TABS = [
  { id: 'ativos',      label: 'Ativos'      },
  { id: 'finalizados', label: 'Finalizados' },
  { id: 'entregadores', label: 'Entregadores' },
];

export default function AdminPage() {
  const { signOut, profile } = useAuth();
  const { call } = useApi();
  const [tab, setTab] = useState('ativos');
  const [orders, setOrders] = useState([]);
  const [finalOrders, setFinalOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverBalances, setDriverBalances] = useState({});
  const [driverAdjustments, setDriverAdjustments] = useState([]);
  const [pendingEarnings, setPendingEarnings] = useState([]);
  const [retryingEarnings, setRetryingEarnings] = useState(null);
  const [retryError, setRetryError] = useState('');
  const [adjustmentDriver, setAdjustmentDriver] = useState(null);
  const [adjustmentType, setAdjustmentType] = useState('credit');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentError, setAdjustmentError] = useState('');
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [loadingWithdraw, setLoadingWithdraw] = useState(null);
  const [copiedPixDriver, setCopiedPixDriver] = useState(null);
  const [withdrawError, setWithdrawError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const balanceRequest = useRef(0);

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders').select('*, order_items(*, order_item_additions(*))')
      .not('status', 'in', '("entregue","cancelado")')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Não foi possível carregar os pedidos do administrador', error);
      setOrdersError('Não foi possível atualizar os pedidos. Verifique a conexão e tente novamente.');
    } else {
      setOrdersError('');
      setOrders(data || []);
    }
    setLoading(false);
  }, []);

  const loadFinalOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders').select('*, order_items(*, order_item_additions(*))')
      .in('status', ['entregue', 'cancelado'])
      .order('created_at', { ascending: false }).limit(50);
    setFinalOrders(data || []);
  }, []);

  const loadDrivers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'driver');
    setDrivers(data || []);
  }, []);

  const loadDriverBalances = useCallback(async () => {
    if (!drivers.length) return;
    const requestId = ++balanceRequest.current;
    const ids = drivers.map(d => d.id);
    const [{ data: hist, error: historyError }, { data: wdr, error: withdrawalsError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
      supabase.from('delivery_history').select('id, driver_id, order_id, valor_entrega, route_error, orders(display_id)').in('driver_id', ids),
      supabase.from('withdrawals').select('driver_id, valor').in('driver_id', ids),
      supabase.from('driver_balance_adjustments').select('id, driver_id, amount, reason, created_at')
        .in('driver_id', ids).order('created_at', { ascending: false }),
    ]);
    if (requestId !== balanceRequest.current) return;
    if (historyError || withdrawalsError || adjustmentsError) {
      console.error('Não foi possível carregar os saldos dos entregadores', historyError || withdrawalsError || adjustmentsError);
      setBalanceError('Não foi possível atualizar os saldos dos entregadores.');
      return;
    }
    const balances = {};
    ids.forEach(id => {
      balances[id] = calculateDriverBalance(
        (hist || []).filter(row => row.driver_id === id),
        (wdr || []).filter(row => row.driver_id === id),
        (adjustments || []).filter(row => row.driver_id === id)
      );
    });
    setBalanceError('');
    setDriverBalances(balances);
    setDriverAdjustments(adjustments || []);
    setPendingEarnings((hist || []).filter(row => row.valor_entrega === null));
  }, [drivers]);

  useEffect(() => { loadOrders(); loadDrivers(); }, [loadOrders, loadDrivers]);
  useEffect(() => { if (tab === 'finalizados') loadFinalOrders(); }, [tab, loadFinalOrders]);
  useEffect(() => { if (tab === 'entregadores') loadDriverBalances(); }, [tab, loadDriverBalances]);

  const hasPendingDispatch = orders.some(order =>
    order.status === 'pronto' && (order.ifood_dispatched_at || order.ifood_dispatching_at)
  );

  useEffect(() => {
    if (tab !== 'ativos' || (realtimeConnected && !hasPendingDispatch)) return undefined;
    const intervalId = window.setInterval(loadOrders, 10000);
    return () => window.clearInterval(intervalId);
  }, [tab, loadOrders, realtimeConnected, hasPendingDispatch]);

  useEffect(() => {
    const ch = supabase.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
        if (tab === 'finalizados') loadFinalOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_history' }, () => {
        if (tab === 'entregadores') loadDriverBalances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_balance_adjustments' }, () => {
        if (tab === 'entregadores') loadDriverBalances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => {
        if (tab === 'entregadores') loadDriverBalances();
      })
      .subscribe((status, error) => {
        const connected = status === 'SUBSCRIBED';
        setRealtimeConnected(connected);
        if (error || ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          console.error('Realtime de pedidos do administrador indisponível; atualização periódica continuará ativa', {
            status,
            error: error?.message || null
          });
        }
      });
    return () => {
      setRealtimeConnected(false);
      supabase.removeChannel(ch);
    };
  }, [loadOrders, loadFinalOrders, loadDriverBalances, tab]);

  async function registerWithdrawal(driver) {
    const balance = driverBalances[driver.id] || 0;
    if (balanceError || balance <= 0) return;
    setLoadingWithdraw(driver.id);
    setWithdrawError('');
    const { error } = await supabase.from('withdrawals').insert({
      driver_id: driver.id,
      valor: balance,
      paid_at: new Date().toISOString(),
      paid_by: profile.id,
    });
    setLoadingWithdraw(null);
    if (error) { setWithdrawError(error.message); return; }
    await loadDriverBalances();
  }

  async function retryEarnings(item) {
    setRetryingEarnings(item.id);
    setRetryError('');
    try {
      await call('/api/driver/request-withdrawal', {
        body: { action: 'retry_route_earnings', orderId: item.order_id }
      });
    } catch (error) {
      setRetryError(`Pedido ${item.orders?.display_id || item.order_id}: ${error.message}`);
    } finally {
      await loadDriverBalances();
      setRetryingEarnings(null);
    }
  }

  function openAdjustment(driver) {
    setAdjustmentDriver(driver);
    setAdjustmentType('credit');
    setAdjustmentAmount('');
    setAdjustmentReason('');
    setAdjustmentError('');
  }

  async function saveAdjustment(event) {
    event.preventDefault();
    if (adjustmentSaving || !adjustmentDriver) return;
    const amount = Number(adjustmentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) {
      setAdjustmentError('Informe um valor válido maior que zero.');
      return;
    }
    if (!adjustmentReason.trim()) {
      setAdjustmentError('Informe o motivo do ajuste.');
      return;
    }

    setAdjustmentSaving(true);
    setAdjustmentError('');
    try {
      const { error } = await supabase.from('driver_balance_adjustments').insert({
        driver_id: adjustmentDriver.id,
        amount: adjustmentType === 'debit' ? -amount : amount,
        reason: adjustmentReason.trim(),
        created_by: profile.id,
      });
      if (error) {
        setAdjustmentError('Não foi possível confirmar o ajuste. Confira o histórico antes de tentar novamente: ' + error.message);
        return;
      }
      setAdjustmentDriver(null);
      await loadDriverBalances();
    } catch (error) {
      console.error('Não foi possível registrar o ajuste de saldo', error);
      setAdjustmentError('Não foi possível registrar o ajuste. Confira o saldo antes de tentar novamente.');
    } finally {
      setAdjustmentSaving(false);
    }
  }

  async function copyDriverPix(driver) {
    setWithdrawError('');
    if (!driver.pix_key) {
      setWithdrawError(`O entregador ${driver.name} ainda não cadastrou uma chave PIX.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(driver.pix_key);
      setCopiedPixDriver(driver.id);
      window.setTimeout(() => {
        setCopiedPixDriver((current) => current === driver.id ? null : current);
      }, 2000);
    } catch (error) {
      console.error('Não foi possível copiar a chave PIX', error);
      setWithdrawError('Não foi possível copiar a chave PIX. Verifique a permissão da área de transferência do navegador.');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* cabeçalho */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 pt-3 pb-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-gray-800">Pedidos</p>
              <p className="text-xs text-gray-400">Olá, {profile?.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <StoreStatusToggle />
              <Link to="/financeiro" className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Financeiro</Link>
              <Button variant="ghost" onClick={signOut}>Sair</Button>
            </div>
          </div>
          <TabBar tabs={TABS} active={tab} onChange={setTab} />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-5">
        {/* ativos */}
        {tab === 'ativos' && (
          <>
            {!realtimeConnected && (
              <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Atualização em tempo real indisponível; os pedidos serão sincronizados automaticamente a cada 10 segundos.
              </p>
            )}
            {ordersError && (
              <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{ordersError}</p>
            )}
            {loading
              ? <p className="text-sm text-gray-400">Carregando...</p>
              : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {ACTIVE_COLUMNS.map(col => {
                  const colOrders = ordersForActiveColumn(orders, col.status);
                  return (
                    <div key={col.status} className="rounded-2xl bg-gray-100 p-3">
                      <p className="mb-3 px-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                        {col.title} <span className="text-gray-400">({colOrders.length})</span>
                      </p>
                      {colOrders.length === 0
                        ? <EmptyState message="Nenhum pedido aqui" />
                        : <div className="space-y-3">
                            {colOrders.map(o => <OrderCard key={o.id} order={o} drivers={drivers} onChanged={loadOrders} />)}
                          </div>
                      }
                    </div>
                  );
                })}
              </div>
            }
          </>
        )}

        {/* finalizados */}
        {tab === 'finalizados' && (
          finalOrders.length === 0
            ? <EmptyState message="Nenhum pedido finalizado ainda." />
            : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {finalOrders.map(o => <OrderCard key={o.id} order={o} drivers={drivers} onChanged={loadFinalOrders} />)}
              </div>
        )}

        {/* entregadores + saques */}
        {tab === 'entregadores' && (
          <div className="max-w-lg space-y-3">
            <ErrorMsg message={withdrawError} />
            <ErrorMsg message={balanceError} />
            <ErrorMsg message={retryError} />
            {drivers.length === 0 && <EmptyState message="Nenhum entregador cadastrado." />}
            {drivers.map(driver => {
              const balance = driverBalances[driver.id];
              const adjustments = driverAdjustments.filter(item => item.driver_id === driver.id);
              const pending = pendingEarnings.filter(item => item.driver_id === driver.id);
              const isPaying = loadingWithdraw === driver.id;
              return (
                <div key={driver.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-800">{driver.name}</p>
                      <p className="text-xs text-gray-400">{driver.phone || 'Sem telefone'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Saldo</p>
                      <p className={`text-lg font-bold ${balance < 0 ? 'text-red-700' : balance > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        {balance === undefined ? '—' : `R$ ${fmtBRL(balance)}`}
                      </p>
                    </div>
                  </div>
                  {pending.length > 0 && (
                    <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                      <p>{pending.length} repasse(s) pendente(s) não incluído(s) no saldo.</p>
                      {pending.map(item => (
                        <div key={item.id} className="mt-2">
                          <p>Pedido {item.orders?.display_id || item.order_id}: {item.route_error || 'cálculo pendente'}</p>
                          <Button variant="secondary" onClick={() => retryEarnings(item)} disabled={Boolean(retryingEarnings)}>
                            {retryingEarnings === item.id ? 'Calculando...' : 'Tentar calcular novamente'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" className="min-w-[130px] flex-1" onClick={() => openAdjustment(driver)}>
                      Ajustar saldo
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-w-[130px] flex-1"
                      onClick={() => copyDriverPix(driver)}
                      disabled={!driver.pix_key}
                    >
                      {copiedPixDriver === driver.id ? 'PIX copiado!' : 'Copiar PIX'}
                    </Button>
                    {balance > 0 && (
                      <Button
                        variant="success"
                        className="min-w-[130px] flex-1"
                        onClick={() => registerWithdrawal(driver)}
                        disabled={isPaying || Boolean(balanceError)}
                      >
                        {isPaying ? 'Registrando...' : `Marcar R$ ${fmtBRL(balance)} como pago`}
                      </Button>
                    )}
                  </div>
                  {balance === 0 && (
                    <p className="mt-2 text-center text-xs text-gray-400">Saldo zerado ✓</p>
                  )}
                  {balance < 0 && (
                    <p className="mt-2 text-center text-xs text-red-700">Saldo negativo será compensado por ganhos futuros.</p>
                  )}
                  {adjustments.length > 0 && (
                    <details className="mt-3 text-sm text-gray-600">
                      <summary className="cursor-pointer font-medium">Histórico de ajustes</summary>
                      <ul className="mt-2 space-y-2">
                        {adjustments.map(item => (
                          <li key={item.id} className="flex justify-between gap-2">
                            <span>{item.reason} <span className="text-xs text-gray-400">({new Date(item.created_at).toLocaleDateString('pt-BR')})</span></span>
                            <span className="shrink-0">{Number(item.amount) > 0 ? '+' : '−'} R$ {fmtBRL(Math.abs(Number(item.amount)))}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Sheet open={Boolean(adjustmentDriver)} onClose={() => { if (!adjustmentSaving) setAdjustmentDriver(null); }}
        title={`Ajustar saldo${adjustmentDriver ? ` — ${adjustmentDriver.name}` : ''}`}>
        <form onSubmit={saveAdjustment} className="space-y-4">
          <ToggleGroup value={adjustmentType} onChange={setAdjustmentType} options={[
            { value: 'credit', label: 'Somar' },
            { value: 'debit', label: 'Subtrair' },
          ]} />
          <CurrencyInput label="Valor do ajuste" required value={adjustmentAmount} onChange={setAdjustmentAmount} />
          <Input label="Motivo" required maxLength={300} value={adjustmentReason}
            onChange={event => setAdjustmentReason(event.target.value)} placeholder="Ex.: entrega refeita ou troco" />
          <ErrorMsg message={adjustmentError} />
          <Button type="submit" disabled={adjustmentSaving}>
            {adjustmentSaving ? 'Salvando...' : 'Registrar ajuste'}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
