import type { Place } from '../types/map';

const AFTER_PICKUP = new Set([
  'coletado', 'trocando', 'trocado', 'retornando', 'segunda_entrega', 'retorno',
  'entregando', 'entregue', 'finalizado', 'concluido'
]);

export interface CollectionOwnership {
  collectionRestricted: boolean;
  collectionOwnerId?: string;
}

export function isAfterPickupStage(stage?: string): boolean {
  return AFTER_PICKUP.has(String(stage || '').trim().toLowerCase());
}

export function canAssignCollectedOrder(
  ownership: CollectionOwnership,
  driverId: string,
  claim: boolean
): boolean {
  return !ownership.collectionRestricted || Boolean(
    !claim && ownership.collectionOwnerId && driverId === ownership.collectionOwnerId
  );
}

export function collectionOwnership(order?: {
  etapa?: string;
  coleta_user_id?: string | number | null;
  coleta_saida_at?: string | null;
}): CollectionOwnership {
  const id = String(order?.coleta_user_id ?? '').trim();
  const ownerId = /^\d+$/.test(id) && Number(id) > 0 ? id : undefined;
  const collected = isAfterPickupStage(order?.etapa);
  return {
    collectionRestricted: collected && Boolean(ownerId || order?.coleta_saida_at),
    collectionOwnerId: collected ? ownerId : undefined
  };
}

export function withCollectionOwner(place: Place, ownerName?: string | null): Place {
  if (!place.collectionRestricted) return place;
  return {
    ...place,
    orderVisibility: 'privado',
    assignedDriverId: place.collectionOwnerId,
    assignedDriverName: ownerName || undefined,
    assignedDriverPhone: undefined
  };
}
