import { LocationCoordinates, Place } from '../types/map';
import { normalizeCityName } from '../services/cityService';

export interface CityReference {
  key: string;
  name: string;
  center: { lat: number; lng: number };
  maxRadiusKm: number;
  aliases: string[];
}

export const KNOWN_CITIES: CityReference[] = [
  {
    key: 'anapolis',
    name: 'Anápolis',
    center: { lat: -16.3285, lng: -48.9534 },
    maxRadiusKm: 28,
    aliases: ['anapolis', 'anapolis go', 'anapolis-go']
  },
  {
    key: 'goiania',
    name: 'Goiânia',
    center: { lat: -16.6869, lng: -49.2648 },
    maxRadiusKm: 35,
    aliases: ['goiania', 'aparecida de goiania', 'senador canedo', 'trindade', 'goianira', 'goiania go', 'goiania-go']
  },
  {
    key: 'brasilia',
    name: 'Brasília',
    center: { lat: -15.7975, lng: -47.8919 },
    maxRadiusKm: 45,
    aliases: ['brasilia', 'taguatinga', 'ceilandia', 'aguas claras', 'brasilia df']
  }
];

/**
 * Distância Haversine em km entre dois pontos geográficos.
 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Detecta a cidade a partir de coordenadas geográficas válidas.
 */
export function detectCityFromCoordinates(coords?: { lat: number; lng: number } | null): CityReference | null {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return null;
  if (isNaN(coords.lat) || isNaN(coords.lng) || (coords.lat === 0 && coords.lng === 0)) return null;

  // 1. Checa raio direto para cidades conhecidas
  for (const city of KNOWN_CITIES) {
    const dist = getDistanceKm(coords.lat, coords.lng, city.center.lat, city.center.lng);
    if (dist <= city.maxRadiusKm) {
      return city;
    }
  }

  // 2. Se estiver fora dos raios estritos, escolhe a cidade mais próxima
  let closest: CityReference = KNOWN_CITIES[1]; // default Goiânia
  let minDistance = Infinity;
  for (const city of KNOWN_CITIES) {
    const dist = getDistanceKm(coords.lat, coords.lng, city.center.lat, city.center.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = city;
    }
  }
  return closest;
}

/**
 * Retorna o nome canônico da cidade atual do motorista (ex: "Goiânia" ou "Anápolis").
 * Prioriza o GPS em tempo real; se indisponível, usa o perfil do usuário ou padrão "Goiânia".
 */
export function getDriverCurrentCity(
  coords?: LocationCoordinates | { lat: number; lng: number } | null,
  userProfile?: { city?: string | null; cidade?: string | null } | null
): string {
  // 1. Tenta coordenadas do GPS do motorista
  const detectedByGps = detectCityFromCoordinates(coords);
  if (detectedByGps) {
    return detectedByGps.name;
  }

  // 2. Tenta perfil do motorista
  const userCityRaw = (userProfile?.city || userProfile?.cidade || '').trim();
  if (userCityRaw) {
    const norm = normalizeCityName(userCityRaw);
    const matched = KNOWN_CITIES.find(c => c.aliases.includes(norm) || norm.includes(c.key));
    if (matched) return matched.name;
    return userCityRaw.split('-')[0].trim();
  }

  // 3. Fallback padrão da central
  return 'Goiânia';
}

/**
 * Normaliza o nome da cidade para comparação flexível.
 */
export function getCityKey(cityName?: string | null): string {
  if (!cityName) return 'goiania';
  const norm = normalizeCityName(cityName);
  const matched = KNOWN_CITIES.find(c => c.aliases.includes(norm) || norm.includes(c.key));
  return matched ? matched.key : norm;
}

/**
 * Verifica se uma encomenda/maker pertence à cidade especificada (ex: "Goiânia" ou "Anápolis").
 */
export function isPlaceInCity(place: Place, targetCityName: string): boolean {
  const targetKey = getCityKey(targetCityName);

  // 1. Verifica campos explícitos de cidade da encomenda
  const placeCityCandidates: (string | undefined)[] = [
    place.operationType === 'entrega' ? place.destinationCity : place.originCity,
    place.operationType === 'coleta' ? place.originCity : place.destinationCity,
    place.destinationCity,
    place.originCity
  ];

  for (const candidate of placeCityCandidates) {
    if (candidate) {
      const candidateKey = getCityKey(candidate);
      if (candidateKey === targetKey) {
        return true;
      }
    }
  }

  // 2. Verifica se o endereço textual contém explicitamente a cidade
  const addressText = (place.address || '').toLowerCase();
  if (targetKey === 'anapolis' && (addressText.includes('anapolis') || addressText.includes('anápolis'))) {
    return true;
  }
  if (targetKey === 'goiania' && (addressText.includes('goiania') || addressText.includes('goiânia') || addressText.includes('aparecida'))) {
    return true;
  }

  // 3. Se não tiver cidade declarada no texto, analisa a coordenada geográfica do ponto
  if (place.coordinates && typeof place.coordinates.lat === 'number' && typeof place.coordinates.lng === 'number') {
    const detected = detectCityFromCoordinates(place.coordinates);
    if (detected && detected.key === targetKey) {
      return true;
    }
  }

  return false;
}

/**
 * Filtra a lista de encomendas/makers para manter apenas as da cidade do motorista.
 */
export function filterPlacesByDriverCity(places: Place[], driverCityName: string): Place[] {
  return places.filter(p => isPlaceInCity(p, driverCityName));
}
