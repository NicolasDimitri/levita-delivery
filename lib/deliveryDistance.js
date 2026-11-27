const STORE_COORDINATES = { latitude: -7.224483, longitude: -35.868339 };

function coordinate(value, limit) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= limit ? result : null;
}

function haversineDistanceKm(origin, destination) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);

  const latitudeOrigin = toRadians(origin.latitude);
  const latitudeDestination = toRadians(destination.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeOrigin)
      * Math.cos(latitudeDestination)
      * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getStoreToOrderDistance(order) {
  const latitude = coordinate(order?.route_latitude ?? order?.latitude, 90);
  const longitude = coordinate(order?.route_longitude ?? order?.longitude, 180);
  if (latitude === null || longitude === null) return null;

  const distanceKm = haversineDistanceKm(STORE_COORDINATES, { latitude, longitude });
  const color = distanceKm <= 2 ? 'green' : distanceKm <= 4 ? 'yellow' : 'red';

  return {
    distanceKm,
    color,
    label: `${distanceKm.toFixed(1).replace('.', ',')} km`
  };
}
