import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { fmtBRL } from '../lib/constants';
import { Button, Card, EmptyState, ErrorMsg } from '../lib/ui';
import { weeklySettlementHistory } from '../lib/orderSettlement';

const PAGE_SIZE = 500;
const money = cents => `R$ ${fmtBRL(cents / 100)}`;
const shortDate = date => date.split('-').reverse().join('/');

export default function SettlementHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    let rows = [];
    let expected = null;
    for (let offset = 0; expected === null || offset < expected; offset += PAGE_SIZE) {
      const { data, error: queryError, count } = await supabase
        .rpc('get_order_settlement_history', {}, { count: 'exact' })
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (request !== requestId.current) return;
      if (queryError || count === null || !data || (data.length === 0 && offset < count)) {
        setError(queryError?.message || 'Não foi possível carregar todo o histórico de repasses.');
        setLoading(false);
        return;
      }
      if (expected !== null && count !== expected) {
        setError('Os pedidos mudaram durante a consulta. Atualize para calcular novamente.');
        setLoading(false);
        return;
      }
      expected = count;
      rows = rows.concat(data);
      if (new Set(rows.map(row => row.id)).size !== rows.length ||
          (data.length < PAGE_SIZE && rows.length < expected)) {
        setError('Não foi possível carregar todo o histórico. Atualize para tentar novamente.');
        setLoading(false);
        return;
      }
    }
    setOrders(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    let timer;
    const channel = supabase.channel('financial-settlement-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        clearTimeout(timer);
        timer = setTimeout(load, 1000);
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setLiveError(false);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLiveError(true);
      });
    return () => {
      requestId.current++;
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const weeks = weeklySettlementHistory(orders);
  const balance = weeks.reduce((total, item) => total + item.summary.payout, 0);
  const excluded = weeks.reduce((total, item) => total + item.summary.excluded, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Saldo e histórico de repasses</h2>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>
      </div>
      {error && <ErrorMsg message={`Erro ao carregar histórico: ${error}`} />}
      {liveError && <p className="text-xs text-amber-700">Atualização automática indisponível. Use o botão Atualizar.</p>}
      {loading && <p className="text-sm text-gray-500">Carregando histórico...</p>}
      {!loading && !error && (
        <>
          <Card>
            <p className="text-xs text-gray-500">Saldo estimado acumulado</p>
            <p className="mt-1 text-lg font-bold text-gray-800">{money(balance)}</p>
            {excluded > 0 && (
              <p className="mt-1 text-xs text-amber-700">Valor parcial: {excluded} pedido(s) não calculado(s).</p>
            )}
          </Card>
          <h3 className="font-semibold text-gray-800">Histórico semanal</h3>
          {weeks.length === 0 && <EmptyState message="Nenhum pedido concluído no histórico." />}
          {weeks.map(({ week, summary, stores }) => (
            <Card key={week.start}>
              <button type="button" aria-expanded={expandedWeek === week.start}
                onClick={() => setExpandedWeek(expandedWeek === week.start ? null : week.start)}
                className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-800">{shortDate(week.start)} a {shortDate(week.last)}</span>
                  <span className="font-bold text-gray-800">{money(summary.payout)}</span>
                </span>
                <span className="mt-1 block text-xs text-brand-600">
                  {expandedWeek === week.start ? 'Ocultar lojas' : 'Ver lojas'}
                </span>
              </button>
              {summary.excluded > 0 && (
                <p className="mt-1 text-xs text-amber-700">Valor parcial: {summary.excluded} pedido(s) não calculado(s).</p>
              )}
              {expandedWeek === week.start && (
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  {stores.map(store => (
                    <div key={store.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">
                        {store.name}
                        {store.summary.excluded > 0 && (
                          <span className="block text-xs text-amber-700">{store.summary.excluded} pedido(s) não calculado(s)</span>
                        )}
                      </span>
                      <span className="font-semibold text-gray-800">{money(store.summary.payout)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
