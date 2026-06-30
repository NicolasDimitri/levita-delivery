// src/pages/AdminPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import OrderCard from '../components/OrderCard';
import StoreStatusToggle from '../components/StoreStatusToggle';
import WithdrawalsTab from '../components/WithdrawalsTab';

// Colunas visíveis na aba "Ativos", na ordem do fluxo - mesmo modelo do
// Gestor de Pedidos do iFood (Em preparo / Pronto / Em rota), com a coluna
// extra "Novos pedidos" antes (pedidos que ainda não foram aceitos).
const ACTIVE_COLUMNS = [
  { status: 'recebido', title: 'Novos pedidos' },
  { status: 'em_preparo', title: 'Em preparo' },
  { status: 'pronto', title: 'Pronto' },
  { status: 'em_rota', title: 'Em rota' }
];

export default function AdminPage() {
  const { signOut, profile } = useAuth();
  const [tab, setTab] = useState('ativos'); // 'ativos' | 'finalizados' | 'saques'
  const [orders, setOrders] = useState([]);
  const [finalizedOrders, setFinalizedOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);

  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pendente').length;

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_additions(*))')
      .neq('status', 'entregue')
      .neq('status', 'cancelado')
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  }, []);

  // Carregada só quando o admin abre a aba "Finalizados" - não fica presa
  // no realtime, pra não recarregar uma lista grande a cada evento.
  const loadFinalizedOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, order_item_additions(*))')
      .in('status', ['entregue', 'cancelado'])
      .order('created_at', { ascending: false })
      .limit(50);

    setFinalizedOrders(data || []);
  }, []);

  const loadDrivers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'driver');
    setDrivers(data || []);
  }, []);

  // mostra solicitações pendentes + as últimas 20 pagas, pra ter um
  // histórico recente sem carregar a tabela inteira
  const loadWithdrawals = useCallback(async () => {
    const { data: pendingData } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('status', 'pendente')
      .order('requested_at', { ascending: true });

    const { data: paidData } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('status', 'pago')
      .order('paid_at', { ascending: false })
      .limit(20);

    setWithdrawals([...(pendingData || []), ...(paidData || [])]);
  }, []);

  useEffect(() => {
    loadOrders();
    loadDrivers();
    loadWithdrawals();

    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
        // se o admin estiver olhando "Finalizados" no momento em que um
        // pedido é concluído, atualiza essa lista também
        if (tab === 'finalizados') loadFinalizedOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => {
        loadWithdrawals();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadOrders, loadDrivers, loadFinalizedOrders, loadWithdrawals, tab]);

  useEffect(() => {
    if (tab === 'finalizados') loadFinalizedOrders();
  }, [tab, loadFinalizedOrders]);

  const totalAtivos = orders.length;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Pedidos</h1>
            <p className="text-sm text-gray-500">Olá, {profile?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <StoreStatusToggle />
            <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">
              Sair
            </button>
          </div>
        </div>

        <div className="mb-5 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setTab('ativos')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === 'ativos' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
            }`}
          >
            Ativos {totalAtivos > 0 && `(${totalAtivos})`}
          </button>
          <button
            onClick={() => setTab('finalizados')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === 'finalizados' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
            }`}
          >
            Finalizados
          </button>
          <button
            onClick={() => setTab('saques')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === 'saques' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
            }`}
          >
            Saques {pendingWithdrawalsCount > 0 && `(${pendingWithdrawalsCount})`}
          </button>
        </div>

        {loading && tab === 'ativos' && <p className="text-gray-500">Carregando pedidos...</p>}

        {tab === 'ativos' && !loading && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {ACTIVE_COLUMNS.map((col) => {
              const columnOrders = orders.filter((o) => o.status === col.status);
              return (
                <div key={col.status} className="rounded-xl bg-gray-100 p-3">
                  <p className="mb-3 px-1 text-sm font-semibold text-gray-600">
                    {col.title} <span className="text-gray-400">({columnOrders.length})</span>
                  </p>
                  <div className="space-y-3">
                    {columnOrders.length === 0 && (
                      <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-400">
                        Nenhum pedido aqui
                      </p>
                    )}
                    {columnOrders.map((order) => (
                      <OrderCard key={order.id} order={order} drivers={drivers} onChanged={loadOrders} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'finalizados' && (
          <div>
            {finalizedOrders.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
                Nenhum pedido finalizado ainda.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {finalizedOrders.map((order) => (
                <OrderCard key={order.id} order={order} drivers={drivers} onChanged={loadFinalizedOrders} />
              ))}
            </div>
          </div>
        )}

        {tab === 'saques' && (
          <WithdrawalsTab withdrawals={withdrawals} drivers={drivers} onChanged={loadWithdrawals} />
        )}
      </div>
    </div>
  );
}