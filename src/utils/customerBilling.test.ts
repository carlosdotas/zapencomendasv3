import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOpenBillsMessage, collectOpenBills } from './customerBilling';

const order = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, customerName: 'João Silva', customerPhone: '62999990000', price: 20, scheduledDate: '2026-11-01', ...extra }) as any;

test('lista só pedidos em aberto do mesmo cliente, sem duplicar', () => {
  const ref = order('pedido-1');
  const items = collectOpenBills(
    [
      ref,
      order('pedido-2', { price: 35, scheduledDate: '2026-10-30' }),
      order('pedido-3', { paymentStatus: 'pago' }),
      order('pedido-4', { customerName: 'Maria' }),
      order('pedido-1', { price: 20 })
    ],
    ref
  );
  assert.deepEqual(items.map(i => i.total), [35, 20]);
});

test('monta a mensagem com detalhes e total', () => {
  const items = collectOpenBills([order('pedido-1'), order('pedido-2', { price: 30 })], order('pedido-1'));
  const msg = buildOpenBillsMessage('João Silva', items);
  assert.ok(msg.includes('João Silva'));
  assert.ok(msg.includes('Pedidos em aberto:* 2'));
  assert.ok(msg.includes('R$ 50,00'));
});
