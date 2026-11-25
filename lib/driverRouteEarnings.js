import { getCorrectedCoordinates } from './deliveryAddress.js';

const STORE_COORDINATES = [-35.868339, -7.224483];
const DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car';

export function earningsForDistance(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
    throw new Error('Distância da rota inválida');
  }
  if (meters <= 2500) return 5;
  if (meters <= 3500) return 6;
  if (meters <= 4500) return 7;
  return 8;
}

function coordinate(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export async function getRouteEarnings(order, { fetchImpl = fetch, apiKey = process.env.ORS_API_KEY } = {}) {
  const corrected = getCorrectedCoordinates(order);
  if (order.route_address && !corrected) {
    throw new Error('Destino corrigido sem coordenadas confirmadas no mapa');
  }
  const latitude = corrected && order.route_address ? corrected.latitude : coordinate(order.latitude, -90, 90);
  const longitude = corrected && order.route_address ? corrected.longitude : coordinate(order.longitude, -180, 180);
  if (latitude === null || longitude === null) throw new Error('Coordenadas do destino ausentes ou inválidas');
  if (!apiKey?.trim()) throw new Error('ORS_API_KEY não configurada');

  const response = await fetchImpl(DIRECTIONS_URL, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: [STORE_COORDINATES, [longitude, latitude]],
      preference: 'shortest'
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`openrouteservice retornou HTTP ${response.status}`);
  const result = await response.json();
  const distance = result?.routes?.[0]?.summary?.distance;
  return { distance, amount: earningsForDistance(distance) };
}

export async function recordDriverEarnings(db, order, routeLookup = getRouteEarnings) {
  if (!order.driver_id) return;
  const { error: insertError } = await db.from('delivery_history').upsert({
    order_id: order.id,
    driver_id: order.driver_id,
    valor_entrega: null
  }, { onConflict: 'order_id', ignoreDuplicates: true });
  if (insertError) throw insertError;
  return calculatePendingEarnings(db, order, routeLookup);
}

export async function calculatePendingEarnings(db, order, routeLookup = getRouteEarnings) {
  const { data: history, error: lookupError } = await db.from('delivery_history')
    .select('id, valor_entrega')
    .eq('order_id', order.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!history) throw new Error('Histórico da entrega não encontrado');
  if (history.valor_entrega !== null) return { pending: false };

  let route;
  try {
    route = await routeLookup(order);
  } catch (error) {
    console.error('Não foi possível calcular o repasse da entrega', { orderId: order.id, error: error.message });
    const { error: updateError } = await db.from('delivery_history')
      .update({ route_error: error.message })
      .eq('id', history.id)
      .is('valor_entrega', null);
    if (updateError) throw updateError;
    return { pending: true, error: error.message };
  }

  const { error: updateError } = await db.from('delivery_history')
    .update({ valor_entrega: route.amount, route_distance_meters: route.distance, route_error: null })
    .eq('id', history.id)
    .is('valor_entrega', null);
  if (updateError) throw updateError;
  return { pending: false };
}
