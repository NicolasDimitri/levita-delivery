// src/pages/DriverPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import DeliveryCard from '../components/DeliveryCard';

export default function DriverPage() {
  const { signOut, profile, session } = useAuth();
  const [tab, setTab] = useState('ativas'); // 'ativas' | 'finalizadas'
  const [orders, setOrders] = useState([]);
  const [finishedOrders, setFinishedOrders] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Só pedidos despachados pro iFood (em_rota) aparecem pro entregador -
  // antes disso (em_preparo / pronto) o pedido ainda nem saiu da cozinha.
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

  // Histórico - entregas concluídas por esse entregador. Carregada só
  // quando ele abre a aba, pra não ficar presa no realtime sem necessidade.
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
    const { data } = await supabase
      .from('delivery_history')
      .select('valor_entrega')
      .eq('driver_id', session.user.id);

    const total = (data || []).reduce((sum, row) => sum + Number(row.valor_entrega), 0);
    setBalance(total);
  }, [session]);

  useEffect(() => {
    loadOrders();
    loadBalance();

    const channel = supabase
      .channel('driver-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${session.user.id}` },
        () => {
          loadOrders();
          loadBalance();
          if (tab === 'finalizadas') loadFinishedOrders();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadOrders, loadBalance, loadFinishedOrders, session, tab]);

  useEffect(() => {
    if (tab === 'finalizadas') loadFinishedOrders();
  }, [tab, loadFinishedOrders]);

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Minhas entregas</h1>
            <p className="text-sm text-gray-500">Olá, {profile?.name}</p>
          </div>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">
            Sair
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Saldo de entregas concluídas</p>
          <p className="text-2xl font-semibold text-green-700">R$ {balance.toFixed(2)}</p>
        </div>

        <div className="mb-5 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setTab('ativas')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === 'ativas' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
            }`}
          >
            Em rota {orders.length > 0 && `(${orders.length})`}
          </button>
          <button
            onClick={() => setTab('finalizadas')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === 'finalizadas' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
            }`}
          >
            Finalizadas
          </button>
        </div>

        {tab === 'ativas' && (
          <>
            {loading && <p className="text-gray-500">Carregando...</p>}
            {!loading && orders.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
                Nenhuma entrega em rota no momento.
              </p>
            )}
            <div className="space-y-4">
              {orders.map((order) => (
                <DeliveryCard key={order.id} order={order} onChanged={loadOrders} />
              ))}
            </div>
          </>
        )}

        {tab === 'finalizadas' && (
          <div className="space-y-2">
            {finishedOrders.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
                Nenhuma entrega finalizada ainda.
              </p>
            )}
            {finishedOrders.map((order) => (
              <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{order.customer_name}</p>
                    <p className="text-sm text-gray-500">
                      {order.street}, {order.street_number} - {order.neighborhood}
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                    Entregue
                  </span>
                </div>
                {order.delivered_at && (
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(order.delivered_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
