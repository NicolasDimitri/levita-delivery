import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Card, Button, ErrorMsg } from '../lib/ui';
import { fmtBRL } from '../lib/constants';
import { STORES, calculateOrderSettlement, todayInBrazil, weekFor } from '../lib/orderSettlement';

const PAGE_SIZE = 500;
const money = cents => `R$ ${fmtBRL(cents / 100)}`;
const shortDate = date => date.split('-').reverse().join('/');

function summarize(orders) {
  const result = { net: 0, payout: 0, count: 0, excluded: 0 };
  for (const order of orders) {
    const calculation = calculateOrderSettlement(order);
    if (order.date_estimated || calculation.error || !STORES.some(store => store.id === order.merchant_id)) {
      result.excluded++;
    } else {
      result.net += calculation.net;
      result.payout += calculation.payout;
      result.count++;
    }
  }
  return result;
}

function SummaryCard({ label, summary, field }) {
  return (
    <Card>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-800">{money(summary[field])}</p>
      <p className="mt-1 text-xs text-gray-500">
        {summary.count} calculado(s){summary.excluded > 0 && ` · ${summary.excluded} não calculado(s)`}
      </p>
    </Card>
  );
}

export default function OrderSettlement() {
  const [date, setDate] = useState(todayInBrazil);
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
  const daily = summarize(dailyOrders);
  const weekly = summarize(orders);
  const reasons = {};
  for (const order of orders) {
    const reason = order.date_estimated ? 'Data original não disponível'
      : !STORES.some(store => store.id === order.merchant_id) ? 'Loja não identificada'
        : calculateOrderSettlement(order).error;
    if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
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
        Estimativa para pedidos concluídos, não é o extrato oficial do iFood. Comissão de 12% sobre itens, entrega e taxas
        adicionais, menos incentivo da loja. As taxas adicionais entram na base da comissão, mas não no valor da loja.
        O valor previsto na entrega é abatido do repasse. Confira outras taxas e a comissão real no demonstrativo.
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
          <SummaryCard label="Total líquido das três lojas" summary={daily} field="net" />
          <div className="grid gap-2 sm:grid-cols-3">
            {STORES.map(store => (
              <SummaryCard key={store.id} label={store.name}
                summary={summarize(dailyOrders.filter(order => order.merchant_id === store.id))} field="net" />
            ))}
          </div>
          <h2 className="font-semibold text-gray-800">Repasse estimado da semana</h2>
          <p className="text-xs text-gray-500">
            Pedidos de {shortDate(week.start)} a {shortDate(week.last)} · previsão: quarta-feira, {shortDate(week.payout)}.
            Valor negativo indica desconto no repasse.
          </p>
          <SummaryCard label="Total das três lojas" summary={weekly} field="payout" />
          <div className="grid gap-2 sm:grid-cols-3">
            {STORES.map(store => (
              <SummaryCard key={store.id} label={store.name}
                summary={summarize(orders.filter(order => order.merchant_id === store.id))} field="payout" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
