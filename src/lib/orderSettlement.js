export const STORES = [
  { id: '5ff3a29c-5175-4566-862a-20eb8170248f', name: 'Levita - Massas Artesanais' },
  { id: 'b3fbcc94-6fc4-414c-b3f1-c8e308dcde65', name: 'Tompêro do Chef' },
  { id: 'e5eceda1-fefe-4c74-a78e-ef41f6730280', name: 'Central Lanches' }
];

function cents(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(Math.round(number * 100))) return null;
  return Math.round(number * 100);
}

export function calculateOrderSettlement(order) {
  const total = order.order_total;
  const subtotal = cents(total?.subTotal);
  const delivery = cents(total?.deliveryFee);
  const additionalFees = cents(total?.additionalFees);
  const discount = cents(total?.benefits);
  const orderAmount = cents(total?.orderAmount);
  const pending = cents(order.payment_pending);
  if (subtotal === null || delivery === null || additionalFees === null || discount === null ||
      orderAmount === null || pending === null) {
    return { error: 'Dados financeiros incompletos' };
  }
  if (!Array.isArray(order.benefits_raw)) return { error: 'Detalhes dos descontos indisponíveis' };

  let merchant = 0;
  let ifood = 0;
  let benefitsSum = 0;
  for (const benefit of order.benefits_raw) {
    const benefitValue = cents(benefit?.value);
    if (benefitValue === null || !Array.isArray(benefit?.sponsorshipValues)) {
      return { error: 'Detalhes dos descontos incompletos' };
    }
    let sponsored = 0;
    for (const sponsor of benefit.sponsorshipValues) {
      const amount = cents(sponsor?.value);
      if (amount === null) return { error: 'Valor de incentivo inválido' };
      sponsored += amount;
      if (sponsor.name === 'MERCHANT') merchant += amount;
      else if (sponsor.name === 'IFOOD') ifood += amount;
      else if (amount !== 0) return { error: 'Incentivo de outra origem requer conferência' };
    }
    if (sponsored !== benefitValue) return { error: 'Divisão dos incentivos não confere' };
    benefitsSum += benefitValue;
  }
  if (benefitsSum !== discount) return { error: 'Total dos descontos não confere' };

  const gross = subtotal + delivery;
  if (gross + additionalFees - discount !== orderAmount) return { error: 'Total do pedido não confere' };
  if (merchant > gross) return { error: 'Incentivo da loja excede o valor da venda' };
  if (orderAmount === 0 || (pending !== 0 && pending !== orderAmount)) {
    return { error: 'Pagamento requer conferência' };
  }

  const saleBase = gross - merchant;
  const commission = Math.round(saleBase * 12 / 100);
  const onlineFee = pending === 0 ? Math.round(saleBase * 32 / 1000) : 0;
  const net = saleBase - commission - onlineFee;
  return { gross, commission, onlineFee, merchant, ifood, pending, net, payout: net - pending };
}

export function settlementEntry(order) {
  const calculation = calculateOrderSettlement(order);
  const reason = order.date_estimated ? 'Data original não disponível'
    : !STORES.some(store => store.id === order.merchant_id) ? 'Loja não identificada'
      : calculation.error;
  return { order, calculation, reason };
}

export function dailyStoreEntries(orders, date, storeId) {
  return orders
    .filter(order => order.order_date === date && order.merchant_id === storeId)
    .map(settlementEntry);
}

export function summarizeSettlement(orders) {
  const result = { payout: 0, count: 0, excluded: 0 };
  for (const order of orders) {
    const { calculation, reason } = settlementEntry(order);
    if (reason) result.excluded++;
    else {
      result.payout += calculation.payout;
      result.count++;
    }
  }
  return result;
}

export function weeklySettlementHistory(orders) {
  const grouped = new Map();
  for (const order of orders) {
    const week = weekFor(order.order_date);
    if (!grouped.has(week.start)) grouped.set(week.start, { week, orders: [] });
    grouped.get(week.start).orders.push(order);
  }
  return [...grouped.values()]
    .sort((a, b) => b.week.start.localeCompare(a.week.start))
    .map(({ week, orders: weekOrders }) => ({
      week,
      summary: summarizeSettlement(weekOrders),
      stores: STORES.map(store => ({
        ...store,
        summary: summarizeSettlement(weekOrders.filter(order => order.merchant_id === store.id))
      }))
    }));
}

export function weekFor(date) {
  const selected = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(selected.getTime())) throw new Error('Data inválida');
  const weekday = (selected.getUTCDay() + 6) % 7;
  const monday = new Date(selected.getTime() - weekday * 86400000);
  const dateAt = days => new Date(monday.getTime() + days * 86400000).toISOString().slice(0, 10);
  return { start: dateAt(0), last: dateAt(6), end: dateAt(7), payout: dateAt(9) };
}

export function todayInBrazil() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
