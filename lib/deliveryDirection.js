const STORE_LATITUDE = -7.224483;
const STORE_LONGITUDE = -35.868339;
const DIRECTIONS = [
  { name: 'Norte', color: 'blue' },
  { name: 'Nordeste', color: 'teal' },
  { name: 'Leste', color: 'green' },
  { name: 'Sudeste', color: 'yellow' },
  { name: 'Sul', color: 'orange' },
  { name: 'Sudoeste', color: 'red' },
  { name: 'Oeste', color: 'purple' },
  { name: 'Noroeste', color: 'pink' }
];

function coordinate(value, limit) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= limit ? result : null;
}

export function getDeliveryDirection(order) {
  const latitude = coordinate(order?.latitude, 90);
  const longitude = coordinate(order?.longitude, 180);
  if (latitude === null || longitude === null) return null;
  if (latitude === STORE_LATITUDE && longitude === STORE_LONGITUDE) {
    return { name: 'Na loja', color: 'gray' };
  }
  const radians = Math.PI / 180;
  const lat1 = STORE_LATITUDE * radians;
  const lat2 = latitude * radians;
  const deltaLongitude = (longitude - STORE_LONGITUDE) * radians;
  const y = Math.sin(deltaLongitude) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude);
  const bearing = (Math.atan2(y, x) / radians + 360) % 360;
  return DIRECTIONS[Math.floor((bearing + 22.5) / 45) % 8];
}
