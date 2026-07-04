// src/components/OrderCard.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useApi } from '../lib/useApi';
import { Button, Badge, SectionLabel, ErrorMsg } from '../lib/ui';
import CountdownTimer from './CountdownTimer';
import { ORDER_STATUS, fmtBRL, fmtDate } from '../lib/constants';

export { ORDER_STATUS };

export default function OrderCard({ order, drivers, onChanged }) {
  const { call } = useApi();
  const [loadingKey, setLoadingKey] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(order.driver_id || '');
  const [error, setError] = useState('');

  const status = ORDER_STATUS[order.status] ?? ORDER_STATUS.recebido;

  async function run(key, fn) {
    setLoadingKey(key);
    setError('');
    try { await fn(); onChanged?.(); }
    catch (e) { setError(e.message); }
    finally { setLoadingKey(null); }
  }

  const accept   = () => run('accept',  () => call('/api/ifood/confirm',  { body: { orderId: order.id } }));
  const dispatch = () => run('dispatch', () => call('/api/ifood/dispatch', { body: { orderId: order.id } }));

  const markReady = () => run('ready', async () => {
    const { error: e } = await supabase.from('orders').update({ status: 'pronto' }).eq('id', order.id);
    if (e) throw new Error(e.message);
  });

  const assignDriver = () => {
    if (!selectedDriver) return setError('Selecione um entregador primeiro.');
    run('assign', async () => {
      const { error: e } = await supabase.from('orders')
        .update({ driver_id: selectedDriver, assigned_at: new Date().toISOString() })
        .eq('id', order.id);
      if (e) throw new Error(e.message);
    });
  };

  const driverName = drivers.find(d => d.id === (order.driver_id || selectedDriver))?.name;
  const loading = (k) => loadingKey === k;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
      {/* cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm text-gray-800">{order.customer_name}</p>
          <p className="truncate text-xs text-gray-400">
            {[order.street, order.street_number, order.neighborhood].filter(Boolean).join(', ')}
          </p>
          {order.display_id && <p className="text-xs text-gray-300">#{order.display_id}</p>}
        </div>
        <Badge color={status.color}>{status.label}</Badge>
      </div>

      {/* temporizador */}
      {order.status === 'recebido' && (
        <CountdownTimer target={new Date(new Date(order.created_at).getTime() + 8 * 60 * 1000)} label="Aceitar em" />
      )}
      {['em_preparo', 'pronto', 'em_rota'].includes(order.status) && order.delivery_date_time && (
        <CountdownTimer target={order.delivery_date_time} label="Previsão" />
      )}

      {/* itens */}
      <ul className="text-xs text-gray-600 space-y-0.5">
        {order.order_items?.map(item => (
          <li key={item.id}>
            {item.quantity}x {item.name}
            {item.order_item_additions?.length > 0 && (
              <span className="text-gray-400"> + {item.order_item_additions.map(a => `${a.quantity}x ${a.name}`).join(', ')}</span>
            )}
          </li>
        ))}
      </ul>

      {/* total + pagamento */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-800">R$ {fmtBRL(order.total_value)}</span>
        <Badge color={order.payment_category === 'online' ? 'green' : order.payment_category === 'credito' ? 'red' : order.payment_category === 'debito' ? 'amber' : 'blue'}>
          {order.payment_category}
        </Badge>
      </div>

      <ErrorMsg message={error} />

      {/* ações por status */}
      {order.status === 'recebido' && (
        <Button variant="primary" size="lg" onClick={accept} disabled={loading('accept')}>
          {loading('accept') ? 'Aceitando...' : 'Aceitar pedido'}
        </Button>
      )}

      {order.status === 'em_preparo' && (
        <Button variant="blue" size="lg" onClick={markReady} disabled={loading('ready')}
          className="w-full !bg-purple-600 hover:!bg-purple-700">
          {loading('ready') ? 'Atualizando...' : 'Marcar como pronto'}
        </Button>
      )}

      {order.status === 'pronto' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
              className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none">
              <option value="">Selecionar entregador</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <Button variant="primary" onClick={assignDriver} disabled={loading('assign')}>
              {loading('assign') ? '...' : driverName ? 'Trocar' : 'Atribuir'}
            </Button>
          </div>
          {driverName && <p className="text-xs text-gray-400">Atribuído: {driverName}</p>}
          <Button variant="blue" size="lg" onClick={dispatch} disabled={loading('dispatch')}>
            {loading('dispatch') ? 'Despachando...' : 'Despachar pro iFood'}
          </Button>
        </div>
      )}

      {order.status === 'em_rota' && (
        <p className="text-xs text-gray-400">Em rota com {driverName ?? '—'} · aguardando confirmação</p>
      )}

      {order.status === 'entregue' && order.delivered_at && (
        <p className="text-xs text-gray-400">Entregue em {fmtDate(order.delivered_at)}{driverName ? ` por ${driverName}` : ''}</p>
      )}

      {order.status === 'cancelado' && <p className="text-xs text-red-400">Pedido cancelado.</p>}
    </div>
  );
}
