// src/components/ExpenseForm.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

const PAYMENT_METHODS = [
  { value: 'nubank',       label: 'Nubank',        group: 'Cartão' },
  { value: 'business',     label: 'Business',      group: 'Cartão' },
  { value: 'mercado_pago', label: 'Mercado Pago',  group: 'Cartão' },
  { value: 'ifood_pago',   label: 'iFood Pago',    group: 'Cartão' },
  { value: 'boleto',       label: 'Boleto',        group: 'Outros' },
  { value: 'pix',          label: 'Pix',           group: 'Outros' },
  { value: 'emprestimo',   label: 'Empréstimo',    group: 'Outros' },
  { value: 'emprestado',   label: 'Emprestado',    group: 'Outros' },
];

const CARDS = ['nubank', 'business', 'mercado_pago', 'ifood_pago'];

const EMPTY = {
  description: '',
  category: 'pessoal',
  payment_method: '',
  amount: '',
  card_installments: '1',
  boleto_type: 'avista',
  boleto_weekly_installments: '',
  loan_installments: '',
  lender_name: '',
  purchase_date: new Date().toISOString().split('T')[0],
};

export default function ExpenseForm({ onSaved }) {
  const { profile } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isCard   = CARDS.includes(form.payment_method);
  const isBoleto = form.payment_method === 'boleto';
  const isPix    = form.payment_method === 'pix';
  const isLoan   = form.payment_method === 'emprestimo';
  const isLent   = form.payment_method === 'emprestado';

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function amountLabel() {
    if (isLoan) return 'Valor da parcela mensal (R$)';
    if (isBoleto && form.boleto_type === 'parcelado_semanal') return 'Valor de cada parcela semanal (R$)';
    return 'Valor total (R$)';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.payment_method)   return setError('Selecione o método de pagamento.');
    if (!form.description.trim()) return setError('Informe uma descrição.');
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      return setError('Informe um valor válido.');
    if (isCard && (!form.card_installments || Number(form.card_installments) < 1))
      return setError('Informe o número de parcelas.');
    if (isBoleto && form.boleto_type === 'parcelado_semanal' && !form.boleto_weekly_installments)
      return setError('Informe o número de parcelas semanais.');
    if (isLoan && (!form.loan_installments || Number(form.loan_installments) < 1))
      return setError('Informe o número de parcelas do empréstimo.');
    if (isLent && !form.lender_name.trim())
      return setError('Informe o nome de quem emprestou.');

    setLoading(true);

    const payload = {
      registered_by:      profile.id,
      registered_by_name: profile.name,
      description:        form.description.trim(),
      category:           form.category,
      payment_method:     form.payment_method,
      amount:             Number(form.amount),
      purchase_date:      form.purchase_date,

      // campos condicionais — null quando não se aplicam
      card_installments:          isCard   ? Number(form.card_installments)          : null,
      boleto_type:                isBoleto ? form.boleto_type                        : null,
      boleto_weekly_installments: isBoleto && form.boleto_type === 'parcelado_semanal'
                                            ? Number(form.boleto_weekly_installments) : null,
      loan_installments:          isLoan   ? Number(form.loan_installments)          : null,
      lender_name:                isLent   ? form.lender_name.trim()                 : null,
    };

    const { error: insertError } = await supabase.from('expenses').insert(payload);
    setLoading(false);

    if (insertError) {
      setError('Erro ao salvar: ' + insertError.message);
      return;
    }

    setForm(EMPTY);
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">Registrar novo gasto</h2>

      {/* Categoria */}
      <div>
        <label className="mb-1 block text-sm font-medium">Categoria</label>
        <div className="flex gap-2">
          {['pessoal', 'empresarial'].map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => set('category', cat)}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition ${
                form.category === cat
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Método de pagamento */}
      <div>
        <label className="mb-1 block text-sm font-medium">Método de pagamento</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAYMENT_METHODS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => set('payment_method', m.value)}
              className={`rounded-lg border py-2 text-sm font-medium transition ${
                form.payment_method === m.value
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Campos condicionais — Cartão */}
      {isCard && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            Parcelas mensais <span className="text-gray-400">(1 = à vista)</span>
          </label>
          <input
            type="number"
            min="1"
            max="60"
            required
            value={form.card_installments}
            onChange={e => set('card_installments', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Campos condicionais — Boleto */}
      {isBoleto && (
        <div>
          <label className="mb-1 block text-sm font-medium">Tipo de boleto</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set('boleto_type', 'avista')}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                form.boleto_type === 'avista'
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              À vista <span className="text-xs opacity-80">(vence em 14 dias)</span>
            </button>
            <button
              type="button"
              onClick={() => set('boleto_type', 'parcelado_semanal')}
              className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                form.boleto_type === 'parcelado_semanal'
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Parcelado semanal <span className="text-xs opacity-80">(1ª em 7 dias)</span>
            </button>
          </div>
          {form.boleto_type === 'parcelado_semanal' && (
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium">Número de semanas</label>
              <input
                type="number"
                min="1"
                max="52"
                required
                value={form.boleto_weekly_installments}
                onChange={e => set('boleto_weekly_installments', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Campos condicionais — Empréstimo */}
      {isLoan && (
        <div>
          <label className="mb-1 block text-sm font-medium">Número de parcelas mensais</label>
          <input
            type="number"
            min="1"
            max="360"
            required
            value={form.loan_installments}
            onChange={e => set('loan_installments', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Campos condicionais — Emprestado */}
      {isLent && (
        <div>
          <label className="mb-1 block text-sm font-medium">Nome de quem emprestou</label>
          <input
            type="text"
            required
            value={form.lender_name}
            onChange={e => set('lender_name', e.target.value)}
            placeholder="Ex: João Silva"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Descrição */}
      <div>
        <label className="mb-1 block text-sm font-medium">Descrição</label>
        <input
          type="text"
          required
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ex: Fornecedor de insumos, aluguel, etc."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Valor */}
      <div>
        <label className="mb-1 block text-sm font-medium">{amountLabel()}</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
          placeholder="0,00"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Data da compra */}
      <div>
        <label className="mb-1 block text-sm font-medium">Data da compra</label>
        <input
          type="date"
          required
          value={form.purchase_date}
          onChange={e => set('purchase_date', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading || !form.payment_method}
        className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {loading ? 'Salvando...' : 'Registrar gasto'}
      </button>

      {/* rodapé: usuário logado */}
      <p className="text-center text-xs text-gray-400">
        Registrando como <span className="font-medium">{profile?.name}</span>
      </p>
    </form>
  );
}
