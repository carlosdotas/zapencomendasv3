import assert from 'node:assert/strict';
import { test } from 'node:test';
import { androidBridge, type AndroidAppBridge } from './androidBridge';

test('requires native alert permissions before a driver goes online', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let calls = 0;
  const bridge: AndroidAppBridge = { prepareUrgentAlerts: () => { calls++; return false; } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AndroidApp: bridge } });
  try {
    assert.equal(androidBridge.prepareDriverAlerts(), false);
    bridge.prepareUrgentAlerts = () => { calls++; return true; };
    assert.equal(androidBridge.prepareDriverAlerts(), true);
    assert.equal(calls, 2);
    delete bridge.prepareUrgentAlerts;
    bridge.requireUrgentFullScreenPermission = () => { calls++; };
    assert.equal(androidBridge.prepareDriverAlerts(), true);
    assert.equal(calls, 3);
    delete (globalThis as { window?: unknown }).window;
    assert.equal(androidBridge.prepareDriverAlerts(), true);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
