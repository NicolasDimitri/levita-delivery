// src/pages/ExpensesPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { TabBar, Button, EmptyState, Badge, Card, SectionLabel } from '../lib/ui';
import { EXPENSE_METHODS, CARD_INFO, CARDS, cardDueDates, fmtBRL, fmtDateShort } from '../lib/constants';
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

function Filters({ filterCat, setFilterCat, filterMethod, setFilterMethod, filterUser, setFilterUser, allUsers, showMethod }) {
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

// Modal genérico para os formulários
function FormModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="font-semibold text-gray-800">{title}</p>
        <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {children}
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const { signOut, profile } = useAuth();
  const [tab, setTab] = useState('gastos');
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cardBalances, setCardBalances] = useState({});
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('todas');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterUser, setFilterUser] = useState('');

  // modal: null | 'expense' | 'payment'
  const [modal, setModal] = useState(null);
  // pré-preenchimento quando abre o PaymentForm a partir de um card de gasto
  const [payInitial, setPayInitial] = useState({});

  // ── carrega usuários únicos (independente dos filtros) ─────────────────
  useEffect(() => {
    async function load() {
      const [{ data: a }, { data: b }] = await Promise.all([
        supabase.from('expenses').select('registered_by_name'),
        supabase.from('payments').select('registered_by_name'),
      ]);
      const names = [...(a || []), ...(b || [])].map(r => r.registered_by_name).filter(Boolean);
      setAllUsers([...new Set(names)]);
    }
    load();
  }, []);

  // ── saldos dos cartões ─────────────────────────────────────────────────
  const loadCardBalances = useCallback(async () => {
    const [{ data: exp }, { data: pay }] = await Promise.all([
      supabase.from('expenses').select('payment_method, amount, card_installments').in('payment_method', CARDS),
      supabase.from('payments').select('reference, amount').in('reference', CARDS),
    ]);
    const bal = Object.fromEntries(CARDS.map(c => [c, 0]));
    // cada compra contribui com amount × parcelas (valor total comprometido)
    (exp || []).forEach(e => {
      bal[e.payment_method] += Number(e.amount) * (e.card_installments ?? 1);
    });
    // cada pagamento reduz o saldo
    (pay || []).forEach(p => {
      if (bal[p.reference] !== undefined) bal[p.reference] -= Number(p.amount);
    });
    setCardBalances(bal);
  }, []);

  // ── gastos filtrados ────────────────────────────────────────────────────
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

  // ── pagamentos filtrados ────────────────────────────────────────────────
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
  useEffect(() => { if (tab === 'cartoes') loadCardBalances(); }, [tab, loadCardBalances]);

  // ── callbacks dos modais ────────────────────────────────────────────────
  function openPay(initial = {}) {
    setPayInitial(initial);
    setModal('payment');
  }

  function onExpenseSaved() {
    loadExpenses();
    loadCardBalances();
    setModal(null);
  }

  function onPaymentSaved() {
    loadPayments();
    loadCardBalances();
    setModal(null);
  }

  // ── totais ──────────────────────────────────────────────────────────────
  const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalPay = payments.reduce((s, p) => s + Number(p.amount), 0);
  const byCategory = cat => expenses
    .filter(e => e.category === cat)
    .reduce((s, e) => s + Number(e.amount), 0);

  const filterProps = { filterCat, setFilterCat, filterMethod, setFilterMethod, filterUser, setFilterUser, allUsers };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* ── cabeçalho ── */}
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

        {/* ── aba: gastos ── */}
        {tab === 'gastos' && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                { l: 'Total',       v: totalExp,              c: 'text-gray-800'    },
                { l: 'Pessoal',     v: byCategory('pessoal'), c: 'text-indigo-700'  },
                { l: 'Empresarial', v: byCategory('empresarial'), c: 'text-emerald-700' },
              ].map(r => (
                <Card key={r.l} className="py-3 text-center">
                  <p className="text-xs text-gray-400">{r.l}</p>
                  <p className={`text-base font-bold ${r.c}`}>R$ {fmtBRL(r.v)}</p>
                </Card>
              ))}
            </div>
            <Filters {...filterProps} showMethod />
            {loading && <p className="text-sm text-gray-400">Carregando...</p>}
            {!loading && expenses.length === 0 && <EmptyState message="Nenhum gasto registrado ainda." />}
            <div className="space-y-3">
              {expenses.map(e => (
                <ExpenseCard key={e.id} expense={e} onPay={openPay} />
              ))}
            </div>
          </>
        )}

        {/* ── aba: pagamentos ── */}
        {tab === 'pagamentos' && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <Card className="py-3 text-center">
                <p className="text-xs text-gray-400">Total pago</p>
                <p className="text-base font-bold text-green-700">R$ {fmtBRL(totalPay)}</p>
              </Card>
              <Card className="py-3 text-center">
                <p className="text-xs text-gray-400">Registros</p>
                <p className="text-base font-bold text-gray-700">{payments.length}</p>
              </Card>
            </div>
            <Filters {...filterProps} />
            {payments.length === 0 && <EmptyState message="Nenhum pagamento registrado ainda." />}
            <div className="space-y-3">{payments.map(p => <PaymentCard key={p.id} payment={p} />)}</div>
          </>
        )}

        {/* ── aba: cartões ── */}
        {tab === 'cartoes' && (
          <div className="space-y-3">
            {Object.entries(CARD_INFO).map(([key, info]) => {
              const d = cardDueDates(key);
              if (!d) return null;
              const balance = cardBalances[key] ?? 0;
              const isPositive = balance > 0;

              return (
                <Card key={key}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="font-semibold text-gray-800">{info.label}</p>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Saldo devedor</p>
                      <p className={`text-xl font-bold ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
                        R$ {fmtBRL(Math.abs(balance))}
                      </p>
                      {!isPositive && balance !== 0 && (
                        <p className="text-xs text-green-500">Crédito a favor</p>
                      )}
                    </div>
                  </div>

                  {/* datas de fechamento e vencimento */}
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className={`rounded-xl p-3 text-center ${d.daysToClose <= 3 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400 mb-0.5">Fecha em</p>
                      <p className="text-sm font-bold text-gray-800">{fmtDateShort(d.closeDate)}</p>
                      <p className={`mt-0.5 text-xs font-medium ${d.daysToClose <= 3 ? 'text-red-600' : 'text-gray-400'}`}>
                        {d.daysToClose <= 0 ? 'Hoje!' : `${d.daysToClose} dias`}
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${d.daysToDue <= 5 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400 mb-0.5">Vence em</p>
                      <p className="text-sm font-bold text-gray-800">{fmtDateShort(d.dueDate)}</p>
                      <p className={`mt-0.5 text-xs font-medium ${d.daysToDue <= 5 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {d.daysToDue <= 0 ? 'Vencido!' : `${d.daysToDue} dias`}
                      </p>
                    </div>
                  </div>

                  {/* botão de pagar a fatura */}
                  <button
                    type="button"
                    onClick={() => openPay({ payment_type: 'fatura_cartao', reference: key })}
                    className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition"
                  >
                    Pagar fatura
                  </button>
                </Card>
              );
            })}
            <p className="pt-1 text-center text-xs text-gray-400">
              Datas ajustadas para o próximo dia útil quando caem em fim de semana.
            </p>
          </div>
        )}
      </div>

      {/* ── Botões flutuantes ── */}
      <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center gap-3 px-4">
        <button
          onClick={() => setModal('expense')}
          className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-brand-600 active:scale-95 transition"
        >
          <span className="text-lg leading-none">+</span> Gasto
        </button>
        <button
          onClick={() => openPay({})}
          className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-700 active:scale-95 transition"
        >
          <span className="text-lg leading-none">✓</span> Pagamento
        </button>
      </div>

      {/* ── Modais ── */}
      {modal === 'expense' && (
        <FormModal title="Registrar gasto" onClose={() => setModal(null)}>
          <ExpenseForm onSaved={onExpenseSaved} onCancel={() => setModal(null)} />
        </FormModal>
      )}

      {modal === 'payment' && (
        <FormModal title="Registrar pagamento" onClose={() => setModal(null)}>
          <PaymentForm
            initialValues={payInitial}
            onSaved={onPaymentSaved}
            onCancel={() => setModal(null)}
          />
        </FormModal>
      )}
    </div>
  );
}
