import type { Place } from '../types/map';

const POINTS = ['pickup', 'exchange', 'delivery'] as const;

/**
 * Pedido novo nunca nasce atribuído: só fica privado quando o atendente escolheu o motorista.
 * Motorista herdado de um rascunho copiado é descartado e, sem visibilidade, o pedido vira público.
 */
export function sanitizeNewOrderAssignments(place: Place): Place {
  const next: Record<string, unknown> = { ...place };

  for (const point of POINTS) {
    const visibility = next[`${point}Visibility`];
    if (visibility === 'privado' && next[`${point}AssignedDriverId`]) continue;
    next[`${point}Visibility`] = visibility === 'privado' ? 'privado' : 'publico';
    next[`${point}AssignedDriverId`] = undefined;
    next[`${point}AssignedDriverPhone`] = undefined;
    next[`${point}AssignedDriverName`] = undefined;
  }

  if (!(next.orderVisibility === 'privado' && next.assignedDriverId)) {
    next.orderVisibility = next.orderVisibility === 'privado' ? 'privado' : 'publico';
    next.assignedDriverId = undefined;
    next.assignedDriverPhone = undefined;
    next.assignedDriverName = undefined;
  }
  next.acceptedByDriver = false;
  return next as unknown as Place;
}
