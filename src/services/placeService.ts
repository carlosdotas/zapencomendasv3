/**
 * Serviço de Gerenciamento de Locais (cliente HTTP do backend /locais)
 *
 * Mantém um cache em memória dos locais cadastrados para busca instantânea e
 * para o "snapping" síncrono de cliques no mapa, economizando chamadas ao Google Maps.
 */

import { BackendLocal, ApiResponse } from './apiTypes';
import { Place } from '../types/map';
import { request } from './httpClient';

const CACHE_LIMIT = 5000;

class PlaceService {
  private places: Map<string, BackendLocal> = new Map();
  private loadPromise: Promise<void> | null = null;

  /**
   * Carrega o cache em memória com os locais cadastrados no servidor.
   */
  public init(force: boolean = false): Promise<void> {
    if (this.loadPromise && !force) return this.loadPromise;
    this.loadPromise = this.loadFromServer().catch(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async loadFromServer(): Promise<void> {
    const res = await request<BackendLocal[]>('/locais', 'POST', { limit: CACHE_LIMIT, page: 1 }, 30000);
    if (!res.success || !Array.isArray(res.data)) {
      throw new Error(res.message || 'Não foi possível carregar os locais.');
    }
    this.places.clear();
    for (const p of res.data) {
      if (p && p.id !== undefined && p.id !== null) this.places.set(String(p.id), p);
    }
  }

  public remember(local?: BackendLocal | null) {
    if (local && local.id !== undefined && local.id !== null) this.places.set(String(local.id), local);
  }

  /**
   * Lista locais com suporte a filtros completos
   */
  public async getLocais(params?: {
    search?: string;
    page?: number;
    limit?: number;
    cidade?: string;
    setor?: string;
    central_coletas?: boolean | number;
    sort_by?: string;
    sort_dir?: 'ASC' | 'DESC';
  }): Promise<ApiResponse<BackendLocal[]>> {
    const body: Record<string, any> = { ...(params || {}) };
    if (params?.central_coletas !== undefined) body.central_coletas = Boolean(params.central_coletas);
    return request<BackendLocal[]>('/locais', 'POST', body, 20000);
  }

  /**
   * Retorna os locais centrais de coleta
   */
  public async getLocaisCentrais(): Promise<ApiResponse<Array<{ id: number | string; name: string; cidade: string; lat: number; lng: number }>>> {
    return request('/locais/centrais', 'POST');
  }

  public async getCentraisByCidade(cidade: string, estado?: string): Promise<ApiResponse<BackendLocal[]>> {
    const res = await this.getLocais({ central_coletas: true, limit: 1000 });
    if (!res.success || !Array.isArray(res.data)) return res;

    const normalizeCity = (value: string) => value
      .trim()
      .replace(/\s*[-,]\s*[a-z]{2}$/i, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const cityKey = normalizeCity(cidade);
    const stateKey = estado?.trim().toUpperCase();

    const centrais = res.data.filter(local => {
      const localCity = String(local.cidade || '');
      if (normalizeCity(localCity) !== cityKey) return false;
      if (!stateKey) return true;

      const localState = localCity.match(/[-,]\s*([a-z]{2})\s*$/i)?.[1]?.toUpperCase();
      return !localState || localState === stateKey;
    });

    return { success: true, data: centrais, total: centrais.length };
  }

  /**
   * Obtém um local por ID
   */
  public async getLocalById(id: string | number): Promise<ApiResponse<BackendLocal>> {
    const res = await request<BackendLocal>(`/locais/${encodeURIComponent(String(id))}`, 'GET');
    if (res.success) this.remember(res.data);
    return res;
  }

  /**
   * Busca local por link do Google Maps
   */
  public async buscarLocalLink(link: string): Promise<ApiResponse<BackendLocal>> {
    return request<BackendLocal>('/locais/buscar_local_link', 'POST', { link: link.trim() });
  }

  /**
   * Encontra de forma síncrona o local mais próximo na memória (ótimo para snapping de cliques no mapa)
   */
  public getClosestLocalSync(
    lat: number,
    lng: number,
    maxDistanceMeters: number = 40
  ): { local: BackendLocal; distMeters: number } | null {
    let closest: { local: BackendLocal; distMeters: number } | null = null;
    const maxDistKm = maxDistanceMeters / 1000;

    for (const p of this.places.values()) {
      const pLat = Number(p.lat);
      const pLng = Number(p.lng);
      if (isNaN(pLat) || isNaN(pLng) || (pLat === 0 && pLng === 0)) continue;

      const dLat = (pLat - lat) * (Math.PI / 180);
      const dLng = (pLng - lng) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat * (Math.PI / 180)) * Math.cos(pLat * (Math.PI / 180)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distKm = 6371 * c;

      if (distKm <= maxDistKm) {
        const distM = distKm * 1000;
        if (!closest || distM < closest.distMeters) {
          closest = { local: p, distMeters: distM };
        }
      }
    }

    return closest;
  }

  /**
   * Encontra o local mais próximo das coordenadas informadas
   */
  public async getLocaisNearby(
    lat: number,
    lng: number,
    radiusKm: number = 0.5
  ): Promise<ApiResponse<{ id: number; name: string; lat: number; lng: number; dist_km?: number; dist_m?: number } | null>> {
    return request('/locais/nearby', 'POST', { lat, lng, radius_km: radiusKm });
  }

  /**
   * Atualiza dados de um local existente
   */
  public async updateLocal(id: number | string, data: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    const res = await request<BackendLocal>('/locais/update', 'POST', { ...data, id });
    if (res.success) this.remember(res.data);
    return res;
  }

  /**
   * Salva ou cria um local
   */
  public async saveLocal(localData: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    const res = await request<BackendLocal>('/locais/save', 'POST', localData);
    if (res.success) this.remember(res.data);
    return res;
  }

  /**
   * Busca nos locais cadastrados antes de consultar o Google Maps (economiza chamadas de API).
   * Só retorna se houver correspondência de alta relevância com o nome ou endereço buscado (score >= 60).
   */
  public async searchPlaces(queryStr: string, limit: number = 8): Promise<Place[]> {
    const q = (queryStr || '').trim();
    if (!q || q.length < 2) return [];

    await this.init();

    const normalize = (str: string) => (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normQ = normalize(q);
    if (!normQ) return [];

    const stopWords = new Set([
      'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas',
      'para', 'pra', 'com', 'um', 'uma', 'o', 'a', 'os', 'as', 'rua', 'r',
      'r.', 'av', 'av.', 'avenida', 'alameda', 'al', 'al.', 'travessa', 'tv',
      'tv.', 'praca', 'praça', 'setor', 'st', 'st.', 'bairro', 'qd', 'lt',
      'quadra', 'lote', 'numero', 'n', 'nº', 'goiania', 'goiânia', 'anapolis',
      'anápolis', 'go', 'goias', 'goiás', 'brasil'
    ]);

    const allWords = normQ.split(' ').filter(w => w.length > 0);
    const significantWords = allWords.filter(w => !stopWords.has(w) && w.length >= 2);
    const searchTerms = significantWords.length > 0 ? significantWords : allWords;

    const matches: Array<{ local: BackendLocal; score: number }> = [];

    for (const p of this.places.values()) {
      const pLat = Number(p.lat);
      const pLng = Number(p.lng);
      if (isNaN(pLat) || isNaN(pLng) || (pLat === 0 && pLng === 0)) continue;

      const normName = normalize(p.name || '');
      const normAddr = normalize(p.endereco || p.rua || '');
      const normFull = normalize([p.name, p.endereco, p.rua, p.setor, p.cidade].filter(Boolean).join(' '));

      let score = 0;
      if (normName === normQ) {
        score = 100;
      } else if (normName.startsWith(normQ)) {
        score = 90;
      } else if (normName.includes(normQ) && normQ.length >= 3) {
        score = 80;
      } else if (searchTerms.length > 0 && searchTerms.every(w => normName.includes(w))) {
        score = 75;
      } else if (searchTerms.length > 0 && searchTerms.every(w => normFull.includes(w)) && searchTerms.some(w => normName.includes(w))) {
        score = 65;
      } else if (allWords.length >= 2 && allWords.every(w => normAddr.includes(w))) {
        score = 60;
      }

      if (score >= 60) {
        matches.push({ local: p, score });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit).map(({ local }) => {
      const fullAddr = local.endereco || [local.rua, local.numero, local.setor, local.cidade].filter(Boolean).join(', ');
      return {
        id: String(local.id),
        name: local.name,
        category: local.setor ? `${local.setor} (Local Cadastrado)` : 'Local Cadastrado',
        address: fullAddr || local.name,
        coordinates: {
          lat: Number(local.lat),
          lng: Number(local.lng)
        },
        phone: local.telefone,
        website: local.site,
        description: fullAddr,
        fromDatabase: true
      } as Place;
    });
  }
}

export const placeService = new PlaceService();
