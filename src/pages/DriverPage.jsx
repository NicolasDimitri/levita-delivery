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

  const [pendingWithdrawal, setPendingWithdrawal] = useState(null);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState('');

  const [showPixForm, setShowPixForm] = useState(false);
  const [pixKey, setPixKey] = useState(profile?.pix_key || '');
  const [savingPix, setSavingPix] = useState(false);

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

  // saldo disponível usa a função SQL driver_available_balance(), que já
  // exclui qualquer entrega que tenha entrado numa solicitação de saque
  // anterior — é a mesma lógica usada no backend pra criar a solicitação,
  // então o número mostrado aqui nunca diverge do que será sacado de fato
  const loadBalance = useCallback(async () => {
    const { data } = await supabase.rpc('driver_available_balance', { p_driver_id: session.user.id });
    setBalance(Number(data) || 0);
  }, [session]);

  const loadPendingWithdrawal = useCallback(async () => {
    const { data } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('driver_id', session.user.id)
      .eq('status', 'pendente')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setPendingWithdrawal(data || null);
  }, [session]);

  useEffect(() => {
    loadOrders();
    loadBalance();
    loadPendingWithdrawal();

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawal_requests', filter: `driver_id=eq.${session.user.id}` },
        () => {
          loadBalance();
          loadPendingWithdrawal();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadOrders, loadBalance, loadFinishedOrders, loadPendingWithdrawal, session, tab]);

  useEffect(() => {
    if (tab === 'finalizadas') loadFinishedOrders();
  }, [tab, loadFinishedOrders]);

  async function handleRequestWithdrawal() {
    setRequestingWithdrawal(true);
    setWithdrawalError('');
    try {
      const token = session.access_token;
      const res = await fetch('/api/driver/request-withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao solicitar saque');

      await loadBalance();
      await loadPendingWithdrawal();
    } catch (err) {
      setWithdrawalError(err.message);
    } finally {
      setRequestingWithdrawal(false);
    }
  }

  async function handleSavePix(e) {
    e.preventDefault();
    setSavingPix(true);
    setWithdrawalError('');
    try {
      const { error } = await supabase.from('profiles').update({ pix_key: pixKey }).eq('id', session.user.id);
      if (error) throw new Error(error.message);
      setShowPixForm(false);
    } catch (err) {
      setWithdrawalError(err.message);
    } finally {
      setSavingPix(false);
    }
  }

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

          {withdrawalError && <p className="mt-2 text-sm text-red-600">{withdrawalError}</p>}

          {pendingWithdrawal ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Saque de R$ {Number(pendingWithdrawal.total_value).toFixed(2)} solicitado em{' '}
              {new Date(pendingWithdrawal.requested_at).toLocaleDateString('pt-BR')} — aguardando pagamento.
            </p>
          ) : (
            <button
              onClick={handleRequestWithdrawal}
              disabled={requestingWithdrawal || balance <= 0}
              className="mt-3 w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {requestingWithdrawal ? 'Solicitando...' : 'Solicitar saque via PIX'}
            </button>
          )}

          <button
            onClick={() => {
              setPixKey(profile?.pix_key || '');
              setShowPixForm((v) => !v);
            }}
            className="mt-2 w-full text-center text-xs text-gray-500 hover:text-gray-700 hover:underline"
          >
            {profile?.pix_key ? 'Trocar chave PIX' : 'Cadastrar chave PIX'}
          </button>

          {showPixForm && (
            <form onSubmit={handleSavePix} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              <label className="block text-xs font-medium text-gray-600">Sua chave PIX</label>
              <input
                required
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPixForm(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPix}
                  className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {savingPix ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          )}
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