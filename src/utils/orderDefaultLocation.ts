import type { Place, LocationCoordinates } from '../types/map';
import type { DefaultOrderLocation } from '../services/settingsService';
import { getCustomerLocation } from './customerLocationUtils';
import type { Customer } from '../types/customer';

function validCoordinates(value?: LocationCoordinates): value is LocationCoordinates {
  return Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180 && (value.lat !== 0 || value.lng !== 0));
}

export function resolveOrderLocationsForSave(
  place: Place,
  customers: Customer[],
  defaultLocation?: DefaultOrderLocation | null
): Place {
  const updated = { ...place };
  const operation = place.operationType || 'coleta';
  const customer = getCustomerLocation(place, customers);
  const fallback = customer || (defaultLocation && validCoordinates(defaultLocation)
    ? {
        name: defaultLocation.name,
        address: defaultLocation.address || defaultLocation.name,
        coordinates: { lat: defaultLocation.lat, lng: defaultLocation.lng }
      }
    : null);

  if (operation === 'coleta') {
    updated.pickupName = place.name;
    updated.pickupAddress = place.address;
    updated.pickupCoordinates = place.coordinates;
  } else if (operation === 'entrega') {
    updated.deliveryName = place.name;
    updated.deliveryAddress = place.address;
    updated.deliveryCoordinates = place.coordinates;
  } else {
    updated.exchangeName = place.name;
    updated.exchangeAddress = place.address;
    updated.exchangeCoordinates = place.coordinates;
  }

  if (fallback && operation !== 'coleta' && !validCoordinates(updated.pickupCoordinates)) {
    updated.pickupName = fallback.name;
    updated.pickupAddress = fallback.address;
    updated.pickupCoordinates = fallback.coordinates;
  }
  if (customer && operation !== 'coleta' && !updated.pickupName &&
      updated.pickupCoordinates?.lat === customer.coordinates.lat &&
      updated.pickupCoordinates?.lng === customer.coordinates.lng) {
    updated.pickupName = customer.name;
    updated.pickupContact ||= customer.name;
  }
  if (fallback && operation !== 'entrega' && !validCoordinates(updated.deliveryCoordinates)) {
    updated.deliveryName = fallback.name;
    updated.deliveryAddress = fallback.address;
    updated.deliveryCoordinates = fallback.coordinates;
  }
  if (customer && operation !== 'entrega' && !updated.deliveryName &&
      updated.deliveryCoordinates?.lat === customer.coordinates.lat &&
      updated.deliveryCoordinates?.lng === customer.coordinates.lng) {
    updated.deliveryName = customer.name;
    updated.deliveryContact ||= customer.name;
  }
  return updated;
}
