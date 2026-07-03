// src/pages/ExpensesPage.jsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import ExpenseForm from '../components/ExpenseForm';
import ExpenseCard from '../components/ExpenseCard';
import { Link } from 'react-router-dom';

const CATEGORIES = ['todas', 'pessoal', 'empresarial'];
const METHODS = [
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

export default function ExpensesPage() {
  const { signOut, profile } = useAuth();
  const [tab, setTab] = useState('lista'); // 'lista' | 'novo'
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('todas');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const loadExpenses = useCallback(async () => {
    let query = supabase
      .from('expenses')
      .select('*')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filterCategory !== 'todas') query = query.eq('category', filterCategory);
    if (filterMethod) query = query.eq('payment_method', filterMethod);
    if (filterUser) query = query.eq('registered_by_name', filterUser);

    const { data } = await query;
    setExpenses(data || []);
    setLoading(false);
  }, [filterCategory, filterMethod, filterUser]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  // lista de usuários únicos presentes nos gastos (para o filtro)
  const uniqueUsers = [...new Set(expenses.map(e => e.registered_by_name))].filter(Boolean);

  // totais por categoria (dos gastos listados atualmente)
  function totalFor(category) {
    return expenses
      .filter(e => category === 'todas' || e.category === category)
      .reduce((sum, e) => sum + Number(e.amount), 0)
      .toFixed(2);
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        {/* cabeçalho */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Controle financeiro</h1>
            <p className="text-sm text-gray-500">Olá, {profile?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-sm text-brand-600 hover:underline">
              ← Pedidos
            </Link>
            <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">
              Sair
            </button>
          </div>
        </div>

        {/* abas */}
        <div className="mb-5 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setTab('lista')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === 'lista' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
            }`}
          >
            Gastos registrados
          </button>
          <button
            onClick={() => setTab('novo')}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === 'novo' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
            }`}
          >
            + Novo gasto
          </button>
        </div>

        {/* aba: novo gasto */}
        {tab === 'novo' && (
          <ExpenseForm
            onSaved={() => {
              loadExpenses();
              setTab('lista');
            }}
          />
        )}

        {/* aba: lista */}
        {tab === 'lista' && (
          <>
            {/* resumo rápido */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              {['todas', 'pessoal', 'empresarial'].map(cat => (
                <div key={cat} className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm">
                  <p className="text-xs capitalize text-gray-400">{cat === 'todas' ? 'Total geral' : cat}</p>
                  <p className="text-lg font-bold text-gray-800">R$ {totalFor(cat)}</p>
                </div>
              ))}
            </div>

            {/* filtros */}
            <div className="mb-4 flex flex-wrap gap-2">
              {/* por categoria */}
              <div className="flex gap-1">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                      filterCategory === cat
                        ? 'bg-brand-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* por método */}
              <select
                value={filterMethod}
                onChange={e => setFilterMethod(e.target.value)}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600"
              >
                {METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              {/* por usuário (aparece só se tiver mais de 1) */}
              {uniqueUsers.length > 1 && (
                <select
                  value={filterUser}
                  onChange={e => setFilterUser(e.target.value)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600"
                >
                  <option value="">Todos os usuários</option>
                  {uniqueUsers.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              )}
            </div>

            {loading && <p className="text-gray-500">Carregando...</p>}

            {!loading && expenses.length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400">
                Nenhum gasto registrado ainda.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {expenses.map(expense => (
                <ExpenseCard key={expense.id} expense={expense} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
