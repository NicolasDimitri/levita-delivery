// src/components/PaymentCard.jsx
import { Badge, Card } from '../lib/ui';
import { PAYMENT_TYPE_MAP, CARD_INFO, fmtBRL, fmtDate } from '../lib/constants';

const CAT_COLOR = { pessoal: 'indigo', empresarial: 'emerald' };

export default function PaymentCard({ payment: p }) {
  const t = PAYMENT_TYPE_MAP[p.payment_type] ?? { label: p.payment_type, icon: '💰' };
  const refLabel = CARD_INFO[p.reference]?.label ?? p.reference;
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{refLabel}</p>
          {p.notes && <p className="mt-0.5 text-xs text-gray-400">{p.notes}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge color={CAT_COLOR[p.category] ?? 'gray'}>{p.category}</Badge>
          {p.is_full_payment && <Badge color="green">Total</Badge>}
        </div>
      </div>
      <p className="mb-3 text-xl font-bold text-green-700">- R$ {fmtBRL(p.amount)}</p>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <Badge color="blue">{t.icon} {t.label}</Badge>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>📅 {fmtDate(p.payment_date)}</span>
          <span>· {p.registered_by_name}</span>
        </div>
      </div>
    </Card>
  );
}
