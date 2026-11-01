import { Place, LocationCoordinates } from '../types/map';

/**
 * Determina se um local é uma rua, avenida, logradouro, endereço residencial,
 * rodovia, geocode ou coordenadas geográficas (não é estabelecimento comercial).
 *
 * Ruas e endereços em geral NÃO possuem horário de funcionamento ou horário de fechar.
 */
export function isStreetOrAddress(place: {
  name?: string;
  category?: string;
  address?: string;
  types?: string[];
  [key: string]: any;
} | null | undefined): boolean {
  if (!place) return false;

  const category = (place.category || '').toLowerCase().trim();
  const name = (place.name || '').toLowerCase().trim();
  const address = (place.address || '').toLowerCase().trim();

  // 1. Categorias explícitas de vias públicas, endereços e geocodificação
  const streetCategories = [
    'via pública',
    'via publica',
    'rua',
    'avenida',
    'alameda',
    'travessa',
    'rodovia',
    'estrada',
    'logradouro',
    'route',
    'street_address',
    'street address',
    'intersection',
    'endereço',
    'endereco',
    'address',
    'coordenadas geográficas',
    'coordenadas geograficas',
    'coordenadas',
    'ponto no mapa',
    'ponto geográfico',
    'localização geográfica',
    'setor',
    'bairro',
    'postal_code',
    'cep',
    'geocode',
    'sublocality',
    'neighborhood'
  ];

  if (streetCategories.some(cat => category === cat || category.includes(cat))) {
    // Se a categoria tiver termos de rua, verifica se não é um estabelecimento com termo no nome
    const commercialSignals = [
      'loja', 'farmácia', 'farmacia', 'drogaria', 'supermercado', 'restaurante',
      'mercado', 'bar', 'oficina', 'shopping', 'distribuidora', 'padaria'
    ];
    if (!commercialSignals.some(s => category.includes(s) || name.includes(s))) {
      return true;
    }
  }

  // 2. Types do Google Maps (se informados)
  if (place.types && Array.isArray(place.types)) {
    const isGoogleStreet = place.types.some(t =>
      ['route', 'street_address', 'premise', 'subpremise', 'intersection', 'geocode', 'postal_code'].includes(t)
    );
    const isGoogleCommercial = place.types.some(t =>
      [
        'establishment', 'point_of_interest', 'store', 'restaurant',
        'food', 'shopping_mall', 'pharmacy', 'health', 'bank', 'lodging'
      ].includes(t)
    );
    if (isGoogleStreet && !isGoogleCommercial) {
      return true;
    }
  }

  // 3. Nomes genéricos de coordenadas ou pontos não comerciais
  if (
    name.startsWith('lat:') ||
    name.startsWith('coordenadas') ||
    name === 'local no mapa' ||
    name === 'ponto no mapa' ||
    name === 'ponto selecionado' ||
    name === 'localizando endereço...' ||
    name === 'local sem nome' ||
    name === 'endereço selecionado' ||
    name.startsWith('local de ') || // Local de cliente
    /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name) // Ex: "-16.6869, -49.2648"
  ) {
    return true;
  }

  // 4. Prefixo de logradouro/rua no nome
  const streetPrefixRegex = /^(rua|r\.|avenida|av\.|alameda|al\.|travessa|tv\.|rodovia|rod\.|estrada|via|viela|quadra|qd\.|lote|lt\.|st\.|setor|chácara|chac\.|condomínio|cond\.|vila|jardim|jd\.)\b/i;
  if (streetPrefixRegex.test(name)) {
    const commercialKeywords = [
      'farmácia', 'farmacia', 'drogaria', 'supermercado', 'mercado', 'loja',
      'restaurante', 'bar', 'oficina', 'shopping', 'pastelaria', 'padaria',
      'distribuidora', 'embalagens', 'frios', 'auto peças', 'autopeças',
      'suplementos', 'comercial', 'transportes', 'transportadora', 'posto',
      'academia', 'clínica', 'clinica', 'hospital', 'laboratório', 'laboratorio',
      'hotel', 'pousada', 'escola', 'colégio', 'colegio', 'gráfica', 'grafica'
    ];
    const isCommercial = commercialKeywords.some(kw => name.includes(kw) || category.includes(kw));
    if (!isCommercial) {
      return true;
    }
  }

  // 5. Nome exatamente igual ao endereço
  if (name && address && name === address) {
    return true;
  }

  return false;
}

/**
 * Calcula a distância em metros entre duas coordenadas geográficas (Fórmula de Haversine).
 */
export function calculateDistanceMeters(
  coord1: LocationCoordinates | { lat: number; lng: number },
  coord2: LocationCoordinates | { lat: number; lng: number }
): number {
  const R = 6371e3; // Raio da Terra em metros
  const lat1Rad = (coord1.lat * Math.PI) / 180;
  const lat2Rad = (coord2.lat * Math.PI) / 180;
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Encontra o local mais próximo dentre uma lista de locais dentro de uma distância máxima em metros.
 */
export function findNearestPlace<T extends { coordinates: LocationCoordinates }>(
  targetCoord: LocationCoordinates,
  placesList: T[],
  maxDistanceMeters: number = 40
): { place: T; distanceMeters: number } | null {
  let closest: { place: T; distanceMeters: number } | null = null;

  for (const item of placesList) {
    if (!item.coordinates || typeof item.coordinates.lat !== 'number' || typeof item.coordinates.lng !== 'number') {
      continue;
    }
    const dist = calculateDistanceMeters(targetCoord, item.coordinates);
    if (dist <= maxDistanceMeters) {
      if (!closest || dist < closest.distanceMeters) {
        closest = { place: item, distanceMeters: dist };
      }
    }
  }

  return closest;
}

/**
 * Determina o horário de fechamento inteligente para um ponto comercial/estabelecimento.
 * Retorna string no formato 'HH:mm', ou '' se for rua/endereço.
 */
export function resolveCommercialClosingTime(
  place: {
    name?: string;
    category?: string;
    address?: string;
    closingTime?: string;
    horario?: string;
    [key: string]: any;
  } | null | undefined,
  now: Date = new Date()
): string {
  if (!place) return '';

  // 1. Ruas, avenidas, rodovias, coordenadas e endereços NÃO possuem horário de fechar
  if (isStreetOrAddress(place)) {
    return '';
  }

  // 2. Se já possuir horário explícito configurado
  if (place.closingTime && typeof place.closingTime === 'string') {
    const match = place.closingTime.match(/(\d{1,2}:\d{2})/);
    if (match) return match[1];
  }

  if (place.horario && typeof place.horario === 'string') {
    const match = place.horario.match(/(\d{1,2}:\d{2})/);
    if (match) return match[1];
  }

  const name = (place.name || '').toLowerCase();
  const category = (place.category || '').toLowerCase();

  // 3. Shoppings e Centros Comerciais (fecham às 22:00)
  if (name.includes('shopping') || category.includes('shopping') || name.includes('mall')) {
    return '22:00';
  }

  // 4. Terminais, Aeroportos (23:59)
  if (name.includes('terminal') || name.includes('aeroporto')) {
    return '23:59';
  }

  // 5. Parques
  if (name.includes('parque') || category.includes('parque')) {
    return '22:00';
  }

  // 6. Farmácias e Drogarias
  if (
    name.includes('farmácia') || name.includes('farmacia') ||
    name.includes('drogaria') || category.includes('farmácia') || category.includes('drogaria')
  ) {
    return '22:00';
  }

  // 7. Supermercados, Hipermercados, Mercados e Feiras
  if (
    name.includes('supermercado') || name.includes('hipermercado') ||
    name.includes('mercado') || category.includes('mercado') || name.includes('feira')
  ) {
    return '21:00';
  }

  // 8. Restaurantes, Bares, Lanchonetes, Pizzarias, Pastelarias, Hamburguerias
  if (
    name.includes('restaurante') || name.includes('bar') || name.includes('pizzaria') ||
    name.includes('lanchonete') || name.includes('burger') || name.includes('pastelaria') ||
    name.includes('churrascaria') || name.includes('comida') || name.includes('espetinho')
  ) {
    return '23:00';
  }

  // 9. Padarias e Panificadoras
  if (name.includes('padaria') || name.includes('panificadora')) {
    return '20:00';
  }

  // 10. Academias
  if (name.includes('academia') || name.includes('fitness')) {
    return '22:00';
  }

  // 11. Distribuidoras e Centrais de Coletas
  if (
    name.includes('distribuidora') || name.includes('central de coletas') ||
    name.includes('transportadora') || name.includes('logística') || name.includes('logistica')
  ) {
    return '18:30';
  }

  // 12. Ponto Comercial / Estabelecimento Padrão:
  // Se estiver sendo acessado durante a noite (a partir das 19h), para pontos comerciais
  // ativos no mapa que recebem encomendas/pedidos, fecha às 22:00 ou 23:00.
  // Durante o dia normal, horário comercial fecha às 19:00.
  const currentHour = now.getHours();
  if (currentHour >= 21) {
    return '23:00';
  }
  if (currentHour >= 18) {
    return '21:00';
  }
  return '19:00';
}

/**
 * Determina o horário de abertura inteligente para um ponto comercial/estabelecimento.
 * Retorna string no formato 'HH:mm', ou '' se for rua/endereço.
 */
export function resolveCommercialOpeningTime(
  place: {
    name?: string;
    category?: string;
    address?: string;
    openingTime?: string;
    horarioAbertura?: string;
    [key: string]: any;
  } | null | undefined
): string {
  if (!place) return '08:00';

  // Ruas, avenidas, rodovias, coordenadas e endereços residenciais não possuem horário comercial
  if (isStreetOrAddress(place)) {
    return '';
  }

  // 1. Se já possuir horário explícito de abertura
  if (place.openingTime && typeof place.openingTime === 'string') {
    const match = place.openingTime.match(/(\d{1,2}:\d{2})/);
    if (match) return match[1];
  }

  if (place.horarioAbertura && typeof place.horarioAbertura === 'string') {
    const match = place.horarioAbertura.match(/(\d{1,2}:\d{2})/);
    if (match) return match[1];
  }

  const name = (place.name || '').toLowerCase();
  const category = (place.category || '').toLowerCase();

  // 2. Padarias e Panificadoras (abrem cedo às 06:00)
  if (name.includes('padaria') || name.includes('panificadora')) {
    return '06:00';
  }

  // 3. Academias (abrem às 06:00)
  if (name.includes('academia') || name.includes('fitness')) {
    return '06:00';
  }

  // 4. Farmácias e Drogarias (abrem às 07:00)
  if (
    name.includes('farmácia') || name.includes('farmacia') ||
    name.includes('drogaria') || category.includes('farmácia') || category.includes('drogaria')
  ) {
    return '07:00';
  }

  // 5. Supermercados, Hipermercados e Feiras (abrem às 07:30)
  if (
    name.includes('supermercado') || name.includes('hipermercado') ||
    name.includes('mercado') || category.includes('mercado') || name.includes('feira')
  ) {
    return '07:30';
  }

  // 6. Shoppings e Centros Comerciais (abrem às 10:00)
  if (name.includes('shopping') || category.includes('shopping') || name.includes('mall')) {
    return '10:00';
  }

  // 7. Restaurantes, Bares, Lanchonetes (abrem às 11:00 para almoço)
  if (
    name.includes('restaurante') || name.includes('bar') || name.includes('pizzaria') ||
    name.includes('churrascaria') || name.includes('burger') || name.includes('lanchonete') ||
    name.includes('pastelaria') || name.includes('espetinho')
  ) {
    return '11:00';
  }

  // 8. Padrão comercial geral (lojas, transportadoras, distribuidoras, escritórios)
  return '08:00';
}
