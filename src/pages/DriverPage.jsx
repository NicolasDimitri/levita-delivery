// src/pages/DriverPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import DeliveryCard from '../components/DeliveryCard';

export default function DriverPage() {
  const { signOut, profile, session } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('driver_id', session.user.id)
      .eq('status', 'a_caminho')
      .order('assigned_at', { ascending: true });

    setOrders(data || []);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel('driver-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${session.user.id}` },
        () => loadOrders()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadOrders, session]);

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
