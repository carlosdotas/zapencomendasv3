import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { assignmentStore, canCallerSeeOrder, isConfirmedDriverClaim, type Caller } from './access';

const pickupDriver: Caller = { id: 11, role: 'motorista', phone: '62911111111' };
const deliveryDriver: Caller = { id: 22, role: 'motorista', phone: '62922222222' };

afterEach(() => assignmentStore.clear());

test('only an explicit claim by a driver records acceptance', () => {
  const admin: Caller = { id: 1, role: 'admin', phone: '62911111110' };

  assert.equal(isConfirmedDriverClaim(pickupDriver, true), true);
  assert.equal(isConfirmedDriverClaim(pickupDriver, false), false);
  assert.equal(isConfirmedDriverClaim(admin, true), false);
  assert.equal(isConfirmedDriverClaim(null, true), false);
});

test('hides an explicitly private stop until a driver is assigned', () => {
  const order = {
    id: 301,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    pickupVisibility: 'privado'
  };

  assert.equal(canCallerSeeOrder(order, null), false);
  assert.equal(canCallerSeeOrder(order, pickupDriver), false);
});

test('preserves private visibility on older orders without per-stop metadata', () => {
  const order = {
    id: 305,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    orderVisibility: 'privado'
  };

  assert.equal(canCallerSeeOrder(order, null), false);
  assert.equal(canCallerSeeOrder(order, pickupDriver), false);
  assert.equal(canCallerSeeOrder({
    ...order,
    assignedDriverId: String(pickupDriver.id)
  }, pickupDriver), true);
});

test('shows a private active stop only to its assigned driver', () => {
  const order = {
    id: 302,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    pickupVisibility: 'privado',
    pickupAssignedDriverId: String(pickupDriver.id),
    deliveryVisibility: 'privado',
    deliveryAssignedDriverId: String(deliveryDriver.id)
  };

  assert.equal(canCallerSeeOrder(order, pickupDriver), true);
  assert.equal(canCallerSeeOrder(order, deliveryDriver), false);
  assert.equal(canCallerSeeOrder({ ...order, etapa: 'coletado' }, deliveryDriver), true);
  assert.equal(canCallerSeeOrder({ ...order, etapa: 'coletado' }, pickupDriver), false);
});

test('keeps legacy driver assignments scoped to the current stop', () => {
  const order = {
    id: 303,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    coleta_user_id: pickupDriver.id,
    entrega_user_id: deliveryDriver.id
  };

  assert.equal(canCallerSeeOrder(order, pickupDriver), true);
  assert.equal(canCallerSeeOrder(order, deliveryDriver), false);
});

test('applies real-time assignments only to the matching active stop', () => {
  const order = {
    id: 304,
    etapa: 'coletado',
    tipo_encomenda: 'entrega',
    pickupVisibility: 'publico',
    deliveryVisibility: 'publico'
  };
  assignmentStore.set('pedido-304_coleta', {
    orderId: 'pedido-304_coleta',
    driverId: String(pickupDriver.id)
  });
  assignmentStore.set('pedido-304_entrega', {
    orderId: 'pedido-304_entrega',
    driverId: String(deliveryDriver.id)
  });

  assert.equal(canCallerSeeOrder(order, deliveryDriver), true);
  assert.equal(canCallerSeeOrder(order, pickupDriver), false);
});
