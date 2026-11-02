import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pedidoFromBackend, pedidoToBackend } from './mappers';

test('preserves seller and responsible metadata by route point when saving an order', () => {
  const extra = JSON.parse(pedidoFromBackend({
    id: 501,
    pickupSellerName: 'Responsável da coleta',
    pickupSellerPhone: '62911111111',
    exchangeSellerName: 'Responsável da troca',
    exchangeSellerPhone: '62922222222',
    deliverySellerName: 'Responsável da entrega',
    deliverySellerPhone: '62933333333'
  }, {
    extra: JSON.stringify({ existingSetting: 'preservada' })
  }).extra);

  const savedOrder = pedidoToBackend({
    id: 501,
    extra: JSON.stringify(extra),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    stage: 'new',
    order_type: 'delivery',
    vehicle_type: 'moto',
    payment_status: 'nao_pago'
  });

  assert.equal(savedOrder.existingSetting, 'preservada');
  assert.equal(savedOrder.pickupSellerName, 'Responsável da coleta');
  assert.equal(savedOrder.pickupSellerPhone, '62911111111');
  assert.equal(savedOrder.exchangeSellerName, 'Responsável da troca');
  assert.equal(savedOrder.exchangeSellerPhone, '62922222222');
  assert.equal(savedOrder.deliverySellerName, 'Responsável da entrega');
  assert.equal(savedOrder.deliverySellerPhone, '62933333333');
});
