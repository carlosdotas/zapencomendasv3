import { Place, LocationCoordinates } from '../types/map';
import { Customer } from '../types/customer';

/**
 * Verifica se um local/place é um ponto aleatório/marcador genérico sem nome de estabelecimento comercial
 * (ex: "Local sem nome", "Pino inserido", "Dropped Pin", coordenadas, ou "Local de [Cliente]")
 */
export function isUnnamedOrGenericPlace(placeOrName: Place | string | null | undefined): boolean {
  if (!placeOrName) return true;
  const rawName = typeof placeOrName === 'string' ? placeOrName : (placeOrName.name || '');
  const cleanName = rawName.trim();
  if (!cleanName) return true;

  if (typeof placeOrName !== 'string') {
    if (placeOrName.category === 'Local sem nome') return true;
    if (placeOrName.isUnnamed) return true;
  }

  // Coordenadas puras (ex: "-16.6869, -49.2648")
  if (/^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(cleanName)) return true;

  // Plus codes do Google Maps
  if (/^[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,4}/i.test(cleanName)) return true;

  // Nomes genéricos de pins/marcadores
  const genericPattern = /^(local sem nome|ponto no mapa|local marcado|pino inserido|marcador inserido|dropped pin|unnamed location|localizando endereço\.\.\.|localização marcada|marcador|pino|ponto de coleta|ponto de entrega|ponto de troca|local|endereço)$/i;
  if (genericPattern.test(cleanName)) return true;

  // Já é um "Local de ..."
  if (cleanName.toLowerCase().startsWith('local de ')) return true;

  return false;
}

/**
 * Retorna o nome formatado do local do cliente: "Local de [Nome do Cliente]"
 */
export function getCustomerPlaceName(customerName: string): string {
  const trimmed = (customerName || '').trim();
  if (!trimmed) return 'Local do Cliente';
  return `Local de ${trimmed}`;
}

let lastCustomersRef: Customer[] | null = null;
let cachedById = new Map<string, Customer>();
let cachedByPhone = new Map<string, Customer>();
let cachedByName = new Map<string, Customer>();

function ensureCustomerIndex(customers: Customer[]): void {
  if (lastCustomersRef === customers && cachedById.size > 0) return;
  lastCustomersRef = customers;
  cachedById = new Map<string, Customer>();
  cachedByPhone = new Map<string, Customer>();
  cachedByName = new Map<string, Customer>();

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    if (c.id) cachedById.set(c.id, c);
    if (c.phone) {
      const cleanPhone = c.phone.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        cachedByPhone.set(cleanPhone, c);
        cachedByPhone.set(cleanPhone.slice(-8), c);
      }
    }
    if (c.fullName) {
      cachedByName.set(c.fullName.toLowerCase().trim(), c);
    }
  }
}

/**
 * Localiza o registro completo do cliente vinculado a um pedido/lugar em O(1)
 */
export function getCustomerForPlace(place: Place | null | undefined, customers: Customer[] = []): Customer | null {
  if (!place) return null;
  if (!customers || customers.length === 0) return null;

  ensureCustomerIndex(customers);

  // 1. Busca por ID direto do cliente
  if (place.customerId) {
    const found = cachedById.get(place.customerId);
    if (found) return found;
  }

  // 2. Busca por telefone (normalizado apenas dígitos)
  if (place.customerPhone) {
    const cleanPhone = place.customerPhone.replace(/\D/g, '');
    if (cleanPhone.length >= 8) {
      const found = cachedByPhone.get(cleanPhone) || cachedByPhone.get(cleanPhone.slice(-8));
      if (found) return found;
    }
  }

  // 3. Busca por nome completo (case-insensitive trimmed)
  if (place.customerName) {
    const cleanName = place.customerName.toLowerCase().trim();
    if (cleanName.length > 1) {
      const found = cachedByName.get(cleanName);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Verifica se um objeto Customer (ou dados de cliente) possui localização/coordenadas válidas cadastradas
 */
export function hasCustomerLocation(customer: Partial<Customer> | null | undefined): boolean {
  if (!customer) return false;
  if (
    customer.coordinates &&
    typeof customer.coordinates.lat === 'number' &&
    typeof customer.coordinates.lng === 'number' &&
    !isNaN(customer.coordinates.lat) &&
    !isNaN(customer.coordinates.lng) &&
    (customer.coordinates.lat !== 0 || customer.coordinates.lng !== 0)
  ) {
    return true;
  }
  if (customer.additionalAddresses && customer.additionalAddresses.length > 0) {
    return customer.additionalAddresses.some(
      a =>
        a.coordinates &&
        typeof a.coordinates.lat === 'number' &&
        typeof a.coordinates.lng === 'number' &&
        !isNaN(a.coordinates.lat) &&
        !isNaN(a.coordinates.lng) &&
        (a.coordinates.lat !== 0 || a.coordinates.lng !== 0)
    );
  }
  return false;
}

/**
 * Verifica se o cliente de um pedido/lugar está sem localização cadastrada
 */
export function isCustomerMissingLocation(place: Place | null | undefined, customers: Customer[] = []): boolean {
  if (!place || !place.customerName || !place.customerName.trim()) {
    return false; // Não há cliente preenchido, logo não acusa falta de localização
  }

  // 1. Se o próprio pedido já tem coordenadas salvas do cliente
  if (
    place.customerCoordinates &&
    typeof place.customerCoordinates.lat === 'number' &&
    typeof place.customerCoordinates.lng === 'number' &&
    !isNaN(place.customerCoordinates.lat) &&
    !isNaN(place.customerCoordinates.lng) &&
    (place.customerCoordinates.lat !== 0 || place.customerCoordinates.lng !== 0)
  ) {
    return false;
  }

  // 2. Verifica se o cliente existe no cadastro e possui coordenadas válidas
  const customer = getCustomerForPlace(place, customers);
  if (customer && hasCustomerLocation(customer)) {
    return false;
  }

  // Cliente cadastrado ou informado no pedido porém sem coordenadas vinculadas
  return true;
}

/**
 * Obtém as coordenadas e o endereço válidos do cliente para um pedido
 */
export function getCustomerLocation(
  place: Place | null | undefined, 
  customers: Customer[] = []
): { coordinates: LocationCoordinates; address: string; name: string } | null {
  if (!place) return null;

  // 1. Verifica coordenadas diretas no objeto place
  if (
    place.customerCoordinates &&
    typeof place.customerCoordinates.lat === 'number' &&
    typeof place.customerCoordinates.lng === 'number' &&
    !isNaN(place.customerCoordinates.lat) &&
    !isNaN(place.customerCoordinates.lng) &&
    (place.customerCoordinates.lat !== 0 || place.customerCoordinates.lng !== 0)
  ) {
    return {
      coordinates: place.customerCoordinates,
      address: place.customerAddress || place.address || '',
      name: place.customerName || place.defaultLocationName || 'Cliente'
    };
  }

  // 2. Busca o registro do cliente na lista
  const customer = getCustomerForPlace(place, customers);
  if (
    customer?.coordinates &&
    typeof customer.coordinates.lat === 'number' &&
    typeof customer.coordinates.lng === 'number' &&
    !isNaN(customer.coordinates.lat) &&
    !isNaN(customer.coordinates.lng) &&
    (customer.coordinates.lat !== 0 || customer.coordinates.lng !== 0)
  ) {
    return {
      coordinates: customer.coordinates,
      address: customer.address || '',
      name: customer.fullName || 'Cliente'
    };
  }

  if (
    customer?.additionalAddresses &&
    customer.additionalAddresses.length > 0
  ) {
    const validAdd = customer.additionalAddresses.find(
      a =>
        a.coordinates &&
        typeof a.coordinates.lat === 'number' &&
        typeof a.coordinates.lng === 'number' &&
        !isNaN(a.coordinates.lat) &&
        !isNaN(a.coordinates.lng) &&
        (a.coordinates.lat !== 0 || a.coordinates.lng !== 0)
    );
    if (validAdd && validAdd.coordinates) {
      return {
        coordinates: validAdd.coordinates,
        address: validAdd.address || customer.address || '',
        name: customer.fullName || 'Cliente'
      };
    }
  }

  return null;
}

export interface OrderResolvedLocations {
  op: 'coleta' | 'entrega' | 'troca';
  canTraceRoute: boolean;
  waypoints: LocationCoordinates[];
  summaryOriginName: string;
  summaryOriginAddress: string;
  summaryDestName: string;
  summaryDestAddress: string;
  exchangeName?: string;
  exchangeAddress?: string;
  pickupAddress: string;
  pickupCoordinates: LocationCoordinates;
  deliveryAddress: string;
  deliveryCoordinates: LocationCoordinates;
  exchangeCoordinates?: LocationCoordinates;
}

/**
 * Regra EncomendasZap:
 * - Coleta: o local de entrega é do cliente (Origem: Local do mapa -> Destino: Cliente)
 * - Entrega: o local de coleta é do cliente (Origem: Cliente -> Destino: Local do mapa)
 * - Troca: Coleta no cliente -> Troca no local de troca -> Entrega no cliente
 * 
 * Se o cliente NÃO tiver local:
 * - canTraceRoute = false
 * - waypoints = [] (não traça rota)
 */
export function getOrderLocationsForOperation(
  place: Place,
  op: 'coleta' | 'entrega' | 'troca',
  customers: Customer[] = []
): OrderResolvedLocations {
  const custLoc = getCustomerLocation(place, customers);
  const placeCoords = place.coordinates;
  const placeName = place.name || 'Local Selecionado';
  const placeAddress = place.address || '';

  if (!custLoc) {
    return {
      op,
      canTraceRoute: false,
      waypoints: [],
      summaryOriginName: op === 'coleta' ? placeName : (place.customerName || 'Cliente'),
      summaryOriginAddress: op === 'coleta' ? placeAddress : 'Endereço não cadastrado',
      summaryDestName: op === 'coleta' ? (place.customerName || 'Cliente') : placeName,
      summaryDestAddress: op === 'coleta' ? 'Endereço não cadastrado' : placeAddress,
      pickupAddress: op === 'coleta' ? placeAddress : '',
      pickupCoordinates: placeCoords,
      deliveryAddress: op === 'coleta' ? '' : placeAddress,
      deliveryCoordinates: placeCoords
    };
  }

  const custName = custLoc.name;
  const custAddress = custLoc.address;
  const custCoords = custLoc.coordinates;

  if (op === 'coleta') {
    // Coleta: o local de entrega é do cliente
    return {
      op: 'coleta',
      canTraceRoute: true,
      waypoints: [placeCoords, custCoords],
      summaryOriginName: placeName,
      summaryOriginAddress: placeAddress,
      summaryDestName: custName,
      summaryDestAddress: custAddress,
      pickupAddress: placeAddress,
      pickupCoordinates: placeCoords,
      deliveryAddress: custAddress,
      deliveryCoordinates: custCoords
    };
  }

  if (op === 'entrega') {
    // Entrega: o local de coleta é do cliente
    return {
      op: 'entrega',
      canTraceRoute: true,
      waypoints: [custCoords, placeCoords],
      summaryOriginName: custName,
      summaryOriginAddress: custAddress,
      summaryDestName: placeName,
      summaryDestAddress: placeAddress,
      pickupAddress: custAddress,
      pickupCoordinates: custCoords,
      deliveryAddress: placeAddress,
      deliveryCoordinates: placeCoords
    };
  }

  // Troca: coleta no cliente, troca no local de troca, entrega no cliente
  return {
    op: 'troca',
    canTraceRoute: true,
    waypoints: [custCoords, placeCoords, custCoords],
    summaryOriginName: `${custName} (Coleta)`,
    summaryOriginAddress: custAddress,
    exchangeName: `${placeName} (Troca)`,
    exchangeAddress: placeAddress,
    summaryDestName: `${custName} (Entrega Retorno)`,
    summaryDestAddress: custAddress,
    pickupAddress: custAddress,
    pickupCoordinates: custCoords,
    exchangeCoordinates: placeCoords,
    deliveryAddress: custAddress,
    deliveryCoordinates: custCoords
  };
}
