import type { CompletedWaypointMark } from '../types/map';
import { getOrderKey } from './orderIds';

function completedKey(mark: CompletedWaypointMark): string | undefined {
  if (mark.status === 'failed') return undefined;
  const orderKey = getOrderKey({ id: mark.orderId, orderCode: mark.orderCode });
  return /^pedido-\d+$/.test(orderKey) ? `${orderKey}:${mark.operationType}` : undefined;
}

export function mergeCompletedWaypointMarks(
  existing: CompletedWaypointMark[],
  incoming: CompletedWaypointMark[]
): CompletedWaypointMark[] {
  const result: CompletedWaypointMark[] = [];
  const positions = new Map<string, number>();
  const ids = new Set<string>();

  for (const mark of [...existing, ...incoming]) {
    if (ids.has(mark.id)) continue;
    ids.add(mark.id);
    const key = completedKey(mark);
    const position = key ? positions.get(key) : undefined;
    if (position !== undefined) {
      if (result[position].id.startsWith('backend-coleta-') && !mark.id.startsWith('backend-coleta-')) {
        result[position] = mark;
      }
      continue;
    }
    if (key) positions.set(key, result.length);
    result.push(mark);
  }
  return result;
}
