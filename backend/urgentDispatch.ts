export interface NearbyDriver {
  id: string;
  distanceKm: number;
}

export const URGENT_PICKUP_STAGES = ['novo', 'pendente', 'aprovado', 'a_caminho_da_coleta'] as const;

export function distanceInKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestAvailableDriver(
  candidates: NearbyDriver[],
  attemptedDriverIds: ReadonlySet<string>,
  radiusKm: number
): NearbyDriver | null {
  return candidates
    .filter(driver => !attemptedDriverIds.has(String(driver.id)) && driver.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}
