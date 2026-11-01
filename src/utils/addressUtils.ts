/**
 * Utilitários para tratamento e extração de cidade/endereço
 */

export const extractCityFromAddress = (address: string): string => {
  if (!address || typeof address !== 'string') return 'Goiânia - GO';
  
  // Procura por padrão ", Cidade - UF"
  const match = address.match(/(?:,\s*|;\s*)([A-Za-zÀ-ÿ\s]+)\s*-\s*([A-Z]{2})\b/i);
  if (match && match[1] && match[2]) {
    return `${match[1].trim()} - ${match[2].toUpperCase()}`;
  }

  // Identifica estado se presente
  const stateMatch = address.match(/-\s*([A-Z]{2})\b/i);
  const stateSuffix = stateMatch ? stateMatch[1].toUpperCase() : 'GO';

  const lower = address.toLowerCase();
  if (lower.includes('aparecida de goiânia') || lower.includes('aparecida de goiania') || lower.includes('aparecida')) {
    return `Aparecida de Goiânia - ${stateSuffix}`;
  }
  if (lower.includes('anápolis') || lower.includes('anapolis')) {
    return `Anápolis - ${stateSuffix}`;
  }
  if (lower.includes('senador canedo')) {
    return `Senador Canedo - ${stateSuffix}`;
  }
  if (lower.includes('trindade')) {
    return `Trindade - ${stateSuffix}`;
  }
  if (lower.includes('brasília') || lower.includes('brasilia')) {
    return 'Brasília - DF';
  }
  if (lower.includes('goiânia') || lower.includes('goiania')) {
    return `Goiânia - ${stateSuffix}`;
  }

  const parts = address.split('-');
  if (parts.length >= 2) {
    const citySegment = parts[parts.length - 2].split(',').pop();
    if (citySegment && citySegment.trim()) {
      return `${citySegment.trim()} - ${stateSuffix}`;
    }
  }

  return 'Goiânia - GO';
};
