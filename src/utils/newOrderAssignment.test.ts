import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeNewOrderAssignments } from './newOrderAssignment';
import type { Place } from '../types/map';

const base = { id: 'pedido-1', name: 'X', coordinates: { lat: 0, lng: 0 } } as Place;

test('pedido novo sem escolha de motorista nasce público e sem atribuição', () => {
  const result = sanitizeNewOrderAssignments({
    ...base,
    assignedDriverId: '7',
    assignedDriverName: 'Fulano',
    pickupAssignedDriverId: '7',
    deliveryVisibility: 'publico',
    deliveryAssignedDriverId: '8',
    acceptedByDriver: true
  });
  assert.equal(result.orderVisibility, 'publico');
  assert.equal(result.assignedDriverId, undefined);
  assert.equal(result.assignedDriverName, undefined);
  assert.equal(result.pickupVisibility, 'publico');
  assert.equal(result.pickupAssignedDriverId, undefined);
  assert.equal(result.deliveryAssignedDriverId, undefined);
  assert.equal(result.acceptedByDriver, false);
});

test('ponto privado com motorista escolhido é preservado', () => {
  const result = sanitizeNewOrderAssignments({
    ...base,
    pickupVisibility: 'privado',
    pickupAssignedDriverId: '7',
    pickupAssignedDriverName: 'Fulano'
  });
  assert.equal(result.pickupVisibility, 'privado');
  assert.equal(result.pickupAssignedDriverId, '7');
  assert.equal(result.deliveryVisibility, 'publico');
});

test('ponto privado sem motorista continua sem atribuição', () => {
  const result = sanitizeNewOrderAssignments({ ...base, deliveryVisibility: 'privado' });
  assert.equal(result.deliveryVisibility, 'privado');
  assert.equal(result.deliveryAssignedDriverId, undefined);
});
