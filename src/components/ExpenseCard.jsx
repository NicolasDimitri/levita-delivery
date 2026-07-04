// src/components/ExpenseCard.jsx
import { Badge, Card } from '../lib/ui';
import { EXPENSE_METHOD_MAP, CARDS, fmtBRL, fmtDate } from '../lib/constants';

function detail(e) {
  if (CARDS.includes(e.payment_method)) {
    const n = e.card_installments ?? 1;
    const total = fmtBRL(Number(e.amount) * n);
    return n === 1 ? `À vista — Total R$ ${total}` : `${n}x de R$ ${fmtBRL(e.amount)} — Total R$ ${total}`;
  }
  if (e.payment_method === 'boleto') {
    if (e.boleto_type === 'avista') return `À vista — vence 14 dias após ${fmtDate(e.purchase_date)}`;
    const n = e.boleto_weekly_installments ?? '?';
    return `${n}x semanais de R$ ${fmtBRL(e.amount)} — Total R$ ${fmtBRL(Number(e.amount) * Number(n))}`;
  }
  if (e.payment_method === 'pix') return 'Pago na hora (Pix)';
  if (e.payment_method === 'emprestimo') {
    const n = e.loan_installments ?? '?';
    return `${n}x mensais de R$ ${fmtBRL(e.amount)} — Total R$ ${fmtBRL(Number(e.amount) * Number(n))}`;
  }
  if (e.payment_method === 'emprestado') return `Emprestado por: ${e.lender_name ?? '—'}`;
  return '—';
}

const CAT_COLOR = { pessoal: 'indigo', empresarial: 'emerald' };

export default function ExpenseCard({ expense: e }) {
  const m = EXPENSE_METHOD_MAP[e.payment_method] ?? { label: e.payment_method, icon: '💰', color: 'gray' };
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-semibold text-gray-800 leading-snug">{e.description}</p>
        <Badge color={CAT_COLOR[e.category] ?? 'gray'}>{e.category}</Badge>
      </div>
      <p className="mb-1 text-xl font-bold text-gray-900">R$ {fmtBRL(e.amount)}</p>
      <p className="mb-3 text-xs text-gray-500 leading-relaxed">{detail(e)}</p>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <Badge color={m.color}>{m.icon} {m.label}</Badge>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>📅 {fmtDate(e.purchase_date)}</span>
          <span>· {e.registered_by_name}</span>
        </div>
      </div>
    </Card>
  );
}
