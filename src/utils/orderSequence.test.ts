import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CompletedWaypointMark, Place } from '../types/map';
import { filterPlacesBySequence } from './orderSequence';

const pickupCoordinates = { lat: -16.6, lng: -49.2 };
const exchangeCoordinates = { lat: -16.7, lng: -49.3 };
const deliveryCoordinates = { lat: -16.8, lng: -49.4 };

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: 'pedido-42',
    name: 'Pedido 42',
    address: 'Endereço de coleta',
    coordinates: pickupCoordinates,
    orderCode: '42',
    operationType: 'coleta',
    pickupAddress: 'Endereço de coleta',
    pickupCoordinates,
    deliveryAddress: 'Endereço de entrega',
    deliveryCoordinates,
    ...overrides
  };
}

function makeNormalOrder(): Place[] {
  return [
    makePlace(),
    makePlace({
      id: 'pedido-42-entrega',
      name: 'Entrega do pedido 42',
      address: 'Endereço de entrega',
      coordinates: deliveryCoordinates,
      operationType: 'entrega',
      orderStage: 'entrega'
    })
  ];
}

function makeCompletedMark(operationType: CompletedWaypointMark['operationType'], status: CompletedWaypointMark['status'] = 'success'): CompletedWaypointMark {
  return {
    id: `${operationType}-42`,
    orderId: 'pedido-42',
    orderCode: '42',
    operationType,
    completedAt: 1,
    timeStr: '00:00',
    placeName: 'Pedido 42',
    address: 'Endereço',
    coordinates: pickupCoordinates,
    completedDate: '2026-11-01',
    status
  };
}

test('mantém a coleta como primeira etapa do pedido normal', () => {
  const [visiblePlace] = filterPlacesBySequence([makePlace()]);

  assert.equal(visiblePlace.operationType, 'coleta');
});

test('mostra a entrega no endereço correto após concluir a coleta', () => {
  const [visiblePlace] = filterPlacesBySequence(
    makeNormalOrder(),
    [makeCompletedMark('coleta')]
  );

  assert.equal(visiblePlace.operationType, 'entrega');
  assert.deepEqual(visiblePlace.coordinates, deliveryCoordinates);
});

test('segue coleta, troca e retorno ao endereço de coleta', () => {
  const exchangeOrder = makePlace({
    isExchangeOrder: true,
    exchangeAddress: 'Endereço de troca',
    exchangeCoordinates
  });
  const afterPickup = filterPlacesBySequence(
    [exchangeOrder],
    [makeCompletedMark('coleta')]
  );
  const afterExchange = filterPlacesBySequence(
    [exchangeOrder],
    [makeCompletedMark('coleta'), makeCompletedMark('troca')]
  );

  assert.equal(afterPickup[0].operationType, 'troca');
  assert.deepEqual(afterPickup[0].coordinates, exchangeCoordinates);
  assert.equal(afterExchange[0].orderStage, 'retorno');
  assert.deepEqual(afterExchange[0].coordinates, pickupCoordinates);
});

test('remove o pedido do mapa após a entrega final bem-sucedida', () => {
  const visiblePlaces = filterPlacesBySequence(
    [makePlace()],
    [makeCompletedMark('entrega')]
  );

  assert.deepEqual(visiblePlaces, []);
});

test('normaliza estados legados e oculta pedidos entregues', () => {
  const legacyPlace: Place & { etapa: string } = {
    ...makePlace(),
    etapa: ' ENTREGUE '
  };
  const visiblePlaces = filterPlacesBySequence([legacyPlace]);

  assert.deepEqual(visiblePlaces, []);
});

test('mantém o pedido no mapa quando a entrega falha', () => {
  const [visiblePlace] = filterPlacesBySequence(
    makeNormalOrder(),
    [makeCompletedMark('entrega', 'failed')]
  );

  assert.ok(visiblePlace);
  assert.equal(visiblePlace.operationType, 'entrega');
});