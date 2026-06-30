// src/pages/AdminPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import OrderCard from '../components/OrderCard';

export default function AdminPage() {
  const { signOut, profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const loadDrivers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'driver');
    setDrivers(data || []);
  }, []);

  useEffect(() => {
    loadOrders();
    loadDrivers();

    // tempo real: qualquer mudança na tabela orders recarrega a lista
    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadOrders, loadDrivers]);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Pedidos</h1>
            <p className="text-sm text-gray-500">Olá, {profile?.name}</p>
          </div>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">
            Sair
          </button>
        </div>

        {loading && <p className="text-gray-500">Carregando pedidos...</p>}

        {!loading && orders.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
            Nenhum pedido em andamento no momento.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} drivers={drivers} onChanged={loadOrders} />
          ))}
        </div>
      </div>
    </div>
  );
}
