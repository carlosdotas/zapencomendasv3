import { PaymentConditionType } from '../types/map';

export type PaymentAdjustmentType = 'nenhum' | 'desconto' | 'acrescimo';
export type PaymentAdjustmentMode = 'percent' | 'fixed';

export interface PaymentConditionRule {
  id: PaymentConditionType;
  label: string;
  description: string;
  adjustmentType: PaymentAdjustmentType;
  adjustmentMode: PaymentAdjustmentMode;
  adjustmentValue: number;
}

export const PAYMENT_CONDITIONS_META: Array<{
  id: PaymentConditionType;
  label: string;
  description: string;
  defaultType: PaymentAdjustmentType;
  defaultMode: PaymentAdjustmentMode;
  defaultValue: number;
}> = [
  {
    id: 'antes_entrega',
    label: 'Pagar antes da entrega',
    description: 'Pagamento antecipado ou no ato da contratação/retirada',
    defaultType: 'desconto',
    defaultMode: 'percent',
    defaultValue: 5
  },
  {
    id: 'depois_entrega',
    label: 'Pagar depois da entrega',
    description: 'Pagamento no ato da entrega ou recebimento da encomenda',
    defaultType: 'nenhum',
    defaultMode: 'percent',
    defaultValue: 0
  },
  {
    id: 'semanal',
    label: 'Semanal',
    description: 'Faturamento consolidado a cada 7 dias',
    defaultType: 'nenhum',
    defaultMode: 'percent',
    defaultValue: 0
  },
  {
    id: 'quinzenal',
    label: 'Quinzenal',
    description: 'Faturamento consolidado a cada 15 dias',
    defaultType: 'acrescimo',
    defaultMode: 'percent',
    defaultValue: 3
  },
  {
    id: 'mensal',
    label: 'Mensal',
    description: 'Faturamento mensal fechado no final do mês',
    defaultType: 'acrescimo',
    defaultMode: 'percent',
    defaultValue: 5
  }
];

export const DEFAULT_PAYMENT_RULES: PaymentConditionRule[] = PAYMENT_CONDITIONS_META.map(meta => ({
  id: meta.id,
  label: meta.label,
  description: meta.description,
  adjustmentType: meta.defaultType,
  adjustmentMode: meta.defaultMode,
  adjustmentValue: meta.defaultValue
}));

const STORAGE_KEY = 'geoexplorer_payment_condition_rules';

/**
 * Formata qualquer valor numérico ou string como moeda brasileira (BRL)
 * Ex: 30.5 -> "R$ 30,50"
 */
export const formatCurrency = (val: number | string | undefined | null): string => {
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
  if (isNaN(num)) return 'R$ 0,00';
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Obtém as regras de condições de pagamento salvas no localStorage ou as padrões
 */
export const getPaymentRules = (): PaymentConditionRule[] => {
  if (typeof window === 'undefined') return DEFAULT_PAYMENT_RULES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PAYMENT_RULES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PAYMENT_RULES;

    // Garante que todas as 5 condições estejam presentes e com defaults
    return DEFAULT_PAYMENT_RULES.map(defaultRule => {
      const found = parsed.find((p: PaymentConditionRule) => p.id === defaultRule.id);
      if (!found) return defaultRule;
      return {
        ...defaultRule,
        ...found,
        adjustmentValue: typeof found.adjustmentValue === 'number' ? Math.max(0, found.adjustmentValue) : defaultRule.adjustmentValue
      };
    });
  } catch {
    return DEFAULT_PAYMENT_RULES;
  }
};

/**
 * Salva as regras de pagamento no localStorage e dispara evento para atualização em tempo real
 */
export const savePaymentRules = (rules: PaymentConditionRule[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    window.dispatchEvent(new CustomEvent('payment_rules_updated', { detail: rules }));
  } catch (e) {
    console.error('Erro ao salvar regras de pagamento:', e);
  }
};

export interface CalculatedPaymentAdjustment {
  condition: PaymentConditionType;
  conditionLabel: string;
  adjustmentType: PaymentAdjustmentType;
  adjustmentMode: PaymentAdjustmentMode;
  configuredValue: number;
  /** Valor numérico do ajuste (+ para acréscimo, - para desconto, 0 para nenhum) */
  amount: number;
  /** Valor absoluto formatado como moeda (ex: "R$ 2,50") */
  formattedAmount: string;
  /** Texto resumo para exibição no card e WhatsApp (ex: "Desconto de 5% (- R$ 2,50)") */
  summaryText: string;
}

/**
 * Calcula o acréscimo ou desconto baseado na regra da condição de pagamento
 */
export const calculatePaymentAdjustment = (
  subtotal: number,
  condition: PaymentConditionType,
  customRules?: PaymentConditionRule[]
): CalculatedPaymentAdjustment => {
  const rules = customRules || getPaymentRules();
  const rule = rules.find(r => r.id === condition) || DEFAULT_PAYMENT_RULES.find(r => r.id === condition)!;

  const validSubtotal = Math.max(0, Number(subtotal) || 0);
  const { adjustmentType, adjustmentMode, adjustmentValue, label } = rule;

  if (adjustmentType === 'nenhum' || adjustmentValue <= 0 || validSubtotal === 0) {
    return {
      condition,
      conditionLabel: label,
      adjustmentType: 'nenhum',
      adjustmentMode,
      configuredValue: 0,
      amount: 0,
      formattedAmount: 'R$ 0,00',
      summaryText: 'Sem alteração de valor'
    };
  }

  let calculatedAbs = 0;
  if (adjustmentMode === 'percent') {
    calculatedAbs = Math.round((validSubtotal * (adjustmentValue / 100)) * 100) / 100;
  } else {
    calculatedAbs = Math.round(adjustmentValue * 100) / 100;
  }

  if (adjustmentType === 'desconto') {
    calculatedAbs = Math.min(validSubtotal, calculatedAbs);
    const amount = -calculatedAbs;
    const unitStr = adjustmentMode === 'percent' ? `${adjustmentValue}%` : formatCurrency(adjustmentValue);
    return {
      condition,
      conditionLabel: label,
      adjustmentType: 'desconto',
      adjustmentMode,
      configuredValue: adjustmentValue,
      amount,
      formattedAmount: formatCurrency(calculatedAbs),
      summaryText: `Desconto de ${unitStr} (- ${formatCurrency(calculatedAbs)})`
    };
  } else {
    const amount = calculatedAbs;
    const unitStr = adjustmentMode === 'percent' ? `${adjustmentValue}%` : formatCurrency(adjustmentValue);
    return {
      condition,
      conditionLabel: label,
      adjustmentType: 'acrescimo',
      adjustmentMode,
      configuredValue: adjustmentValue,
      amount,
      formattedAmount: formatCurrency(calculatedAbs),
      summaryText: `Acréscimo de ${unitStr} (+ ${formatCurrency(calculatedAbs)})`
    };
  }
};
