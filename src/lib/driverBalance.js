function sumCents(rows, field) {
  return rows.reduce((sum, row) => sum + Math.round(Number(row[field]) * 100), 0);
}

export function calculateDriverBalance(deliveries, withdrawals, adjustments) {
  return (
    sumCents(deliveries, 'valor_entrega') -
    sumCents(withdrawals, 'valor') +
    sumCents(adjustments, 'amount')
  ) / 100;
}
