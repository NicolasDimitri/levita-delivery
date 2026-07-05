// src/components/PaymentForm.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Button, Input, ToggleGroup, SectionLabel, ErrorMsg } from '../lib/ui';
import { PAYMENT_TYPES, CARDS, CARD_INFO, cardDueDates, fmtDateShort } from '../lib/constants';
import CurrencyInput from './CurrencyInput';
import AutocompleteInput from './AutocompleteInput';

const IS_CARD_TYPE = ['fatura_cartao', 'antecipacao_cartao'];

export default function PaymentForm({ onSaved, onCancel, initialValues = {} }) {
  const { profile } = useAuth();
  const [f, setF] = useState({
    payment_type: '', reference: '', amount: 0,
    is_full_payment: false, category: 'pessoal', notes: '',
    payment_date: new Date().toISOString().split('T')[0],
    ...initialValues,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const isCard = IS_CARD_TYPE.includes(f.payment_type);
  const cardDates = isCard && CARDS.includes(f.reference) ? cardDueDates(f.reference) : null;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.payment_type) return setError('Selecione o tipo de pagamento.');
    if (!f.reference.trim()) return setError('Informe a referência.');
    if (f.amount <= 0) return setError('Informe um valor válido.');
    setLoading(true);
    const { error: err } = await supabase.from('payments').insert({
      registered_by: profile.id, registered_by_name: profile.name,
      payment_type: f.payment_type, reference: f.reference.trim(),
      amount: f.amount, is_full_payment: f.is_full_payment,
      category: f.category, notes: f.notes.trim() || null,
      payment_date: f.payment_date,
    });
    setLoading(false);
    if (err) return setError('Erro ao salvar: ' + err.message);
    onSaved?.();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <SectionLabel>Tipo de pagamento</SectionLabel>
        <div className="space-y-2">
          {PAYMENT_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => set('payment_type', t.value)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                f.payment_type === t.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white'
              }`}>
              <span className="text-xl">{t.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${f.payment_type === t.value ? 'text-brand-700' : 'text-gray-700'}`}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-400">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {f.payment_type && (
        <div>
          <SectionLabel>{isCard ? 'Cartão' : 'Referência'}</SectionLabel>
          {isCard ? (
            <div className="grid grid-cols-2 gap-2">
              {CARDS.map(c => {
                const d = cardDueDates(c);
                return (
                  <button key={c} type="button" onClick={() => set('reference', c)}
                    className={`rounded-xl border-2 p-3 text-left transition ${
                      f.reference === c ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white'
                    }`}>
                    <p className={`text-sm font-semibold ${f.reference === c ? 'text-brand-700' : 'text-gray-700'}`}>
                      {CARD_INFO[c].label}
                    </p>
                    {d && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        Fecha {fmtDateShort(d.closeDate)} · Vence {fmtDateShort(d.dueDate)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <AutocompleteInput
              table="payments" column="reference"
              placeholder="Ex: Boleto Fornecedor X"
              required
              value={f.reference}
              onChange={v => set('reference', v)}
            />
          )}
        </div>
      )}

      {cardDates && (
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
            {CARD_INFO[f.reference]?.label} — fatura atual
          </p>
          Fecha em <strong>{cardDates.closeDate.toLocaleDateString('pt-BR')}</strong>
          {' · '}Vence em <strong>{cardDates.dueDate.toLocaleDateString('pt-BR')}</strong>
        </div>
      )}

      {isCard && f.reference && (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-3">
          <input type="checkbox" checked={f.is_full_payment}
            onChange={e => set('is_full_payment', e.target.checked)}
            className="h-4 w-4 rounded accent-brand-500" />
          <span className="text-sm text-gray-700">Pagamento total da fatura</span>
        </label>
      )}

      {f.payment_type && (
        <div>
          <SectionLabel>Categoria</SectionLabel>
          <ToggleGroup value={f.category} onChange={v => set('category', v)}
            options={[{ value: 'pessoal', label: 'Pessoal' }, { value: 'empresarial', label: 'Empresarial' }]} />
        </div>
      )}

      {f.payment_type && (
        <CurrencyInput label="Valor pago" value={f.amount} onChange={v => set('amount', v)} required />
      )}

      {f.payment_type && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Observações <span className="font-normal normal-case">(opcional)</span>
          </label>
          <textarea rows={2} placeholder="Ex: Antecipei 3 parcelas..."
            value={f.notes} onChange={e => set('notes', e.target.value)}
            className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {f.payment_type && (
        <Input label="Data do pagamento" type="date" required
          value={f.payment_date} onChange={e => set('payment_date', e.target.value)} />
      )}

      <ErrorMsg message={error} />

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" type="button" onClick={onCancel} className="flex-1">Cancelar</Button>
        )}
        <Button variant="success" size="lg" type="submit"
          disabled={loading || !f.payment_type}
          className={onCancel ? 'flex-1' : 'w-full'}>
          {loading ? 'Salvando...' : 'Registrar pagamento'}
        </Button>
      </div>

      <p className="text-center text-xs text-gray-400">
        Registrando como <strong>{profile?.name}</strong>
      </p>
    </form>
  );
}
