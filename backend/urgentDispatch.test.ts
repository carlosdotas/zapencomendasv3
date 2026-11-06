import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceInKm, nearestAvailableDriver } from './urgentDispatch';

test('calculates the distance between pickup and driver coordinates', () => {
  assert.ok(Math.abs(distanceInKm(
    { lat: -16.6869, lng: -49.2648 },
    { lat: -16.6869, lng: -49.2648 }
  )) < 0.001);
  assert.ok(distanceInKm(
    { lat: -16.6869, lng: -49.2648 },
    { lat: -16.6969, lng: -49.2648 }
  ) > 1 && distanceInKm(
    { lat: -16.6869, lng: -49.2648 },
    { lat: -16.6969, lng: -49.2648 }
  ) < 1.2);
});

test('offers the closest untried driver within the configured capture radius', () => {
  const candidates = [
    { id: 'farther', distanceKm: 3 },
    { id: 'closest', distanceKm: 1 },
    { id: 'outside', distanceKm: 8 }
  ];

  assert.deepEqual(nearestAvailableDriver(candidates, new Set(), 5), {
    id: 'closest',
    distanceKm: 1
  });
  assert.deepEqual(nearestAvailableDriver(candidates, new Set(['closest']), 5), {
    id: 'farther',
    distanceKm: 3
  });
  assert.equal(nearestAvailableDriver(candidates, new Set(['closest', 'farther']), 5), null);
});
