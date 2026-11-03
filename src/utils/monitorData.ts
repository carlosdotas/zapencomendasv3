import type { Driver, Place } from '../types/map';
import { normalizeCityName } from '../services/cityService';

const DRIVER_CITY_MAX_DISTANCE_KM = 30;

export interface MonitorCityOption {
  key: string;
  label: string;
}

function hasCoordinates(point?: { lat: number; lng: number } | null): point is { lat: number; lng: number } {
  return Boolean(point) && Number.isFinite(point!.lat) && Number.isFinite(point!.lng) && (point!.lat !== 0 || point!.lng !== 0);
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// A cidade do ponto segue a etapa exibida: coleta/troca usam a origem; entrega usa o destino.
export function getPlaceCity(place: Place): { key: string; label: string } | null {
  const isDelivery = (place.operationType || 'entrega') === 'entrega';
  const raw = (isDelivery
    ? place.destinationCity || place.originCity
    : place.originCity || place.destinationCity) || '';
  const key = normalizeCityName(raw);
  if (!key) return null;
  return { key, label: raw.trim() };
}

export function getMonitorPlaces(places: Place[]): Place[] {
  return places.filter(place =>
    hasCoordinates(place.coordinates) &&
    place.orderStage !== 'concluido' &&
    (place.operationType as string) !== 'concluido'
  );
}

export function getMonitorCities(places: Place[]): MonitorCityOption[] {
  const cities = new Map<string, string>();
  places.forEach(place => {
    const city = getPlaceCity(place);
    if (city && !cities.has(city.key)) cities.set(city.key, city.label);
  });
  return Array.from(cities, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

// selected === null significa "todas as cidades".
export function filterPlacesByCities(places: Place[], selected: string[] | null): Place[] {
  if (selected === null) return places;
  const allowed = new Set(selected);
  return places.filter(place => {
    const city = getPlaceCity(place);
    return Boolean(city) && allowed.has(city!.key);
  });
}

// Motoristas não têm cidade cadastrada: pertencem à cidade cujo centro de pedidos está mais próximo.
export function filterDriversByCities(drivers: Driver[], places: Place[], selected: string[] | null): Driver[] {
  const withPosition = drivers.filter(driver => hasCoordinates(driver.coordinates));
  if (selected === null) return withPosition;

  const sums = new Map<string, { lat: number; lng: number; count: number }>();
  places.forEach(place => {
    const city = getPlaceCity(place);
    if (!city) return;
    const sum = sums.get(city.key) || { lat: 0, lng: 0, count: 0 };
    sum.lat += place.coordinates.lat;
    sum.lng += place.coordinates.lng;
    sum.count += 1;
    sums.set(city.key, sum);
  });
  const centers = Array.from(sums, ([key, sum]) => ({ key, lat: sum.lat / sum.count, lng: sum.lng / sum.count }));
  const allowed = new Set(selected);

  return withPosition.filter(driver => {
    let best: { key: string; distance: number } | null = null;
    centers.forEach(center => {
      const distance = distanceKm(driver.coordinates, center);
      if (!best || distance < best.distance) best = { key: center.key, distance };
    });
    return Boolean(best) && best!.distance <= DRIVER_CITY_MAX_DISTANCE_KM && allowed.has(best!.key);
  });
}
