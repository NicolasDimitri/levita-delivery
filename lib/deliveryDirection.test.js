import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeliveryDirection } from './deliveryDirection.js';

test('identifica os oito setores a partir da loja usando coordenadas do iFood', () => {
  const cases = [
    [-7.214483, -35.868339, 'Norte'],
    [-7.214483, -35.858339, 'Nordeste'],
    [-7.224483, -35.858339, 'Leste'],
    [-7.234483, -35.858339, 'Sudeste'],
    [-7.234483, -35.868339, 'Sul'],
    [-7.234483, -35.878339, 'Sudoeste'],
    [-7.224483, -35.878339, 'Oeste'],
    [-7.214483, -35.878339, 'Noroeste']
  ];
  for (const [latitude, longitude, name] of cases) {
    assert.equal(getDeliveryDirection({ latitude, longitude, route_latitude: 90, route_longitude: 0 }).name, name);
  }
});

test('trata coordenadas ausentes, inválidas e o ponto da loja', () => {
  for (const order of [{}, { latitude: '', longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 'NaN' }]) {
    assert.equal(getDeliveryDirection(order), null);
  }
  assert.equal(getDeliveryDirection({ latitude: '-7.224483', longitude: '-35.868339' }).name, 'Na loja');
});
