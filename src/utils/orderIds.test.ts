import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTemporaryOrderId } from './orderIds';

test('recognizes timestamp order drafts with or without an operation suffix', () => {
  assert.equal(isTemporaryOrderId('pedido-1793635716408'), true);
  assert.equal(isTemporaryOrderId('pedido-1793635716408-coleta'), true);
});

test('recognizes explicit draft ids but not persisted numeric order ids', () => {
  assert.equal(isTemporaryOrderId('draft-123'), true);
  assert.equal(isTemporaryOrderId('new-123'), true);
  assert.equal(isTemporaryOrderId('pedido-123'), false);
  assert.equal(isTemporaryOrderId('pedido-123-entrega'), false);
});
