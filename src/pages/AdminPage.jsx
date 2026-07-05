// src/pages/AdminPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { TabBar, Button, EmptyState, Badge, ErrorMsg } from '../lib/ui';
import { fmtBRL } from '../lib/constants';
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
  const [tab, setTab] = useState('ativos');
  const [orders, setOrders] = useState([]);
  const [finalOrders, setFinalOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverBalances, setDriverBalances] = useState({});
  const [loadingWithdraw, setLoadingWithdraw] = useState(null);
  const [withdrawError, setWithdrawError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders').select('*, order_items(*, order_item_additions(*))')
      .neq('status', 'entregue').neq('status', 'cancelado')
      .order('created_at', { ascending: false });
    setOrders(data || []);
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
    const ids = drivers.map(d => d.id);
    const [{ data: hist }, { data: wdr }] = await Promise.all([
      supabase.from('delivery_history').select('driver_id, valor_entrega').in('driver_id', ids),
      supabase.from('withdrawals').select('driver_id, valor').in('driver_id', ids),
    ]);
    const earned = {};
    const withdrawn = {};
    (hist || []).forEach(r => { earned[r.driver_id] = (earned[r.driver_id] || 0) + Number(r.valor_entrega); });
    (wdr || []).forEach(r => { withdrawn[r.driver_id] = (withdrawn[r.driver_id] || 0) + Number(r.valor); });
    const balances = {};
    ids.forEach(id => { balances[id] = Math.max(0, (earned[id] || 0) - (withdrawn[id] || 0)); });
    setDriverBalances(balances);
  }, [drivers]);

  useEffect(() => { loadOrders(); loadDrivers(); }, [loadOrders, loadDrivers]);
  useEffect(() => { if (tab === 'finalizados') loadFinalOrders(); }, [tab, loadFinalOrders]);
  // loadDriverBalances depende de drivers, então roda quando: (1) aba abre, (2) drivers carrega
  useEffect(() => {
    if (tab === 'entregadores' && drivers.length > 0) loadDriverBalances();
  }, [tab, drivers, loadDriverBalances]);

  useEffect(() => {
    const ch = supabase.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
        if (tab === 'finalizados') loadFinalOrders();
      }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadOrders, loadFinalOrders, tab]);

  async function registerWithdrawal(driver) {
    const balance = driverBalances[driver.id] || 0;
    if (balance <= 0) return;
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
          loading
            ? <p className="text-sm text-gray-400">Carregando...</p>
            : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {ACTIVE_COLUMNS.map(col => {
                  const colOrders = orders.filter(o => o.status === col.status);
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
            {drivers.length === 0 && <EmptyState message="Nenhum entregador cadastrado." />}
            {drivers.map(driver => {
              const balance = driverBalances[driver.id] ?? 0;
              const isPaying = loadingWithdraw === driver.id;
              return (
                <div key={driver.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-800">{driver.name}</p>
                      <p className="text-xs text-gray-400">{driver.phone || 'Sem telefone'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Saldo a pagar</p>
                      <p className={`text-lg font-bold ${balance > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                        R$ {fmtBRL(balance)}
                      </p>
                    </div>
                  </div>
                  {balance > 0 && (
                    <Button variant="success" size="lg" className="mt-3 w-full"
                      onClick={() => registerWithdrawal(driver)} disabled={isPaying}>
                      {isPaying ? 'Registrando...' : `Marcar R$ ${fmtBRL(balance)} como pago`}
                    </Button>
                  )}
                  {balance === 0 && (
                    <p className="mt-2 text-center text-xs text-gray-400">Saldo zerado ✓</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
