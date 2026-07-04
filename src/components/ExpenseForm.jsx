// src/components/ExpenseForm.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Button, Input, CurrencyInput, AutocompleteInput, ToggleGroup, SectionLabel, ErrorMsg } from '../lib/ui';
import { EXPENSE_METHODS, CARDS } from '../lib/constants';
import { useSuggestions } from '../lib/useSuggestions';

const EMPTY = {
  description: '', category: 'pessoal', payment_method: '',
  amount: '', card_installments: '1',
  boleto_type: 'avista', boleto_weekly_installments: '',
  loan_installments: '', lender_name: '',
  purchase_date: new Date().toISOString().split('T')[0],
};

export default function ExpenseForm({ onSaved }) {
  const { profile } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const descriptionSuggestions = useSuggestions('expenses', 'description');
  const lenderSuggestions = useSuggestions('expenses', 'lender_name');

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isCard   = CARDS.includes(f.payment_method);
  const isBoleto = f.payment_method === 'boleto';
  const isLoan   = f.payment_method === 'emprestimo';
  const isLent   = f.payment_method === 'emprestado';

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.payment_method) return setError('Selecione o método de pagamento.');
    if (!isLent && !f.description.trim()) return setError('Informe uma descrição.');
    if (Number(f.amount) <= 0) return setError('Informe um valor válido.');
    if (isCard && Number(f.card_installments) < 1) return setError('Informe o número de parcelas.');
    if (isBoleto && f.boleto_type === 'parcelado_semanal' && !f.boleto_weekly_installments)
      return setError('Informe o número de parcelas semanais.');
    if (isLoan && Number(f.loan_installments) < 1) return setError('Informe as parcelas do empréstimo.');
    if (isLent && !f.lender_name.trim()) return setError('Informe o nome de quem emprestou.');

    setLoading(true);
    const { error: err } = await supabase.from('expenses').insert({
      registered_by: profile.id, registered_by_name: profile.name,
      description: isLent ? `Emprestado — ${f.lender_name.trim()}` : f.description.trim(),
      category: f.category,
      payment_method: f.payment_method, amount: Number(f.amount),
      purchase_date: f.purchase_date,
      card_installments: isCard ? Number(f.card_installments) : null,
      boleto_type: isBoleto ? f.boleto_type : null,
      boleto_weekly_installments: (isBoleto && f.boleto_type === 'parcelado_semanal')
        ? Number(f.boleto_weekly_installments) : null,
      loan_installments: isLoan ? Number(f.loan_installments) : null,
      lender_name: isLent ? f.lender_name.trim() : null,
    });
    setLoading(false);
    if (err) return setError('Erro ao salvar: ' + err.message);
    setF(EMPTY);
    onSaved?.();
  }

  const amountLabel = isLoan ? 'Valor da parcela mensal'
    : (isBoleto && f.boleto_type === 'parcelado_semanal') ? 'Valor de cada parcela semanal'
    : isLent ? 'Valor emprestado'
    : 'Valor total';

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <SectionLabel>Categoria</SectionLabel>
        <ToggleGroup value={f.category} onChange={v => set('category', v)}
          options={[{ value: 'pessoal', label: 'Pessoal' }, { value: 'empresarial', label: 'Empresarial' }]} />
      </div>

      <div>
        <SectionLabel>Método de pagamento</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {EXPENSE_METHODS.map(m => (
            <button key={m.value} type="button" onClick={() => set('payment_method', m.value)}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                f.payment_method === m.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600'
              }`}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>
      </div>

      {isCard && (
        <Input label="Parcelas mensais (1 = à vista)" type="number" min="1" max="60" required
          value={f.card_installments} onChange={e => set('card_installments', e.target.value)} />
      )}

      {isBoleto && (
        <div className="space-y-3">
          <SectionLabel>Tipo de boleto</SectionLabel>
          <ToggleGroup value={f.boleto_type} onChange={v => set('boleto_type', v)} options={[
            { value: 'avista',           label: 'À vista',  sub: 'vence em 14 dias' },
            { value: 'parcelado_semanal', label: 'Semanal', sub: '1ª em 7 dias'      },
          ]} />
          {f.boleto_type === 'parcelado_semanal' && (
            <Input label="Número de semanas" type="number" min="1" max="52" required
              value={f.boleto_weekly_installments} onChange={e => set('boleto_weekly_installments', e.target.value)} />
          )}
        </div>
      )}

      {isLoan && (
        <Input label="Parcelas mensais totais" type="number" min="1" max="360" required
          value={f.loan_installments} onChange={e => set('loan_installments', e.target.value)} />
      )}

      {isLent && (
        <AutocompleteInput label="Nome de quem emprestou" required placeholder="Ex: João Silva"
          value={f.lender_name} onChange={v => set('lender_name', v)} suggestions={lenderSuggestions} />
      )}

      {!isLent && (
        <AutocompleteInput label="Descrição" required placeholder="Fornecedor, aluguel, etc."
          value={f.description} onChange={v => set('description', v)} suggestions={descriptionSuggestions} />
      )}

      <CurrencyInput label={amountLabel} required
        value={f.amount} onChange={v => set('amount', v)} />

      <Input label="Data da compra" type="date" required
        value={f.purchase_date} onChange={e => set('purchase_date', e.target.value)} />

      <ErrorMsg message={error} />
      <Button variant="primary" size="lg" type="submit" disabled={loading || !f.payment_method}>
        {loading ? 'Salvando...' : 'Registrar gasto'}
      </Button>
      <p className="text-center text-xs text-gray-400">Registrando como <strong>{profile?.name}</strong></p>
    </form>
  );
}
