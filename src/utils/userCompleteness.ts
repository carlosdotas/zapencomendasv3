/**
 * Utilitário de Validação e Identificação de Completude de Usuários e Contatos
 * 
 * Regra de Negócio:
 * - O usuário que possuir Nome, Telefone e CPF é considerado COMPLETO.
 * - Caso falte qualquer um desses 3 dados essenciais, é considerado INCOMPLETO.
 * 
 * Usuários completos recebem:
 * - Ícone especial de verificação (CheckCircle2 / ShieldCheck).
 * - Destaque visual diferenciado (tons esmeralda/verde de cadastro regularizado).
 * 
 * Usuários incompletos recebem:
 * - Ícone de alerta (AlertCircle / AlertTriangle).
 * - Identificação dos campos pendentes (Falta CPF, Falta Telefone, etc.).
 * - Destaque visual em tons âmbar/alaranjado suave de atenção.
 */

export interface UserCompletenessResult {
  isComplete: boolean;
  hasName: boolean;
  hasPhone: boolean;
  hasCpf: boolean;
  cleanCpf: string;
  cleanPhone: string;
  missingFields: string[];
  statusLabel: 'Completo' | 'Incompleto';
  badgeText: string;
}

export interface TaxIdInfo {
  type: 'CPF' | 'CNPJ';
  formatted: string;
  clean: string;
  isValidLength: boolean;
  displayLabel: string;
}

export function isValidCpf(value?: string | null): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calculateDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index++) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    return (sum * 10) % 11 % 10;
  };

  return calculateDigit(9) === Number(digits[9])
    && calculateDigit(10) === Number(digits[10]);
}

export function isValidCnpj(value?: string | null): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calculateDigit = (length: number): number => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + Number(digits[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return calculateDigit(12) === Number(digits[12])
    && calculateDigit(13) === Number(digits[13]);
}

export function isValidTaxId(value?: string | null): boolean {
  return isValidCpf(value) || isValidCnpj(value);
}

/**
 * Formata CPF (11 dígitos) ou CNPJ (14 dígitos) e detecta o tipo de documento.
 */
export function formatTaxId(taxId?: string | null): TaxIdInfo {
  if (!taxId) {
    return { type: 'CPF', formatted: '', clean: '', isValidLength: false, displayLabel: 'Não informado' };
  }
  const clean = String(taxId).replace(/\D/g, '');
  if (clean.length === 11) {
    const formatted = clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return { type: 'CPF', formatted, clean, isValidLength: true, displayLabel: `CPF: ${formatted}` };
  } else if (clean.length === 14) {
    const formatted = clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return { type: 'CNPJ', formatted, clean, isValidLength: true, displayLabel: `CNPJ: ${formatted}` };
  }
  
  // Caso contenha caracteres especiais pré-existentes ou tamanho atípico
  const isCnpj = clean.length > 11;
  const type = isCnpj ? 'CNPJ' : 'CPF';
  const trimmed = String(taxId).trim();
  return {
    type,
    formatted: trimmed,
    clean,
    isValidLength: clean.length === 11 || clean.length === 14,
    displayLabel: trimmed ? `${type}: ${trimmed}` : 'Não informado'
  };
}

export function checkUserCompleteness(user?: {
  fullName?: string;
  name?: string;
  phone?: string;
  cpf?: string;
  cnpj?: string;
} | null): UserCompletenessResult {
  if (!user) {
    return {
      isComplete: false,
      hasName: false,
      hasPhone: false,
      hasCpf: false,
      cleanCpf: '',
      cleanPhone: '',
      missingFields: ['Nome', 'Telefone', 'CPF/CNPJ'],
      statusLabel: 'Incompleto',
      badgeText: 'Incompleto (Falta Nome, Telefone e CPF/CNPJ)'
    };
  }

  const rawName = (user.fullName || user.name || '').trim();
  const cleanPhone = (user.phone || '').replace(/\D/g, '');
  const taxId = user.cpf || user.cnpj || '';
  const cleanCpf = taxId.replace(/\D/g, '');

  const hasName = rawName.length >= 2;
  const hasPhone = cleanPhone.length >= 8;
  const hasCpf = cleanCpf.length === 11 || cleanCpf.length === 14 || (Boolean(taxId) && taxId.trim().length >= 11);

  const missingFields: string[] = [];
  if (!hasName) missingFields.push('Nome');
  if (!hasPhone) missingFields.push('Telefone');
  if (!hasCpf) missingFields.push('CPF/CNPJ');

  const isComplete = hasName && hasPhone && hasCpf;

  let badgeText = '✓ Cadastro Completo';
  if (!isComplete) {
    if (missingFields.length === 1) {
      badgeText = `Incompleto (Falta ${missingFields[0]})`;
    } else {
      badgeText = `Incompleto (Faltam ${missingFields.join(', ')})`;
    }
  }

  return {
    isComplete,
    hasName,
    hasPhone,
    hasCpf,
    cleanCpf,
    cleanPhone,
    missingFields,
    statusLabel: isComplete ? 'Completo' : 'Incompleto',
    badgeText
  };
}
