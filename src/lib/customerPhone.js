export function getCustomerPhone(order, now = Date.now()) {
  const phone = order.subtotal?.customer?.phone;
  if (!phone || typeof phone.number !== 'string') return null;

  const rawNumber = phone.number.trim();
  if (!/^\+?[\d\s().-]+$/.test(rawNumber)) return null;
  const digits = rawNumber.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;

  const localizer = phone.localizer == null ? '' : String(phone.localizer).trim();
  if (localizer && !/^\d+$/.test(localizer)) return null;
  if (digits.startsWith('0800') && !localizer) return null;

  if (phone.localizerExpiration) {
    const expiresAt = Date.parse(phone.localizerExpiration);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  }
  if (order.delivery_date_time) {
    const deliveryAt = Date.parse(order.delivery_date_time);
    if (Number.isFinite(deliveryAt) && deliveryAt + 3 * 60 * 60 * 1000 <= now) return null;
  }

  return {
    number: rawNumber,
    localizer,
    href: `tel:${rawNumber.startsWith('+') ? '+' : ''}${digits}`,
  };
}
