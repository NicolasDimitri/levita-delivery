import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Card, Button, ErrorMsg } from '../lib/ui';
import { fmtBRL } from '../lib/constants';
import { STORES, dailyStoreEntries, settlementEntry, summarizeSettlement, todayInBrazil, weekFor } from '../lib/orderSettlement';

const PAGE_SIZE = 500;
const money = cents => `R$ ${fmtBRL(cents / 100)}`;
const shortDate = date => date.split('-').reverse().join('/');

function SummaryCard({ label, summary, onClick }) {
  const content = (
    <Card>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-800">{money(summary.payout)}</p>
      <p className="mt-1 text-xs text-gray-500">
        {summary.count} calculado(s){summary.excluded > 0 && ` · ${summary.excluded} não calculado(s)`}
      </p>
      {onClick && <p className="mt-2 text-xs font-semibold text-brand-600">Ver pedidos</p>}
    </Card>
  );
  if (!onClick) return content;
  return (
    <button type="button" onClick={onClick}
      className="w-full rounded-2xl text-left transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
      {content}
    </button>
  );
}

export default function OrderSettlement() {
  const [date, setDate] = useState(todayInBrazil);
  const [selectedStore, setSelectedStore] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState(false);
  const requestId = useRef(0);
  const loadedIds = useRef(new Set());
  const week = useMemo(() => weekFor(date), [date]);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    let rows = [];
    let expected = null;
    for (let offset = 0; expected === null || offset < expected; offset += PAGE_SIZE) {
      const { data, error: queryError, count } = await supabase
        .rpc('get_weekly_order_estimates', { p_start: week.start, p_end: week.end }, { count: 'exact' })
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (request !== requestId.current) return;
      if (queryError || count === null || !data || (data.length === 0 && offset < count)) {
        setError(queryError?.message || 'Não foi possível carregar todos os pedidos da semana.');
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
      if (new Set(rows.map(row => row.id)).size !== rows.length) {
        setError('Os pedidos mudaram durante a consulta. Atualize para calcular novamente.');
        setLoading(false);
        return;
      }
      if (data.length < PAGE_SIZE && rows.length < expected) {
        setError('A consulta não retornou todos os pedidos. Verifique o limite de linhas do banco.');
        setLoading(false);
        return;
      }
    }
    loadedIds.current = new Set(rows.map(row => row.id));
    setOrders(rows);
    setLoading(false);
  }, [week.start, week.end]);

  useEffect(() => {
    load();
    let timer;
    const channel = supabase.channel(`financial-orders-${week.start}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        const id = payload.new?.id || payload.old?.id;
        if (payload.new?.status !== 'entregue' && !loadedIds.current.has(id)) return;
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
  }, [load, week.start]);

  const dailyOrders = orders.filter(order => order.order_date === date);
  const daily = summarizeSettlement(dailyOrders);
  const weekly = summarizeSettlement(orders);
  const reasons = {};
  for (const order of orders) {
    const { reason } = settlementEntry(order);
    if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
  }

  if (selectedStore) {
    const entries = dailyStoreEntries(orders, date, selectedStore.id);
    const summary = summarizeSettlement(entries.map(entry => entry.order));
    return (
      <div className="space-y-4">
        <Button type="button" variant="secondary" onClick={() => setSelectedStore(null)}>← Voltar</Button>
        <div>
          <h2 className="font-semibold text-gray-800">{selectedStore.name}</h2>
          <p className="text-sm text-gray-500">Pedidos de {shortDate(date)}</p>
        </div>
        {error && <ErrorMsg message={`Erro ao carregar repasses: ${error}`} />}
        {liveError && <p className="text-xs text-amber-700">Atualização automática indisponível. Volte e use Atualizar.</p>}
        {loading && <p className="text-sm text-gray-500">Carregando pedidos...</p>}
        {!loading && !error && (
          <>
            <SummaryCard label="Repasse estimado" summary={summary} />
            <p className="text-xs text-gray-500">
              O valor previsto para pagamento na entrega é abatido do repasse. Ajustes do iFood não estão incluídos.
            </p>
            {entries.length === 0 && <p className="text-sm text-gray-500">Nenhum pedido concluído para esta loja neste dia.</p>}
            {entries.map(({ order, calculation, reason }) => (
              <Card key={order.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-800">Pedido {order.display_id ? `#${order.display_id}` : order.id}</p>
                  {!reason && <p className="font-bold text-gray-800">{money(calculation.payout)}</p>}
                </div>
                {reason ? (
                  <p className="mt-2 text-sm text-amber-700">Não calculado: {reason}</p>
                ) : (
                  <div className="mt-2 space-y-1 text-xs text-gray-500">
                    <p>Itens e entrega: {money(calculation.gross)}</p>
                    <p>Incentivo da loja: − {money(calculation.merchant)}</p>
                    <p>Comissão iFood: − {money(calculation.commission)}</p>
                    <p>Taxa de pagamento online: − {money(calculation.onlineFee)}</p>
                    {calculation.pending > 0 && <p>Pagamento previsto na entrega: − {money(calculation.pending)}</p>}
                  </div>
                )}
              </Card>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <label className="flex-1 text-xs font-semibold text-gray-500">
          Dia dos pedidos
          <input type="date" value={date} onChange={event => {
            if (event.target.value) setDate(event.target.value);
          }} className="mt-1 block w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm" />
        </label>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>Atualizar</Button>
      </div>
      <p className="text-xs text-gray-500">
        Estimativa para pedidos concluídos, não é o extrato oficial do iFood. As taxas de 12% e, no pagamento online,
        3,2% são calculadas sobre itens e entrega, menos incentivo da loja. O valor previsto na entrega é abatido
        do repasse. Ajustes, como reembolso da taxa de serviço, não estão incluídos; confira o demonstrativo.
      </p>
      {error && <ErrorMsg message={`Erro ao carregar repasses: ${error}`} />}
      {liveError && <p className="text-xs text-amber-700">Atualização automática indisponível. Use o botão Atualizar.</p>}
      {loading && <p className="text-sm text-gray-500">Carregando pedidos...</p>}
      {!loading && !error && (
        <>
          {(daily.excluded > 0 || weekly.excluded > 0) && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Valores parciais: {weekly.excluded} pedido(s) da semana não puderam ser calculados.
              {Object.entries(reasons).map(([reason, count]) => (
                <p key={reason} className="mt-1 text-xs">{reason}: {count}</p>
              ))}
            </div>
          )}
          <h2 className="font-semibold text-gray-800">Dia {shortDate(date)}</h2>
          <SummaryCard label="Repasse estimado das três lojas" summary={daily} />
          <div className="grid gap-2 sm:grid-cols-3">
            {STORES.map(store => (
              <SummaryCard key={store.id} label={store.name}
                summary={summarizeSettlement(dailyOrders.filter(order => order.merchant_id === store.id))}
                onClick={() => setSelectedStore(store)} />
            ))}
          </div>
          <h2 className="font-semibold text-gray-800">Repasse estimado da semana</h2>
          <p className="text-xs text-gray-500">
            Pedidos de {shortDate(week.start)} a {shortDate(week.last)} · previsão: quarta-feira, {shortDate(week.payout)}.
            Valor negativo indica desconto no repasse.
          </p>
          <SummaryCard label="Total das três lojas" summary={weekly} />
          <div className="grid gap-2 sm:grid-cols-3">
            {STORES.map(store => (
              <SummaryCard key={store.id} label={store.name}
                summary={summarizeSettlement(orders.filter(order => order.merchant_id === store.id))} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
