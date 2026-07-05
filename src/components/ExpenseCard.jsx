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
  if (e.payment_method === 'emprestado') return `Emprestado por: ${e.lender_name ?? e.description ?? '—'}`;
  return '—';
}

const CAT_COLOR = { pessoal: 'indigo', empresarial: 'emerald' };

export default function ExpenseCard({ expense: e, onPay }) {
  const m = EXPENSE_METHOD_MAP[e.payment_method] ?? { label: e.payment_method, icon: '💰', color: 'gray' };
  const canPay = CARDS.includes(e.payment_method) || e.payment_method === 'emprestado';

  // dados que pré-preenchem o PaymentForm ao clicar em "Pagar"
  function buildInitialPayment() {
    if (CARDS.includes(e.payment_method)) {
      return { payment_type: 'fatura_cartao', reference: e.payment_method };
    }
    if (e.payment_method === 'emprestado') {
      return {
        payment_type: 'quitacao_emprestado',
        reference: e.lender_name ?? e.description ?? '',
        amount: e.amount,
      };
    }
    return {};
  }

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-semibold text-gray-800 leading-snug">
          {e.payment_method === 'emprestado'
            ? (e.lender_name ?? e.description)
            : e.description}
        </p>
        <Badge color={CAT_COLOR[e.category] ?? 'gray'}>{e.category}</Badge>
      </div>

      <p className="mb-1 text-xl font-bold text-gray-900">R$ {fmtBRL(e.amount)}</p>
      <p className="mb-3 text-xs text-gray-500 leading-relaxed">{detail(e)}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge color={m.color}>{m.icon} {m.label}</Badge>
          <span className="text-xs text-gray-400">📅 {fmtDate(e.purchase_date)}</span>
          <span className="text-xs text-gray-400">· {e.registered_by_name}</span>
        </div>

        {canPay && onPay && (
          <button
            type="button"
            onClick={() => onPay(buildInitialPayment())}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 active:scale-95 transition"
          >
            Pagar
          </button>
        )}
      </div>
    </Card>
  );
}
