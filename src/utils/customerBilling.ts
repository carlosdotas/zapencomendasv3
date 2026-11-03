import { Place } from '../types/map';
import { getBaseOrderId } from './orderIds';

export interface OpenBillItem {
  code: string;
  date: string;
  operation: string;
  origin: string;
  destination: string;
  total: number;
  discount: number;
}

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const normName = (s?: string) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const isPaid = (p: Place) =>
  (p as any).status_pagamento === 'pago' || p.paymentStatus === 'pago' || p.isPaid === true;

const isCancelled = (p: Place) =>
  ['cancelado', 'cancelled', 'canceled'].includes(String((p as any).status ?? (p as any).etapa ?? '').toLowerCase());

const priceOf = (p: Place) => {
  const direct = Number(p.price);
  if (direct > 0) return direct;
  const raw = Number((p as any).total ?? (p as any).valor_total ?? (p as any).valor);
  return Number.isFinite(raw) ? raw : 0;
};

const discountOf = (p: Place) =>
  Array.isArray(p.discountItems) && p.discountItems.length
    ? p.discountItems.reduce((a, d) => a + (Number(d.value) || 0), 0)
    : Number(p.totalDiscounts) || 0;

const dateOf = (p: Place) => {
  const key = String(p.scheduledDate || (p as any).data || (p as any).orderDate || '').slice(0, 10);
  const [y, m, d] = key.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};

const place = (name?: string, address?: string, city?: string) =>
  (name || '').trim() || (address || '').split(' - ')[0].trim() || (city || '').trim() || 'A definir';

export function sameCustomer(a: Place, b: Place): boolean {
  if (a.customerId && b.customerId) return String(a.customerId) === String(b.customerId);
  const na = normName(a.customerName);
  return Boolean(na) && na === normName(b.customerName);
}

/** Pedidos em aberto (não pagos e não cancelados) do mesmo cliente, um por pedido, do mais antigo ao mais novo. */
export function collectOpenBills(orders: Place[], reference: Place): OpenBillItem[] {
  const byOrder = new Map<string, Place>();
  for (const p of orders) {
    if (!p?.id || !sameCustomer(p, reference) || isPaid(p) || isCancelled(p)) continue;
    const key = getBaseOrderId(p.id);
    const prev = byOrder.get(key);
    if (!prev || priceOf(p) > priceOf(prev)) byOrder.set(key, p);
  }
  return [...byOrder.entries()]
    .map(([key, p]) => ({
      sortKey: String(p.scheduledDate || (p as any).data || '').slice(0, 10),
      item: {
        code: p.orderCode || `#${key.replace('pedido-', '').slice(0, 8)}`,
        date: dateOf(p),
        operation: p.operationType === 'entrega' ? 'Entrega' : p.operationType === 'troca' ? 'Troca' : 'Coleta',
        origin: place(p.pickupName, p.pickupAddress, p.originCity),
        destination: place(p.deliveryName, p.deliveryAddress || p.address, p.destinationCity),
        total: priceOf(p),
        discount: discountOf(p)
      } as OpenBillItem
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(x => x.item);
}

export function buildOpenBillsMessage(customerName: string, items: OpenBillItem[]): string {
  const total = items.reduce((s, i) => s + i.total, 0);
  const lines = items.map((i, idx) =>
    `${idx + 1}. *${i.code}*${i.date ? ` - ${i.date}` : ''}\n` +
    `   ${i.operation}: ${i.origin} ➜ ${i.destination}\n` +
    (i.discount > 0 ? `   Desconto: ${brl(i.discount)}\n` : '') +
    `   Valor: *${brl(i.total)}*`
  ).join('\n\n');

  return `*COBRANÇA - ENCOMENDASZAP* 📦\n\n` +
    `Olá, *${customerName || 'cliente'}*!\n` +
    `Segue o detalhamento das suas contas em aberto:\n\n` +
    `${lines}\n\n` +
    `📊 *Pedidos em aberto:* ${items.length}\n` +
    `💰 *TOTAL A PAGAR:* *${brl(total)}*\n\n` +
    `Por favor, envie o comprovante após o pagamento. Obrigado!`;
}
