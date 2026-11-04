import assert from 'node:assert/strict';
import test from 'node:test';
import type { Place } from '../types/map';
import { getMarkerNote, renderMarkerNote } from './markerNotes';

const place: Place = {
  id: 'pedido-1-coleta', name: 'Local', address: 'Rua 1',
  coordinates: { lat: -16, lng: -49 }, operationType: 'coleta'
};

test('uses the note for the displayed route stage without leaking other stages', () => {
  const order = { ...place, pickupNotes: 'Coleta', deliveryNotes: 'Entrega', observations: 'Geral' };
  assert.equal(getMarkerNote(order), 'Coleta');
  assert.equal(getMarkerNote({ ...order, orderStage: 'entrega' }), 'Entrega');
  assert.equal(getMarkerNote({ ...order, pickupNotes: '' }), '');
  assert.equal(getMarkerNote({ ...place, observations: 'Geral' }), 'Geral');
  assert.equal(getMarkerNote({ ...place, driverNotes: 'Nota técnica' }), '');
});

test('escapes user text and renders a red background with uppercase white text', () => {
  const html = renderMarkerNote({ ...place, observations: 'abrir <portão> & tocar' });
  assert.match(html, /background:#dc2626;color:#fff;text-transform:uppercase/);
  assert.match(html, /abrir &lt;portão&gt; &amp; tocar/);
  assert.equal(renderMarkerNote(place), '');
});
