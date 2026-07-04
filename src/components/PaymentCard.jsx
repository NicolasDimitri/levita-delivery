// src/components/PaymentCard.jsx
const TYPE_STYLES = {
  fatura_cartao:       { label: 'Fatura',        color: 'bg-blue-100 text-blue-700',    icon: '💳' },
  antecipacao_cartao:  { label: 'Antecipação',   color: 'bg-purple-100 text-purple-700', icon: '⚡' },
  quitacao_boleto:     { label: 'Boleto',        color: 'bg-orange-100 text-orange-700', icon: '📄' },
  quitacao_emprestimo: { label: 'Empréstimo',    color: 'bg-pink-100 text-pink-700',    icon: '🏦' },
  quitacao_emprestado: { label: 'Emprestado',    color: 'bg-gray-100 text-gray-600',    icon: '🤝' },
};

const CAT_STYLES = {
  pessoal:     'bg-indigo-50 text-indigo-700',
  empresarial: 'bg-emerald-50 text-emerald-700',
};

const CARD_LABELS = { nubank: 'Nubank', business: 'Business', mercado_pago: 'Mercado Pago', ifood_pago: 'iFood Pago' };

function fmt(n) { return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

export default function PaymentCard({ payment: p }) {
  const t = TYPE_STYLES[p.payment_type] ?? { label: p.payment_type, color: 'bg-gray-100 text-gray-600', icon: '💰' };
  const refLabel = CARD_LABELS[p.reference] ?? p.reference;

  return (
    <div className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{refLabel}</p>
          {p.notes && <p className="mt-0.5 text-xs text-gray-400 leading-snug">{p.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${CAT_STYLES[p.category] ?? 'bg-gray-100 text-gray-500'}`}>
            {p.category}
          </span>
          {p.is_full_payment && (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Total</span>
          )}
        </div>
      </div>
      <p className="mb-3 text-xl font-bold text-green-700">- R$ {fmt(p.amount)}</p>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.color}`}>
          {t.icon} {t.label}
        </span>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>📅 {fmtDate(p.payment_date)}</span>
          <span>· {p.registered_by_name}</span>
        </div>
      </div>
    </div>
  );
}
