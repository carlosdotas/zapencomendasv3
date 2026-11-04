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

test('persists observations and stage notes to database columns and preserves in payload', () => {
  const backendRow = pedidoFromBackend({
    id: 502,
    detalhes: 'Geral: Cuidado pacote frágil',
    observations: 'Geral: Cuidado pacote frágil',
    pickupNotes: 'Coleta: Tocar interfone 102',
    deliveryNotes: 'Entrega: Deixar com Dona Maria',
    exchangeNotes: 'Troca: Conferir peças'
  });

  // Verify mapped into database columns (notes, orig_notes, dest_notes)
  assert.equal(backendRow.notes, 'Geral: Cuidado pacote frágil');
  assert.equal(backendRow.orig_notes, 'Coleta: Tocar interfone 102');
  assert.equal(backendRow.dest_notes, 'Entrega: Deixar com Dona Maria');

  // Verify mapped back to frontend representations
  const frontendPayload = pedidoToBackend({
    id: 502,
    notes: backendRow.notes,
    orig_notes: backendRow.orig_notes,
    dest_notes: backendRow.dest_notes,
    extra: backendRow.extra,
    created_at: new Date(),
    updated_at: new Date(),
    stage: 'new',
    order_type: 'delivery',
    vehicle_type: 'moto',
    payment_status: 'nao_pago'
  });

  assert.equal(frontendPayload.detalhes, 'Geral: Cuidado pacote frágil');
  assert.equal(frontendPayload.observations, 'Geral: Cuidado pacote frágil');
  assert.equal(frontendPayload.coleta_obs, 'Coleta: Tocar interfone 102');
  assert.equal(frontendPayload.pickupNotes, 'Coleta: Tocar interfone 102');
  assert.equal(frontendPayload.entrega_obs, 'Entrega: Deixar com Dona Maria');
  assert.equal(frontendPayload.deliveryNotes, 'Entrega: Deixar com Dona Maria');
  assert.equal(frontendPayload.exchangeNotes, 'Troca: Conferir peças');
});

