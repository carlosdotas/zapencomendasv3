import assert from 'node:assert/strict';
import { test, beforeEach, after, mock } from 'node:test';
import { realtimeAssignmentService } from './realtimeAssignmentService';
import { Place, UserProfile } from '../types/map';

const driverA: UserProfile = {
  id: 'usr-mot-01',
  name: 'Carlos Motoboy',
  email: 'carlos@example.com',
  phone: '62991111111',
  role: 'motorista',
  avatarUrl: '',
  savedPlacesCount: 0,
  contributionsCount: 0
};

const driverB: UserProfile = {
  id: 'usr-mot-02',
  name: 'Marcos Entrega',
  email: 'marcos@example.com',
  phone: '62992222222',
  role: 'motorista',
  avatarUrl: '',
  savedPlacesCount: 0,
  contributionsCount: 0
};

const openPublicPlace: Place = {
  id: 'pedido-701-coleta',
  orderId: '701',
  orderCode: 'EZ-701-GO',
  name: 'Loja Flamboyant',
  address: 'Shopping Flamboyant, Goiânia',
  coordinates: { lat: -16.71, lng: -49.23 },
  category: 'Coleta Expressa',
  operationType: 'coleta',
  orderStage: 'coleta',
  orderVisibility: 'publico',
  pickupVisibility: 'publico',
  originCity: 'Goiânia',
  destinationCity: 'Goiânia'
};

after(() => {
  if (typeof (realtimeAssignmentService as any).stopPolling === 'function') {
    (realtimeAssignmentService as any).stopPolling();
  }
});

beforeEach(() => {
  // Limpa atribuições locais
  const all = realtimeAssignmentService.getAllAssignments();
  for (const k of Object.keys(all)) {
    delete (realtimeAssignmentService as any).assignments[k];
  }
});

test('open order with no driver is public and visible to both drivers', () => {
  assert.equal(realtimeAssignmentService.isPublicOrder(openPublicPlace), true);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(openPublicPlace, driverA), true);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(openPublicPlace, driverB), true);
});

test('when driverA accepts/claims the order, it vanishes for driverB and is only visible to driverA', () => {
  // Simula aceite em tempo real pelo driverA
  (realtimeAssignmentService as any).assignments['pedido-701-coleta'] = {
    orderId: 'pedido-701-coleta',
    driverId: driverA.id,
    driverName: driverA.name,
    driverPhone: driverA.phone,
    assignedAt: Date.now(),
    acceptedByDriver: true
  };

  assert.equal(realtimeAssignmentService.isPublicOrder(openPublicPublicClone(openPublicPlace)), false, 'Não é mais público após ser aceito');
  assert.equal(
    realtimeAssignmentService.isPlaceAssignedToUser(openPublicPlace, driverA),
    true,
    'Driver A (que aceitou) DEVE visualizar a marker'
  );
  assert.equal(
    realtimeAssignmentService.isPlaceAssignedToUser(openPublicPlace, driverB),
    false,
    'Driver B NÃO DEVE visualizar a marker aceita por outro motorista'
  );
});

test('when attendant sets a driver for pickup, it appears only for that driver and not for other drivers', () => {
  const attendantAssignedPickup: Place = {
    ...openPublicPlace,
    id: 'pedido-702-coleta',
    orderId: '702',
    pickupAssignedDriverId: driverA.id,
    pickupAssignedDriverName: driverA.name,
    pickupAssignedDriverPhone: driverA.phone,
    pickupVisibility: 'privado',
    orderVisibility: 'privado'
  };

  assert.equal(realtimeAssignmentService.isPublicOrder(attendantAssignedPickup), false);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(attendantAssignedPickup, driverA), true);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(attendantAssignedPickup, driverB), false);
});

test('when attendant sets a driver for delivery on a delivery marker, it appears only for that driver', () => {
  const attendantAssignedDelivery: Place = {
    ...openPublicPlace,
    id: 'pedido-703-entrega',
    orderId: '703',
    operationType: 'entrega',
    orderStage: 'entrega',
    deliveryAssignedDriverId: driverB.id,
    deliveryAssignedDriverName: driverB.name,
    deliveryAssignedDriverPhone: driverB.phone,
    deliveryVisibility: 'privado',
    orderVisibility: 'privado'
  };

  assert.equal(realtimeAssignmentService.isPublicOrder(attendantAssignedDelivery), false);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(attendantAssignedDelivery, driverB), true);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(attendantAssignedDelivery, driverA), false);
});

test('when an accepted order is unassigned, it returns to public and both drivers see it again', () => {
  (realtimeAssignmentService as any).assignments['pedido-701-coleta'] = {
    orderId: 'pedido-701-coleta',
    driverId: driverA.id,
    assignedAt: Date.now(),
    acceptedByDriver: true
  };
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(openPublicPlace, driverB), false);

  // Desvincula
  delete (realtimeAssignmentService as any).assignments['pedido-701-coleta'];
  assert.equal(realtimeAssignmentService.isPublicOrder(openPublicPlace), true);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(openPublicPlace, driverA), true);
  assert.equal(realtimeAssignmentService.isPlaceAssignedToUser(openPublicPlace, driverB), true);
});

test('assignment and release each make one request and failures do not change local state', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  let success = true;
  const fetchMock = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    const body = success
      ? { success: true, data: { orderId: '701_coleta', driverId: '11', assignedAt: 1 } }
      : { success: false, message: 'Falha ao salvar' };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
  try {
    success = false;
    await assert.rejects(realtimeAssignmentService.assignOrder('pedido-701-coleta', { id: '11' }, 'coleta'), /Falha ao salvar/);
    assert.equal(realtimeAssignmentService.getAssignmentForOrder('701', 'coleta'), null);
    success = true;
    await realtimeAssignmentService.assignOrder('pedido-701-coleta', { id: '11' }, 'coleta');
    assert.equal(realtimeAssignmentService.getAssignmentForOrder('701', 'coleta')?.driverId, '11');
    success = false;
    await assert.rejects(realtimeAssignmentService.unassignOrder('pedido-701-coleta', 'coleta'), /Falha ao salvar/);
    assert.equal(realtimeAssignmentService.getAssignmentForOrder('701', 'coleta')?.driverId, '11');
    success = true;
    await realtimeAssignmentService.unassignOrder('pedido-701-coleta', 'coleta');
    assert.equal(realtimeAssignmentService.getAssignmentForOrder('701', 'coleta'), null);
    assert.equal(requests.length, 4);
    assert.ok(requests.every(request => request.body.orderId === '701_coleta'));
  } finally {
    fetchMock.mock.restore();
  }
});

function openPublicPublicClone(p: Place): Place {
  return { ...p };
}
