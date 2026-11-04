import test from 'node:test';
import assert from 'node:assert/strict';
import type { Place } from '../types/map';
import { resolveOrderLocationsForSave } from './orderDefaultLocation';
import { buildMapOrderPayload } from '../services/mapOrderPayload';
import { pedidoFromBackend, pedidoToBackend } from '../../backend/mappers';
import { backendPedidoToPlaces } from '../services/apiAdapters';
import type { BackendPedido } from '../services/apiTypes';

const defaultLocation = { name: 'Central', address: 'Rua Central, 1', lat: -16.7, lng: -49.2 };
const base: Place = { id: 'pedido-1793800000000', name: 'Loja', address: 'Rua Loja, 2', coordinates: { lat: -16.71, lng: -49.21 } };

test('default is applied only on save to the missing route point without creating a customer', () => {
  for (const operationType of ['coleta', 'entrega', 'troca'] as const) {
    const draft = { ...base, operationType };
    const saved = resolveOrderLocationsForSave(draft, [], defaultLocation);
    assert.equal(draft.pickupName, undefined);
    assert.equal(saved.customerName, undefined);
    if (operationType !== 'coleta') {
      assert.equal(saved.pickupName, 'Central');
      assert.deepEqual(saved.pickupCoordinates, { lat: -16.7, lng: -49.2 });
    }
    if (operationType !== 'entrega') {
      assert.equal(saved.deliveryName, 'Central');
      assert.equal(saved.deliveryAddress, 'Rua Central, 1');
    }
  }
});

test('keeps a manually selected point and uses customer location before the default', () => {
  const manual = resolveOrderLocationsForSave({
    ...base, operationType: 'coleta', deliveryName: 'Manual', deliveryAddress: 'Rua Manual',
    deliveryCoordinates: { lat: -16.8, lng: -49.3 },
    customerName: 'Cliente', customerCoordinates: { lat: -16.9, lng: -49.4 }
  }, [], defaultLocation);
  assert.equal(manual.deliveryName, 'Manual');
  const customer = resolveOrderLocationsForSave({
    ...base, operationType: 'coleta', customerName: 'Cliente',
    customerAddress: 'Rua Cliente', customerCoordinates: { lat: -16.9, lng: -49.4 }
  }, [], defaultLocation);
  assert.equal(customer.deliveryName, 'Cliente');
  assert.deepEqual(customer.deliveryCoordinates, { lat: -16.9, lng: -49.4 });
});

test('default name, address and coordinates survive serialization and reload', () => {
  const saved = resolveOrderLocationsForSave({ ...base, operationType: 'coleta', destinationCity: 'Goiânia' }, [], defaultLocation);
  const persisted = pedidoFromBackend(buildMapOrderPayload(saved));
  const restored = pedidoToBackend({
    id: 700, ...persisted, created_at: new Date(), updated_at: new Date(),
    stage: persisted.stage || 'novo', order_type: persisted.order_type || 'coleta_entrega',
    vehicle_type: persisted.vehicle_type || 'pick_up', payment_status: persisted.payment_status || 'nao_pago'
  }) as BackendPedido;
  const [place] = backendPedidoToPlaces(restored);
  assert.equal(place.deliveryName, 'Central');
  assert.equal(place.deliveryAddress, 'Rua Central, 1');
  assert.deepEqual(place.deliveryCoordinates, { lat: -16.7, lng: -49.2 });
  assert.equal(place.customerName, '');
});
