// src/components/ExpenseCard.jsx
const METHOD_STYLES = {
  nubank:       { label: 'Nubank',       color: 'bg-purple-100 text-purple-700', icon: '💳' },
  business:     { label: 'Business',     color: 'bg-blue-100 text-blue-700',     icon: '💳' },
  mercado_pago: { label: 'Mercado Pago', color: 'bg-yellow-100 text-yellow-800', icon: '💳' },
  ifood_pago:   { label: 'iFood Pago',   color: 'bg-red-100 text-red-700',       icon: '💳' },
  boleto:       { label: 'Boleto',       color: 'bg-orange-100 text-orange-700', icon: '📄' },
  pix:          { label: 'Pix',          color: 'bg-teal-100 text-teal-700',     icon: '⚡' },
  emprestimo:   { label: 'Empréstimo',   color: 'bg-pink-100 text-pink-700',     icon: '🏦' },
  emprestado:   { label: 'Emprestado',   color: 'bg-gray-100 text-gray-600',     icon: '🤝' },
};

const CAT_STYLES = {
  pessoal:     'bg-indigo-50 text-indigo-700',
  empresarial: 'bg-emerald-50 text-emerald-700',
};

function fmt(n) { return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function detail(e) {
  const CARDS = ['nubank', 'business', 'mercado_pago', 'ifood_pago'];
  const pm = e.payment_method;
  if (CARDS.includes(pm)) {
    const n = e.card_installments ?? 1;
    if (n === 1) return `À vista — Total R$ ${fmt(e.amount)}`;
    const total = (Number(e.amount) * n).toFixed(2);
    return `${n}x de R$ ${fmt(e.amount)} — Total R$ ${fmt(total)}`;
  }
  if (pm === 'boleto') {
    if (e.boleto_type === 'avista') return `À vista — vence 14 dias após ${fmtDate(e.purchase_date)}`;
    const n = e.boleto_weekly_installments ?? '?';
    const total = (Number(e.amount) * Number(n)).toFixed(2);
    return `${n}x semanais de R$ ${fmt(e.amount)} — Total R$ ${fmt(total)}`;
  }
  if (pm === 'pix') return 'Pago na hora (Pix)';
  if (pm === 'emprestimo') {
    const n = e.loan_installments ?? '?';
    const total = (Number(e.amount) * Number(n)).toFixed(2);
    return `${n}x mensais de R$ ${fmt(e.amount)} — Total R$ ${fmt(total)}`;
  }
  if (pm === 'emprestado') return `Emprestado por: ${e.lender_name ?? '—'}`;
  return '—';
}

export default function ExpenseCard({ expense: e }) {
  const m = METHOD_STYLES[e.payment_method] ?? { label: e.payment_method, color: 'bg-gray-100 text-gray-600', icon: '💰' };
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-semibold text-gray-800 leading-snug">{e.description}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${CAT_STYLES[e.category] ?? 'bg-gray-100 text-gray-500'}`}>
          {e.category}
        </span>
      </div>
      <p className="mb-1 text-xl font-bold text-gray-900">R$ {fmt(e.amount)}</p>
      <p className="mb-3 text-xs text-gray-500 leading-relaxed">{detail(e)}</p>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.color}`}>
          {m.icon} {m.label}
        </span>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>📅 {fmtDate(e.purchase_date)}</span>
          <span>· {e.registered_by_name}</span>
        </div>
      </div>
    </div>
  );
}
