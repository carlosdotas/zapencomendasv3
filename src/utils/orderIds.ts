const TEMPORARY_ORDER_ID_PATTERN =
  /^(?:draft-|new-)|^pedido-\d{13,}(?:-(?:coleta|entrega|troca|retorno))?$/i;
const ORDER_OPERATION_SUFFIX = /-(?:coleta|entrega|troca|retorno)$/i;

export const isTemporaryOrderId = (id?: string | null): boolean =>
  Boolean(id && TEMPORARY_ORDER_ID_PATTERN.test(id));

export const getBaseOrderId = (id: string): string => id.replace(ORDER_OPERATION_SUFFIX, '');

export function excludeCoveredOrders<T extends { id: string | number }>(
  orders: T[],
  coveredOrderIds: ReadonlySet<string>
): T[] {
  return orders.filter(order => !coveredOrderIds.has(String(order.id)));
}
