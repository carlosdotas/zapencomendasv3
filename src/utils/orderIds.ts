const TEMPORARY_ORDER_ID_PATTERN =
  /^(?:draft-|new-)|^pedido-\d{13,}(?:-(?:coleta|entrega|troca|retorno))?$/i;

export const isTemporaryOrderId = (id?: string | null): boolean =>
  Boolean(id && TEMPORARY_ORDER_ID_PATTERN.test(id));
