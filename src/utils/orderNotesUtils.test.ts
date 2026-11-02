import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStageObservations, buildWhatsAppUrl } from './orderNotesUtils';

test('buildWhatsAppUrl adds Brazilian country code 55 when missing', () => {
  assert.equal(buildWhatsAppUrl('62981234567'), 'https://wa.me/5562981234567');
  assert.equal(buildWhatsAppUrl('(62) 98123-4567'), 'https://wa.me/5562981234567');
  assert.equal(buildWhatsAppUrl('5562981234567'), 'https://wa.me/5562981234567');
});

test('formatStageObservations aggregates all 3 stages for Troca', () => {
  const result = formatStageObservations({
    pickupNotes: 'Portaria 1',
    exchangeNotes: 'Conferir tênis tamanho 41',
    deliveryNotes: 'Deixar com vizinho',
    isExchange: true
  });
  assert.equal(result, '[Coleta] Portaria 1 • [Troca] Conferir tênis tamanho 41 • [Entrega] Deixar com vizinho');
});

test('formatStageObservations ignores exchangeNotes when not an exchange order', () => {
  const result = formatStageObservations({
    pickupNotes: 'Retirar no balcão',
    exchangeNotes: 'Nota ignorada',
    deliveryNotes: 'Tocar campainha',
    isExchange: false
  });
  assert.equal(result, '[Coleta] Retirar no balcão • [Entrega] Tocar campainha');
});

test('formatStageObservations returns empty string when no notes are provided', () => {
  const result = formatStageObservations({ isExchange: true });
  assert.equal(result, '');
});
