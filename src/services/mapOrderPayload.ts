import type { BackendPedido } from './apiTypes';
import type { LocationCoordinates, OperationType, Place } from '../types/map';

type RoutePoint = 'pickup' | 'exchange' | 'delivery';

const isValidCoordinates = (coordinates?: LocationCoordinates): coordinates is LocationCoordinates =>
  Boolean(
    coordinates &&
    Number.isFinite(coordinates.lat) &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180
  );

const toNumberOrUndefined = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function routePointCoordinates(
  place: Place,
  operation: OperationType,
  point: RoutePoint
): LocationCoordinates | undefined {
  const explicit = point === 'pickup'
    ? place.pickupCoordinates
    : point === 'exchange'
      ? place.exchangeCoordinates
      : place.deliveryCoordinates;

  if (isValidCoordinates(explicit)) return explicit;
  return operation === (point === 'pickup' ? 'coleta' : point === 'exchange' ? 'troca' : 'entrega') &&
    isValidCoordinates(place.coordinates)
    ? place.coordinates
    : undefined;
}

function routePointName(
  place: Place,
  operation: OperationType,
  point: RoutePoint,
  hasCoordinates: boolean
): string | undefined {
  const explicit = point === 'pickup'
    ? place.pickupName
    : point === 'exchange'
      ? place.exchangeName
      : place.deliveryName;
  const pointOperation = point === 'pickup' ? 'coleta' : point === 'exchange' ? 'troca' : 'entrega';
  const fallback = point === 'pickup' ? 'Ponto de Coleta' : point === 'exchange' ? 'Ponto de Troca' : 'Ponto de Entrega';

  if (operation === pointOperation) return explicit || place.name;
  return hasCoordinates ? explicit || fallback : undefined;
}

function routePointAddress(
  place: Place,
  operation: OperationType,
  point: RoutePoint,
  hasCoordinates: boolean
): string | undefined {
  const explicit = point === 'pickup'
    ? place.pickupAddress
    : point === 'exchange'
      ? place.exchangeAddress
      : place.deliveryAddress;
  const pointOperation = point === 'pickup' ? 'coleta' : point === 'exchange' ? 'troca' : 'entrega';

  if (operation === pointOperation) return explicit || place.address;
  return hasCoordinates ? explicit : undefined;
}

function parseDimensions(dimensions?: string): {
  length?: string;
  width?: string;
  height?: string;
} {
  if (!dimensions) return {};
  const [length, width, height] = dimensions.split('x').map(value => value.trim().replace(/cm$/i, '').trim());
  return {
    ...(length ? { length } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {})
  };
}

function sumPriceItems(place: Place, category: 'coleta' | 'transporte' | 'entrega'): number | undefined {
  const matching = place.priceItems?.filter(item => item.category === category) || [];
  if (!matching.length) return undefined;
  return matching.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
}

/**
 * Builds the canonical request body used for every new order created from the map.
 * Route-only values remain in the order JSON metadata while values with database
 * columns are sent through their canonical API names.
 */
export function buildMapOrderPayload(place: Place): Partial<BackendPedido> {
  const operation = place.operationType || 'coleta';
  const pickupCoordinates = routePointCoordinates(place, operation, 'pickup');
  const exchangeCoordinates = routePointCoordinates(place, operation, 'exchange');
  const deliveryCoordinates = routePointCoordinates(place, operation, 'delivery');
  const dimensions = parseDimensions(place.dimensions);
  const total = toNumberOrUndefined(place.price);
  const discount = toNumberOrUndefined(place.totalDiscounts) || 0;
  const details = place.observations?.trim() || place.driverNotes?.trim() || '';

  return {
    data: place.data || place.scheduledDate,
    etapa: 'pendente',
    cliente: place.customerName?.trim() || '',
    phone: place.customerPhone || '',
    clientes_id: place.customerId && /^\d+$/.test(place.customerId) ? Number(place.customerId) : undefined,
    cidade: place.originCity || 'Goiânia',
    tipo_encomenda: operation,
    tipo_veiculo: place.vehicleType || 'moto',
    detalhes: details,
    valor: total === undefined ? undefined : total + discount,
    desconto: discount,
    total,
    coleta_valor: sumPriceItems(place, 'coleta'),
    valor_intercidade: sumPriceItems(place, 'transporte'),
    entrega_valor: sumPriceItems(place, 'entrega'),
    mercadoria_nome: place.packageType,
    mercadoria_altura: dimensions.height,
    mercadoria_largura: dimensions.width,
    mercadoria_comprimento: dimensions.length,
    mercadoria_peso: place.weightKg,
    mercadoria_fragil: place.isFragile,
    mercadoria_quantidade: place.volumesCount,
    itens_extras: JSON.stringify({
      schemaVersion: 1,
      source: 'map',
      priceItems: place.priceItems || [],
      discountItems: place.discountItems || [],
      orderVisibility: place.orderVisibility,
      assignedDriverId: place.assignedDriverId,
      assignedDriverPhone: place.assignedDriverPhone,
      pickupVisibility: place.pickupVisibility,
      pickupAssignedDriverId: place.pickupAssignedDriverId,
      pickupAssignedDriverPhone: place.pickupAssignedDriverPhone,
      pickupAssignedDriverName: place.pickupAssignedDriverName,
      pickupSellerName: place.pickupSellerName,
      pickupSellerPhone: place.pickupSellerPhone,
      exchangeVisibility: place.exchangeVisibility,
      exchangeAssignedDriverId: place.exchangeAssignedDriverId,
      exchangeAssignedDriverPhone: place.exchangeAssignedDriverPhone,
      exchangeAssignedDriverName: place.exchangeAssignedDriverName,
      exchangeSellerName: place.exchangeSellerName,
      exchangeSellerPhone: place.exchangeSellerPhone,
      deliveryVisibility: place.deliveryVisibility,
      deliveryAssignedDriverId: place.deliveryAssignedDriverId,
      deliveryAssignedDriverPhone: place.deliveryAssignedDriverPhone,
      deliveryAssignedDriverName: place.deliveryAssignedDriverName,
      deliverySellerName: place.deliverySellerName,
      deliverySellerPhone: place.deliverySellerPhone,
      packageSize: place.packageSize,
      volumesCount: place.volumesCount,
      scheduledTime: place.scheduledTime,
      scheduledTimeMode: place.scheduledTimeMode,
      paymentCondition: place.paymentCondition,
      paymentAdjustmentType: place.paymentAdjustmentType,
      paymentAdjustmentValue: place.paymentAdjustmentValue,
      paymentAdjustmentMode: place.paymentAdjustmentMode
    }),
    local: place.name,
    coleta_foto: place.pickupPhotos?.length ? JSON.stringify(place.pickupPhotos) : undefined,
    entrega_foto: place.deliveryPhotos?.length ? JSON.stringify(place.deliveryPhotos) : undefined,
    coleta_local: routePointName(place, operation, 'pickup', Boolean(pickupCoordinates)),
    coleta_nome: routePointName(place, operation, 'pickup', Boolean(pickupCoordinates)),
    coleta_data: place.data || place.scheduledDate,
    coleta_cidade: place.originCity,
    coleta_endereco: routePointAddress(place, operation, 'pickup', Boolean(pickupCoordinates)),
    coleta_lat: pickupCoordinates?.lat,
    coleta_lng: pickupCoordinates?.lng,
    coleta_contato: place.pickupContact,
    coleta_phone: place.pickupPhone,
    coleta_obs: place.pickupNotes || '',
    entrega_local: routePointName(place, operation, 'delivery', Boolean(deliveryCoordinates)),
    entrega_nome: routePointName(place, operation, 'delivery', Boolean(deliveryCoordinates)),
    entrega_data: place.data || place.scheduledDate,
    entrega_cidade: place.destinationCity,
    entrega_endereco: routePointAddress(place, operation, 'delivery', Boolean(deliveryCoordinates)),
    entrega_lat: deliveryCoordinates?.lat,
    entrega_lng: deliveryCoordinates?.lng,
    entrega_contato: place.deliveryContact,
    entrega_phone: place.deliveryPhone,
    entrega_obs: place.deliveryNotes || '',
    troca_nome: routePointName(place, operation, 'exchange', Boolean(exchangeCoordinates)),
    troca_endereco: routePointAddress(place, operation, 'exchange', Boolean(exchangeCoordinates)),
    troca_lat: exchangeCoordinates?.lat,
    troca_lng: exchangeCoordinates?.lng,
    troca_contato: place.exchangeContact,
    troca_phone: place.exchangePhone,
    troca_obs: place.exchangeNotes || ''
  };
}
