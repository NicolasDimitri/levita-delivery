// src/components/ExpenseCard.jsx
// Exibe um gasto registrado com todos os detalhes relevantes pro método usado.

const METHOD_LABELS = {
  nubank:       { label: 'Nubank',       color: 'bg-purple-100 text-purple-700' },
  business:     { label: 'Business',     color: 'bg-blue-100 text-blue-700'   },
  mercado_pago: { label: 'Mercado Pago', color: 'bg-yellow-100 text-yellow-700' },
  ifood_pago:   { label: 'iFood Pago',   color: 'bg-red-100 text-red-700'     },
  boleto:       { label: 'Boleto',       color: 'bg-orange-100 text-orange-700' },
  pix:          { label: 'Pix',          color: 'bg-teal-100 text-teal-700'   },
  emprestimo:   { label: 'Empréstimo',   color: 'bg-pink-100 text-pink-700'   },
  emprestado:   { label: 'Emprestado',   color: 'bg-gray-100 text-gray-700'   },
};

const CATEGORY_LABEL = {
  pessoal:      { label: 'Pessoal',      color: 'bg-indigo-50 text-indigo-700'  },
  empresarial:  { label: 'Empresarial',  color: 'bg-emerald-50 text-emerald-700' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}

function installmentDetail(expense) {
  const CARDS = ['nubank', 'business', 'mercado_pago', 'ifood_pago'];
  const pm = expense.payment_method;

  if (CARDS.includes(pm)) {
    const n = expense.card_installments ?? 1;
    const total = (Number(expense.amount) * n).toFixed(2);
    if (n === 1) return `À vista no cartão — Total: R$ ${total}`;
    return `${n}x de R$ ${Number(expense.amount).toFixed(2)} — Total: R$ ${total}`;
  }

  if (pm === 'boleto') {
    if (expense.boleto_type === 'avista') {
      return `À vista — vence em 14 dias a partir de ${formatDate(expense.purchase_date)}`;
    }
    const n = expense.boleto_weekly_installments ?? '?';
    const total = (Number(expense.amount) * (Number(n) || 0)).toFixed(2);
    return `${n}x semanais de R$ ${Number(expense.amount).toFixed(2)} — 1ª em 7 dias — Total: R$ ${total}`;
  }

  if (pm === 'pix') return 'Pago na hora (Pix)';

  if (pm === 'emprestimo') {
    const n = expense.loan_installments ?? '?';
    const total = (Number(expense.amount) * (Number(n) || 0)).toFixed(2);
    return `${n}x mensais de R$ ${Number(expense.amount).toFixed(2)} — Total: R$ ${total}`;
  }

  if (pm === 'emprestado') {
    return `Emprestado por: ${expense.lender_name ?? '—'} — sem prazo definido`;
  }

  return '—';
}

export default function ExpenseCard({ expense }) {
  const method   = METHOD_LABELS[expense.payment_method]   ?? { label: expense.payment_method, color: 'bg-gray-100 text-gray-700' };
  const category = CATEGORY_LABEL[expense.category] ?? { label: expense.category, color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-gray-800">{expense.description}</p>
        <div className="flex gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${method.color}`}>
            {method.label}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${category.color}`}>
            {category.label}
          </span>
        </div>
      </div>

      <p className="mb-1 text-lg font-bold text-gray-900">R$ {Number(expense.amount).toFixed(2)}</p>
      <p className="mb-3 text-sm text-gray-500">{installmentDetail(expense)}</p>

      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-gray-400">
        <span>📅 {formatDate(expense.purchase_date)}</span>
        <span>👤 {expense.registered_by_name}</span>
      </div>
    </div>
  );
}
