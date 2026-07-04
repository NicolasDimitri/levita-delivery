// src/pages/DriverPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import DeliveryCard from '../components/DeliveryCard';

export default function DriverPage() {
  const { signOut, profile, session } = useAuth();
  const [tab, setTab] = useState('ativas');
  const [orders, setOrders] = useState([]);
  const [finishedOrders, setFinishedOrders] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [withdrawNote, setWithdrawNote] = useState('');

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('driver_id', session.user.id)
      .eq('status', 'em_rota')
      .order('assigned_at', { ascending: true });
    setOrders(data || []);
    setLoading(false);
  }, [session]);

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
    const { data: hist } = await supabase
      .from('delivery_history')
      .select('valor_entrega')
      .eq('driver_id', session.user.id);

    const earned = (hist || []).reduce((s, r) => s + Number(r.valor_entrega), 0);

    const { data: wdr } = await supabase
      .from('withdrawals')
      .select('valor')
      .eq('driver_id', session.user.id);

    const withdrawn = (wdr || []).reduce((s, r) => s + Number(r.valor), 0);

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
    loadBalance();
    const channel = supabase
      .channel('driver-orders')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${session.user.id}` },
        () => { loadOrders(); loadBalance(); if (tab === 'finalizadas') loadFinishedOrders(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawals', filter: `driver_id=eq.${session.user.id}` },
        () => { loadBalance(); if (tab === 'saque') loadWithdrawals(); }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadOrders, loadBalance, loadFinishedOrders, loadWithdrawals, session, tab]);

  useEffect(() => {
    if (tab === 'finalizadas') loadFinishedOrders();
    if (tab === 'saque') loadWithdrawals();
  }, [tab, loadFinishedOrders, loadWithdrawals]);

  const tabs = [
    { id: 'ativas',     label: `Em rota${orders.length > 0 ? ` (${orders.length})` : ''}` },
    { id: 'finalizadas', label: 'Finalizadas' },
    { id: 'saque',      label: 'Carteira' },
  ];

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
        {/* aba: em rota */}
        {tab === 'ativas' && (
          <>
            {loading && <p className="text-sm text-gray-400">Carregando...</p>}
            {!loading && orders.length === 0 && (
              <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-sm text-gray-400">Nenhuma entrega em rota agora.</p>
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
