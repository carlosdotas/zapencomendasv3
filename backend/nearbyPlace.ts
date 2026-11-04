import { calculateDistanceMeters } from '../src/utils/placeUtils';

interface NearbyPlace {
  name?: string;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
  vicinity?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: { open_now?: boolean };
  place_id?: string;
  photos?: { photo_reference?: string }[];
}

export function findNearbyNamedPlace<T extends NearbyPlace>(
  candidates: T[],
  coordinates: { lat: number; lng: number },
  maxDistanceMeters: number
): T | undefined {
  return candidates.find(candidate => {
    const location = candidate.geometry?.location;
    return Boolean(
      candidate.name?.trim() &&
      candidate.types?.some(type => ['establishment', 'point_of_interest', 'store', 'shopping_mall', 'restaurant', 'pharmacy'].includes(type)) &&
      typeof location?.lat === 'number' && typeof location.lng === 'number' &&
      Number.isFinite(location.lat) && Number.isFinite(location.lng) &&
      calculateDistanceMeters(coordinates, { lat: location.lat, lng: location.lng }) <= maxDistanceMeters
    );
  });
}
