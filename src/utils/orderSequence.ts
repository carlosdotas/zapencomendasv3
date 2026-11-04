import { Place, CompletedWaypointMark, OperationsFilterState } from '../types/map';

type PlaceWithLegacyStage = Place & { etapa?: string };

const FINALIZED_LEGACY_STAGES = new Set(['entregue', 'finalizado', 'concluido', 'cancelado']);
const COLLECTED_LEGACY_STAGES = new Set(['coletado', 'trocando', 'trocado', 'retornando', 'entregando']);
const EXCHANGED_LEGACY_STAGES = new Set(['trocado', 'retornando', 'segunda_entrega', 'retorno']);

function getLegacyStage(place: Place): string {
  return (place as PlaceWithLegacyStage).etapa?.toLowerCase().trim() || '';
}

/**
 * Regra Estrita de Sequência EncomendasZap:
 * 
 * 1. Fluxo Normal:
 *    - 1º: Coleta (aparece no local da coleta).
 *    - 2º: Depois que for coletado, aparece a Entrega (no local da entrega).
 *    - 3º: Depois que for entregue, some do mapa.
 * 
 * 2. Fluxo de Troca:
 *    - 1º: Coleta (aparece no local da coleta).
 *    - 2º: Depois que for coletado, aparece a Troca (no local do cliente).
 *    - 3º: Depois que for trocado, aparece a Entrega NO MESMO LOCAL DA COLETA (retorno ao ponto de coleta).
 *    - 4º: Depois que for entregue, some do mapa.
 */

export function extractOrderId(place: Place): string | null {
  if (place.id) {
    const match = place.id.match(/(?:pedido|order)[-_](\d+)/i);
    if (match) return `pedido_${match[1]}`;
  }
  if (place.orderCode) {
    const match = place.orderCode.match(/(\d+)/);
    if (match) return `pedido_${match[1]}`;
    return `code_${place.orderCode.trim()}`;
  }
  const genericMatch = place.id.match(/\d{4,}/);
  if (genericMatch) {
    return `pedido_${genericMatch[0]}`;
  }
  return null;
}

export function extractNumericId(str?: string): string | null {
  if (!str) return null;
  const match = str.match(/\d+/);
  return match ? match[0] : null;
}

/**
 * Gera ou recupera o marcador de Coleta para o grupo
 */
function getColetaMarker(group: Place[]): Place {
  const existing = group.find(p => p.operationType === 'coleta');
  if (existing) return existing;

  const base = group[0];
  const coords = base.pickupCoordinates || base.coordinates;
  const addr = base.pickupAddress || base.address;
  const name = base.pickupName || (base.customerName ? `Coleta: ${base.customerName}` : 'Ponto de Coleta');
  const isExchange = base.isExchangeOrder || group.some(p => p.isExchangeOrder || p.category?.toLowerCase().includes('troca'));

  return {
    ...base,
    id: base.operationType === 'coleta' ? base.id : `${base.id}-coleta`,
    name,
    address: addr,
    coordinates: coords,
    operationType: 'coleta',
    orderStage: 'coleta',
    category: isExchange ? 'Troca de Mercadoria' : 'Coleta Expressa',
    isExchangeOrder: isExchange
  };
}

/**
 * Gera ou recupera o marcador de Troca para o grupo (no local do cliente)
 */
function getTrocaMarker(group: Place[]): Place {
  const existing = group.find(p => p.operationType === 'troca');
  if (existing) return existing;

  const base = group[0];
  const coords = base.exchangeCoordinates || base.deliveryCoordinates || base.coordinates;
  const addr = base.exchangeAddress || base.deliveryAddress || base.address;
  const name = base.exchangeName || (base.customerName ? `Troca: ${base.customerName}` : 'Ponto de Troca');

  return {
    ...base,
    id: base.operationType === 'troca' ? base.id : `${base.id}-troca`,
    name,
    address: addr,
    coordinates: coords,
    operationType: 'troca',
    orderStage: 'troca',
    category: 'Troca de Mercadoria',
    isExchangeOrder: true
  };
}

/**
 * Gera ou recupera o marcador de Entrega Normal para o grupo (no local de entrega)
 */
function getEntregaMarker(group: Place[]): Place {
  const existing = group.find(p => p.operationType === 'entrega' && p.orderStage !== 'retorno');
  if (existing) return existing;

  const base = group[0];
  const coords = base.deliveryCoordinates || base.coordinates;
  const addr = base.deliveryAddress || base.address;
  const name = base.deliveryName || (base.customerName ? `Entrega: ${base.customerName}` : 'Ponto de Entrega');

  return {
    ...base,
    id: base.operationType === 'entrega' ? base.id : `${base.id}-entrega`,
    name,
    address: addr,
    coordinates: coords,
    operationType: 'entrega',
    orderStage: 'entrega',
    category: 'Entrega Expressa',
    isExchangeOrder: false
  };
}

/**
 * Gera o marcador de 2ª Entrega de Retorno da Troca (ESTRITAMENTE NO MESMO LOCAL DA COLETA)
 */
function getRetornoEntregaMarker(group: Place[]): Place {
  const existing = group.find(p => p.orderStage === 'retorno');
  if (existing) return existing;

  const base = group[0];
  const coletaItem = group.find(p => p.operationType === 'coleta');
  const numId = extractNumericId(base.id) || extractNumericId(base.orderCode);

  // Regra explícita: "depois entrega no mesmo local da coleta"
  const retornoCoords = base.pickupCoordinates || coletaItem?.coordinates || base.coordinates;
  const retornoAddr = base.pickupAddress || coletaItem?.address || base.address;
  const coletaLocalName = base.pickupName || coletaItem?.name || 'Local de Coleta';

  return {
    ...base,
    id: numId ? `pedido-${numId}-retorno` : `${base.id}-retorno`,
    name: `2ª Entrega (Retorno à Coleta): ${coletaLocalName}`,
    address: retornoAddr,
    coordinates: retornoCoords, // MESMO LOCAL DA COLETA!
    operationType: 'entrega',
    orderStage: 'retorno',
    category: 'Troca de Mercadoria',
    isExchangeOrder: true
  };
}

export function filterPlacesBySequence(
  places: Place[], 
  completedMarks: CompletedWaypointMark[] = [],
  operationsFilter?: OperationsFilterState
): Place[] {
  // 1. Mapeia etapas e pedidos finalizados a partir do histórico de baixas
  const completedKeys = new Set<string>();
  const finalizedOrders = new Set<string>();

  for (const mark of completedMarks) {
    completedKeys.add(`${mark.orderId}_${mark.operationType}`);
    if (mark.orderCode) {
      completedKeys.add(`${mark.orderCode}_${mark.operationType}`);
    }

    const numId = extractNumericId(mark.orderId) || extractNumericId(mark.orderCode);
    if (numId) {
      completedKeys.add(`pedido_${numId}_${mark.operationType}`);
    }

    // Se a entrega final da encomenda foi concluída com sucesso:
    // A encomenda está FINALIZADA e SOME DO MAPA!
    if (mark.operationType === 'entrega' && mark.status !== 'failed') {
      if (numId) {
        finalizedOrders.add(`pedido_${numId}`);
        finalizedOrders.add(numId);
      }
      if (mark.orderCode) {
        finalizedOrders.add(mark.orderCode.trim());
      }
      finalizedOrders.add(mark.orderId);
    }
  }

  // 2. Mapeia também se algum lugar da lista já veio como 'concluido' ou 'entregue'
  for (const p of places) {
    if (p.orderStage === 'concluido' || (p.operationType as any) === 'concluido' || FINALIZED_LEGACY_STAGES.has(getLegacyStage(p))) {
      const numId = extractNumericId(p.id) || extractNumericId(p.orderCode);
      if (numId) {
        finalizedOrders.add(`pedido_${numId}`);
        finalizedOrders.add(numId);
      }
      if (p.orderCode) {
        finalizedOrders.add(p.orderCode.trim());
      }
      finalizedOrders.add(p.id);
    }
  }

  // 3. Agrupa os lugares pelo identificador da encomenda, ignorando as finalizadas
  const orderGroups = new Map<string, Place[]>();
  const independentPlaces: Place[] = [];

  for (const place of places) {
    const numId = extractNumericId(place.id) || extractNumericId(place.orderCode);
    const orderKey = extractOrderId(place);

    // REGRA DE OURO: Encomenda finalizada NUNCA mais aparece no mapa
    const isOrderFinalized = 
      (numId && finalizedOrders.has(numId)) ||
      (numId && finalizedOrders.has(`pedido_${numId}`)) ||
      (orderKey && finalizedOrders.has(orderKey)) ||
      (place.orderCode && finalizedOrders.has(place.orderCode.trim())) ||
      finalizedOrders.has(place.id) ||
      place.orderStage === 'concluido' ||
      (place.operationType as any) === 'concluido';

    if (isOrderFinalized) {
      continue;
    }

    const groupKey = orderKey || (numId ? `pedido_${numId}` : null);
    if (!groupKey) {
      independentPlaces.push(place);
    } else {
      const group = orderGroups.get(groupKey) || [];
      group.push(place);
      orderGroups.set(groupKey, group);
    }
  }

  const result: Place[] = [...independentPlaces];

  // Se o usuário selecionou filtros manuais estritos na barra superior (ex: somente 'troca' ou somente 'entrega')
  const hasSpecificFilter = operationsFilter && 
    ((!operationsFilter.coleta && operationsFilter.entrega) || (!operationsFilter.coleta && operationsFilter.troca));

  // 4. Aplica a sequência estrita para cada encomenda ativa:
  for (const [groupKey, group] of orderGroups.entries()) {
    if (group.length === 0) continue;

    if (hasSpecificFilter) {
      const seenStages = new Set<string>();
      for (const p of group) {
        const stage = p.orderStage === 'retorno' ? 'retorno' : (p.operationType || '');
        if (seenStages.has(stage)) continue;
        seenStages.add(stage);
        result.push(p);
      }
      continue;
    }

    const numId = extractNumericId(groupKey);
    const hasPickupMarker = group.some(p => p.operationType === 'coleta');
    const hasLaterStageMarker = group.some(p => p.operationType === 'troca' || p.operationType === 'entrega');

    // Identifica se é encomenda com Troca
    const isExchangeOrder = Boolean(
      group.some(p => 
        p.isExchangeOrder || 
        p.operationType === 'troca' || 
        p.orderStage === 'troca' || 
        p.orderStage === 'retorno' ||
        p.category?.toLowerCase().includes('troca') ||
        Boolean(p.exchangeCoordinates?.lat)
      )
    );

    // Verifica se a Coleta já foi concluída
    const isColetaDone = Boolean(
      (numId && completedKeys.has(`pedido_${numId}_coleta`)) ||
      (numId && (completedKeys.has(`pedido_${numId}_troca`) || completedKeys.has(`pedido_${numId}_entrega`))) ||
      group.some(p => completedKeys.has(`${p.id}_coleta`) || (p.orderCode && completedKeys.has(`${p.orderCode}_coleta`))) ||
      group.some(p => ['coletado', 'trocando', 'trocado', 'retorno', 'retornando', 'entregando'].includes(p.orderStage || '')) ||
      group.some(p => COLLECTED_LEGACY_STAGES.has(getLegacyStage(p))) ||
      (!hasPickupMarker && hasLaterStageMarker)
    );

    // Verifica se a Troca já foi concluída (no cliente)
    const isTrocaDone = Boolean(
      (numId && completedKeys.has(`pedido_${numId}_troca`)) ||
      group.some(p => completedKeys.has(`${p.id}_troca`) || (p.orderCode && completedKeys.has(`${p.orderCode}_troca`))) ||
      group.some(p => ['trocado', 'retorno', 'retornando', 'segunda_entrega'].includes(p.orderStage || '')) ||
      group.some(p => EXCHANGED_LEGACY_STAGES.has(getLegacyStage(p)))
    );

    // ========================================================
    // REGRA 1: FLUXO DE TROCA (Coleta -> Troca -> Entrega na Coleta)
    // ========================================================
    if (isExchangeOrder) {
      if (!isColetaDone) {
        // 1º: Primeiro Coleta (aparece no local da coleta)
        result.push(getColetaMarker(group));
      } else if (!isTrocaDone) {
        // 2º: Depois que for coletado, aparece a Troca (no local do cliente)
        result.push(getTrocaMarker(group));
      } else {
        // 3º: Depois que for trocado, aparece a Entrega NO MESMO LOCAL DA COLETA!
        result.push(getRetornoEntregaMarker(group));
      }
      continue;
    }

    // ========================================================
    // REGRA 2: FLUXO NORMAL (Coleta -> Entrega)
    // ========================================================
    // Se a encomenda for exclusivamente de Entrega (sem etapa de coleta):
    const isEntregaOnly = group.every(p => p.operationType === 'entrega') || 
      (Boolean(group[0]?.category?.toLowerCase().includes('entrega')) && !group.some(p => p.operationType === 'coleta'));
    if (isEntregaOnly) {
      result.push(getEntregaMarker(group));
      continue;
    }

    // Se a encomenda for exclusivamente de Coleta (sem etapa de entrega):
    const isColetaOnly = group.every(p => p.operationType === 'coleta') || 
      (Boolean(group[0]?.category?.toLowerCase().includes('coleta')) && !group.some(p => p.operationType === 'entrega'));
    if (isColetaOnly) {
      result.push(getColetaMarker(group));
      continue;
    }

    if (!isColetaDone) {
      // 1º: Primeiro Coleta (aparece no local da coleta)
      result.push(getColetaMarker(group));
    } else {
      // 2º: Depois que for coletado, aparece a Entrega
      result.push(getEntregaMarker(group));
    }
  }

  return result;
}
