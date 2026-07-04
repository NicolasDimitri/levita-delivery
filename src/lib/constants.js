// src/lib/constants.js

// ── Pedidos ──────────────────────────────────────────────────────────────
export const ORDER_STATUS = {
  recebido:   { label: 'Novo pedido', color: 'gray'   },
  em_preparo: { label: 'Em preparo',  color: 'amber'  },
  pronto:     { label: 'Pronto',      color: 'purple' },
  em_rota:    { label: 'Em rota',     color: 'blue'   },
  entregue:   { label: 'Entregue',    color: 'green'  },
  cancelado:  { label: 'Cancelado',   color: 'red'    },
};

export const PAYMENT_BADGE = {
  online:   { label: 'PAGO ONLINE',        bg: 'bg-green-600'  },
  dinheiro: { label: 'RECEBER EM DINHEIRO', bg: 'bg-blue-600'  },
  debito:   { label: 'RECEBER NO DÉBITO',   bg: 'bg-yellow-500' },
  credito:  { label: 'RECEBER NO CRÉDITO',  bg: 'bg-red-600'   },
};

// ── Financeiro — Gastos ──────────────────────────────────────────────────
export const EXPENSE_METHODS = [
  { value: 'nubank',       label: 'Nubank',       icon: '💳', color: 'purple' },
  { value: 'business',     label: 'Business',     icon: '💳', color: 'blue'   },
  { value: 'mercado_pago', label: 'Mercado Pago', icon: '💳', color: 'yellow' },
  { value: 'ifood_pago',   label: 'iFood Pago',   icon: '💳', color: 'red'    },
  { value: 'boleto',       label: 'Boleto',       icon: '📄', color: 'orange' },
  { value: 'pix',          label: 'Pix',          icon: '⚡', color: 'teal'   },
  { value: 'emprestimo',   label: 'Empréstimo',   icon: '🏦', color: 'pink'   },
  { value: 'emprestado',   label: 'Emprestado',   icon: '🤝', color: 'gray'   },
];

export const EXPENSE_METHOD_MAP = Object.fromEntries(EXPENSE_METHODS.map(m => [m.value, m]));

export const CARDS = ['nubank', 'business', 'mercado_pago', 'ifood_pago'];

// ── Financeiro — Pagamentos ───────────────────────────────────────────────
export const PAYMENT_TYPES = [
  { value: 'fatura_cartao',       label: 'Pagamento de fatura',  icon: '💳', desc: 'Total ou parcial de cartão'  },
  { value: 'antecipacao_cartao',  label: 'Antecipação de fatura', icon: '⚡', desc: 'Pagar antes do vencimento'  },
  { value: 'quitacao_boleto',     label: 'Quitar boleto',        icon: '📄', desc: 'Quitar parcelas de boleto'   },
  { value: 'quitacao_emprestimo', label: 'Quitar empréstimo',    icon: '🏦', desc: 'Quitar parcelas de empréstimo'},
  { value: 'quitacao_emprestado', label: 'Devolver emprestado',  icon: '🤝', desc: 'Devolver valor emprestado'   },
];

export const PAYMENT_TYPE_MAP = Object.fromEntries(PAYMENT_TYPES.map(t => [t.value, t]));

// ── Financeiro — Cartões ─────────────────────────────────────────────────
export const CARD_INFO = {
  nubank:       { label: 'Nubank',       close: 5,  due: 12 },
  business:     { label: 'Business',     close: 14, due: 21 },
  mercado_pago: { label: 'Mercado Pago', close: 2,  due: 7  },
  ifood_pago:   { label: 'iFood Pago',   close: 19, due: 25 },
};

// ── Helpers ──────────────────────────────────────────────────────────────
export const CATEGORIES = ['pessoal', 'empresarial'];

export function fmtBRL(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('pt-BR');
}

/** Próximo dia útil (pula sábado/domingo) */
export function nextBusinessDay(date) {
  const d = new Date(date);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

/** Calcula a próxima data de fechamento e vencimento de um cartão */
export function cardDueDates(cardKey) {
  const info = CARD_INFO[cardKey];
  if (!info) return null;
  const now = new Date();
  const pastClose = now.getDate() > info.close;
  const closeMonth = (now.getMonth() + (pastClose ? 1 : 0));
  const closeDate = new Date(now.getFullYear() + (closeMonth > 11 ? 1 : 0), closeMonth % 12, info.close);
  const dueRaw = new Date(closeDate.getFullYear(), closeDate.getMonth() + 1, info.due);
  const dueDate = nextBusinessDay(dueRaw);
  const daysToClose = Math.ceil((closeDate - now) / 86400000);
  const daysToDue = Math.ceil((dueDate - now) / 86400000);
  return { closeDate, dueDate, daysToClose, daysToDue };
}

/** Formata a data de um objeto Date em dd/mm */
export function fmtDateShort(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
