import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  areArraysEqualFast,
  getPlaceSignature,
  getCustomerSignature,
  getDriverSignature,
  runInBackground
} from './backgroundScheduler.js';

describe('backgroundScheduler', () => {
  it('areArraysEqualFast detects identical arrays correctly without JSON.stringify', () => {
    const list1 = [
      { id: '1', name: 'A' },
      { id: '2', name: 'B' }
    ];
    const list2 = [
      { id: '1', name: 'A' },
      { id: '2', name: 'B' }
    ];

    assert.equal(areArraysEqualFast(list1, list2, item => `${item.id}_${item.name}`), true);
  });

  it('areArraysEqualFast detects modified arrays instantly', () => {
    const list1 = [
      { id: '1', name: 'A' },
      { id: '2', name: 'B' }
    ];
    const list2 = [
      { id: '1', name: 'A' },
      { id: '2', name: 'B_MODIFIED' }
    ];

    assert.equal(areArraysEqualFast(list1, list2, item => `${item.id}_${item.name}`), false);
  });

  it('areArraysEqualFast handles empty and different length arrays gracefully', () => {
    assert.equal(areArraysEqualFast([], [], x => x), true);
    assert.equal(areArraysEqualFast([1], [1, 2], x => x), false);
    assert.equal(areArraysEqualFast(null, [], x => x), false);
  });

  it('getPlaceSignature captures stage, driver, and visibility differences', () => {
    const p1 = { id: 'p1', orderStage: 'coleta', orderVisibility: 'publico', price: 20 };
    const p2 = { id: 'p1', orderStage: 'entrega', orderVisibility: 'publico', price: 20 };
    assert.notEqual(getPlaceSignature(p1), getPlaceSignature(p2));
  });

  it('getCustomerSignature generates predictable string', () => {
    const c1 = { id: 10, fullName: 'Carlos', phone: '62999999999', address: 'Rua 1', coordinates: { lat: -16.6, lng: -49.2 } };
    const c2 = { id: 10, fullName: 'Carlos', phone: '62999999999', address: 'Rua 1', coordinates: { lat: -16.6, lng: -49.2 } };
    assert.equal(getCustomerSignature(c1), getCustomerSignature(c2));
  });

  it('getDriverSignature detects position changes', () => {
    const d1 = { id: 'd1', isOnline: true, status: 'em_rota', coordinates: { lat: -16.6869, lng: -49.2648 } };
    const d2 = { id: 'd1', isOnline: true, status: 'em_rota', coordinates: { lat: -16.7000, lng: -49.2648 } };
    assert.notEqual(getDriverSignature(d1), getDriverSignature(d2));
  });

  it('runInBackground resolves successfully', async () => {
    const result = await runInBackground(() => 40 + 2);
    assert.equal(result, 42);
  });
});
