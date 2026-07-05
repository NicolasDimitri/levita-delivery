// src/pages/ExpensesPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { TabBar, Button, EmptyState, Card, SectionLabel, Sheet, FloatingActions } from '../lib/ui';
import {
  EXPENSE_METHODS, CARD_INFO, CARDS, cardDueDates, fmtBRL, fmtDateShort,
  cardOwed, lenderOwed,
} from '../lib/constants';
import ExpenseForm from '../components/ExpenseForm';
import ExpenseCard from '../components/ExpenseCard';
import PaymentForm from '../components/PaymentForm';
import PaymentCard from '../components/PaymentCard';

const TABS = [
  { id: 'gastos',     label: 'Gastos'     },
  { id: 'pagamentos', label: 'Pagamentos' },
  { id: 'cartoes',    label: 'Cartões'    },
];

const CATS = ['todas', 'pessoal', 'empresarial'];

export default function ExpensesPage() {
  const { signOut, profile } = useAuth();
  const [tab, setTab] = useState('gastos');
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('todas');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterUser, setFilterUser] = useState('');

  // formulários flutuantes
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false);
  const [paymentPreset, setPaymentPreset] = useState(undefined); // undefined = fechado

  const loadExpenses = useCallback(async () => {
    let q = supabase.from('expenses').select('*')
      .order('purchase_date', { ascending: false }).order('created_at', { ascending: false });
    if (filterCat !== 'todas') q = q.eq('category', filterCat);
    if (filterMethod) q = q.eq('payment_method', filterMethod);
    if (filterUser) q = q.eq('registered_by_name', filterUser);
    const { data } = await q;
    setExpenses(data || []);
    setLoading(false);
  }, [filterCat, filterMethod, filterUser]);

  const loadPayments = useCallback(async () => {
    let q = supabase.from('payments').select('*')
      .order('payment_date', { ascending: false }).order('created_at', { ascending: false });
    if (filterCat !== 'todas') q = q.eq('category', filterCat);
    if (filterUser) q = q.eq('registered_by_name', filterUser);
    const { data } = await q;
    setPayments(data || []);
  }, [filterCat, filterUser]);

  // gastos e pagamentos são carregados sempre — cartões e saldos de dívida
  // dependem dos dois, mesmo em abas diferentes.
  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => { loadPayments(); }, [loadPayments]);

  function reloadAll() {
    loadExpenses();
    loadPayments();
  }

  const allUsers = [...new Set([
    ...expenses.map(e => e.registered_by_name),
    ...payments.map(p => p.registered_by_name),
  ])].filter(Boolean);

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const byCategory = cat => expenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0);

  function openPayCard(cardKey) {
    setPaymentPreset({ payment_type: 'fatura_cartao', reference: cardKey, category: 'pessoal' });
  }

  function openPayExpense(e) {
    if (e.payment_method === 'emprestado') {
      setPaymentPreset({ payment_type: 'quitacao_emprestado', reference: e.lender_name, category: e.category });
    } else if (e.payment_method === 'emprestimo') {
      setPaymentPreset({ payment_type: 'quitacao_emprestimo', reference: e.description, category: e.category });
    }
  }

  function Filters({ showMethod = false }) {
    return (
      <div className="mb-4 flex flex-wrap gap-2">
        {CATS.map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
              filterCat === c ? 'bg-brand-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}>{c}</button>
        ))}
        {showMethod && (
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
            <option value="">Todos métodos</option>
            {EXPENSE_METHODS.map(m => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
          </select>
        )}
        {allUsers.length > 1 && (
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
            <option value="">Todos usuários</option>
            {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* cabeçalho */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-0">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-800">Controle Financeiro</p>
              <p className="text-xs text-gray-400">Olá, {profile?.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/admin" className="text-xs font-medium text-brand-600 hover:underline">← Pedidos</Link>
              <Button variant="ghost" onClick={signOut}>Sair</Button>
            </div>
          </div>
          <TabBar tabs={TABS} active={tab} onChange={setTab} />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-5">

        {/* ── gastos ── */}
        {tab === 'gastos' && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                { l: 'Total',       v: totalExpenses,          c: 'text-gray-800'   },
                { l: 'Pessoal',     v: byCategory('pessoal'),  c: 'text-indigo-700' },
                { l: 'Empresarial', v: byCategory('empresarial'), c: 'text-emerald-700' },
              ].map(r => (
                <Card key={r.l} className="text-center py-3">
                  <p className="text-xs text-gray-400">{r.l}</p>
                  <p className={`text-base font-bold ${r.c}`}>R$ {fmtBRL(r.v)}</p>
                </Card>
              ))}
            </div>
            <Filters showMethod />
            {loading && <p className="text-sm text-gray-400">Carregando...</p>}
            {!loading && expenses.length === 0 && <EmptyState message="Nenhum gasto registrado ainda." />}
            <div className="space-y-3">
              {expenses.map(e => {
                const isDebt = e.payment_method === 'emprestado' || e.payment_method === 'emprestimo';
                const remaining = e.payment_method === 'emprestado'
                  ? lenderOwed(e.lender_name, expenses, payments)
                  : undefined;
                return (
                  <ExpenseCard key={e.id} expense={e}
                    remaining={isDebt ? remaining : undefined}
                    onPay={isDebt ? openPayExpense : undefined} />
                );
              })}
            </div>
          </>
        )}

        {/* ── pagamentos ── */}
        {tab === 'pagamentos' && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <Card className="text-center py-3">
                <p className="text-xs text-gray-400">Total pago</p>
                <p className="text-base font-bold text-green-700">R$ {fmtBRL(totalPayments)}</p>
              </Card>
              <Card className="text-center py-3">
                <p className="text-xs text-gray-400">Registros</p>
                <p className="text-base font-bold text-gray-700">{payments.length}</p>
              </Card>
            </div>
            <Filters />
            {payments.length === 0 && <EmptyState message="Nenhum pagamento registrado ainda." />}
            <div className="space-y-3">{payments.map(p => <PaymentCard key={p.id} payment={p} />)}</div>
          </>
        )}

        {/* ── cartões ── */}
        {tab === 'cartoes' && (
          <div className="space-y-3">
            <SectionLabel>Fechamento, vencimento e saldo dos cartões</SectionLabel>
            {CARDS.map(key => {
              const info = CARD_INFO[key];
              const d = cardDueDates(key);
              if (!d) return null;
              const owed = cardOwed(key, expenses, payments);
              return (
                <Card key={key}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-800">{info.label}</p>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 leading-none mb-0.5">A pagar</p>
                      <p className="text-lg font-bold text-gray-900 leading-none">R$ {fmtBRL(owed)}</p>
                    </div>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div className={`rounded-xl p-3 text-center ${d.daysToClose <= 3 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400 mb-0.5">Fecha em</p>
                      <p className="text-sm font-bold text-gray-800">{fmtDateShort(d.closeDate)}</p>
                      <p className={`text-xs font-medium mt-0.5 ${d.daysToClose <= 3 ? 'text-red-600' : 'text-gray-400'}`}>
                        {d.daysToClose <= 0 ? 'Hoje!' : `${d.daysToClose} dias`}
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${d.daysToDue <= 5 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400 mb-0.5">Vence em</p>
                      <p className="text-sm font-bold text-gray-800">{fmtDateShort(d.dueDate)}</p>
                      <p className={`text-xs font-medium mt-0.5 ${d.daysToDue <= 5 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {d.daysToDue <= 0 ? 'Vencido!' : `${d.daysToDue} dias`}
                      </p>
                    </div>
                  </div>
                  <Button variant="success" size="sm" type="button"
                    disabled={owed <= 0.005} onClick={() => openPayCard(key)}>
                    💸 Pagar fatura
                  </Button>
                </Card>
              );
            })}
            <p className="text-xs text-gray-400 text-center pt-1">Datas ajustadas para o próximo dia útil quando caem em fim de semana.</p>
          </div>
        )}
      </div>

      {/* botões flutuantes: + Gasto / Pagar */}
      <FloatingActions
        onNewExpense={() => setExpenseSheetOpen(true)}
        onPay={() => setPaymentPreset(null)}
      />

      {/* formulário de novo gasto */}
      <Sheet open={expenseSheetOpen} onClose={() => setExpenseSheetOpen(false)} title="Novo gasto">
        <ExpenseForm onSaved={() => { reloadAll(); setExpenseSheetOpen(false); setTab('gastos'); }} />
      </Sheet>

      {/* formulário de pagamento — paymentPreset === null: livre; objeto: pré-preenchido/travado */}
      <Sheet open={paymentPreset !== undefined} onClose={() => setPaymentPreset(undefined)}
        title={paymentPreset ? 'Pagar' : 'Novo pagamento'}>
        <PaymentForm preset={paymentPreset || undefined}
          onSaved={() => { reloadAll(); setPaymentPreset(undefined); setTab('pagamentos'); }} />
      </Sheet>
    </div>
  );
}
