import { fmtBRL } from '../lib/constants';

const SPONSOR_LABELS = {
  MERCHANT: 'Loja',
  IFOOD: 'iFood',
  CHAIN: 'Rede',
  EXTERNAL: 'Indústria'
};

const TARGET_LABELS = {
  ITEM: 'Itens',
  DELIVERY_FEE: 'Entrega'
};

function getAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export default function OrderDiscounts({ benefits, total, className = '' }) {
  const entries = Array.isArray(benefits) ? benefits : [];
  const fallbackTotal = entries.reduce((sum, benefit) => sum + (getAmount(benefit?.value) || 0), 0);
  const storedTotal = getAmount(total);
  const totalDiscount = storedTotal > 0 ? storedTotal : fallbackTotal;

  const targets = new Map();
  const sponsors = new Map();

  for (const benefit of entries) {
    const benefitValue = getAmount(benefit?.value) || 0;
    const targetKey = benefit?.target || 'OTHER';
    const target = targets.get(targetKey) || { value: 0 };
    target.value += benefitValue;
    targets.set(targetKey, target);

    if (!Array.isArray(benefit?.sponsorshipValues)) continue;
    for (const sponsorship of benefit.sponsorshipValues) {
      const amount = getAmount(sponsorship?.value) || 0;
      if (amount <= 0) continue;

      const name = sponsorship?.name || 'OTHER';
      const sponsor = sponsors.get(name) || {
        label: SPONSOR_LABELS[name] || sponsorship?.description || 'Outro',
        value: 0
      };
      sponsor.value += amount;
      sponsors.set(name, sponsor);
    }
  }

  if (totalDiscount <= 0) return null;

  const targetRows = [...targets.entries()]
    .filter(([, target]) => target.value > 0)
    .map(([name, target]) => ({
      label: TARGET_LABELS[name] || 'Outros',
      value: target.value
    }));
  const sponsorRows = [...sponsors.values()].filter((sponsor) => sponsor.value > 0);

  return (
    <section
      aria-label="Descontos do pedido"
      className={`rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 font-semibold">
        <span>Descontos</span>
        <span>R$ {fmtBRL(totalDiscount)}</span>
      </div>
      {targetRows.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-green-800">
          {targetRows.map((target) => (
            <span key={target.label}>{target.label}: R$ {fmtBRL(target.value)}</span>
          ))}
        </div>
      )}
      {sponsorRows.length > 0 && (
        <div className="mt-1 border-t border-green-200 pt-1 text-green-800">
          {sponsorRows.map((sponsor, index) => (
            <span key={sponsor.label}>
              {index > 0 && ' · '}
              {sponsor.label}: R$ {fmtBRL(sponsor.value)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
