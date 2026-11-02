// Só a conta realmente logada como motorista aceita pedidos; admin/atendente em "visão motorista" não.
export function canClaimOrders(currentRole: string): boolean {
  if (currentRole !== 'motorista') return false;
  try {
    const raw = localStorage.getItem('encomendaszap_logged_account');
    if (!raw) return true;
    return JSON.parse(raw)?.role === 'motorista';
  } catch {
    return true;
  }
}
