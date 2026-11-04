import assert from 'node:assert/strict';
import test from 'node:test';
import { pedidoFromBackend, pedidoToBackend } from '../../backend/mappers';
import type { BackendPedido } from './apiTypes';
import { backendPedidoToPlaces } from './apiAdapters';
import { buildMapOrderPayload } from './mapOrderPayload';
import type { Place } from '../types/map';

test('preserves a map order through the API, database mapper, and map reload', () => {
  const place: Place = {
    id: 'pedido-1793800000000-coleta',
    name: 'Loja de Coleta',
    address: 'Rua da Coleta, 100 - Goiânia',
    coordinates: { lat: -16.7001, lng: -49.2001 },
    operationType: 'troca',
    vehicleType: 'utilitario',
    packageType: 'cilindro',
    customerName: 'Cliente de Teste',
    customerPhone: '62999990000',
    customerId: '51',
    originCity: 'Goiânia',
    destinationCity: 'Anápolis',
    observations: 'Mercadoria frágil',
    pickupName: 'Loja de Coleta',
    pickupAddress: 'Rua da Coleta, 100 - Goiânia',
    pickupCoordinates: { lat: -16.7001, lng: -49.2001 },
    pickupContact: 'Maria da Coleta',
    pickupPhone: '62988880000',
    pickupNotes: 'Retirar na portaria',
    exchangeName: 'Centro de Trocas',
    exchangeAddress: 'Avenida da Troca, 200 - Goiânia',
    exchangeCoordinates: { lat: -16.7101, lng: -49.2101 },
    exchangeContact: 'João da Troca',
    exchangePhone: '62977770000',
    exchangeNotes: 'Conferir o lacre',
    deliveryName: 'Casa do Cliente',
    deliveryAddress: 'Rua da Entrega, 300 - Anápolis',
    deliveryCoordinates: { lat: -16.7201, lng: -49.2201 },
    deliveryContact: 'Ana da Entrega',
    deliveryPhone: '62966660000',
    deliveryNotes: 'Ligar antes de chegar',
    price: 42,
    totalDiscounts: 5,
    priceItems: [
      { id: 'pickup', name: 'Coleta', value: 10, category: 'coleta' },
      { id: 'transport', name: 'Transporte', value: 20, category: 'transporte' },
      { id: 'delivery', name: 'Entrega', value: 17, category: 'entrega' }
    ],
    discountItems: [{ id: 'discount', name: 'Desconto', value: 5 }],
    dimensions: '30x20x10cm',
    weightKg: '3',
    isFragile: true,
    volumesCount: 2,
    packageSize: 'grande',
    scheduledDate: '2026-11-04',
    scheduledTime: '10:30',
    scheduledTimeMode: 'ate',
    paymentCondition: 'semanal',
    paymentAdjustmentType: 'desconto',
    paymentAdjustmentValue: 5,
    paymentAdjustmentMode: 'percent',
    pickupVisibility: 'privado',
    pickupAssignedDriverId: '12',
    pickupSellerName: 'Vendedora da Coleta',
    exchangeVisibility: 'publico',
    exchangeSellerName: 'Vendedor da Troca',
    deliveryVisibility: 'privado',
    deliveryAssignedDriverId: '13',
    deliverySellerName: 'Vendedor da Entrega'
  };

  const payload = buildMapOrderPayload(place);
  const persisted = pedidoFromBackend(payload);

  assert.equal(persisted.orig_notes, 'Retirar na portaria');
  assert.equal(persisted.dest_notes, 'Ligar antes de chegar');
  assert.equal(persisted.notes, 'Mercadoria frágil');
  assert.equal(persisted.base_value, 47);
  assert.equal(persisted.discount, 5);
  assert.equal(persisted.total, 42);
  assert.equal(persisted.item_length, '30');
  assert.equal(persisted.item_width, '20');
  assert.equal(persisted.item_height, '10');

  const storedExtra = JSON.parse(persisted.extra);
  assert.equal(storedExtra.troca_obs, 'Conferir o lacre');
  assert.equal(storedExtra.troca_lat, -16.7101);
  assert.equal(storedExtra.coleta_lat, -16.7001);
  assert.equal(storedExtra.entrega_lat, -16.7201);

  const reloaded = pedidoToBackend({
    id: 700,
    ...persisted,
    created_at: new Date('2026-11-04T10:00:00.000Z'),
    updated_at: new Date('2026-11-04T10:00:00.000Z'),
    stage: persisted.stage || 'novo',
    order_type: persisted.order_type || 'coleta_entrega',
    vehicle_type: persisted.vehicle_type || 'pick_up',
    payment_status: persisted.payment_status || 'nao_pago'
  }) as BackendPedido;

  assert.equal(reloaded.coleta_obs, 'Retirar na portaria');
  assert.equal(reloaded.troca_obs, 'Conferir o lacre');
  assert.equal(reloaded.entrega_obs, 'Ligar antes de chegar');
  assert.equal(reloaded.coleta_lat, -16.7001);
  assert.equal(reloaded.troca_lat, -16.7101);
  assert.equal(reloaded.entrega_lat, -16.7201);

  const [mapPlace] = backendPedidoToPlaces(reloaded);
  assert.equal(mapPlace.operationType, 'coleta');
  assert.equal(mapPlace.pickupNotes, 'Retirar na portaria');
  assert.equal(mapPlace.exchangeNotes, 'Conferir o lacre');
  assert.equal(mapPlace.deliveryNotes, 'Ligar antes de chegar');
  assert.deepEqual(mapPlace.pickupCoordinates, { lat: -16.7001, lng: -49.2001 });
  assert.deepEqual(mapPlace.exchangeCoordinates, { lat: -16.7101, lng: -49.2101 });
  assert.deepEqual(mapPlace.deliveryCoordinates, { lat: -16.7201, lng: -49.2201 });
  assert.equal(mapPlace.packageType, 'cilindro');
  assert.equal(mapPlace.volumesCount, 2);
  assert.equal(mapPlace.weightKg, '3');
  assert.equal(mapPlace.dimensions, '30x20x10cm');
  assert.equal(mapPlace.isFragile, true);
  assert.equal(mapPlace.priceItems?.length, 3);
  assert.equal(mapPlace.discountItems?.length, 1);
  assert.equal(mapPlace.scheduledTime, '10:30');
  assert.equal(mapPlace.paymentCondition, 'semanal');
});
