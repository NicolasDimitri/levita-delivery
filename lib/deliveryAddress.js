const MAPS_MAX_URL_LENGTH = 2048;
// Mobile Google Maps URLs support up to three waypoints, plus the destination.
const MAPS_MAX_STOPS_PER_MOBILE_ROUTE = 4;

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

function isMissingStreetNumber(value) {
  return !value || /^(?:s\s*\/?\s*n|sem\s+n[uú]mero|0+)$/i.test(value);
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
  const latitude = parseCoordinate(order.latitude, -90, 90);
  const longitude = parseCoordinate(order.longitude, -180, 180);
  if (latitude !== null && longitude !== null) {
    return { destination: `${latitude},${longitude}`, source: 'coordinates', approximate: false };
  }

  const street = normalizeText(order.street);
  const streetNumber = normalizeText(order.street_number);
  const neighborhood = normalizeText(order.neighborhood);
  const city = normalizeText(order.city);
  const state = normalizeText(order.state);
  const postalCode = normalizeText(order.postal_code);
  const hasLocationContext = Boolean(neighborhood || city || postalCode);
  const hasPreciseLocationContext = Boolean(city || postalCode);

  if (!street || !hasLocationContext) {
    return { destination: '', source: 'missing', approximate: true };
  }

  const missingNumber = isMissingStreetNumber(streetNumber);
  const destination = [
    missingNumber ? street : `${street}, ${streetNumber}`,
    neighborhood,
    city,
    state,
    postalCode
  ].filter(Boolean).join(', ');

  return {
    destination,
    source: 'address',
    approximate: missingNumber || !hasPreciseLocationContext
  };
}

function createMapsRouteUrl(stops, origin) {
  const params = new URLSearchParams({
    api: '1',
    destination: stops[stops.length - 1],
    travelmode: 'driving'
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
