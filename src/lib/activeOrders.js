function forecastTime(order) {
  if (!order.delivery_date_time) return Infinity;
  const time = new Date(order.delivery_date_time).getTime();
  return Number.isNaN(time) ? Infinity : time;
}

export function ordersForActiveColumn(orders, status) {
  const filtered = orders.filter(order => order.status === status);
  if (status !== 'em_preparo') return filtered;
  return filtered.sort((a, b) => {
    const first = forecastTime(a);
    const second = forecastTime(b);
    return first === second ? 0 : first < second ? -1 : 1;
  });
}
