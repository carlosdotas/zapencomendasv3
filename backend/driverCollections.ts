import { isPrivileged, type Caller } from './access';
import { CLOSED_ORDER_STAGES } from './orderStatus';

export function canViewDriverCollections(caller: Caller | null, driverId: number): boolean {
  return Boolean(caller && (isPrivileged(caller) || (caller.role === 'motorista' && caller.id === driverId)));
}

export function openDriverCollectionsWhere(driverId: number) {
  return {
    collector_id: driverId,
    collected_at: { not: null },
    stage: { notIn: CLOSED_ORDER_STAGES }
  };
}

export function collectionSummary(order: Record<string, unknown>) {
  return {
    id: String(order.id),
    pickupName: String(order.coleta_locais_name || order.coleta_local || order.coleta_nome || 'Local de coleta não informado'),
    pickupAddress: String(order.coleta_endereco || ''),
    customerName: String(order.cliente || 'Cliente não informado'),
    photo: typeof order.coleta_foto === 'string' ? order.coleta_foto : '',
    collectedAt: typeof order.coleta_saida_at === 'string' ? order.coleta_saida_at : ''
  };
}
