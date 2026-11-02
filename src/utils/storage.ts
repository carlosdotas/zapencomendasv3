import { LocationCoordinates, OperationsFilterState, VehicleFilterType } from '../types/map';

const STORAGE_KEY_LOCATION = 'encomendaszap_last_location_gyn_v1';
const SESSION_KEY_LOCATION = 'encomendaszap_last_location_gyn_session_v1';
const STORAGE_KEY_OPERATIONS = 'encomendaszap_operations_filter_v1';
const STORAGE_KEY_VEHICLE = 'encomendaszap_vehicle_filter_v1';

export interface SavedMapState {
  coords: LocationCoordinates;
  zoom: number;
}

export const DEFAULT_COORDS: LocationCoordinates = {
  lat: -16.686891,
  lng: -49.264794 // Goiânia, Centro / Região Metropolitana
};

export const DEFAULT_ZOOM = 12;

/**
 * Retrieves the last saved map position and zoom from localStorage.
 */
export const getSavedLocation = (): SavedMapState => {
  for (const storage of [
    typeof localStorage !== 'undefined' ? localStorage : null,
    typeof sessionStorage !== 'undefined' ? sessionStorage : null
  ]) {
    if (!storage) continue;
    try {
      const raw = storage.getItem(STORAGE_KEY_LOCATION) || storage.getItem(SESSION_KEY_LOCATION);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.lat === 'number' &&
        typeof parsed.lng === 'number' &&
        !isNaN(parsed.lat) &&
        !isNaN(parsed.lng)
      ) {
        return {
          coords: { lat: parsed.lat, lng: parsed.lng },
          zoom: typeof parsed.zoom === 'number' && parsed.zoom >= 2 && parsed.zoom <= 19
            ? parsed.zoom
            : DEFAULT_ZOOM
        };
      }
    } catch {}
  }

  return {
    coords: DEFAULT_COORDS,
    zoom: DEFAULT_ZOOM
  };
};

/**
 * Persists the map location and zoom level to localStorage.
 */
export const saveLocationToStorage = (coords: LocationCoordinates, zoom: number): void => {
  try {
    if (
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      !isNaN(coords.lat) &&
      !isNaN(coords.lng)
    ) {
      localStorage.setItem(
        STORAGE_KEY_LOCATION,
        JSON.stringify({ lat: coords.lat, lng: coords.lng, zoom: Math.round(zoom * 10) / 10 })
      );
      return;
    }
  } catch {}

  try {
    if (
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      !isNaN(coords.lat) &&
      !isNaN(coords.lng)
    ) {
      sessionStorage.setItem(
        SESSION_KEY_LOCATION,
        JSON.stringify({ lat: coords.lat, lng: coords.lng, zoom: Math.round(zoom * 10) / 10 })
      );
    }
  } catch {
    // Keep map interaction working when both browser storage areas are full.
  }
};

/**
 * Retrieves the saved operations filter (coleta, entrega, troca) from localStorage.
 */
export const getSavedOperationsFilter = (): OperationsFilterState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPERATIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.coleta === 'boolean' &&
        typeof parsed.entrega === 'boolean' &&
        typeof parsed.troca === 'boolean'
      ) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Could not read operations filter from localStorage:', error);
  }

  // Padrão: todas ativas
  return {
    coleta: true,
    entrega: true,
    troca: true
  };
};

/**
 * Persists the operations filter (coleta, entrega, troca) to localStorage.
 */
export const saveOperationsFilterToStorage = (state: OperationsFilterState): void => {
  try {
    localStorage.setItem(STORAGE_KEY_OPERATIONS, JSON.stringify(state));
  } catch (error) {
    console.warn('Could not save operations filter to localStorage:', error);
  }
};

/**
 * Retrieves the saved vehicle filter from localStorage.
 */
export const getSavedVehicleFilter = (): VehicleFilterType => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VEHICLE);
    if (raw && ['todos', 'carro', 'moto', 'utilitario', 'nenhum'].includes(raw)) {
      return raw as VehicleFilterType;
    }
  } catch (error) {
    console.warn('Could not read vehicle filter from localStorage:', error);
  }
  return 'todos';
};

/**
 * Persists the vehicle filter to localStorage.
 */
export const saveVehicleFilterToStorage = (filter: VehicleFilterType): void => {
  try {
    localStorage.setItem(STORAGE_KEY_VEHICLE, filter);
  } catch (error) {
    console.warn('Could not save vehicle filter to localStorage:', error);
  }
};
