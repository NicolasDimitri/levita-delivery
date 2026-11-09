import { fmtBRL } from '../lib/constants';

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
  const sponsors = { MERCHANT: 0, IFOOD: 0 };
  let hasSponsorBreakdown = false;

  for (const benefit of entries) {
    if (!Array.isArray(benefit?.sponsorshipValues)) continue;
    for (const sponsorship of benefit.sponsorshipValues) {
      if (!Object.hasOwn(sponsors, sponsorship?.name)) continue;
      const amount = getAmount(sponsorship?.value);
      if (amount === null) continue;
      hasSponsorBreakdown = true;
      sponsors[sponsorship.name] += amount;
    }
  }

  if (totalDiscount <= 0) return null;

  return (
    <section
      aria-label="Descontos do pedido"
      className={`rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 font-semibold">
        <span>Total de descontos</span>
        <span>R$ {fmtBRL(totalDiscount)}</span>
      </div>
      {hasSponsorBreakdown ? (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 border-t border-green-200 pt-1 text-green-800">
          <span>Incentivo da loja: R$ {fmtBRL(sponsors.MERCHANT)}</span>
          <span>Incentivo do iFood: R$ {fmtBRL(sponsors.IFOOD)}</span>
        </div>
      ) : (
        <p className="mt-1 border-t border-green-200 pt-1 text-green-800">
          O iFood não informou a divisão entre loja e iFood.
        </p>
      )}
    </section>
  );
}
