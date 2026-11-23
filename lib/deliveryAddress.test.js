import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleMapsRouteBatches,
  buildWazeDestinationUrl,
  getGoogleMapsDestination,
  getOrderCopyAddress,
  getOrderDestinationCoordinates,
  parseCoordinatePair
} from './deliveryAddress.js';

test('navegação usa coordenadas do iFood ou a correção administrativa, ignorando endereço textual', () => {
  const order = { latitude: '-7.23', longitude: '-35.87', route_address: 'Local antigo', street: 'Rua A', street_number: '10' };
  assert.equal(getGoogleMapsDestination(order).destination, '-7.23,-35.87');
  const corrected = { ...order, route_latitude: '-7.24', route_longitude: '-35.88' };
  assert.equal(getGoogleMapsDestination(corrected).destination, '-7.24,-35.88');
  assert.equal(getGoogleMapsDestination(corrected).source, 'admin');
  assert.equal(getGoogleMapsDestination({ ...order, route_latitude: -7.24 }).destination, '');
  assert.equal(getGoogleMapsDestination({ latitude: null, longitude: null }).destination, '');
});

test('links para Google Maps e Waze usam coordenadas e mantêm paradas da rota', () => {
  const coordinates = '-7.24,-35.88';
  const waze = new URL(buildWazeDestinationUrl(coordinates));
  assert.equal(waze.searchParams.get('ll'), coordinates);
  assert.equal(waze.searchParams.get('navigate'), 'yes');
  const route = buildGoogleMapsRouteBatches([coordinates, '-7.25,-35.89', 'Loja']);
  const maps = new URL(route.batches[0].url);
  assert.equal(maps.searchParams.get('waypoints'), `${coordinates}|-7.25,-35.89`);
  assert.equal(maps.searchParams.get('destination'), 'Loja');
});

test('aceita e valida coordenadas em graus decimais', () => {
  assert.deepEqual(parseCoordinatePair(' -7.223361, -35.936778 '), { latitude: -7.223361, longitude: -35.936778 });
  assert.deepEqual(parseCoordinatePair('0; 0'), { latitude: 0, longitude: 0 });
  for (const value of ['', '-91, -35', '-7, -181', '-7', 'foo, bar', '-7,2, -35,8']) {
    assert.equal(parseCoordinatePair(value), null);
  }
  assert.deepEqual(getOrderDestinationCoordinates({ route_latitude: null, route_longitude: null, latitude: '0', longitude: '0' }), { latitude: 0, longitude: 0 });
});

test('cópia usa rua, número e bairro mesmo sem coordenadas ou número', () => {
  assert.equal(getOrderCopyAddress({ street: ' Rua A ', street_number: '123', neighborhood: 'Centro', route_address: 'Outro local' }), 'Rua A, 123, Centro');
  assert.equal(getOrderCopyAddress({ street: 'Rua A', street_number: '', neighborhood: 'Centro' }), 'Rua A, Centro');
  assert.equal(getOrderCopyAddress({}), '');
});
