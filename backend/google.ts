import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { localToBackend } from './mappers';
import { findNearbyNamedPlace } from './nearbyPlace';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyATwFNGYw-Y0TGH3SrjwQelQD4EorVjlg4';

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

interface CacheItem<T> {
  timestamp: number;
  data: T;
}

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function registerGoogleRoutes(app: Express, rootDir: string) {
  const cacheFile = path.resolve(rootDir, 'google-api-cache.json');
  const placesCache = new Map<string, CacheItem<any>>();
  const reverseCache = new Map<string, CacheItem<any>>();
  const linkCache = new Map<string, CacheItem<any>>();
  const directionsCache = new Map<string, CacheItem<any>>();

  try {
    if (fs.existsSync(cacheFile)) {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const load = (target: Map<string, CacheItem<any>>, source: any) => {
        if (source && typeof source === 'object') Object.entries(source).forEach(([k, v]) => target.set(k, v as CacheItem<any>));
      };
      load(placesCache, parsed.places);
      load(reverseCache, parsed.reverse);
      load(linkCache, parsed.links);
      load(directionsCache, parsed.directions);
    }
  } catch (e) {
    console.warn('[Google API Cache] Não foi possível ler google-api-cache.json:', e);
  }

  let saveTimer: NodeJS.Timeout | null = null;
  function persistCache() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        fs.writeFileSync(cacheFile, JSON.stringify({
          places: Object.fromEntries(placesCache),
          reverse: Object.fromEntries(reverseCache),
          links: Object.fromEntries(linkCache),
          directions: Object.fromEntries(directionsCache)
        }), 'utf-8');
      } catch (err) {
        console.warn('[Google API Cache] Erro ao gravar google-api-cache.json:', err);
      }
    }, 2000);
  }

  const fresh = (item?: CacheItem<any>) => !!item && Date.now() - item.timestamp < CACHE_TTL_MS;

  const normalizeCacheKey = (key: string) =>
    key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  const requireKey = (res: Response): boolean => {
    if (GOOGLE_MAPS_API_KEY) return true;
    res.status(503).json({ success: false, message: 'Configure GOOGLE_MAPS_API_KEY no .env do servidor.', results: [] });
    return false;
  };

  const PORTUGUESE_STOP_WORDS = new Set([
    'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas',
    'para', 'pra', 'com', 'um', 'uma', 'o', 'a', 'os', 'as', 'rua', 'r',
    'r.', 'av', 'av.', 'avenida', 'alameda', 'al', 'al.', 'travessa', 'tv',
    'tv.', 'praca', 'praça', 'setor', 'st', 'st.', 'bairro', 'qd', 'lt',
    'quadra', 'lote', 'numero', 'n', 'nº', 'goiania', 'goiânia', 'anapolis',
    'anápolis', 'go', 'goias', 'goiás', 'brasil'
  ]);

  function normalizeText(str: string): string {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Busca locais já cadastrados no banco antes de consultar o Google. */
  async function searchLocations(query: string, limit = 8) {
    const q = query.trim();
    if (q.length < 2) return [];

    const normQ = normalizeText(q);
    if (!normQ) return [];

    const allWords = normQ.split(' ').filter(w => w.length > 0);
    const significantWords = allWords.filter(w => !PORTUGUESE_STOP_WORDS.has(w) && w.length >= 2);
    const searchTerms = significantWords.length > 0 ? significantWords : allWords;

    // Busca candidatos no banco de dados pelo nome ou endereço
    const candidates = await prisma.locations.findMany({
      where: {
        lat: { not: null },
        lng: { not: null },
        OR: [
          { name: { contains: q } },
          { address: { contains: q } },
          ...searchTerms.map(t => ({ name: { contains: t } }))
        ]
      },
      take: 150
    });

    const scored = candidates.map(p => {
      const normName = normalizeText(p.name || '');
      const normAddr = normalizeText(p.address || '');
      const normFull = normalizeText([p.name, p.address, p.street, p.district, p.city].filter(Boolean).join(' '));

      let score = 0;

      // 1. Nome exato
      if (normName === normQ) {
        score = 100;
      }
      // 2. Nome começa com a busca
      else if (normName.startsWith(normQ)) {
        score = 90;
      }
      // 3. Nome contém a busca inteira
      else if (normName.includes(normQ) && normQ.length >= 3) {
        score = 80;
      }
      // 4. Todos os termos significativos estão no nome do local
      else if (searchTerms.length > 0 && searchTerms.every(w => normName.includes(w))) {
        score = 75;
      }
      // 5. Todos os termos estão no texto completo E pelo menos um termo significativo está no nome
      else if (searchTerms.length > 0 && searchTerms.every(w => normFull.includes(w)) && searchTerms.some(w => normName.includes(w))) {
        score = 65;
      }
      // 6. Busca por endereço específico (onde todos os termos batem no endereço)
      else if (allWords.length >= 2 && allWords.every(w => normAddr.includes(w))) {
        score = 60;
      }

      return { p, score };
    }).filter(s => s.score >= 60 && !(s.p.lat === 0 && s.p.lng === 0));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ p }) => {
      const fullAddr = p.address || [p.street, p.number, p.district, p.city].filter(Boolean).join(', ');
      return {
        id: `loc-${p.id}`,
        name: p.name,
        category: p.district ? `${p.district} (Local Cadastrado)` : 'Local Cadastrado',
        address: fullAddr || p.name,
        coordinates: { lat: p.lat, lng: p.lng },
        description: fullAddr,
        fromDatabase: true
      };
    });
  }

  app.get('/api/google/places', async (req: Request, res: Response) => {
    const query = String(req.query.q || req.query.query || req.query.input || '').trim();
    if (!query) {
      res.json({ success: true, results: [] });
      return;
    }

    const cacheKey = normalizeCacheKey(query);
    const cached = placesCache.get(cacheKey);
    if (fresh(cached)) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, results: cached!.data, fromCache: true });
      return;
    }

    try {
      const dbMatches = await searchLocations(query, 8);
      if (dbMatches.length > 0) {
        placesCache.set(cacheKey, { timestamp: Date.now(), data: dbMatches });
        persistCache();
        res.setHeader('X-Cache', 'HIT');
        res.json({ success: true, results: dbMatches, fromDatabase: true });
        return;
      }
      if (!requireKey(res)) return;

      // Busca na API do Google Places com viés para Goiás
      const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=-16.686895,-49.264794&radius=50000&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&region=br`;
      const placesData: any = await (await fetch(placesUrl)).json();

      let items: any[] = [];
      if (Array.isArray(placesData.results) && placesData.results.length > 0) {
        items = placesData.results.slice(0, 10).map((r: any) => {
          const rawType = r.types?.[0] || 'establishment';
          return {
            id: `gplace-${r.place_id}`,
            name: r.name || r.formatted_address?.split(',')[0],
            category: GOOGLE_TYPE_MAP[rawType] || rawType.replace(/_/g, ' '),
            address: r.formatted_address,
            coordinates: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
            rating: r.rating,
            reviewsCount: r.user_ratings_total,
            openNow: r.opening_hours?.open_now,
            description: r.formatted_address
          };
        });
      }

      if (items.length < 4) {
        const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:BR&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&region=br`;
        const geoData: any = await (await fetch(geoUrl)).json();
        if (Array.isArray(geoData.results)) {
          geoData.results.slice(0, 6).forEach((g: any) => {
            const exists = items.some(it =>
              Math.abs(it.coordinates.lat - g.geometry.location.lat) < 0.0002 &&
              Math.abs(it.coordinates.lng - g.geometry.location.lng) < 0.0002);
            if (exists) return;
            const rawType = g.types?.[0] || 'street_address';
            items.push({
              id: `gcode-${g.place_id}`,
              name: g.formatted_address.split(',')[0],
              category: GOOGLE_TYPE_MAP[rawType] || 'Endereço',
              address: g.formatted_address,
              coordinates: { lat: g.geometry.location.lat, lng: g.geometry.location.lng },
              description: g.formatted_address
            });
          });
        }
      }

      if (items.length > 0) {
        placesCache.set(cacheKey, { timestamp: Date.now(), data: items });
        persistCache();

        // Salva todos os nomes e endereços buscados na tabela 'locations' do banco de dados
        for (const item of items) {
          try {
            const lat = item.coordinates?.lat;
            const lng = item.coordinates?.lng;
            if (typeof lat !== 'number' || typeof lng !== 'number') continue;
            const placeId = item.id?.startsWith('gplace-') 
              ? item.id.replace('gplace-', '') 
              : item.id?.startsWith('gcode-') 
              ? item.id.replace('gcode-', '') 
              : undefined;

            let city = 'Goiânia';
            let state = 'GO';
            let district = '';

            const addr = item.address || '';
            const cityMatch = addr.match(/,\s*([A-Za-zÀ-ÿ\s]+)\s*-\s*([A-Za-z]{2})(?:,\s*\d{5}-?\d{3})?/);
            if (cityMatch) {
              city = cityMatch[1].trim();
              state = cityMatch[2].trim().toUpperCase();
            }
            const districtMatch = addr.match(/-\s*([^,]+),\s*[A-Za-zÀ-ÿ\s]+-\s*[A-Za-z]{2}/);
            if (districtMatch) {
              district = districtMatch[1].trim();
            }

            const existing = await prisma.locations.findFirst({
              where: {
                OR: [
                  ...(placeId ? [{ place_id: placeId }] : []),
                  { name: item.name, address: item.address }
                ]
              }
            });

            if (!existing) {
              await prisma.locations.create({
                data: {
                  name: item.name,
                  address: item.address,
                  lat,
                  lng,
                  city,
                  state,
                  district: district || undefined,
                  place_id: placeId,
                  link_maps: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
                  status: 'active'
                }
              }).catch(() => null);
            }
          } catch {
            // Continua salvando os outros itens
          }
        }
      }

      res.setHeader('X-Cache', 'MISS');
      res.json({ success: true, results: items });
    } catch (err: any) {
      console.warn('[Google Maps API] Falha na busca de locais:', err.message);
      res.status(500).json({ success: false, message: err.message, results: [] });
    }
  });

  app.get('/api/google/reverse', async (req: Request, res: Response) => {
    const lat = parseFloat(String(req.query.lat));
    const lng = parseFloat(String(req.query.lng));
    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ success: false, message: 'Latitude e Longitude inválidas' });
      return;
    }

    const radiusParam = Number(req.query.snapRadius);
    const snapRadius = req.query.snapRadius === undefined ? 45 :
      Number.isFinite(radiusParam) ? Math.min(45, Math.max(0, radiusParam)) : 45;
    const cacheKey = `v3:${snapRadius}:${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = reverseCache.get(cacheKey);
    if (fresh(cached)) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached!.data, fromCache: true });
      return;
    }

    try {
      // Local já cadastrado a até 45 m do ponto clicado
      const dLat = 0.0006;
      const dLng = 0.0006 / Math.max(0.1, Math.cos(lat * Math.PI / 180));
      const nearby = await prisma.locations.findMany({
        where: { lat: { gte: lat - dLat, lte: lat + dLat }, lng: { gte: lng - dLng, lte: lng + dLng } }
      });
      let closest: any = null;
      let minDist = Infinity;
      for (const loc of nearby) {
        const rLat = (loc.lat! - lat) * Math.PI / 180;
        const rLng = (loc.lng! - lng) * Math.PI / 180;
        const a = Math.sin(rLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(loc.lat! * Math.PI / 180) * Math.sin(rLng / 2) ** 2;
        const dist = 6371e3 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (dist <= snapRadius && dist < minDist) {
          minDist = dist;
          closest = loc;
        }
      }

      if (closest) {
        const local = localToBackend(closest);
        const fullAddr = local.endereco || [local.rua, local.numero, local.setor, local.cidade].filter(Boolean).join(', ') || closest.name;
        const responseData = {
          formatted_address: fullAddr,
          name: closest.name,
          city: local.cidade || 'Goiânia - GO',
          neighborhood: local.setor,
          coordinates: { lat: closest.lat, lng: closest.lng },
          category: closest.is_collection_hub ? 'Central de Coletas' : (local.setor || 'Ponto Comercial'),
          phone: local.telefone,
          imageUrl: closest.icon || undefined,
          fromDatabase: true
        };
        reverseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
        persistCache();
        res.setHeader('X-Cache', 'HIT');
        res.json({ success: true, data: responseData, fromDatabase: true });
        return;
      }

      if (!requireKey(res)) return;

      let poiData: any = null;
      try {
        const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=establishment&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`;
        const nearbyJson: any = await (await fetch(nearbyUrl)).json();
        if (Array.isArray(nearbyJson.results) && nearbyJson.results.length > 0) {
          const found = findNearbyNamedPlace(nearbyJson.results, { lat, lng }, 10);
          if (found?.name) {
            const rawType = found.types?.[0] || 'establishment';
            poiData = {
              name: found.name,
              formatted_address: found.vicinity || found.formatted_address,
              category: GOOGLE_TYPE_MAP[rawType] || 'Ponto de Interesse',
              rating: found.rating,
              reviewsCount: found.user_ratings_total,
              openNow: found.opening_hours?.open_now,
              place_id: found.place_id,
              imageUrl: found.photos?.[0]?.photo_reference
                ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${found.photos[0].photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
                : undefined
            };
          }
        }
      } catch {
        // segue para o geocoding padrão
      }

      const revData: any = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`)).json();

      if (revData.results && revData.results.length > 0) {
        const item = revData.results[0];
        const getComp = (type: string) => item.address_components?.find((ac: any) => ac.types.includes(type))?.long_name || '';
        const route = getComp('route');
        const number = getComp('street_number');
        const neighborhood = getComp('sublocality') || getComp('sublocality_level_1') || getComp('neighborhood');
        const city = getComp('administrative_area_level_2') || 'Goiânia';
        const state = getComp('administrative_area_level_1') || 'GO';
        const streetName = route ? `${route}${number ? ', ' + number : ''}` : '';

        const responseData = {
          formatted_address: poiData?.formatted_address || item.formatted_address,
          name: poiData?.name || streetName || neighborhood || city,
          city: `${city}${state ? ' - ' + state : ''}`,
          neighborhood,
          postal_code: getComp('postal_code'),
          coordinates: { lat, lng },
          category: poiData?.category || (route ? 'Via pública' : 'Endereço residencial'),
          rating: poiData?.rating,
          reviewsCount: poiData?.reviewsCount,
          openNow: poiData ? poiData.openNow : undefined,
          imageUrl: poiData?.imageUrl
        };
        reverseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
        persistCache();
        res.setHeader('X-Cache', 'MISS');
        res.json({ success: true, data: responseData });
        return;
      }

      if (poiData) {
        const responseData = {
          formatted_address: poiData.formatted_address,
          name: poiData.name,
          city: 'Goiânia - GO',
          coordinates: { lat, lng },
          category: poiData.category,
          rating: poiData.rating,
          reviewsCount: poiData.reviewsCount,
          openNow: poiData.openNow,
          imageUrl: poiData.imageUrl
        };
        reverseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
        persistCache();
        res.json({ success: true, data: responseData });
        return;
      }

      res.json({ success: false, message: 'Nenhum endereço encontrado para essas coordenadas' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/google/directions', async (req: Request, res: Response) => {
    const origin = String(req.query.origin || '').trim();
    const destination = String(req.query.destination || '').trim();
    const mode = String(req.query.mode || 'driving').trim();
    if (!origin || !destination) {
      res.status(400).json({ success: false, message: 'origin e destination são obrigatórios (lat,lng)' });
      return;
    }

    const cacheKey = `${origin}->${destination}-${mode}`;
    const cached = directionsCache.get(cacheKey);
    if (fresh(cached)) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached!.data });
      return;
    }
    if (!requireKey(res)) return;

    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${encodeURIComponent(mode)}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&region=br`;
      const data: any = await (await fetch(url)).json();

      if (data.status === 'OK' && data.routes?.length > 0) {
        const route = data.routes[0];
        const leg = route.legs?.[0];
        const payload = {
          encodedPolyline: route.overview_polyline?.points || '',
          distanceKm: Math.round(((leg?.distance?.value || 0) / 1000) * 10) / 10,
          durationMin: Math.max(1, Math.round((leg?.duration?.value || 0) / 60)),
          distanceText: leg?.distance?.text || '',
          durationText: leg?.duration?.text || '',
          summary: route.summary || ''
        };
        directionsCache.set(cacheKey, { timestamp: Date.now(), data: payload });
        persistCache();
        res.setHeader('X-Cache', 'MISS');
        res.json({ success: true, data: payload });
        return;
      }
      res.json({ success: false, message: data.error_message || `Status: ${data.status}` });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Resolve links do Google Maps (inclusive encurtados), extraindo coordenadas e nome do local
  app.all('/api/google/resolve-link', async (req: Request, res: Response) => {
    let rawInput = String(req.query.url || req.query.input || req.query.q || '').trim();
    let customerName = String(req.query.customerName || req.query.customer || '').trim();
    if (!rawInput && req.body) {
      try {
        const parsed = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf-8')) : req.body;
        rawInput = String(parsed?.url || parsed?.input || '').trim();
        if (!customerName) customerName = String(parsed?.customerName || parsed?.customer || '').trim();
      } catch {
        // corpo inválido: segue sem entrada
      }
    }
    if (!rawInput) {
      res.status(400).json({ success: false, message: 'URL ou texto do link não fornecido.' });
      return;
    }

    const cacheKey = `${rawInput}_${customerName || 'nocust'}`;
    const cached = linkCache.get(cacheKey) || linkCache.get(rawInput);
    if (fresh(cached)) {
      const data = { ...cached!.data };
      if (customerName && (data.isUnnamed || data.name === 'Local sem nome' || data.name.toLowerCase().startsWith('local de '))) {
        data.name = `Local de ${customerName}`;
      }
      res.setHeader('X-Cache', 'HIT');
      res.json({ ...data, fromCache: true });
      return;
    }

    try {
      const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
      let resolvedUrl = urlMatch ? urlMatch[0].replace(/[)\]'",;.]+$/, '').trim() : rawInput;

      let lat: number | null = null;
      let lng: number | null = null;
      let name = '';
      let address = '';
      let isUnnamed = false;
      let bodyText = '';

      if (/^https?:\/\//.test(resolvedUrl)) {
        try {
          const resp = await fetch(resolvedUrl, {
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
          });
          resolvedUrl = resp.url || resolvedUrl;
          bodyText = await resp.text();
          const ogMatch = bodyText.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ||
            bodyText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i) ||
            bodyText.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
            bodyText.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
          if (ogMatch?.[1]) resolvedUrl = ogMatch[1].replace(/&amp;/g, '&');
        } catch (err: any) {
          console.warn('[Google Link Resolver] Erro ao seguir redirecionamento:', err.message);
        }
      }

      let decodedResolved = resolvedUrl;
      try { decodedResolved = decodeURIComponent(resolvedUrl); } catch { /* mantém original */ }
      let decodedRaw = rawInput;
      try { decodedRaw = decodeURIComponent(rawInput); } catch { /* mantém original */ }
      const textToScan = [decodedResolved, resolvedUrl, decodedRaw, bodyText].join(' \n ');

      const cidMatch = textToScan.match(/0x[0-9a-fA-F]+:(0x[0-9a-fA-F]+)/);
      if (cidMatch?.[1] && GOOGLE_MAPS_API_KEY) {
        try {
          const decCid = BigInt(cidMatch[1]).toString();
          const placeData: any = await (await fetch(`https://maps.googleapis.com/maps/api/place/details/json?cid=${decCid}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`)).json();
          if (placeData.status === 'OK' && placeData.result) {
            name = placeData.result.name || '';
            address = placeData.result.formatted_address || '';
            if (placeData.result.geometry?.location) {
              lat = placeData.result.geometry.location.lat;
              lng = placeData.result.geometry.location.lng;
            }
          }
        } catch (e: any) {
          console.warn('[Google Link Resolver] Erro ao buscar dados por CID:', e.message);
        }
      }

      const patterns: Array<[RegExp, string?]> = [
        [/!3d(-?\d+(?:\.\d+)?)[!&]4d(-?\d+(?:\.\d+)?)/],
        [/\/place\/(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/],
        [/[?&](?:destination|daddr|origin|saddr)=(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/],
        [/[?&](?:q|ll|query|loc|center)=(?:loc:)?\s*(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/],
        [/@(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/]
      ];
      for (const [pattern] of patterns) {
        if (lat !== null && lng !== null) break;
        const m = textToScan.match(pattern);
        if (m) {
          lat = parseFloat(m[1]);
          lng = parseFloat(m[2]);
        }
      }
      if ((lat === null || lng === null) && bodyText) {
        const m = bodyText.match(/\[(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\]/);
        if (m) {
          lat = parseFloat(m[1]);
          lng = parseFloat(m[2]);
        }
      }
      if (lat === null || lng === null) {
        const m = textToScan.match(/(-?\d{1,2}\.\d{4,})[,\s+]+(-?\d{1,3}\.\d{4,})/);
        if (m) {
          lat = parseFloat(m[1]);
          lng = parseFloat(m[2]);
        }
      }

      if (!name) {
        const pathMatch = decodedResolved.match(/\/maps\/place\/([^/@?]+)/);
        if (pathMatch?.[1]) name = pathMatch[1].replace(/\+/g, ' ').trim();
      }

      const isCoordPattern = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(name);
      const isGenericDropped = !name || isCoordPattern ||
        /^(dropped pin|marcador inserido|pino inserido|local sem nome|unnamed location|marcador|pino|ponto no mapa|local marcado|local|google maps)$/i.test(name) ||
        /^[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,4}/i.test(name) ||
        name.toLowerCase().startsWith('local de ');
      if (isGenericDropped) {
        isUnnamed = true;
        name = customerName ? `Local de ${customerName}` : 'Local sem nome';
      }

      if (lat !== null && lng !== null && GOOGLE_MAPS_API_KEY) {
        try {
          const revData: any = await (await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`)).json();
          if (revData.status === 'OK' && revData.results?.length > 0) {
            const revAddress = revData.results[0].formatted_address;
            if (!address || isUnnamed || address.split(',').length < 2) address = revAddress;
          }
        } catch (e: any) {
          console.warn('[Google Link Resolver] Erro no reverse geocoding:', e.message);
        }
      }

      if (lat === null || lng === null) {
        res.status(404).json({ success: false, message: 'Não foi possível extrair as coordenadas deste link do Google Maps.' });
        return;
      }
      if (!address) address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      const finalName = name || (customerName ? `Local de ${customerName}` : 'Local sem nome');
      const payload = { success: true, name: finalName, address: address || finalName, coordinates: { lat, lng }, isUnnamed, resolvedUrl };
      linkCache.set(cacheKey, { timestamp: Date.now(), data: payload });
      if (resolvedUrl && resolvedUrl !== cacheKey) linkCache.set(resolvedUrl, { timestamp: Date.now(), data: payload });
      persistCache();

      res.setHeader('X-Cache', 'MISS');
      res.json(payload);
    } catch (err: any) {
      console.error('[Google Link Resolver Error]:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });
}
