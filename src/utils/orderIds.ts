const TEMPORARY_ORDER_ID_PATTERN =
  /^(?:draft-|new-)|^pedido-\d{13,}(?:-(?:coleta|entrega|troca|retorno))?$/i;
const ORDER_OPERATION_SUFFIX = /-(?:coleta|entrega|troca|retorno)$/i;

export const isTemporaryOrderId = (id?: string | null): boolean =>
  Boolean(id && TEMPORARY_ORDER_ID_PATTERN.test(id));

export const getBaseOrderId = (id: string): string => id.replace(ORDER_OPERATION_SUFFIX, '');

export const cleanOrderId = (rawId?: string | number | null): string => {
  if (rawId === undefined || rawId === null || rawId === '') return '';
  return String(rawId)
    .trim()
    .replace(/^pedido-/, '')
    .replace(ORDER_OPERATION_SUFFIX, '')
    .trim();
};

export const getOrderKey = (p: { id?: string | number | null; orderCode?: string | null; pedido_id?: string | number | null }): string => {
  if (p.orderCode && /^EZ-\d+/i.test(p.orderCode.trim())) {
    const num = p.orderCode.trim().match(/\d+/);
    if (num) return `pedido-${num[0]}`;
  }
  const idStr = String(p.id ?? p.pedido_id ?? '');
  const clean = idStr.replace(ORDER_OPERATION_SUFFIX, '').trim();
  const match = clean.match(/^pedido-(\d+)$/i);
  if (match) return `pedido-${match[1]}`;
  const num = clean.match(/^\d+$/);
  if (num) return `pedido-${num[0]}`;
  return clean || idStr;
};

export function excludeCoveredOrders<T extends { id: string | number }>(
  orders: T[],
  coveredOrderIds: ReadonlySet<string>
): T[] {
  return orders.filter(order => !coveredOrderIds.has(String(order.id)));
}
