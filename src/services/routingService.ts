import { LocationCoordinates } from '../types/map';

export interface RouteResult {
  coordinates: LocationCoordinates[];
  distanceKm: number;
  durationMin: number;
}

interface RouteCacheItem {
  timestamp: number;
  data: RouteResult;
}

const ROUTE_CACHE_KEY = 'encomendaszap_route_cache_v2';
const ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const routeMemoryCache = new Map<string, RouteCacheItem>();

// Carrega rotas já cacheadas na sessão/localStorage
try {
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    const raw = sessionStorage.getItem(ROUTE_CACHE_KEY);
    if (raw) {
      const parsed: Record<string, RouteCacheItem> = JSON.parse(raw);
      const now = Date.now();
      Object.entries(parsed).forEach(([k, v]) => {
        if (now - v.timestamp < ROUTE_CACHE_TTL_MS) {
          routeMemoryCache.set(k, v);
        }
      });
    }
  }
} catch {}

function persistRouteCache() {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const obj = Object.fromEntries(routeMemoryCache);
    sessionStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

function getRouteKey(start: LocationCoordinates, end: LocationCoordinates): string {
  return `${start.lat.toFixed(4)},${start.lng.toFixed(4)}->${end.lat.toFixed(4)},${end.lng.toFixed(4)}`;
}

/**
 * Decodifica a string codificada do Google Maps Directions API (overview_polyline)
 * em uma lista precisa de pontos de coordenadas (lat, lng) pelas vias reais.
 */
export function decodeGooglePolyline(encoded: string): LocationCoordinates[] {
  const points: LocationCoordinates[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5
    });
  }

  return points;
}

export async function fetchRoute(
  start: LocationCoordinates,
  end: LocationCoordinates
): Promise<RouteResult | null> {
  // 0. Verifica se a rota já foi calculada e está em cache
  const cacheKey = getRouteKey(start, end);
  const cached = routeMemoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < ROUTE_CACHE_TTL_MS)) {
    console.log(`[Cache HIT - Route] Rota ${cacheKey} recuperada do cache.`);
    return cached.data;
  }

  // 1. Tenta o sistema de rotas do Google Maps (Google Directions API via backend proxy com cache)
  try {
    const originParam = `${start.lat},${start.lng}`;
    const destParam = `${end.lat},${end.lng}`;
    const googleRes = await fetch(`/api/google/directions?origin=${originParam}&destination=${destParam}`, {
      signal: AbortSignal.timeout(2500)
    });

    if (googleRes.ok) {
      const gData = await googleRes.json();
      if (gData.success && gData.data && gData.data.encodedPolyline) {
        const decodedPoints = decodeGooglePolyline(gData.data.encodedPolyline);
        if (decodedPoints.length > 0) {
          const result: RouteResult = {
            coordinates: decodedPoints,
            distanceKm: gData.data.distanceKm || calculateCrowDistance(start, end),
            durationMin: gData.data.durationMin || 15
          };

          routeMemoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
          persistRouteCache();
          return result;
        }
      }
    }
  } catch (e) {
    console.warn('[Routing Service] Falha ao consultar rotas do Google Maps, tentando fallback:', e);
  }

  // 2. Fallback secundário (OSRM)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coords: LocationCoordinates[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );

    const result: RouteResult = {
      coordinates: coords,
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.round(route.duration / 60))
    };

    routeMemoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
    persistRouteCache();

    return result;
  } catch (err) {
    console.warn('Could not fetch online street route, fallback to line:', err);
    const fallbackResult: RouteResult = {
      coordinates: [start, end],
      distanceKm: calculateCrowDistance(start, end),
      durationMin: Math.max(1, Math.round(calculateCrowDistance(start, end) * 2))
    };

    routeMemoryCache.set(cacheKey, { timestamp: Date.now(), data: fallbackResult });
    persistRouteCache();

    return fallbackResult;
  }
}

/**
 * Calcula a rota percorrendo múltiplos pontos sequenciais (ex: Troca: Cliente -> Local -> Cliente)
 */
export async function fetchMultiStopRoute(
  waypoints: LocationCoordinates[]
): Promise<RouteResult | null> {
  const validPoints = waypoints.filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng));
  if (validPoints.length < 2) return null;
  if (validPoints.length === 2) {
    return fetchRoute(validPoints[0], validPoints[1]);
  }

  const allCoords: LocationCoordinates[] = [];
  let totalDistKm = 0;
  let totalDurMin = 0;

  for (let i = 0; i < validPoints.length - 1; i++) {
    const leg = await fetchRoute(validPoints[i], validPoints[i + 1]);
    if (leg && leg.coordinates.length > 0) {
      if (i > 0 && allCoords.length > 0) {
        allCoords.push(...leg.coordinates.slice(1));
      } else {
        allCoords.push(...leg.coordinates);
      }
      totalDistKm += leg.distanceKm;
      totalDurMin += leg.durationMin;
    } else {
      allCoords.push(validPoints[i], validPoints[i + 1]);
      const crowDist = calculateCrowDistance(validPoints[i], validPoints[i + 1]);
      totalDistKm += crowDist;
      totalDurMin += Math.max(1, Math.round(crowDist * 2));
    }
  }

  return {
    coordinates: allCoords,
    distanceKm: Math.round(totalDistKm * 10) / 10,
    durationMin: Math.max(1, Math.round(totalDurMin))
  };
}

function calculateCrowDistance(c1: LocationCoordinates, c2: LocationCoordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLon = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
