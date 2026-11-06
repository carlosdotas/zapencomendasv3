import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DriverTrackingClient } from './driverTrackingClient';

test('native offers are synchronized once and cancellations do not remove newer offers', () => {
  const events = new EventTarget();
  const doc = new EventTarget();
  Object.assign(doc, { visibilityState: 'visible' });
  let nativeOffers: unknown[] = [];
  let nativeCancellations: unknown[] = [];
  Object.assign(events, {
    location: { protocol: 'https:', host: 'example.com' },
    AndroidApp: {
      getNativeUrgentOffers: () => JSON.stringify(nativeOffers),
      getNativeUrgentCancellations: () => JSON.stringify(nativeCancellations)
    }
  });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  try {
    const client = new DriverTrackingClient();
    const received: number[] = [];
    const cancelled: string[] = [];
    client.onUrgentOffer(offer => received.push(offer.expiresAt));
    client.onUrgentCancel(id => cancelled.push(id));
    const expiresAt = Date.now() + 30000;
    const offer = { offerId: '1-coleta', expiresAt, place: { name: 'Local', coordinates: { lat: 1, lng: 2 } } };
    nativeOffers = [offer];
    events.dispatchEvent(new Event('zap:native-urgent-sync'));
    events.dispatchEvent(new Event('zap:native-urgent-sync'));
    assert.deepEqual(received, [expiresAt]);

    nativeOffers = [];
    nativeCancellations = [{ offerId: offer.offerId, expiresAt }];
    events.dispatchEvent(new Event('zap:native-urgent-sync'));
    events.dispatchEvent(new Event('zap:native-urgent-sync'));
    assert.deepEqual(cancelled, ['1-coleta']);

    nativeOffers = [{ ...offer, expiresAt: expiresAt + 1000 }];
    events.dispatchEvent(new Event('zap:native-urgent-sync'));
    nativeOffers = [];
    events.dispatchEvent(new Event('zap:native-urgent-sync'));
    assert.deepEqual(received, [expiresAt, expiresAt + 1000]);
    assert.deepEqual(cancelled, ['1-coleta']);
    client.disconnect();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
