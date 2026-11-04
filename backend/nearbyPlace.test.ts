import test from 'node:test';
import assert from 'node:assert/strict';
import { findNearbyNamedPlace } from './nearbyPlace';

test('only accepts establishments within 10 metres of the selected point', () => {
  const origin = { lat: -16.7, lng: -49.2 };
  const distant = { name: 'Outro local', types: ['establishment'], geometry: { location: { lat: -16.7002, lng: -49.2 } } };
  const nearby = { name: 'Loja próxima', types: ['store'], geometry: { location: { lat: -16.70004, lng: -49.2 } } };
  assert.equal(findNearbyNamedPlace([distant], origin, 10), undefined);
  assert.equal(findNearbyNamedPlace([distant, nearby], origin, 10), nearby);
  assert.equal(findNearbyNamedPlace([{ name: 'Rua', types: ['route'], geometry: nearby.geometry }], origin, 10), undefined);
  assert.equal(findNearbyNamedPlace([{ name: 'Loja', types: ['store'] }], origin, 10), undefined);
});
