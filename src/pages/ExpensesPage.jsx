// src/pages/ExpensesPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import ExpenseForm from '../components/ExpenseForm';
import ExpenseCard from '../components/ExpenseCard';
import PaymentForm from '../components/PaymentForm';
import PaymentCard from '../components/PaymentCard';

// Datas dos cartões (fechamento / vencimento)
const CARD_DATES = {
  nubank:       { label: 'Nubank',       close: 5,  due: 12 },
  business:     { label: 'Business',     close: 14, due: 21 },
  mercado_pago: { label: 'Mercado Pago', close: 2,  due: 7  },
  ifood_pago:   { label: 'iFood Pago',   close: 19, due: 25 },
};

const METHODS_FILTER = [
  { value: '',             label: 'Todos' },
  { value: 'nubank',       label: 'Nubank' },
  { value: 'business',     label: 'Business' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'ifood_pago',   label: 'iFood Pago' },
  { value: 'boleto',       label: 'Boleto' },
  { value: 'pix',          label: 'Pix' },
  { value: 'emprestimo',   label: 'Empréstimo' },
  { value: 'emprestado',   label: 'Emprestado' },
];

function fmt(n) { return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

export default function ExpensesPage() {
  const { signOut, profile } = useAuth();
  const [tab, setTab] = useState('gastos');
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('todas');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [showForm, setShowForm] = useState(false);

  const loadExpenses = useCallback(async () => {
    let q = supabase.from('expenses').select('*')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (filterCat !== 'todas') q = q.eq('category', filterCat);
    if (filterMethod) q = q.eq('payment_method', filterMethod);
    if (filterUser) q = q.eq('registered_by_name', filterUser);
    const { data } = await q;
    setExpenses(data || []);
    setLoading(false);
  }, [filterCat, filterMethod, filterUser]);

  const loadPayments = useCallback(async () => {
    let q = supabase.from('payments').select('*')
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (filterCat !== 'todas') q = q.eq('category', filterCat);
    if (filterUser) q = q.eq('registered_by_name', filterUser);
    const { data } = await q;
    setPayments(data || []);
  }, [filterCat, filterUser]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => { if (tab === 'pagamentos') loadPayments(); }, [tab, loadPayments]);

  const uniqueUsers = [...new Set([
    ...expenses.map(e => e.registered_by_name),
    ...payments.map(p => p.registered_by_name),
  ])].filter(Boolean);

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);

  const TABS = [
    { id: 'gastos',     label: 'Gastos' },
    { id: 'pagamentos', label: 'Pagamentos' },
    { id: 'cartoes',    label: 'Cartões' },
    { id: 'novo',       label: '+ Gasto' },
    { id: 'pagar',      label: '+ Pago' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* cabeçalho sticky */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-0">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-gray-800">Controle Financeiro</p>
              <p className="text-xs text-gray-400">Olá, {profile?.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/admin" className="text-xs font-medium text-brand-600 hover:underline">← Pedidos</Link>
              <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-700">Sair</button>
            </div>
          </div>
          {/* abas */}
          <div className="flex overflow-x-auto scrollbar-hide">
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setShowForm(false); }}
                className={`shrink-0 border-b-2 px-4 py-2 text-xs font-semibold transition ${
                  tab === t.id
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-5">

        {/* ── ABA GASTOS ── */}
        {tab === 'gastos' && (
          <>
            {/* resumo */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                { l: 'Total',       v: totalExpenses,                                           c: 'text-gray-800' },
                { l: 'Pessoal',     v: expenses.filter(e => e.category === 'pessoal').reduce((s, e) => s + Number(e.amount), 0),     c: 'text-indigo-700' },
                { l: 'Empresarial', v: expenses.filter(e => e.category === 'empresarial').reduce((s, e) => s + Number(e.amount), 0), c: 'text-emerald-700' },
              ].map(r => (
                <div key={r.l} className="rounded-2xl bg-white p-3 shadow-sm text-center border border-gray-100">
                  <p className="text-xs text-gray-400">{r.l}</p>
                  <p className={`text-base font-bold ${r.c}`}>R$ {fmt(r.v)}</p>
                </div>
              ))}
            </div>

            {/* filtros */}
            <div className="mb-4 flex flex-wrap gap-2">
              {['todas', 'pessoal', 'empresarial'].map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    filterCat === c ? 'bg-brand-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
                  }`}>
                  {c}
                </button>
              ))}
              <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
                {METHODS_FILTER.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {uniqueUsers.length > 1 && (
                <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
                  <option value="">Todos</option>
                  {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              )}
            </div>

            {loading && <p className="text-sm text-gray-400">Carregando...</p>}
            {!loading && expenses.length === 0 && (
              <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-sm text-gray-400">Nenhum gasto registrado ainda.</p>
              </div>
            )}
            <div className="space-y-3">
              {expenses.map(e => <ExpenseCard key={e.id} expense={e} />)}
            </div>
          </>
        )}

        {/* ── ABA PAGAMENTOS ── */}
        {tab === 'pagamentos' && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white p-3 shadow-sm text-center border border-gray-100">
                <p className="text-xs text-gray-400">Total pago</p>
                <p className="text-base font-bold text-green-700">R$ {fmt(totalPayments)}</p>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm text-center border border-gray-100">
                <p className="text-xs text-gray-400">Registros</p>
                <p className="text-base font-bold text-gray-700">{payments.length}</p>
              </div>
            </div>

            {/* filtros simples */}
            <div className="mb-4 flex flex-wrap gap-2">
              {['todas', 'pessoal', 'empresarial'].map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    filterCat === c ? 'bg-green-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
                  }`}>
                  {c}
                </button>
              ))}
            </div>

            {payments.length === 0 && (
              <div className="mt-8 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                <p className="text-sm text-gray-400">Nenhum pagamento registrado ainda.</p>
              </div>
            )}
            <div className="space-y-3">
              {payments.map(p => <PaymentCard key={p.id} payment={p} />)}
            </div>
          </>
        )}

        {/* ── ABA CARTÕES ── */}
        {tab === 'cartoes' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Datas de fechamento e vencimento</p>
            {Object.entries(CARD_DATES).map(([key, card]) => {
              // próximo fechamento
              const now = new Date();
              const closeDay = card.close;
              const dueDay = card.due;
              const pastClose = now.getDate() > closeDay;
              const closeMonth = pastClose ? now.getMonth() + 1 : now.getMonth();
              const closeYear = closeMonth > 11 ? now.getFullYear() + 1 : now.getFullYear();
              const closeDate = new Date(closeYear, closeMonth % 12, closeDay);

              const dueMonth = closeMonth + 1;
              const dueYear = dueMonth > 11 ? now.getFullYear() + 1 : now.getFullYear();
              let dueDate = new Date(dueYear, dueMonth % 12, dueDay);
              // próximo dia útil
              if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);
              if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);

              const daysToClose = Math.ceil((closeDate - now) / (1000 * 60 * 60 * 24));
              const daysToDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

              return (
                <div key={key} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                  <p className="mb-3 font-semibold text-gray-800">{card.label}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-xl p-3 text-center ${daysToClose <= 3 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400 mb-0.5">Fecha em</p>
                      <p className="text-sm font-bold text-gray-800">
                        {closeDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                      <p className={`text-xs font-medium mt-0.5 ${daysToClose <= 3 ? 'text-red-600' : 'text-gray-400'}`}>
                        {daysToClose <= 0 ? 'Hoje!' : `${daysToClose} dias`}
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${daysToDue <= 5 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400 mb-0.5">Vence em</p>
                      <p className="text-sm font-bold text-gray-800">
                        {dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                      <p className={`text-xs font-medium mt-0.5 ${daysToDue <= 5 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {daysToDue <= 0 ? 'Vencido!' : `${daysToDue} dias`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-gray-400 text-center pt-2">
              Datas ajustadas para o próximo dia útil quando caem em fim de semana.
            </p>
          </div>
        )}

        {/* ── ABA NOVO GASTO ── */}
        {tab === 'novo' && (
          <ExpenseForm onSaved={() => { loadExpenses(); setTab('gastos'); }} />
        )}

        {/* ── ABA REGISTRAR PAGAMENTO ── */}
        {tab === 'pagar' && (
          <PaymentForm onSaved={() => { loadPayments(); setTab('pagamentos'); }} />
        )}
      </div>
    </div>
  );
}
