import { Place, LocationCoordinates } from '../types/map';
import { getCustomerPlaceName, isUnnamedOrGenericPlace } from '../utils/customerLocationUtils';
import { calculateDistanceMeters, isStreetOrAddress, resolveCommercialClosingTime } from '../utils/placeUtils';
import { placeService } from './placeService';

export const GOOGLE_MAPS_API_KEY = 'AIzaSyATwFNGYw-Y0TGH3SrjwQelQD4EorVjlg4';

const GOOGLE_TYPE_MAP: Record<string, string> = {
  shopping_mall: 'Shopping Center',
  supermarket: 'Supermercado',
  grocery_or_supermarket: 'Supermercado',
  store: 'Loja Comercial',
  restaurant: 'Restaurante',
  food: 'Alimentação',
  bakery: 'Panificadora',
  pharmacy: 'Farmácia',
  hospital: 'Hospital',
  health: 'Saúde / Clínica',
  doctor: 'Consultório Médico',
  bank: 'Agência Bancária',
  finance: 'Financeiro',
  gas_station: 'Posto de Combustível',
  lodging: 'Hotel / Pousada',
  gym: 'Academia',
  school: 'Escola / Colégio',
  university: 'Universidade',
  church: 'Igreja / Templo',
  place_of_worship: 'Igreja',
  bus_station: 'Terminal Rodoviário',
  transit_station: 'Terminal de Ônibus',
  airport: 'Aeroporto',
  bar: 'Bar / Conveniência',
  cafe: 'Café / Lanchonete',
  car_repair: 'Oficina Mecânica',
  car_dealer: 'Concessionária',
  parking: 'Estacionamento',
  post_office: 'Correios',
  police: 'Polícia / Segurança',
  local_government_office: 'Órgão Público',
  street_address: 'Endereço',
  premise: 'Imóvel / Prédio',
  subpremise: 'Edifício / Apartamento',
  route: 'Rua / Avenida',
  intersection: 'Cruzamento',
  neighborhood: 'Bairro',
  sublocality: 'Bairro / Setor',
  locality: 'Cidade',
  point_of_interest: 'Ponto Comercial',
  establishment: 'Ponto de Interesse'
};

// =========================================================================
// CACHE MULTINÍVEL DE CLIENTE (MEMÓRIA + LOCALSTORAGE COM TTL)
// Economiza chamadas de API, evita consumo de cota e fornece resposta em 0ms
// =========================================================================

interface ClientCacheEntry<T> {
  timestamp: number;
  data: T;
}

const SEARCH_CACHE_KEY = 'encomendaszap_places_search_cache_v2';
const LINK_CACHE_KEY = 'encomendaszap_link_cache_v2';
const REVERSE_CACHE_KEY = 'encomendaszap_reverse_cache_v2';

const CLIENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias de validade
const MAX_SEARCH_CACHE_ENTRIES = 250; // Limite de entradas no localStorage

const searchMemoryCache = new Map<string, ClientCacheEntry<Place[]>>();
const linkMemoryCache = new Map<string, ClientCacheEntry<Place>>();
const reverseMemoryCache = new Map<string, ClientCacheEntry<Place>>();

// Inicializa o cache a partir do localStorage
function initClientCache() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const rawSearch = localStorage.getItem(SEARCH_CACHE_KEY);
    if (rawSearch) {
      const parsed: Record<string, ClientCacheEntry<Place[]>> = JSON.parse(rawSearch);
      const now = Date.now();
      Object.entries(parsed).forEach(([k, v]) => {
        if (now - v.timestamp < CLIENT_CACHE_TTL_MS) {
          searchMemoryCache.set(k, v);
        }
      });
    }

    const rawLinks = localStorage.getItem(LINK_CACHE_KEY);
    if (rawLinks) {
      const parsed: Record<string, ClientCacheEntry<Place>> = JSON.parse(rawLinks);
      const now = Date.now();
      Object.entries(parsed).forEach(([k, v]) => {
        if (now - v.timestamp < CLIENT_CACHE_TTL_MS) {
          linkMemoryCache.set(k, v);
        }
      });
    }

    const rawRev = localStorage.getItem(REVERSE_CACHE_KEY);
    if (rawRev) {
      const parsed: Record<string, ClientCacheEntry<Place>> = JSON.parse(rawRev);
      const now = Date.now();
      Object.entries(parsed).forEach(([k, v]) => {
        if (now - v.timestamp < CLIENT_CACHE_TTL_MS) {
          reverseMemoryCache.set(k, v);
        }
      });
    }
  } catch (e) {
    console.warn('[Geocoding Cache] Falha ao inicializar cache do cliente:', e);
  }
}

initClientCache();

function persistSearchCache() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const entries = Array.from(searchMemoryCache.entries());
    if (entries.length > MAX_SEARCH_CACHE_ENTRIES) {
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const trimmed = entries.slice(0, MAX_SEARCH_CACHE_ENTRIES);
      searchMemoryCache.clear();
      trimmed.forEach(([k, v]) => searchMemoryCache.set(k, v));
    }
    const obj = Object.fromEntries(searchMemoryCache);
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

function persistLinkCache() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const obj = Object.fromEntries(linkMemoryCache);
    localStorage.setItem(LINK_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

function persistReverseCache() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const obj = Object.fromEntries(reverseMemoryCache);
    localStorage.setItem(REVERSE_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

export function normalizeQueryKey(q: string): string {
  return q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getGeocodingCacheStats() {
  return {
    searchesCached: searchMemoryCache.size,
    linksCached: linkMemoryCache.size,
    reverseCached: reverseMemoryCache.size
  };
}

export function clearGeocodingCache() {
  searchMemoryCache.clear();
  linkMemoryCache.clear();
  reverseMemoryCache.clear();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SEARCH_CACHE_KEY);
    localStorage.removeItem(LINK_CACHE_KEY);
    localStorage.removeItem(REVERSE_CACHE_KEY);
  }
}

/**
 * Verifica se o texto inserido é ou contém um link do Google Maps ou coordenadas
 */
export function isGoogleMapsUrl(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase();
  return (
    lower.includes('maps.app.goo.gl') ||
    lower.includes('goo.gl/maps') ||
    lower.includes('google.com/maps') ||
    lower.includes('maps.google.') ||
    lower.includes('google.com.br/maps') ||
    (lower.startsWith('http') && (lower.includes('maps') || lower.includes('goo.gl')))
  );
}

/**
 * Converte e resolve links do Google Maps (encurtados ou completos) e extrai os dados do local.
 * Se for um local sem nome comercial (dropped pin, marcador inserido, etc.), retorna como "Local de [Cliente]" (se informado) ou "Local sem nome" e pega as coordenadas.
 * Usa cache de alta velocidade para economizar requisições de rede.
 */
export async function resolveGoogleMapsUrl(input: string, customerName?: string): Promise<Place | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const cacheKey = `${trimmed}_${customerName?.trim() || ''}`;

  // 0. Verifica cache local do cliente primeiro
  const cached = linkMemoryCache.get(cacheKey) || linkMemoryCache.get(trimmed);
  if (cached && (Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS)) {
    if (customerName && isUnnamedOrGenericPlace(cached.data)) {
      const custPlaceName = getCustomerPlaceName(customerName);
      return {
        ...cached.data,
        name: custPlaceName,
        customerName: customerName.trim()
      };
    }
    console.log(`[Cache HIT - Frontend Link] "${trimmed}" retornado do cache local.`);
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const custParam = customerName ? `&customerName=${encodeURIComponent(customerName.trim())}` : '';
    const res = await fetch(`${baseUrl}/api/google/resolve-link?url=${encodeURIComponent(trimmed)}${custParam}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.coordinates) {
        const isUnnamed = Boolean(data.isUnnamed || isUnnamedOrGenericPlace(data.name));
        let placeName = data.name || 'Ponto de Interesse';

        if (customerName && isUnnamed) {
          placeName = getCustomerPlaceName(customerName);
        } else if (isUnnamed) {
          placeName = 'Local sem nome';
        }
        
        let fullAddress = data.address || '';
        if (isUnnamed) {
          fullAddress = fullAddress.startsWith(placeName) 
            ? fullAddress 
            : `${placeName} - ${fullAddress}`;
        } else if (placeName && !fullAddress.toLowerCase().includes(placeName.toLowerCase())) {
          fullAddress = `${placeName} - ${fullAddress}`;
        }

        const resolvedPlace: Place = {
          id: `glink-${Date.now()}`,
          name: placeName,
          category: isUnnamed ? 'Local sem nome' : 'Google Maps',
          address: fullAddress,
          coordinates: data.coordinates,
          description: fullAddress,
          isUnnamed,
          customerName: customerName ? customerName.trim() : undefined
        };

        // Salva no cache do cliente
        linkMemoryCache.set(cacheKey, { timestamp: Date.now(), data: resolvedPlace });
        persistLinkCache();

        return resolvedPlace;
      }
    }
  } catch (err) {
    console.warn('[resolveGoogleMapsUrl] Erro ao resolver link:', err);
  }

  return null;
}

/**
 * Busca de locais e endereços usando o Google Maps (Places TextSearch & Geocoding)
 * Chave Oficial configurada: AIzaSyATwFNGYw-Y0TGH3SrjwQelQD4EorVjlg4
 */
export async function searchAddress(query: string, customerName?: string): Promise<Place[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Evita buscas com menos de 3 caracteres (a menos que seja link ou coordenada)
  if (trimmed.length < 3 && !isGoogleMapsUrl(trimmed) && !trimmed.includes(',')) {
    return [];
  }

  // 0. Se for um link do Google Maps, resolve imediatamente e retorna o local com coordenadas
  if (isGoogleMapsUrl(trimmed)) {
    const resolvedLinkPlace = await resolveGoogleMapsUrl(trimmed, customerName);
    if (resolvedLinkPlace) {
      return [resolvedLinkPlace];
    }
  }

  // Se forem coordenadas numéricas puras coladas no campo de busca (ex: -16.615549, -48.7546005)
  const coordMatch = trimmed.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    const rev = await reverseGeocode({ lat, lng });
    const addr = rev?.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const placeName = customerName ? getCustomerPlaceName(customerName) : 'Local sem nome';
    return [{
      id: `coord-${Date.now()}`,
      name: placeName,
      category: 'Local sem nome',
      address: `${placeName} - ${addr}`,
      coordinates: { lat, lng },
      description: addr,
      isUnnamed: true,
      customerName: customerName ? customerName.trim() : undefined
    }];
  }

  // 1. Verifica no Cache Local do Cliente (Resposta em 0ms e economia total de requisições de API)
  const normKey = normalizeQueryKey(trimmed);
  const cachedSearch = searchMemoryCache.get(normKey);
  if (cachedSearch && (Date.now() - cachedSearch.timestamp < CLIENT_CACHE_TTL_MS)) {
    console.log(`[Cache HIT - Frontend Search] "${trimmed}" retornado do cache local (${cachedSearch.data.length} itens).`);
    return cachedSearch.data;
  }

  // 2. Busca primeiro nas encomendas ativas salvas em memória
  let localMatches: Place[] = [];
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('encomendaszap_all_places');
      if (saved) {
        const places: Place[] = JSON.parse(saved);
        localMatches = places.filter(place => 
          place.name.toLowerCase().includes(trimmed.toLowerCase()) ||
          place.address.toLowerCase().includes(trimmed.toLowerCase()) ||
          (place.customerName && place.customerName.toLowerCase().includes(trimmed.toLowerCase()))
        );
      }
    }
  } catch {}

  // 3. BUSCA NOS LOCAIS CADASTRADOS PRIMEIRO (ECONOMIZA CHAMADAS DE API GOOGLE MAPS)
  try {
    const fbResults = await placeService.searchPlaces(trimmed, 8);
    if (fbResults.length > 0) {
      console.log(`[Local Search HIT] "${trimmed}" encontrado nos locais cadastrados (${fbResults.length} locais). Economizou chamada de API do Google!`);
      const combined = [...localMatches];
      for (const item of fbResults) {
        const exists = combined.some(
          r => Math.abs(r.coordinates.lat - item.coordinates.lat) < 0.0001 &&
               Math.abs(r.coordinates.lng - item.coordinates.lng) < 0.0001
        );
        if (!exists) {
          combined.push(item);
        }
      }
      searchMemoryCache.set(normKey, { timestamp: Date.now(), data: combined });
      persistSearchCache();
      return combined;
    }
  } catch (err) {
    console.warn('[Places Search Error]:', err);
  }

  // 4. Se não encontrar nos locais cadastrados, busca no Google Maps (via servidor)
  let googleResults: Place[] = [];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    // Tenta primeiro o endpoint Express interno /api/google/places (busca Places + Geocoding completos)
    let res: Response | null = null;
    try {
      const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
      res = await fetch(`${baseUrl}/api/google/places?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal
      });
    } catch {}

    if (res && res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        googleResults = data.results;
      }
    }

    // Se o endpoint interno não retornar resultados ou estiver rodando em standalone, faz a busca direta no Google Geocoding API
    if (googleResults.length === 0) {
      const directGoogleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&region=br`;
      const directRes = await fetch(directGoogleUrl, { signal: controller.signal });
      if (directRes.ok) {
        const geoData = await directRes.json();
        if (geoData.results && Array.isArray(geoData.results)) {
          googleResults = geoData.results.slice(0, 7).map((item: any, idx: number) => {
            const rawType = item.types?.[0] || 'street_address';
            return {
              id: `gmap-${item.place_id || idx}-${Date.now()}`,
              name: item.formatted_address.split(',')[0],
              category: GOOGLE_TYPE_MAP[rawType] || 'Google Maps',
              address: item.formatted_address,
              coordinates: {
                lat: item.geometry.location.lat,
                lng: item.geometry.location.lng
              },
              description: item.formatted_address
            };
          });
        }
      }
    }

    clearTimeout(timeoutId);

    if (googleResults.length > 0) {
      // Mescla com correspondências locais sem duplicar coordenadas
      const allResults = [...localMatches];
      for (const item of googleResults) {
        const exists = allResults.some(
          r => Math.abs(r.coordinates.lat - item.coordinates.lat) < 0.0001 &&
               Math.abs(r.coordinates.lng - item.coordinates.lng) < 0.0001
        );
        if (!exists) {
          allResults.push(item);
        }
      }

      // Salva no cache local do cliente e na memória do placeService para consultas futuras
      for (const item of allResults) {
        placeService.remember({
          id: item.id,
          name: item.name,
          endereco: item.address,
          lat: item.coordinates.lat,
          lng: item.coordinates.lng,
          cidade: item.destinationCity || item.originCity || 'Goiânia'
        });
      }

      searchMemoryCache.set(normKey, { timestamp: Date.now(), data: allResults });
      persistSearchCache();

      return allResults;
    }
  } catch (err) {
    console.warn('[Google Maps Search] Falha temporária, acionando fallback:', err);
  }

  // 3. Fallback inteligente de segurança (Nominatim) caso a conexão com a API do Google caia
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&addressdetails=1&limit=6&accept-language=pt-BR,pt,en`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const remoteResults: Place[] = data.map((item: any, idx: number) => {
        const addressParts = [
          item.address?.road,
          item.address?.suburb || item.address?.neighbourhood,
          item.address?.city || item.address?.town || item.address?.village || item.address?.municipality,
          item.address?.state,
          item.address?.country
        ].filter(Boolean);

        const displayName = item.name || item.display_name.split(',')[0];
        const formattedAddress = addressParts.length > 0 ? addressParts.join(', ') : item.display_name;

        return {
          id: `osm-${item.place_id || idx}-${Date.now()}`,
          name: displayName,
          category: item.type ? item.type.replace(/_/g, ' ') : 'Localização',
          address: formattedAddress,
          coordinates: {
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon)
          },
          description: item.display_name
        };
      });

      const allResults = [...localMatches];
      for (const item of remoteResults) {
        const exists = allResults.some(
          r => Math.abs(r.coordinates.lat - item.coordinates.lat) < 0.0001 &&
               Math.abs(r.coordinates.lng - item.coordinates.lng) < 0.0001
        );
        if (!exists) {
          allResults.push(item);
        }
      }

      if (allResults.length > 0) {
        searchMemoryCache.set(normKey, { timestamp: Date.now(), data: allResults });
        persistSearchCache();
      }

      return allResults;
    }
  } catch {}

  if (localMatches.length > 0) {
    searchMemoryCache.set(normKey, { timestamp: Date.now(), data: localMatches });
    persistSearchCache();
  }

  return localMatches;
}

/**
 * Geocodificação reversa usando o Google Maps Geocoding API
 * Converte coordenadas (lat, lng) em endereço textual completo formatado
 * Usa cache de coordenadas arredondadas para evitar chamadas de API repetitivas
 */
export async function reverseGeocode(coords: LocationCoordinates, snapRadiusMeters = 45): Promise<Place> {
  // 0. Verifica cache local do cliente
  const revKey = `v3:${snapRadiusMeters}:${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
  const cachedRev = reverseMemoryCache.get(revKey);
  if (cachedRev && (Date.now() - cachedRev.timestamp < CLIENT_CACHE_TTL_MS)) {
    console.log(`[Cache HIT - Frontend Reverse] Coordenadas ${revKey} retornadas do cache.`);
    return cachedRev.data;
  }

  // 0.1 SNAPPING DE LOCAL REGISTRADO (se clicou perto de algum local cadastrado <= 45m)
  try {
    const nearbyFb = placeService.getClosestLocalSync(coords.lat, coords.lng, snapRadiusMeters);
    if (nearbyFb && nearbyFb.local) {
      const l = nearbyFb.local;
      const fullAddr = l.endereco || [l.rua, l.numero, l.setor, l.cidade].filter(Boolean).join(', ') || l.name;
      const isStreet = isStreetOrAddress({ name: l.name, category: l.setor, address: fullAddr });
      const closing = isStreet ? undefined : resolveCommercialClosingTime({
        name: l.name,
        category: l.setor,
        address: fullAddr,
        horario: l.horario
      });

      console.log(`[Reverse Snap HIT] Ponto próximo a "${l.name}" (${Math.round(nearbyFb.distMeters)}m) adotado.`);
      const resPlace: Place = {
        id: `pin-fb-${l.id}`,
        name: l.name,
        customerName: '',
        customerPhone: l.telefone || '',
        managerName: 'Central EncomendasZap Operações',
        managerPhone: '5562991112200',
        originCity: l.cidade || 'Goiânia - GO',
        destinationCity: l.cidade || 'Goiânia - GO',
        driverNotes: `Ponto cadastrado na rede EncomendasZap (${Math.round(nearbyFb.distMeters)}m do clique).`,
        orderCode: `EZ-${Math.floor(1000 + Math.random() * 9000)}-GO`,
        operationType: 'coleta',
        vehicleType: 'moto',
        packageType: 'caixa',
        category: isStreet ? 'Via pública / Endereço' : (l.central_coletas ? 'Central de Coletas' : (l.setor ? `${l.setor}` : 'Ponto Comercial')),
        address: fullAddr,
        coordinates: { lat: Number(l.lat), lng: Number(l.lng) },
        phone: l.telefone,
        website: l.site,
        openNow: isStreet ? undefined : true,
        closingTime: isStreet ? undefined : closing,
        imageUrl: (l.icon && typeof l.icon === 'string' && l.icon.startsWith('http')) ? l.icon : 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&auto=format&fit=crop&q=80',
        photos: (l.icon && typeof l.icon === 'string' && l.icon.startsWith('http')) ? [l.icon] : undefined,
        description: fullAddr
      };

      reverseMemoryCache.set(revKey, { timestamp: Date.now(), data: resPlace });
      persistReverseCache();
      return resPlace;
    }
  } catch (err) {
    console.warn('[Reverse Snap] Erro ao buscar local próximo:', err);
  }

  const sampleNames = [
    'Camila Silveira',
    'Rodrigo Guimarães',
    'Juliana Peixoto',
    'Marcelo Alencar',
    'Fernanda Nogueira',
    'Thiago Castro'
  ];
  const randomCustomer = sampleNames[Math.floor(Math.random() * sampleNames.length)];
  const orderCode = `EZ-${Math.floor(1000 + Math.random() * 9000)}-GO`;

  const vehicleTypes: ('moto' | 'carro' | 'utilitario')[] = ['moto', 'carro', 'utilitario'];
  const packageTypes: ('caixa' | 'sacola' | 'envelope')[] = ['caixa', 'sacola', 'envelope'];
  const operationTypes: ('coleta' | 'entrega' | 'troca')[] = ['coleta', 'entrega', 'troca'];
  const chosenVehicle = vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
  const chosenPackage = packageTypes[Math.floor(Math.random() * packageTypes.length)];
  const chosenOperation = operationTypes[Math.floor(Math.random() * operationTypes.length)];

  // 1. Tenta obter o endereço pelo Google Maps
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    // 1.1 Tenta primeiro o endpoint local proxy do Express
    let proxyRes: Response | null = null;
    try {
      proxyRes = await fetch(`/api/google/reverse?lat=${coords.lat}&lng=${coords.lng}&snapRadius=${snapRadiusMeters}`, {
        signal: controller.signal
      });
    } catch {}

    if (proxyRes && proxyRes.ok) {
      const pData = await proxyRes.json();
      if (pData.success && pData.data) {
        clearTimeout(timeoutId);
        const d = pData.data;
        const isStreet = isStreetOrAddress({
          name: d.name,
          category: d.category,
          address: d.formatted_address
        });

        const resPlace: Place = {
          id: `pin-gmap-${Date.now()}`,
          name: d.name || 'Ponto no Mapa',
          customerName: randomCustomer,
          customerPhone: `5562981${Math.floor(100000 + Math.random() * 900000)}`,
          managerName: 'Central EncomendasZap Operações',
          managerPhone: '5562991112200',
          originCity: 'Goiânia - GO',
          destinationCity: d.city || 'Goiânia - GO',
          driverNotes: 'Ponto marcado no Google Maps. Conferir endereço e número predial, solicitar documento com foto.',
          orderCode,
          operationType: chosenOperation,
          vehicleType: chosenVehicle,
          packageType: chosenPackage,
          category: isStreet ? 'Via pública / Endereço' : (d.category || 'Ponto de Interesse'),
          address: d.formatted_address,
          coordinates: coords,
          rating: d.rating,
          reviewsCount: d.reviewsCount,
          openNow: isStreet ? undefined : (d.openNow ?? true),
          imageUrl: d.imageUrl || 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&auto=format&fit=crop&q=80',
          photos: d.imageUrl ? [d.imageUrl] : undefined,
          closingTime: isStreet ? undefined : (d.closingTime || resolveCommercialClosingTime({ name: d.name, category: d.category, address: d.formatted_address })),
          description: `Coordenadas: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
        };

        reverseMemoryCache.set(revKey, { timestamp: Date.now(), data: resPlace });
        persistReverseCache();
        return resPlace;
      }
    }

    // 1.2 Tenta a API direta do Google Geocoding
    const directUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`;
    const gResponse = await fetch(directUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (gResponse.ok) {
      const gData = await gResponse.json();
      if (gData.results && gData.results.length > 0) {
        const item = gData.results[0];
        const getComp = (type: string) => {
          const c = item.address_components?.find((ac: any) => ac.types.includes(type));
          return c ? c.long_name : '';
        };

        const route = getComp('route');
        const number = getComp('street_number');
        const neighborhood = getComp('sublocality_level_1') || getComp('neighborhood') || getComp('sublocality');
        const city = getComp('administrative_area_level_2') || 'Goiânia';
        const state = getComp('administrative_area_level_1') || 'GO';
        const streetName = route ? `${route}${number ? ', ' + number : ''}` : '';

        // Tenta achar estabelecimento/POI na lista de resultados do Google
        const poiCandidate = gData.results.find((r: any) =>
          r.name && typeof r.geometry?.location?.lat === 'number' &&
          typeof r.geometry?.location?.lng === 'number' &&
          calculateDistanceMeters(coords, r.geometry.location) <= 10 && r.types && (
            r.types.includes('point_of_interest') || 
            r.types.includes('establishment') ||
            r.types.includes('store') ||
            r.types.includes('shopping_mall')
          )
        );
        const poiName = poiCandidate?.name;

        const finalName = poiName || streetName || neighborhood || city || 'Ponto no Mapa';
        const isStreet = isStreetOrAddress({
          name: finalName,
          category: poiCandidate ? 'Ponto de Interesse' : 'Via pública',
          address: item.formatted_address
        });

        const resPlace: Place = {
          id: `pin-gmap-${Date.now()}`,
          name: finalName,
          customerName: randomCustomer,
          customerPhone: `5562981${Math.floor(100000 + Math.random() * 900000)}`,
          managerName: 'Central EncomendasZap Operações',
          managerPhone: '5562991112200',
          originCity: 'Goiânia - GO',
          destinationCity: `${city} - ${state}`,
          driverNotes: 'Ponto marcado no Google Maps. Conferir endereço e número predial, solicitar documento com foto.',
          orderCode,
          operationType: chosenOperation,
          vehicleType: chosenVehicle,
          packageType: chosenPackage,
          category: isStreet ? 'Via pública / Endereço' : (poiName ? 'Ponto de Interesse' : 'Via pública / Endereço'),
          address: item.formatted_address,
          coordinates: coords,
          openNow: isStreet ? undefined : true,
          imageUrl: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&auto=format&fit=crop&q=80',
          closingTime: isStreet ? undefined : resolveCommercialClosingTime({ name: poiCandidate?.name || item.formatted_address, address: item.formatted_address }),
          description: `Coordenadas: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
        };

        reverseMemoryCache.set(revKey, { timestamp: Date.now(), data: resPlace });
        persistReverseCache();
        return resPlace;
      }
    }
  } catch (err) {
    console.warn('[Google Maps Reverse Geocode] Fallback acionado:', err);
  }

  // 2. Fallback de segurança (Nominatim)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&addressdetails=1&accept-language=pt-BR,pt,en`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const item = await response.json();
      const addressParts = [
        item.address?.road,
        item.address?.house_number,
        item.address?.suburb || item.address?.neighbourhood,
        item.address?.city || item.address?.town || item.address?.municipality,
        item.address?.state,
        item.address?.country
      ].filter(Boolean);

      const name = item.name || 
        (item.address?.road ? `${item.address.road}${item.address.house_number ? ', ' + item.address.house_number : ''}` : null) || 
        item.address?.city || 
        'Ponto no Mapa';

      const city = item.address?.city || item.address?.town || item.address?.municipality || 'Goiânia - GO';
      const fullAddr = addressParts.length > 0 ? addressParts.join(', ') : item.display_name;
      const isStreet = isStreetOrAddress({ name, address: fullAddr });

      const resPlace: Place = {
        id: `pin-${Date.now()}`,
        name: name,
        customerName: randomCustomer,
        customerPhone: `5562981${Math.floor(100000 + Math.random() * 900000)}`,
        managerName: 'Central EncomendasZap Operações',
        managerPhone: '5562991112200',
        originCity: 'Goiânia - GO',
        destinationCity: city.includes('GO') ? city : `${city} - GO`,
        driverNotes: 'Ponto marcado no mapa. Conferir endereço e número predial, solicitar documento com foto.',
        orderCode,
        operationType: chosenOperation,
        vehicleType: chosenVehicle,
        packageType: chosenPackage,
        category: isStreet ? 'Via pública / Endereço' : 'Ponto Marcado no Mapa',
        address: fullAddr,
        coordinates: coords,
        openNow: isStreet ? undefined : true,
        imageUrl: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&auto=format&fit=crop&q=80',
        closingTime: undefined,
        description: `Coordenadas: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
      };

      reverseMemoryCache.set(revKey, { timestamp: Date.now(), data: resPlace });
      persistReverseCache();
      return resPlace;
    }
  } catch {}

  // Fallback offline garantido
  const fallbackPlace: Place = {
    id: `pin-${Date.now()}`,
    name: 'Ponto Marcado no Mapa',
    customerName: '',
    customerPhone: '',
    managerName: 'Central EncomendasZap Operações',
    managerPhone: '5562991112200',
    originCity: 'Goiânia - GO',
    destinationCity: 'Goiânia - GO',
    driverNotes: 'Ponto marcado no mapa. Ligar para o cliente antes da entrega e confirmar ponto de referência.',
    orderCode,
    operationType: 'entrega',
    vehicleType: 'moto',
    packageType: 'caixa',
    category: 'Coordenadas Geográficas',
    imageUrl: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=800&auto=format&fit=crop&q=80',
    closingTime: undefined,
    openNow: undefined,
    address: `Lat: ${coords.lat.toFixed(5)}, Long: ${coords.lng.toFixed(5)}`,
    coordinates: coords
  };

  reverseMemoryCache.set(revKey, { timestamp: Date.now(), data: fallbackPlace });
  persistReverseCache();
  return fallbackPlace;
}
