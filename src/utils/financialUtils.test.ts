import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  generateAuthCode,
  calculatePayableSubtotals,
  calculateReceivableSubtotals,
  filterPayableAccounts,
  filterReceivableAccounts,
  buildDriverReceiptWhatsAppMessage,
  buildCustomerBillingWhatsAppMessage,
  buildCustomerReceiptWhatsAppMessage,
  PayableAccount,
  ReceivableAccount
} from './financialUtils.js';

describe('financialUtils', () => {
  it('formatCurrency formats Brazilian Real numbers gracefully', () => {
    assert.match(formatCurrency(25.5), /25,50/);
    assert.match(formatCurrency(0), /0,00/);
    assert.match(formatCurrency(null), /0,00/);
  });

  it('generateAuthCode produces consistent and standardized auth code format', () => {
    const code = generateAuthCode('receivable', 42, 1700000000000);
    assert.match(code, /^AUT-EZ-REC-\d{4}-[0-9A-F]{4}$/);
    const pagCode = generateAuthCode('payable', 15, 1700000000000);
    assert.match(pagCode, /^AUT-EZ-PAG-\d{4}-[0-9A-F]{4}$/);
  });

  it('calculatePayableSubtotals computes unpaid, paid, and total sums accurately', () => {
    const items: PayableAccount[] = [
      { id: 1, driver_key: 'd1', driver_name: 'Carlos', day: '2026-05-10', order_key: '1_coleta', status: 'coletado', price: 15.00, paid: false },
      { id: 2, driver_key: 'd1', driver_name: 'Carlos', day: '2026-05-10', order_key: '1_entrega', status: 'entregue', price: 20.00, paid: false },
      { id: 3, driver_key: 'd2', driver_name: 'Marcos', day: '2026-05-10', order_key: '2_coleta', status: 'coletado', price: 30.00, paid: true }
    ];

    const subtotals = calculatePayableSubtotals(items);
    assert.equal(subtotals.unpaidTotal, 35.00);
    assert.equal(subtotals.unpaidCount, 2);
    assert.equal(subtotals.paidTotal, 30.00);
    assert.equal(subtotals.paidCount, 1);
    assert.equal(subtotals.allTotal, 65.00);
    assert.equal(subtotals.allCount, 3);
  });

  it('calculateReceivableSubtotals computes order totals and payment statuses', () => {
    const items: ReceivableAccount[] = [
      { id: 1, order_id: 101, code: 'EZ-101', client_name: 'Loja Alpha', date: '2026-05-10', total: 50.00, base_value: 50, discount: 0, payment_status: 'nao_pago' },
      { id: 2, order_id: 102, code: 'EZ-102', client_name: 'Loja Beta', date: '2026-05-10', total: 80.00, base_value: 80, discount: 0, payment_status: 'pago' },
      { id: 3, order_id: 103, code: 'EZ-103', client_name: 'Loja Alpha', date: '2026-05-10', total: 25.00, base_value: 25, discount: 0, payment_status: 'pendente' }
    ];

    const subtotals = calculateReceivableSubtotals(items);
    assert.equal(subtotals.unpaidTotal, 75.00);
    assert.equal(subtotals.unpaidCount, 2);
    assert.equal(subtotals.paidTotal, 80.00);
    assert.equal(subtotals.paidCount, 1);
    assert.equal(subtotals.allTotal, 155.00);
  });

  it('filterPayableAccounts filters by unpaid status and driver correctly', () => {
    const items: PayableAccount[] = [
      { id: 1, driver_key: 'd1', driver_name: 'Carlos', day: '2026-05-10', order_key: '1_coleta', status: 'coletado', price: 15.00, paid: false },
      { id: 2, driver_key: 'd1', driver_name: 'Carlos', day: '2026-05-10', order_key: '1_entrega', status: 'entregue', price: 20.00, paid: true },
      { id: 3, driver_key: 'd2', driver_name: 'Marcos', day: '2026-05-10', order_key: '2_coleta', status: 'coletado', price: 30.00, paid: false }
    ];

    // Default: unpaid
    const unpaidOnly = filterPayableAccounts(items, { status: 'unpaid' });
    assert.equal(unpaidOnly.length, 2);
    assert.ok(unpaidOnly.every(i => !i.paid));

    // Filter by driver d1
    const d1Unpaid = filterPayableAccounts(items, { status: 'unpaid', driverKey: 'd1' });
    assert.equal(d1Unpaid.length, 1);
    assert.equal(d1Unpaid[0].id, 1);
  });

  it('filterReceivableAccounts filters by customer and search term', () => {
    const items: ReceivableAccount[] = [
      { id: 1, order_id: 101, code: 'EZ-101', client_id: 5, client_name: 'Loja Centro', date: '2026-05-10', total: 50.00, base_value: 50, discount: 0, payment_status: 'nao_pago' },
      { id: 2, order_id: 102, code: 'EZ-102', client_id: 6, client_name: 'Farmácia Saúde', date: '2026-05-10', total: 80.00, base_value: 80, discount: 0, payment_status: 'nao_pago' }
    ];

    const filtered = filterReceivableAccounts(items, { status: 'unpaid', searchTerm: 'saúde' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].order_id, 102);
  });

  it('buildDriverReceiptWhatsAppMessage formats single and general summary with authentication', () => {
    const items: PayableAccount[] = [
      { id: 1, driver_key: 'd1', driver_name: 'Carlos Silva', day: '2026-05-10', order_key: '1_coleta', place_name: 'Loja A', price: 25.00, paid: true, status: 'coletado' }
    ];
    const singleMsg = buildDriverReceiptWhatsAppMessage(items, 'Carlos Silva', false, 'AUT-EZ-PAG-0001-ABCD');
    assert.ok(singleMsg.includes('COMPROVANTE DE PAGAMENTO'));
    assert.ok(singleMsg.includes('AUT-EZ-PAG-0001-ABCD'));
    assert.ok(singleMsg.includes('Carlos Silva'));

    const generalMsg = buildDriverReceiptWhatsAppMessage(items, 'Carlos Silva', true, 'AUT-EZ-PAG-0001-ABCD');
    assert.ok(generalMsg.includes('RESUMO DE REPASSE'));
    assert.ok(generalMsg.includes('VALOR TOTAL REPASSADO'));
  });

  it('buildCustomerBillingWhatsAppMessage and buildCustomerReceiptWhatsAppMessage format messages appropriately', () => {
    const items: ReceivableAccount[] = [
      { id: 1, order_id: 99, code: 'EZ-099-GO', client_name: 'Mercado Bom', date: '2026-05-10', total: 45.00, base_value: 45, discount: 0, payment_status: 'nao_pago' }
    ];
    const billing = buildCustomerBillingWhatsAppMessage(items, 'Mercado Bom');
    assert.ok(billing.includes('DEMONSTRATIVO DE COBRANÇA'));
    assert.ok(billing.includes('Mercado Bom'));
    assert.ok(billing.includes('EZ-099-GO'));

    const receipt = buildCustomerReceiptWhatsAppMessage(items, 'Mercado Bom', false, 'AUT-EZ-REC-0099-WXYZ');
    assert.ok(receipt.includes('RECIBO DE PAGAMENTO'));
    assert.ok(receipt.includes('AUT-EZ-REC-0099-WXYZ'));
  });
});
