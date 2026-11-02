/**
 * Funções auxiliares para comentários por etapa e WhatsApp
 */

export interface StageNotes {
  pickupNotes?: string;
  exchangeNotes?: string;
  deliveryNotes?: string;
  isExchange?: boolean;
}

export function formatStageObservations(notes: StageNotes): string {
  const parts: string[] = [];
  if (notes.pickupNotes?.trim()) {
    parts.push(`[Coleta] ${notes.pickupNotes.trim()}`);
  }
  if (notes.isExchange && notes.exchangeNotes?.trim()) {
    parts.push(`[Troca] ${notes.exchangeNotes.trim()}`);
  }
  if (notes.deliveryNotes?.trim()) {
    parts.push(`[Entrega] ${notes.deliveryNotes.trim()}`);
  }
  return parts.join(' • ');
}

export function buildWhatsAppUrl(phone: string, _name?: string): string {
  let clean = phone.replace(/\D/g, '');
  if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
    clean = '55' + clean;
  }
  return `https://wa.me/${clean}`;
}
