// src/components/PaymentForm.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Button, Input, ToggleGroup, SectionLabel, ErrorMsg, Card } from '../lib/ui';
import { PAYMENT_TYPES, CARDS, CARD_INFO, cardDueDates, fmtDateShort } from '../lib/constants';

const IS_CARD_TYPE = ['fatura_cartao', 'antecipacao_cartao'];
const EMPTY = {
  payment_type: '', reference: '', amount: '', is_full_payment: false,
  category: 'pessoal', notes: '',
  payment_date: new Date().toISOString().split('T')[0],
};

export default function PaymentForm({ onSaved }) {
  const { profile } = useAuth();
  const [f, setF] = useState(EMPTY);
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
    if (Number(f.amount) <= 0) return setError('Informe um valor válido.');
    setLoading(true);
    const { error: err } = await supabase.from('payments').insert({
      registered_by: profile.id, registered_by_name: profile.name,
      payment_type: f.payment_type, reference: f.reference.trim(),
      amount: Number(f.amount), is_full_payment: f.is_full_payment,
      category: f.category, notes: f.notes.trim() || null,
      payment_date: f.payment_date,
    });
    setLoading(false);
    if (err) return setError('Erro ao salvar: ' + err.message);
    setF(EMPTY);
    onSaved?.();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* tipo */}
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
                <p className={`text-sm font-semibold ${f.payment_type === t.value ? 'text-brand-700' : 'text-gray-700'}`}>{t.label}</p>
                <p className="text-xs text-gray-400">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* referência */}
      {f.payment_type && (
        <div>
          <SectionLabel>{isCard ? 'Cartão' : 'Referência (o que está sendo pago)'}</SectionLabel>
          {isCard ? (
            <div className="grid grid-cols-2 gap-2">
              {CARDS.map(c => {
                const d = cardDueDates(c);
                return (
                  <button key={c} type="button" onClick={() => set('reference', c)}
                    className={`rounded-xl border-2 p-3 text-left transition ${
                      f.reference === c ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white'
                    }`}>
                    <p className={`text-sm font-semibold ${f.reference === c ? 'text-brand-700' : 'text-gray-700'}`}>{CARD_INFO[c].label}</p>
                    {d && <p className="mt-0.5 text-xs text-gray-400">Fecha {fmtDateShort(d.closeDate)} · Vence {fmtDateShort(d.dueDate)}</p>}
                  </button>
                );
              })}
            </div>
          ) : (
            <Input type="text" required placeholder="Ex: Boleto Fornecedor X"
              value={f.reference} onChange={e => set('reference', e.target.value)} />
          )}
        </div>
      )}

      {/* info datas do cartão */}
      {cardDates && (
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">{CARD_INFO[f.reference]?.label} — fatura atual</p>
          Fecha em <strong>{cardDates.closeDate.toLocaleDateString('pt-BR')}</strong> · Vence em <strong>{cardDates.dueDate.toLocaleDateString('pt-BR')}</strong>
        </div>
      )}

      {/* pagamento total? */}
      {isCard && f.reference && (
        <label className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 cursor-pointer">
          <input type="checkbox" checked={f.is_full_payment} onChange={e => set('is_full_payment', e.target.checked)}
            className="h-4 w-4 rounded accent-brand-500" />
          <span className="text-sm text-gray-700">Pagamento total da fatura</span>
        </label>
      )}

      {/* categoria */}
      {f.payment_type && (
        <div>
          <SectionLabel>Categoria</SectionLabel>
          <ToggleGroup value={f.category} onChange={v => set('category', v)}
            options={[{ value: 'pessoal', label: 'Pessoal' }, { value: 'empresarial', label: 'Empresarial' }]} />
        </div>
      )}

      {f.payment_type && (
        <Input label="Valor pago (R$)" type="number" min="0.01" step="0.01" required placeholder="0,00"
          value={f.amount} onChange={e => set('amount', e.target.value)} />
      )}

      {f.payment_type && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Observações <span className="normal-case font-normal">(opcional)</span>
          </label>
          <textarea rows={2} placeholder="Ex: Antecipei 3 parcelas..." value={f.notes}
            onChange={e => set('notes', e.target.value)}
            className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {f.payment_type && (
        <Input label="Data do pagamento" type="date" required
          value={f.payment_date} onChange={e => set('payment_date', e.target.value)} />
      )}

      <ErrorMsg message={error} />
      <Button variant="success" size="lg" type="submit" disabled={loading || !f.payment_type}>
        {loading ? 'Salvando...' : 'Registrar pagamento'}
      </Button>
      <p className="text-center text-xs text-gray-400">Registrando como <strong>{profile?.name}</strong></p>
    </form>
  );
}
