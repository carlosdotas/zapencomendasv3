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

test('makes a publicly claimed order available again after its assignment is removed', () => {
  const order = {
    id: 306,
    etapa: 'pendente',
    tipo_encomenda: 'coleta',
    pickupVisibility: 'publico'
  };
  assignmentStore.set('306_coleta', {
    orderId: '306_coleta',
    driverId: String(pickupDriver.id),
    acceptedByDriver: true
  });

  assert.equal(canCallerSeeOrder(order, deliveryDriver), false);
  assignmentStore.delete('306_coleta');
  assert.equal(canCallerSeeOrder(order, deliveryDriver), true);
});

test('reserves the order after collection to its collector even if delivery was public or assigned to another driver', () => {
  const order = {
    id: 401, etapa: 'coletado', tipo_encomenda: 'entrega',
    coleta_user_id: pickupDriver.id, coleta_saida_at: '2026-11-04T15:00:00Z',
    deliveryVisibility: 'publico', deliveryAssignedDriverId: String(deliveryDriver.id)
  };
  assignmentStore.set('401_entrega', { orderId: '401_entrega', driverId: String(deliveryDriver.id) });
  assert.equal(canCallerSeeOrder(order, pickupDriver), true);
  assert.equal(canCallerSeeOrder(order, deliveryDriver), false);
  assert.equal(canCallerSeeOrder(order, null), false);
  assert.equal(canCallerSeeOrder(order, { id: 7, role: 'atendente', phone: '' }), true);
  assert.equal(canCallerSeeOrder(order, { id: 8, role: 'admin_geral', phone: '' }), true);
  for (const etapa of ['trocando', 'trocado', 'retornando', 'entregando']) {
    assert.equal(canCallerSeeOrder({ ...order, etapa, tipo_encomenda: 'troca' }, pickupDriver), true);
    assert.equal(canCallerSeeOrder({ ...order, etapa, tipo_encomenda: 'troca' }, deliveryDriver), false);
  }
});

test('does not make a recorded collection public when its collector is missing', () => {
  const order = { id: 402, etapa: 'coletado', coleta_saida_at: '2026-11-04T15:00:00Z', deliveryVisibility: 'publico' };
  assert.equal(canCallerSeeOrder(order, pickupDriver), false);
  assert.equal(canCallerSeeOrder(order, deliveryDriver), false);
  assert.equal(canCallerSeeOrder(order, { id: 7, role: 'atendente', phone: '' }), true);
});

test('when attendant sets a driver, the order appears ONLY for that driver and disappears for others', () => {
  // Pedido público configurado pelo atendente direcionando para pickupDriver
  const orderWithDriver = {
    id: 501,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    coleta_user_id: pickupDriver.id,
    pickupVisibility: 'publico', // Mesmo que esteja com visibilidade pública
    orderVisibility: 'publico'
  };

  assert.equal(canCallerSeeOrder(orderWithDriver, pickupDriver), true, 'Driver atribuído pelo atendente DEVE ver o pedido');
  assert.equal(canCallerSeeOrder(orderWithDriver, deliveryDriver), false, 'Outro motorista NÃO PODE ver o pedido de outro');
  assert.equal(canCallerSeeOrder(orderWithDriver, { id: 99, role: 'admin', phone: '' }), true, 'Admin deve ver todos os pedidos');
  assert.equal(canCallerSeeOrder(orderWithDriver, { id: 100, role: 'atendente', phone: '' }), true, 'Atendente deve ver todos os pedidos');
});

test('when attendant sets motorista_id or extra assignedDriverId, other drivers cannot see it', () => {
  const orderWithGeneralDriver = {
    id: 502,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    motorista_id: pickupDriver.id,
    orderVisibility: 'publico'
  };

  assert.equal(canCallerSeeOrder(orderWithGeneralDriver, pickupDriver), true);
  assert.equal(canCallerSeeOrder(orderWithGeneralDriver, deliveryDriver), false);

  const orderWithExtraDriver = {
    id: 503,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    assignedDriverId: String(pickupDriver.id),
    orderVisibility: 'publico'
  };

  assert.equal(canCallerSeeOrder(orderWithExtraDriver, pickupDriver), true);
  assert.equal(canCallerSeeOrder(orderWithExtraDriver, deliveryDriver), false);
});

test('when a driver claims an open order, it vanishes immediately for other drivers', () => {
  const openOrder = {
    id: 504,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    pickupVisibility: 'publico',
    orderVisibility: 'publico'
  };

  // Aberto para todos antes de ser aceito
  assert.equal(canCallerSeeOrder(openOrder, pickupDriver), true);
  assert.equal(canCallerSeeOrder(openOrder, deliveryDriver), true);

  // pickupDriver aceita a corrida
  assignmentStore.set('pedido-504_coleta', {
    orderId: 'pedido-504_coleta',
    driverId: String(pickupDriver.id),
    acceptedByDriver: true
  });

  // Imediatamente: pickupDriver vê, deliveryDriver NÃO vê!
  assert.equal(canCallerSeeOrder(openOrder, pickupDriver), true);
  assert.equal(canCallerSeeOrder(openOrder, deliveryDriver), false);
});
