/**
 * financialUtils.ts
 * Utilitários puros para cálculos, subtotais, autenticação de recibos e geração de mensagens WhatsApp
 * para o módulo de Contas a Pagar (motoristas) e Contas a Receber (pedidos dos clientes).
 */

export interface PayableAccount {
  id: number;
  driver_key: string;
  driver_name: string;
  driver_phone?: string;
  day: string;
  order_key: string;
  order_id?: number | string;
  operation?: string;
  label?: string;
  place_name?: string;
  customer_name?: string;
  address?: string;
  status: string;
  price: number;
  paid: boolean;
  paid_at?: string | null;
}

export interface ReceivableAccount {
  id: number;
  order_id: number;
  code: string;
  client_id?: number | null;
  client_name: string;
  client_phone?: string;
  seller_name?: string;
  seller_phone?: string;
  date: string;
  total: number;
  base_value: number;
  discount: number;
  payment_status: 'pago' | 'nao_pago' | 'pendente' | string;
  payment_method?: string | null;
  paid_at?: string | null;
  orig_name?: string;
  dest_name?: string;
  tipo_encomenda?: string;
  etapa?: string;
}

/**
 * Formata um valor numérico em moeda Real (BRL).
 */
export function formatCurrency(value: number | undefined | null): string {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Gera código de autenticação único e rastreável para comprovantes/recibos.
 * Exemplo: AUT-EZ-REC-1042-8F9B ou AUT-EZ-PAG-0512-3A1C
 */
export function generateAuthCode(
  type: 'receivable' | 'payable',
  referenceId: number | string,
  timestamp: number = Date.now()
): string {
  const prefix = type === 'receivable' ? 'REC' : 'PAG';
  const cleanId = String(referenceId).replace(/\D/g, '').padStart(4, '0').slice(-4);
  const timeHash = Math.abs(Math.sin(timestamp) * 1000000)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0')
    .slice(0, 4);
  return `AUT-EZ-${prefix}-${cleanId}-${timeHash}`;
}

/**
 * Calcula subtotais de Contas a Pagar
 */
export function calculatePayableSubtotals(items: PayableAccount[]): {
  unpaidTotal: number;
  unpaidCount: number;
  paidTotal: number;
  paidCount: number;
  allTotal: number;
  allCount: number;
} {
  let unpaidTotal = 0;
  let unpaidCount = 0;
  let paidTotal = 0;
  let paidCount = 0;

  for (const item of items) {
    const val = Number(item.price) || 0;
    if (item.paid) {
      paidTotal += val;
      paidCount += 1;
    } else {
      unpaidTotal += val;
      unpaidCount += 1;
    }
  }

  return {
    unpaidTotal,
    unpaidCount,
    paidTotal,
    paidCount,
    allTotal: unpaidTotal + paidTotal,
    allCount: unpaidCount + paidCount
  };
}

/**
 * Calcula subtotais de Contas a Receber
 */
export function calculateReceivableSubtotals(items: ReceivableAccount[]): {
  unpaidTotal: number;
  unpaidCount: number;
  paidTotal: number;
  paidCount: number;
  allTotal: number;
  allCount: number;
} {
  let unpaidTotal = 0;
  let unpaidCount = 0;
  let paidTotal = 0;
  let paidCount = 0;

  for (const item of items) {
    const val = Number(item.total) || 0;
    const isPaid = item.payment_status === 'pago';
    if (isPaid) {
      paidTotal += val;
      paidCount += 1;
    } else {
      unpaidTotal += val;
      unpaidCount += 1;
    }
  }

  return {
    unpaidTotal,
    unpaidCount,
    paidTotal,
    paidCount,
    allTotal: unpaidTotal + paidTotal,
    allCount: unpaidCount + paidCount
  };
}

/**
 * Filtra itens de Contas a Pagar
 */
export function filterPayableAccounts(
  items: PayableAccount[],
  filters: {
    status?: 'unpaid' | 'paid' | 'all';
    driverKey?: string;
    searchTerm?: string;
  }
): PayableAccount[] {
  const { status = 'unpaid', driverKey, searchTerm } = filters;
  const term = (searchTerm || '').trim().toLowerCase();

  return items.filter(item => {
    // Filtro de status
    if (status === 'unpaid' && item.paid) return false;
    if (status === 'paid' && !item.paid) return false;

    // Filtro de motorista
    if (driverKey && driverKey !== 'all' && item.driver_key !== driverKey) return false;

    // Busca textual
    if (term) {
      const match =
        (item.driver_name && item.driver_name.toLowerCase().includes(term)) ||
        (item.customer_name && item.customer_name.toLowerCase().includes(term)) ||
        (item.place_name && item.place_name.toLowerCase().includes(term)) ||
        (item.address && item.address.toLowerCase().includes(term)) ||
        (item.order_key && item.order_key.toLowerCase().includes(term)) ||
        (item.day && item.day.includes(term));
      if (!match) return false;
    }

    return true;
  });
}

/**
 * Filtra itens de Contas a Receber
 */
export function filterReceivableAccounts(
  items: ReceivableAccount[],
  filters: {
    status?: 'unpaid' | 'paid' | 'all';
    clientId?: string | number;
    searchTerm?: string;
  }
): ReceivableAccount[] {
  const { status = 'unpaid', clientId, searchTerm } = filters;
  const term = (searchTerm || '').trim().toLowerCase();

  return items.filter(item => {
    const isPaid = item.payment_status === 'pago';
    if (status === 'unpaid' && isPaid) return false;
    if (status === 'paid' && !isPaid) return false;

    if (clientId && clientId !== 'all') {
      if (String(item.client_id) !== String(clientId) && item.client_name !== clientId) {
        return false;
      }
    }

    if (term) {
      const match =
        (item.client_name && item.client_name.toLowerCase().includes(term)) ||
        (item.code && item.code.toLowerCase().includes(term)) ||
        (item.orig_name && item.orig_name.toLowerCase().includes(term)) ||
        (item.dest_name && item.dest_name.toLowerCase().includes(term)) ||
        (String(item.order_id).includes(term)) ||
        (item.date && item.date.includes(term));
      if (!match) return false;
    }

    return true;
  });
}

/**
 * Monta mensagem WhatsApp de Comprovante de Pagamento para Motorista (individual ou resumo geral)
 */
export function buildDriverReceiptWhatsAppMessage(
  items: PayableAccount[],
  driverName: string,
  isGeneral: boolean = false,
  customAuthCode?: string
): string {
  const auth = customAuthCode || generateAuthCode('payable', items[0]?.id || '0');
  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const now = new Date().toLocaleString('pt-BR');

  if (!isGeneral && items.length === 1) {
    const item = items[0];
    return `*COMPROVANTE DE PAGAMENTO - ENCOMENDASZAP* 🛵💨\n\n` +
      `Olá, *${driverName}*!\n` +
      `Confirmamos a baixa e pagamento do serviço realizado:\n\n` +
      `📍 *Local/Serviço:* ${item.place_name || item.label || 'Corrida'}\n` +
      `📅 *Data:* ${item.day}\n` +
      `📦 *Ref:* ${item.order_key}\n` +
      `💰 *Valor Pago:* ${formatCurrency(item.price)}\n` +
      `🔐 *Autenticação:* ${auth}\n` +
      `⏰ *Emitido em:* ${now}\n\n` +
      `Obrigado pela dedicação e parceria!`;
  }

  // Resumo Geral do Motorista
  const lines = items.map((item, idx) => {
    return `${idx + 1}. ${item.day} - ${item.place_name || item.label || 'Serviço'} (${item.operation || 'entrega'}): *${formatCurrency(item.price)}*`;
  }).join('\n');

  return `*RESUMO DE REPASSE / COMPROVANTE - ENCOMENDASZAP* 🛵💨\n\n` +
    `Olá, *${driverName}*!\n` +
    `Segue o resumo consolidado de repasses realizados:\n\n` +
    `${lines}\n\n` +
    `📊 *Total de Serviços:* ${items.length}\n` +
    `💰 *VALOR TOTAL REPASSADO:* *${formatCurrency(total)}*\n` +
    `🔐 *Código de Autenticação:* ${auth}\n` +
    `⏰ *Data do Comprovante:* ${now}\n\n` +
    `Valores conferidos e baixados no sistema EncomendasZap.`;
}

/**
 * Monta mensagem WhatsApp de Cobrança para Cliente (individual ou resumo geral)
 */
export function buildCustomerBillingWhatsAppMessage(
  items: ReceivableAccount[],
  customerName: string,
  isGeneral: boolean = false
): string {
  const total = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const now = new Date().toLocaleDateString('pt-BR');

  if (!isGeneral && items.length === 1) {
    const item = items[0];
    return `*DEMONSTRATIVO DE COBRANÇA - ENCOMENDASZAP* 📦\n\n` +
      `Olá, *${customerName}*!\n` +
      `Segue a cobrança referente ao pedido realizado com nossa equipe:\n\n` +
      `📋 *Pedido:* #${item.code || item.order_id}\n` +
      `📅 *Data:* ${item.date}\n` +
      `📍 *Destino/Local:* ${item.dest_name || item.orig_name || 'Entrega'}\n` +
      `💰 *Valor:* *${formatCurrency(item.total)}*\n` +
      (item.discount > 0 ? `🏷️ *Desconto aplicado:* ${formatCurrency(item.discount)}\n` : '') +
      `\nSolicitamos a gentileza de nos enviar o comprovante após a transferência.\n` +
      `Qualquer dúvida estamos à disposição!`;
  }

  // Resumo Geral de Cobrança
  const lines = items.map((item, idx) => {
    return `${idx + 1}. Pedido #${item.code || item.order_id} (${item.date}): *${formatCurrency(item.total)}* - ${item.dest_name || 'Entrega'}`;
  }).join('\n');

  return `*RESUMO GERAL DE COBRANÇA - ENCOMENDASZAP* 📦\n\n` +
    `Olá, *${customerName}*!\n` +
    `Segue o fechamento dos seus pedidos pendentes em *${now}*:\n\n` +
    `${lines}\n\n` +
    `📊 *Quantidade de Pedidos:* ${items.length}\n` +
    `💰 *VALOR TOTAL A PAGAR:* *${formatCurrency(total)}*\n\n` +
    `Por favor, nos envie o comprovante assim que realizar o pagamento. Agradecemos pela preferência!`;
}

/**
 * Monta mensagem WhatsApp de Recibo / Comprovante com Número de Autenticação para Cliente
 */
export function buildCustomerReceiptWhatsAppMessage(
  items: ReceivableAccount[],
  customerName: string,
  isGeneral: boolean = false,
  customAuthCode?: string
): string {
  const auth = customAuthCode || generateAuthCode('receivable', items[0]?.order_id || '0');
  const total = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const now = new Date().toLocaleString('pt-BR');

  if (!isGeneral && items.length === 1) {
    const item = items[0];
    return `*RECIBO DE PAGAMENTO - ENCOMENDASZAP* ✅\n\n` +
      `Recebemos de: *${customerName}*\n` +
      `A quantia de: *${formatCurrency(item.total)}*\n` +
      `Referente ao Pedido: *#${item.code || item.order_id}*\n` +
      `Origem/Destino: ${item.orig_name || ''} ➔ ${item.dest_name || ''}\n` +
      (item.payment_method ? `Forma de pagamento: ${item.payment_method}\n` : '') +
      `\n🔐 *NÚMERO DE AUTENTICAÇÃO:* *${auth}*\n` +
      `⏰ *Data de Quitação:* ${now}\n\n` +
      `Este documento comprova a quitação integral do pedido. Obrigado pela confiança!`;
  }

  // Recibo Geral Consolidado
  const lines = items.map((item, idx) => {
    return `${idx + 1}. #${item.code || item.order_id} - ${item.dest_name || 'Entrega'}: *${formatCurrency(item.total)}*`;
  }).join('\n');

  return `*RECIBO CONSOLIDADO DE QUITAÇÃO - ENCOMENDASZAP* ✅\n\n` +
    `Confirmamos a quitação dos pedidos de *${customerName}*:\n\n` +
    `${lines}\n\n` +
    `📊 *Total de Pedidos Quitados:* ${items.length}\n` +
    `💰 *TOTAL RECEBIDO:* *${formatCurrency(total)}*\n` +
    `🔐 *NÚMERO DE AUTENTICAÇÃO:* *${auth}*\n` +
    `⏰ *Data da Quitação:* ${now}\n\n` +
    `Agradecemos a parceria e preferência com a EncomendasZap!`;
}
