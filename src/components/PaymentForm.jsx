// src/components/PaymentForm.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

// Datas de fechamento e vencimento de cada cartão
const CARD_DATES = {
  nubank:       { close: 5,  due: 12 },
  business:     { close: 14, due: 21 },
  mercado_pago: { close: 2,  due: 7  },
  ifood_pago:   { close: 19, due: 25 },
};

const PAYMENT_TYPES = [
  { value: 'fatura_cartao',       label: 'Pagamento de fatura',      icon: '💳', desc: 'Total ou parcial de cartão' },
  { value: 'antecipacao_cartao',  label: 'Antecipação de fatura',    icon: '⚡', desc: 'Pagar antes do vencimento' },
  { value: 'quitacao_boleto',     label: 'Quitar boleto',            icon: '📄', desc: 'Quitar parcelas de boleto' },
  { value: 'quitacao_emprestimo', label: 'Quitar empréstimo',        icon: '🏦', desc: 'Quitar parcelas de empréstimo' },
  { value: 'quitacao_emprestado', label: 'Devolver emprestado',      icon: '🤝', desc: 'Devolver valor emprestado' },
];

const CARDS = ['nubank', 'business', 'mercado_pago', 'ifood_pago'];
const CARD_LABELS = { nubank: 'Nubank', business: 'Business', mercado_pago: 'Mercado Pago', ifood_pago: 'iFood Pago' };

function nextBusinessDay(day, month, year) {
  const date = new Date(year, month, day);
  const dow = date.getDay();
  if (dow === 6) date.setDate(date.getDate() + 2);
  if (dow === 0) date.setDate(date.getDate() + 1);
  return date;
}

function getCardDueDates(cardKey) {
  if (!CARD_DATES[cardKey]) return null;
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const { close, due } = CARD_DATES[cardKey];

  // se já passou do fechamento deste mês, a fatura atual fecha mês que vem
  const closedThisMonth = now.getDate() > close;
  const closeMonth = closedThisMonth ? month + 1 : month;
  const closeYear = closeMonth > 11 ? year + 1 : year;
  const closeDate = new Date(closeYear, closeMonth % 12, close);

  const dueMonth = closeMonth + 1;
  const dueYear = dueMonth > 11 ? year + 1 : year;
  const dueDate = nextBusinessDay(due, dueMonth % 12, dueYear);

  return { closeDate, dueDate };
}

const EMPTY = {
  payment_type: '', reference: '', amount: '', is_full_payment: false,
  category: 'pessoal', notes: '',
  payment_date: new Date().toISOString().split('T')[0],
};

export default function PaymentForm({ onSaved }) {
  const { profile } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isCard = ['fatura_cartao', 'antecipacao_cartao'].includes(form.payment_type);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const cardDates = isCard && CARDS.includes(form.reference) ? getCardDueDates(form.reference) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.payment_type) return setError('Selecione o tipo de pagamento.');
    if (!form.reference.trim()) return setError('Informe a referência.');
    if (!form.amount || Number(form.amount) <= 0) return setError('Informe um valor válido.');

    setLoading(true);
    const { error: err } = await supabase.from('payments').insert({
      registered_by: profile.id, registered_by_name: profile.name,
      payment_type: form.payment_type, reference: form.reference.trim(),
      amount: Number(form.amount), is_full_payment: form.is_full_payment,
      category: form.category, notes: form.notes.trim() || null,
      payment_date: form.payment_date,
    });
    setLoading(false);
    if (err) return setError('Erro ao salvar: ' + err.message);
    setForm(EMPTY);
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* tipo de pagamento */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Tipo de pagamento</p>
        <div className="space-y-2">
          {PAYMENT_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => set('payment_type', t.value)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                form.payment_type === t.value
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 bg-white'
              }`}>
              <span className="text-xl">{t.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${form.payment_type === t.value ? 'text-brand-700' : 'text-gray-700'}`}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-400">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* referência */}
      {form.payment_type && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {isCard ? 'Cartão' : 'Referência (o que está sendo pago)'}
          </p>
          {isCard ? (
            <div className="grid grid-cols-2 gap-2">
              {CARDS.map(c => {
                const dates = getCardDueDates(c);
                return (
                  <button key={c} type="button" onClick={() => set('reference', c)}
                    className={`rounded-xl border-2 p-3 text-left transition ${
                      form.reference === c
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-200 bg-white'
                    }`}>
                    <p className={`text-sm font-semibold ${form.reference === c ? 'text-brand-700' : 'text-gray-700'}`}>
                      {CARD_LABELS[c]}
                    </p>
                    {dates && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        Fecha {dates.closeDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        {' · '}Vence {dates.dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <input type="text" required placeholder="Ex: Boleto Fornecedor X, Empréstimo João"
              value={form.reference} onChange={e => set('reference', e.target.value)}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
          )}
        </div>
      )}

      {/* info de datas do cartão selecionado */}
      {cardDates && form.reference && (
        <div className="rounded-xl bg-blue-50 p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
            {CARD_LABELS[form.reference]} — datas da fatura atual
          </p>
          <p className="text-sm text-blue-800">
            Fecha em <strong>{cardDates.closeDate.toLocaleDateString('pt-BR')}</strong>
            {' · '}
            Vence em <strong>{cardDates.dueDate.toLocaleDateString('pt-BR')}</strong>
          </p>
        </div>
      )}

      {/* fatura total ou parcial */}
      {isCard && form.reference && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-gray-200 bg-white px-4 py-3">
          <input type="checkbox" id="full_pay" checked={form.is_full_payment}
            onChange={e => set('is_full_payment', e.target.checked)}
            className="h-4 w-4 rounded accent-brand-500" />
          <label htmlFor="full_pay" className="text-sm text-gray-700">Pagamento total da fatura</label>
        </div>
      )}

      {/* categoria */}
      {form.payment_type && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Categoria</p>
          <div className="grid grid-cols-2 gap-2">
            {['pessoal', 'empresarial'].map(cat => (
              <button key={cat} type="button" onClick={() => set('category', cat)}
                className={`rounded-xl border-2 py-3 text-sm font-semibold capitalize transition ${
                  form.category === cat
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* valor */}
      {form.payment_type && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Valor pago (R$)</label>
          <input type="number" min="0.01" step="0.01" required placeholder="0,00"
            value={form.amount} onChange={e => set('amount', e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {/* observações */}
      {form.payment_type && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Observações <span className="normal-case font-normal text-gray-400">(opcional)</span>
          </label>
          <textarea rows={2} placeholder="Ex: Antecipei 3 parcelas, quitei metade da dívida..."
            value={form.notes} onChange={e => set('notes', e.target.value)}
            className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {/* data */}
      {form.payment_type && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Data do pagamento</label>
          <input type="date" required value={form.payment_date}
            onChange={e => set('payment_date', e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none" />
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={loading || !form.payment_type}
        className="w-full rounded-xl bg-green-600 py-4 text-sm font-bold text-white shadow hover:bg-green-700 active:scale-95 disabled:opacity-60">
        {loading ? 'Salvando...' : 'Registrar pagamento'}
      </button>

      <p className="text-center text-xs text-gray-400">Registrando como <strong>{profile?.name}</strong></p>
    </form>
  );
}
