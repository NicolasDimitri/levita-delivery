const MAPS_MAX_URL_LENGTH = 2048;
// Mobile Google Maps URLs support up to three waypoints, plus the destination.
const MAPS_MAX_STOPS_PER_MOBILE_ROUTE = 4;
export const STORE_RETURN_ADDRESS = 'Pedro da Costa Agra, 296, Campina Grande, PB';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCoordinate(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

export function isMissingStreetNumber(value) {
  const streetNumber = normalizeText(value);
  return !streetNumber || /^(?:s\s*\/?\s*n|sem\s+n[uú]mero|0+)$/i.test(streetNumber);
}

export async function getPreviousRouteAddress(db, customerId, order) {
  const latitude = parseCoordinate(order.latitude, -90, 90);
  const longitude = parseCoordinate(order.longitude, -180, 180);
  if (!customerId || latitude === null || longitude === null) return null;

  const { data: previous, error } = await db
    .from('orders')
    .select('route_address, corrected_latitude, corrected_longitude, street, street_number, neighborhood, complement, reference, city, state, postal_code, latitude, longitude')
    .eq('ifood_customer_id', customerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!previous || !normalizeText(previous.route_address)) return null;

  if (parseCoordinate(previous.latitude, -90, 90) !== latitude ||
      parseCoordinate(previous.longitude, -180, 180) !== longitude) return null;

  const addressFields = ['street', 'street_number', 'neighborhood', 'complement', 'reference', 'city', 'state', 'postal_code'];
  if (addressFields.some((field) => normalizeText(previous[field]) !== normalizeText(order[field]))) return null;
  return {
    route_address: previous.route_address.trim(),
    corrected_latitude: parseCoordinate(previous.corrected_latitude, -90, 90),
    corrected_longitude: parseCoordinate(previous.corrected_longitude, -180, 180)
  };
}

export function getCorrectedCoordinates(order) {
  const latitude = parseCoordinate(order.corrected_latitude, -90, 90);
  const longitude = parseCoordinate(order.corrected_longitude, -180, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

export function getOrderNavigationAddress(order) {
  const customAddress = normalizeText(order.route_address);
  if (customAddress) return customAddress;

  const street = normalizeText(order.street);
  const streetNumber = normalizeText(order.street_number);
  if (!street || isMissingStreetNumber(streetNumber)) return '';
  return `${street}, ${streetNumber}`;
}

function coordinatesFromMapUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const isGoogleMapsHost = url.hostname === 'maps.google.com' ||
      url.hostname === 'google.com' ||
      url.hostname === 'www.google.com';
    if (!isGoogleMapsHost || (url.hostname !== 'maps.google.com' && !url.pathname.startsWith('/maps'))) {
      return null;
    }

    const query = url.searchParams.get('q') || url.searchParams.get('query');
    const match = query?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;

    const latitude = parseCoordinate(match[1], -90, 90);
    const longitude = parseCoordinate(match[2], -180, 180);
    return latitude === null || longitude === null ? null : { latitude, longitude };
  } catch {
    return null;
  }
}

function findGoogleMapsCoordinates(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return null;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const coordinates = findGoogleMapsCoordinates(item, visited);
      if (coordinates) return coordinates;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && /(?:google\.com|maps\.google\.com)/i.test(child)) {
      const coordinates = coordinatesFromMapUrl(child);
      if (coordinates) return coordinates;
    }
    if (child && typeof child === 'object') {
      const coordinates = findGoogleMapsCoordinates(child, visited);
      if (coordinates) return coordinates;
    }
    if ((key === 'coordinates' || key === 'location') && child && typeof child === 'object') {
      const latitude = parseCoordinate(child.latitude ?? child.lat, -90, 90);
      const longitude = parseCoordinate(child.longitude ?? child.lng ?? child.lon, -180, 180);
      if (latitude !== null && longitude !== null) return { latitude, longitude };
    }
  }
  return null;
}

export function getDeliveryCoordinates(address, delivery = {}) {
  const coordinateSources = [
    address?.coordinates,
    delivery?.coordinates,
    address?.location,
    delivery?.location,
    address,
    delivery
  ];

  for (const source of coordinateSources) {
    if (!source || typeof source !== 'object') continue;
    const latitude = parseCoordinate(source.latitude ?? source.lat, -90, 90);
    const longitude = parseCoordinate(source.longitude ?? source.lng ?? source.lon, -180, 180);
    if (latitude !== null && longitude !== null) return { latitude, longitude };
  }

  return findGoogleMapsCoordinates({ address, delivery });
}

export function getGoogleMapsDestination(order) {
  const corrected = getCorrectedCoordinates(order);
  const destination = order.route_address && corrected
    ? `${corrected.latitude},${corrected.longitude}`
    : getOrderNavigationAddress(order);
  if (!destination) return { destination: '', source: 'missing', approximate: true };

  return {
    destination,
    source: normalizeText(order.route_address) ? 'admin' : 'address',
    approximate: false
  };
}

function createMapsRouteUrl(stops, origin) {
  const params = new URLSearchParams({
    api: '1',
    destination: stops[stops.length - 1],
    travelmode: 'two-wheeler'
  });
  if (origin) params.set('origin', origin);
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsRouteBatches(destinations) {
  const batches = [];
  let startIndex = 0;
  let previousDestination = '';

  while (startIndex < destinations.length) {
    const remaining = destinations.slice(startIndex);
    const maxStops = Math.min(MAPS_MAX_STOPS_PER_MOBILE_ROUTE, remaining.length);
    let batchSize = 0;
    let url = '';

    for (let size = 1; size <= maxStops; size += 1) {
      const candidate = remaining.slice(0, size);
      const candidateUrl = createMapsRouteUrl(candidate, previousDestination);
      if (candidateUrl.length > MAPS_MAX_URL_LENGTH) break;
      batchSize = size;
      url = candidateUrl;
    }

    if (batchSize === 0) {
      return { batches, failedIndex: startIndex };
    }

    const stops = remaining.slice(0, batchSize);
    batches.push({ url, stops });
    previousDestination = stops[stops.length - 1];
    startIndex += batchSize;
  }

  return { batches, failedIndex: -1 };
}

export function buildWazeDestinationUrl(destination) {
  const params = new URLSearchParams({
    q: destination,
    navigate: 'yes'
  });
  return `https://waze.com/ul?${params.toString()}`;
}
