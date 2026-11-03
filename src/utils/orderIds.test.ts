import assert from 'node:assert/strict';
import { test } from 'node:test';
import { excludeCoveredOrders, getBaseOrderId, isTemporaryOrderId } from './orderIds';

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

test('keeps distinct orders with adjacent ids even when customer and address match', () => {
  const orders = [
    { id: 501, cliente: 'Cliente A', coleta_endereco: 'Rua 10, 200' },
    { id: 502, cliente: 'Cliente A', coleta_endereco: 'Rua 10, 200' }
  ];

  assert.deepEqual(excludeCoveredOrders(orders, new Set()), orders);
  assert.deepEqual(excludeCoveredOrders(orders, new Set(['501'])), [orders[1]]);
});

test('normalizes operation suffixes without treating a longer order id as a match', () => {
  assert.equal(getBaseOrderId('pedido-501-coleta'), 'pedido-501');
  assert.notEqual(getBaseOrderId('pedido-501'), getBaseOrderId('pedido-5010'));
});
