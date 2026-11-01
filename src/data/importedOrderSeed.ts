import type { BackendPedido } from '../services/apiTypes';

export async function loadImportedOrderSeed(): Promise<BackendPedido[]> {
  const { default: importedOrders } = await import('./importedPedidos.json');
  return Array.isArray(importedOrders) ? importedOrders as BackendPedido[] : [];
}