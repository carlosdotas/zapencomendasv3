import { Place, LocationCoordinates } from '../types/map';

const USAGE_STATS_STORAGE_KEY = 'encomendaszap_places_usage_stats_v1';

/**
 * 20 Locais mais buscados e utilizados em Goiânia, Aparecida e Região Metropolitana.
 * Lista canônica com coordenadas precisas, endereços completos e categorias para alta conversão logística.
 */
export const DEFAULT_TOP_20_PLACES: Place[] = [
  {
    id: 'top-flamboyant',
    name: 'Flamboyant Shopping Center',
    address: 'Av. Dep. Jamel Cecílio, 3300 - Jardim Goiás, Goiânia - GO',
    category: 'Shopping & Coletas',
    coordinates: { lat: -16.7118, lng: -49.2346 },
    rating: 4.8,
    openNow: true
  },
  {
    id: 'top-goiania-shopping',
    name: 'Goiânia Shopping',
    address: 'Av. T-10, 1300 - Setor Bueno, Goiânia - GO',
    category: 'Shopping & Comércio',
    coordinates: { lat: -16.7042, lng: -49.2731 },
    rating: 4.7,
    openNow: true
  },
  {
    id: 'top-polo-44',
    name: 'Polo de Moda da 44 (Região da 44)',
    address: 'Rua 44, Setor Norte Ferroviário, Goiânia - GO',
    category: 'Centro Atacadista & Confecções',
    coordinates: { lat: -16.6631, lng: -49.2575 },
    rating: 4.9,
    openNow: true
  },
  {
    id: 'top-buriti-shopping',
    name: 'Buriti Shopping',
    address: 'Av. Rio Verde, Qd. 102 - Vila São Tomaz, Aparecida de Goiânia - GO',
    category: 'Shopping & Varejo',
    coordinates: { lat: -16.7328, lng: -49.2802 },
    rating: 4.7,
    openNow: true
  },
  {
    id: 'top-passeio-aguas',
    name: 'Passeio das Águas Shopping',
    address: 'Av. Perimetral Norte, 8303 - Fazenda Caveiras, Goiânia - GO',
    category: 'Shopping & Hub Norte',
    coordinates: { lat: -16.6267, lng: -49.2844 },
    rating: 4.8,
    openNow: true
  },
  {
    id: 'top-araguaia-rodoviaria',
    name: 'Araguaia Shopping / Terminal Rodoviário',
    address: 'Rua 44, 399 - Setor Central, Goiânia - GO',
    category: 'Terminal Rodoviário & Shopping',
    coordinates: { lat: -16.6639, lng: -49.2586 },
    rating: 4.6,
    openNow: true
  },
  {
    id: 'top-cerrado-shopping',
    name: 'Shopping Cerrado',
    address: 'Av. Anhanguera, 10790 - Setor Aeroviário, Goiânia - GO',
    category: 'Shopping & Polo Oeste',
    coordinates: { lat: -16.6668, lng: -49.3005 },
    rating: 4.6,
    openNow: true
  },
  {
    id: 'top-feira-hippie',
    name: 'Feira Hippie / Praça do Trabalhador',
    address: 'Praça do Trabalhador - Setor Central, Goiânia - GO',
    category: 'Comércio Popular & Entregas',
    coordinates: { lat: -16.6648, lng: -49.2592 },
    rating: 4.8,
    openNow: true
  },
  {
    id: 'top-terminal-biblia',
    name: 'Terminal Praça da Bíblia',
    address: 'Av. Anhanguera - Setor Leste Universitário, Goiânia - GO',
    category: 'Terminal Urbano de Integração',
    coordinates: { lat: -16.6749, lng: -49.2372 },
    rating: 4.5,
    openNow: true
  },
  {
    id: 'top-terminal-praca-a',
    name: 'Terminal Praça A',
    address: 'Av. Anhanguera - Setor Campinas, Goiânia - GO',
    category: 'Terminal Urbano Campinas',
    coordinates: { lat: -16.6712, lng: -49.2798 },
    rating: 4.5,
    openNow: true
  },
  {
    id: 'top-terminal-isidoria',
    name: 'Terminal Isidória',
    address: 'Av. 2ª Radial, 10 - Setor Pedro Ludovico, Goiânia - GO',
    category: 'Terminal Integrado Sul',
    coordinates: { lat: -16.7145, lng: -49.2558 },
    rating: 4.6,
    openNow: true
  },
  {
    id: 'top-terminal-pelagio',
    name: 'Terminal Padre Pelágio',
    address: 'Av. Anhanguera, km 0 - Bairro Ipiranga, Goiânia - GO',
    category: 'Terminal Rodoviário Oeste',
    coordinates: { lat: -16.6575, lng: -49.3325 },
    rating: 4.5,
    openNow: true
  },
  {
    id: 'top-terminal-bandeiras',
    name: 'Terminal Bandeiras',
    address: 'Av. Bandeiras - Jardim Europa, Goiânia - GO',
    category: 'Terminal de Transbordo',
    coordinates: { lat: -16.7288, lng: -49.3075 },
    rating: 4.5,
    openNow: true
  },
  {
    id: 'top-terminal-cruzeiro',
    name: 'Terminal Cruzeiro',
    address: 'Av. São João - Jardim Luz, Aparecida de Goiânia - GO',
    category: 'Terminal Aparecida de Goiânia',
    coordinates: { lat: -16.7582, lng: -49.2871 },
    rating: 4.5,
    openNow: true
  },
  {
    id: 'top-terminal-vila-brasilia',
    name: 'Terminal Vila Brasília',
    address: 'Av. São Paulo - Vila Brasília, Aparecida de Goiânia - GO',
    category: 'Terminal Regional Sul',
    coordinates: { lat: -16.7381, lng: -49.2612 },
    rating: 4.5,
    openNow: true
  },
  {
    id: 'top-terminal-senador-canedo',
    name: 'Terminal Senador Canedo',
    address: 'Av. Progresso - Centro, Senador Canedo - GO',
    category: 'Terminal Central Senador Canedo',
    coordinates: { lat: -16.7065, lng: -49.0925 },
    rating: 4.6,
    openNow: true
  },
  {
    id: 'top-praca-civica',
    name: 'Praça Cívica (Centro Administrativo)',
    address: 'Praça Cívica - Setor Central, Goiânia - GO',
    category: 'Centro Administrativo & Órgãos',
    coordinates: { lat: -16.6806, lng: -49.2564 },
    rating: 4.7,
    openNow: true
  },
  {
    id: 'top-polo-empresarial-goias',
    name: 'Polo Empresarial Goiás',
    address: 'Av. Eixo Primário - Polo Empresarial Goiás, Aparecida de Goiânia - GO',
    category: 'Distrito Industrial & Galpões',
    coordinates: { lat: -16.7925, lng: -49.2458 },
    rating: 4.7,
    openNow: true
  },
  {
    id: 'top-centro-convencoes',
    name: 'Centro de Convenções de Goiânia',
    address: 'Rua 4, 1400 - Setor Central, Goiânia - GO',
    category: 'Eventos & Negócios',
    coordinates: { lat: -16.6765, lng: -49.2598 },
    rating: 4.7,
    openNow: true
  },
  {
    id: 'top-aeroporto-santa-genoveva',
    name: 'Aeroporto Internacional Santa Genoveva',
    address: 'Alameda 4, s/n - Santa Genoveva, Goiânia - GO',
    category: 'Cargas Aéreas & Aeroporto GYN',
    coordinates: { lat: -16.6322, lng: -49.2215 },
    rating: 4.8,
    openNow: true
  }
];

/**
 * Normaliza chave de texto para agregação de estatísticas
 */
function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Registra o uso ou busca de um local pelo usuário
 */
export function recordPlaceUsage(placeOrQuery: Place | string): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem(USAGE_STATS_STORAGE_KEY);
    const stats: Record<string, { count: number; lastUsed: number; place?: Place }> = raw ? JSON.parse(raw) : {};

    let name = '';
    let placeObj: Place | undefined;

    if (typeof placeOrQuery === 'string') {
      name = placeOrQuery;
    } else if (placeOrQuery && placeOrQuery.name) {
      name = placeOrQuery.name;
      placeObj = {
        id: placeOrQuery.id,
        name: placeOrQuery.name,
        address: placeOrQuery.address,
        coordinates: placeOrQuery.coordinates,
        category: placeOrQuery.category || 'Local Selecionado'
      };
    }

    const key = normalizeKey(name);
    if (!key) return;

    const existing = stats[key] || { count: 0, lastUsed: Date.now() };
    stats[key] = {
      count: existing.count + 1,
      lastUsed: Date.now(),
      place: placeObj || existing.place
    };

    localStorage.setItem(USAGE_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (err) {
    // ignore
  }
}

/**
 * Retorna os 20 locais mais buscados e usados do sistema.
 * Agrega:
 * 1. Frequência de buscas registradas localmente
 * 2. Ocorrência de locais nos pedidos ativos e históricos (`allPlaces`)
 * 3. Base oficial dos 20 hubs mais estratégicos da região
 */
export function getTop20MostUsedPlaces(allPlaces: Place[] = []): Place[] {
  const usageStatsMap = new Map<string, { score: number; place: Place }>();

  // 1. Carrega os 20 padrões com pontuação base
  DEFAULT_TOP_20_PLACES.forEach((p, idx) => {
    const key = normalizeKey(p.name);
    // Pontuação decrescente de 30 até 11 para garantir ordenação base sólida
    usageStatsMap.set(key, {
      score: 30 - idx,
      place: p
    });
  });

  // 2. Pontua com base em pedidos reais existentes (`allPlaces`)
  if (Array.isArray(allPlaces)) {
    allPlaces.forEach(p => {
      if (!p || !p.name || !p.coordinates) return;
      const key = normalizeKey(p.name);
      const existing = usageStatsMap.get(key);

      if (existing) {
        existing.score += 5; // Aumenta relevância se tiver pedidos ativos
      } else {
        usageStatsMap.set(key, {
          score: 8,
          place: {
            id: p.id,
            name: p.name,
            address: p.address || p.name,
            coordinates: p.coordinates,
            category: p.category || (p.operationType ? `Pedido (${p.operationType})` : 'Local Cadastrado')
          }
        });
      }
    });
  }

  // 3. Pontua com base nas buscas e cliques do usuário salvas no localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(USAGE_STATS_STORAGE_KEY);
      if (raw) {
        const stats: Record<string, { count: number; lastUsed: number; place?: Place }> = JSON.parse(raw);
        for (const [key, item] of Object.entries(stats)) {
          const existing = usageStatsMap.get(key);
          const bonus = (item.count || 1) * 10;

          if (existing) {
            existing.score += bonus;
          } else if (item.place && item.place.coordinates) {
            usageStatsMap.set(key, {
              score: bonus,
              place: item.place
            });
          }
        }
      }
    } catch {}
  }

  // Ordena por pontuação (mais usados primeiro) e retorna estritamente os 20 primeiros
  const sorted = Array.from(usageStatsMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(item => item.place);

  return sorted;
}
