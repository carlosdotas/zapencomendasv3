import type { Place } from '../types/map';

export function getMarkerNote(place: Place): string {
  const stage = place.orderStage === 'coleta' || place.orderStage === 'entrega' || place.orderStage === 'troca'
    ? place.orderStage
    : place.operationType;
  const note = stage === 'coleta' ? place.pickupNotes :
    stage === 'entrega' ? place.deliveryNotes :
    stage === 'troca' ? place.exchangeNotes : undefined;
  return (note ?? place.observations ?? '').trim();
}

export function renderMarkerNote(place: Place): string {
  const note = getMarkerNote(place);
  if (!note) return '';
  const escaped = note.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character] || character));
  return `<div class="place-marker-note" style="background:#dc2626;color:#fff;text-transform:uppercase;font-size:10px;font-weight:900;line-height:1.2;padding:3px 6px;border-radius:5px;margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere;max-width:210px;">${escaped}</div>`;
}
