/**
 * Paleta de cores exclusivas e permanentes para identificação visual dos motoristas.
 * Cores vibrantes, de alto contraste no mapa claro e escuro.
 */
export const DRIVER_PERMANENT_PALETTE: readonly string[] = [
  '#0B5187', // 0: Azul EncomendasZap / Marinho Forte
  '#E11D48', // 1: Rose / Carmesim Vibrante
  '#059669', // 2: Esmeralda / Verde Floresta
  '#7C3AED', // 3: Violeta / Roxo Profundo
  '#D97706', // 4: Âmbar Dourado / Laranja Quente
  '#0891B2', // 5: Ciano Escuro / Turquesa
  '#DC2626', // 6: Vermelho Vivo
  '#4F46E5', // 7: Índigo Elétrico
  '#16A34A', // 8: Verde Bandeira
  '#C026D3', // 9: Fúcsia / Magenta
  '#2563EB', // 10: Azul Royal
  '#EA580C', // 11: Laranja Queimado
  '#0D9488', // 12: Teal Escuro
  '#9333EA', // 13: Púrpura Brilhante
  '#B91C1C', // 14: Rubi / Vermelho Escuro
  '#0284C7', // 15: Azul Oceano
  '#4338CA', // 16: Índigo Escuro
  '#047857', // 17: Verde Esmeralda Escuro
  '#BE185D', // 18: Pink Escuro
  '#475569'  // 19: Grafite Ardósia
] as const;

/**
 * Retorna uma cor permanente, consistente e exclusiva para o motorista baseada em seu ID/telefone/nome.
 * O hash determinístico garante que o motorista SEMPRE receba a mesma cor em todas as sessões.
 */
export function getDriverPermanentColor(identifier?: string | number | null): string {
  if (identifier === undefined || identifier === null) {
    return DRIVER_PERMANENT_PALETTE[0];
  }

  const str = String(identifier).trim();
  if (!str) {
    return DRIVER_PERMANENT_PALETTE[0];
  }

  // Se o identificador já for um código hexadecimal válido de cor personalizada
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str)) {
    return str;
  }

  // Hash determinístico estilo DJB2
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % DRIVER_PERMANENT_PALETTE.length;
  return DRIVER_PERMANENT_PALETTE[index];
}
