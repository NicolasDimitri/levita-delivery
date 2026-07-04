// src/components/ExpenseForm.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const CARDS = ['nubank', 'business', 'mercado_pago', 'ifood_pago'];

const METHODS = [
  { value: 'nubank',       label: 'Nubank',        icon: '💳' },
  { value: 'business',     label: 'Business',      icon: '💳' },
  { value: 'mercado_pago', label: 'Mercado Pago',  icon: '💳' },
  { value: 'ifood_pago',   label: 'iFood Pago',    icon: '💳' },
  { value: 'boleto',       label: 'Boleto',        icon: '📄' },
  { value: 'pix',          label: 'Pix',           icon: '⚡' },
  { value: 'emprestimo',   label: 'Empréstimo',    icon: '🏦' },
  { value: 'emprestado',   label: 'Emprestado',    icon: '🤝' },
];

const EMPTY = {
  description: '', category: 'pessoal', payment_method: '',
  amount: '', card_installments: '1',
  boleto_type: 'avista', boleto_weekly_installments: '',
  loan_installments: '', lender_name: '',
  purchase_date: new Date().toISOString().split('T')[0],
};

export default function ExpenseForm({ onSaved }) {
  const { profile } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isCard   = CARDS.includes(form.payment_method);
  const isBoleto = form.payment_method === 'boleto';
  const isLoan   = form.payment_method === 'emprestimo';
  const isLent   = form.payment_method === 'emprestado';

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  function amountLabel() {
    if (isLoan) return 'Valor da parcela mensal';
    if (isBoleto && form.boleto_type === 'parcelado_semanal') return 'Valor de cada parcela semanal';
    return 'Valor total';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.payment_method) return setError('Selecione o método de pagamento.');
    if (!form.description.trim()) return setError('Informe uma descrição.');
    if (!form.amount || Number(form.amount) <= 0) return setError('Informe um valor válido.');
    if (isCard && Number(form.card_installments) < 1) return setError('Informe o número de parcelas.');
    if (isBoleto && form.boleto_type === 'parcelado_semanal' && !form.boleto_weekly_installments)
      return setError('Informe o número de parcelas semanais.');
    if (isLoan && Number(form.loan_installments) < 1) return setError('Informe as parcelas do empréstimo.');
    if (isLent && !form.lender_name.trim()) return setError('Informe o nome de quem emprestou.');

    setLoading(true);
    const { error: err } = await supabase.from('expenses').insert({
      registered_by: profile.id, registered_by_name: profile.name,
      description: form.description.trim(), category: form.category,
      payment_method: form.payment_method, amount: Number(form.amount),
      purchase_date: form.purchase_date,
      card_installments: isCard ? Number(form.card_installments) : null,
      boleto_type: isBoleto ? form.boleto_type : null,
      boleto_weekly_installments: isBoleto && form.boleto_type === 'parcelado_semanal'
        ? Number(form.boleto_weekly_installments) : null,
      loan_installments: isLoan ? Number(form.loan_installments) : null,
      lender_name: isLent ? form.lender_name.trim() : null,
    });
    setLoading(false);
    if (err) return setError('Erro ao salvar: ' + err.message);
    setForm(EMPTY);
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* categoria */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Categoria</p>
        <div className="grid grid-cols-2 gap-2">
          {['pessoal', 'empresarial'].map(cat => (
            <button key={cat} type="button" onClick={() => set('category', cat)}
              className={`rounded-xl py-3 text-sm font-semibold capitalize border-2 transition ${
                form.category === cat
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-500'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* método */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Método de pagamento</p>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map(m => (
            <button key={m.value} type="button" onClick={() => set('payment_method', m.value)}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                form.payment_method === m.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600'
              }`}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>
      </div>

      {/* campos condicionais */}
      {isCard && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Parcelas mensais <span className="normal-case font-normal">(1 = à vista)</span>
          </label>
          <input type="number" min="1" max="60" required value={form.card_installments}
            onChange={e => set('card_installments', e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {isBoleto && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tipo de boleto</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'avista', l: 'À vista', sub: 'vence em 14 dias' },
              { v: 'parcelado_semanal', l: 'Semanal', sub: '1ª em 7 dias' },
            ].map(o => (
              <button key={o.v} type="button" onClick={() => set('boleto_type', o.v)}
                className={`rounded-xl border-2 py-3 text-sm font-medium transition ${
                  form.boleto_type === o.v
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}>
                <p>{o.l}</p>
                <p className="text-xs opacity-70">{o.sub}</p>
              </button>
            ))}
          </div>
          {form.boleto_type === 'parcelado_semanal' && (
            <input type="number" min="1" max="52" required placeholder="Número de semanas"
              value={form.boleto_weekly_installments}
              onChange={e => set('boleto_weekly_installments', e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
          )}
        </div>
      )}

      {isLoan && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Parcelas mensais totais</label>
          <input type="number" min="1" max="360" required value={form.loan_installments}
            onChange={e => set('loan_installments', e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {isLent && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Nome de quem emprestou</label>
          <input type="text" required placeholder="Ex: João Silva" value={form.lender_name}
            onChange={e => set('lender_name', e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {/* descrição */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Descrição</label>
        <input type="text" required placeholder="Fornecedor, aluguel, etc." value={form.description}
          onChange={e => set('description', e.target.value)}
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
      </div>

      {/* valor */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">{amountLabel()} (R$)</label>
        <input type="number" min="0.01" step="0.01" required placeholder="0,00" value={form.amount}
          onChange={e => set('amount', e.target.value)}
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
      </div>

      {/* data */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Data da compra</label>
        <input type="date" required value={form.purchase_date}
          onChange={e => set('purchase_date', e.target.value)}
          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading || !form.payment_method}
        className="w-full rounded-xl bg-brand-500 py-4 text-sm font-bold text-white shadow hover:bg-brand-600 active:scale-95 disabled:opacity-60">
        {loading ? 'Salvando...' : 'Registrar gasto'}
      </button>

      <p className="text-center text-xs text-gray-400">Registrando como <strong>{profile?.name}</strong></p>
    </form>
  );
}
