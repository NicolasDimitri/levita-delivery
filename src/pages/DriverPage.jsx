// src/pages/DriverPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import DeliveryCard from '../components/DeliveryCard';

export default function DriverPage() {
  const { signOut, profile, session } = useAuth();
  const [orders, setOrders] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('driver_id', session.user.id)
      .eq('status', 'em_preparo')
      .order('assigned_at', { ascending: true });

    setOrders(data || []);
    setLoading(false);
  }, [session]);

  // Soma do delivery_history — só entra linha ali DEPOIS que o código de
  // entrega é validado com sucesso pelo iFood (veja api/ifood/verify-delivery.js),
  // então o saldo nunca conta uma entrega só por ter sido atribuída.
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
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadOrders, loadBalance, session]);

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

        {loading && <p className="text-gray-500">Carregando...</p>}

        {!loading && orders.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
            Nenhuma entrega no momento.
          </p>
        )}

        <div className="space-y-4">
          {orders.map((order) => (
            <DeliveryCard key={order.id} order={order} onChanged={loadOrders} />
          ))}
        </div>
      </div>
    </div>
  );
}
