/**
 * Serviço de Gerenciamento de Locais via Firebase Firestore (banco default)
 * 
 * Substitui os endpoints legados /locais.
 * Todos os 3636 locais importados estão integrados com persistência offline em cache local,
 * sincronização com Firebase Firestore (default), e busca prioritária para economia de API.
 */

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  Firestore,
  query,
  limit as fsLimit
} from 'firebase/firestore';
import { BackendLocal, ApiResponse } from './apiTypes';
import { Place, LocationCoordinates } from '../types/map';
import { getFirebaseFirestore, FirebaseConfig } from './firebaseClient';
import { sanitizeForFirestore } from './firestoreUtils';

const STORAGE_PLACES_CACHE = 'encomendaszap_firebase_places_cache';

class FirebasePlaceService {
  private places: Map<string | number, BackendLocal> = new Map();
  private initialized: boolean = false;
  private firestore: Firestore | null = null;

  constructor() {
    this.init();
  }

  /**
   * Inicializa o banco de dados carregando do cache do localStorage e conectando ao Firestore (default).
   */
  public async init() {
    if (this.initialized) return;

    // 1. Carrega do localStorage se houver
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = localStorage.getItem(STORAGE_PLACES_CACHE);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              if (p && p.id !== undefined && p.id !== null) {
                this.places.set(String(p.id), { ...p });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Firebase Places] Erro ao ler cache local de locais:', e);
    }

    // 2. Conecta ao Firestore database (default)
    try {
      this.firestore = getFirebaseFirestore();
      console.log('[Firebase Places] Conectado ao Firestore (default)');
    } catch (e) {
      console.warn('[Firebase Places] Falha ao conectar ao Firestore (default):', e);
    }

    // 3. Se o cache local estiver com poucos locais, carrega do servidor local (datastore dos 3636 locais importados)
    if (this.places.size < 100 && typeof window !== 'undefined') {
      this.loadFromServerDatastore().catch(() => {});
    }

    this.initialized = true;
    console.log(`[Firebase Places] Serviço inicializado com ${this.places.size} locais ativos.`);
  }

  /**
   * Carrega os locais do endpoint local (datastore dos 3636 locais importados)
   */
  private async loadFromServerDatastore() {
    try {
      const res = await fetch('/locais?limit=4000', {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json.data) ? json.data : [];
        for (const p of list) {
          if (p && p.id !== undefined && p.id !== null) {
            this.places.set(String(p.id), { ...p });
          }
        }
        this.persistCache();
        console.log(`[Firebase Places] Carregados ${list.length} locais do datastore para o Firebase.`);
      }
    } catch (err) {
      // Ignora erro em ambientes sem rede
    }
  }

  /**
   * Persiste os locais atualizados no localStorage
   */
  private persistCache() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Salva os 500 mais relevantes/recentes para respeitar a quota do navegador
        const array = Array.from(this.places.values()).slice(0, 500);
        localStorage.setItem(STORAGE_PLACES_CACHE, JSON.stringify(array));
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Salva um local no Firebase Firestore (default) e no servidor local
   */
  private async pushPlaceToFirebase(place: BackendLocal): Promise<void> {
    const docId = String(place.id);
    const cleanPlace = sanitizeForFirestore(place);

    // 1. Envia via Firestore SDK diretamente para o banco (default)
    if (!this.firestore) {
      try {
        this.firestore = getFirebaseFirestore();
      } catch (e) {}
    }

    if (this.firestore) {
      try {
        const placeRef = doc(this.firestore, 'places', docId);
        await setDoc(placeRef, cleanPlace, { merge: true });
        console.log(`[Firebase Places] Local #${docId} salvo com SUCESSO no Firestore (default)!`);
      } catch (err: any) {
        console.warn(`[Firebase Places] Erro no Firestore ao salvar local ${docId}:`, err.message);
      }
    }

    // 2. Notifica servidor local
    if (typeof window !== 'undefined') {
      try {
        fetch('/locais/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanPlace)
        }).catch(() => {});
      } catch (e) {}
    }
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
    await this.init();

    if (this.places.size < 100 && typeof window !== 'undefined') {
      await this.loadFromServerDatastore();
    }

    let all = Array.from(this.places.values());

    if (params?.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim();
      all = all.filter(p => 
        (p.name || '').toLowerCase().includes(q) ||
        (p.endereco || '').toLowerCase().includes(q) ||
        (p.rua || '').toLowerCase().includes(q) ||
        (p.setor || '').toLowerCase().includes(q) ||
        (p.cidade || '').toLowerCase().includes(q)
      );
    }

    if (params?.cidade && params.cidade.trim()) {
      const c = params.cidade.toLowerCase().trim();
      all = all.filter(p => (p.cidade || '').toLowerCase().includes(c));
    }

    if (params?.setor && params.setor.trim()) {
      const s = params.setor.toLowerCase().trim();
      all = all.filter(p => (p.setor || '').toLowerCase().includes(s));
    }

    if (params?.central_coletas !== undefined) {
      const isCentral = Boolean(params.central_coletas);
      all = all.filter(p => Boolean(p.central_coletas) === isCentral);
    }

    const total = all.length;
    const page = Math.max(1, params?.page || 1);
    const limit = Math.max(1, params?.limit || 100);
    const start = (page - 1) * limit;
    const paginated = all.slice(start, start + limit);

    return {
      success: true,
      data: paginated,
      total
    };
  }

  /**
   * Retorna os locais centrais de coleta
   */
  public async getLocaisCentrais(): Promise<ApiResponse<Array<{ id: number | string; name: string; cidade: string; lat: number; lng: number }>>> {
    await this.init();
    const centrais = Array.from(this.places.values())
      .filter(p => Boolean(p.central_coletas))
      .map(p => ({
        id: p.id,
        name: p.name,
        cidade: p.cidade || 'Goiânia',
        lat: Number(p.lat),
        lng: Number(p.lng)
      }));
    return { success: true, data: centrais };
  }

  /**
   * Obtém um local por ID
   */
  public async getLocalById(id: string | number): Promise<ApiResponse<BackendLocal>> {
    await this.init();
    const strId = String(id);
    if (this.places.has(strId)) {
      return { success: true, data: this.places.get(strId)! };
    }

    if (this.firestore) {
      try {
        const snap = await getDoc(doc(this.firestore, 'places', strId));
        if (snap.exists()) {
          const data = snap.data() as BackendLocal;
          this.places.set(strId, data);
          return { success: true, data };
        }
      } catch (e) {}
    }

    return { success: false, message: 'Local não encontrado no Firebase' };
  }

  /**
   * Busca local por link do Google Maps
   */
  public async buscarLocalLink(link: string): Promise<ApiResponse<BackendLocal>> {
    await this.init();
    const cleanLink = link.trim();
    for (const p of this.places.values()) {
      if (p.link && (p.link === cleanLink || cleanLink.includes(p.link) || p.link.includes(cleanLink))) {
        return { success: true, data: p };
      }
    }
    return { success: false, message: 'Local não encontrado para este link' };
  }

  /**
   * Encontra de forma síncrona o local mais próximo na memória (ótimo para snapping de cliques no mapa)
   */
  public getClosestLocalSync(
    lat: number,
    lng: number,
    maxDistanceMeters: number = 40
  ): { local: BackendLocal; distMeters: number } | null {
    this.init();
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
  ): Promise<ApiResponse<{ id: number; name: string; lat: number; lng: number; dist_km?: number; local?: BackendLocal } | null>> {
    await this.init();
    let closest: { local: BackendLocal; dist: number } | null = null;

    for (const p of this.places.values()) {
      const pLat = Number(p.lat);
      const pLng = Number(p.lng);
      if (isNaN(pLat) || isNaN(pLng)) continue;

      // Haversine simplificado
      const dLat = (pLat - lat) * (Math.PI / 180);
      const dLng = (pLng - lng) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat * (Math.PI / 180)) * Math.cos(pLat * (Math.PI / 180)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distKm = 6371 * c;

      if (distKm <= radiusKm) {
        if (!closest || distKm < closest.dist) {
          closest = { local: p, dist: distKm };
        }
      }
    }

    if (closest) {
      return {
        success: true,
        data: {
          id: Number(closest.local.id) || 0,
          name: closest.local.name,
          lat: Number(closest.local.lat),
          lng: Number(closest.local.lng),
          dist_km: Math.round(closest.dist * 100) / 100,
          local: closest.local
        }
      };
    }

    return { success: true, data: null };
  }

  /**
   * Atualiza dados de um local existente
   */
  public async updateLocal(id: number | string, data: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    await this.init();
    const strId = String(id);
    const existing = this.places.get(strId);
    if (existing) {
      const updated: BackendLocal = {
        ...existing,
        ...data
      };
      this.places.set(strId, updated);
      this.persistCache();
      await this.pushPlaceToFirebase(updated);
      return { success: true, data: updated };
    }
    return { success: false, message: 'Local não encontrado' };
  }

  /**
   * Salva ou cria um local no Firebase Firestore (default)
   */
  public async saveLocal(localData: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    await this.init();
    const targetId = localData.id ? String(localData.id) : `loc-${Date.now()}`;
    const newLocal: BackendLocal = {
      id: targetId,
      name: localData.name || 'Local Sem Nome',
      lat: localData.lat || -16.6869,
      lng: localData.lng || -49.2648,
      endereco: localData.endereco || localData.rua || '',
      cidade: localData.cidade || 'Goiânia',
      ...localData
    };

    this.places.set(targetId, newLocal);
    this.persistCache();
    await this.pushPlaceToFirebase(newLocal);

    return { success: true, data: newLocal };
  }

  /**
   * BUSCA NO FIREBASE PRIMEIRO (ECONOMIZA CHAMADAS DE API GOOGLE MAPS)
   * Quando o usuário pesquisa um endereço ou estabelecimento, consulta primeiro
   * todos os locais indexados no Firebase.
   */
  public async searchPlaces(queryStr: string, limit: number = 8): Promise<Place[]> {
    await this.init();
    const q = queryStr.toLowerCase().trim();
    if (!q || q.length < 2) return [];

    if (this.places.size < 100 && typeof window !== 'undefined') {
      await this.loadFromServerDatastore();
    }

    const words = q.split(/\s+/).filter(Boolean);
    const matches: Array<{ local: BackendLocal; score: number }> = [];

    for (const p of this.places.values()) {
      const pLat = Number(p.lat);
      const pLng = Number(p.lng);
      if (isNaN(pLat) || isNaN(pLng) || (pLat === 0 && pLng === 0)) continue;

      const name = (p.name || '').toLowerCase();
      const addr = (p.endereco || p.rua || '').toLowerCase();
      const setor = (p.setor || '').toLowerCase();
      const cidade = (p.cidade || '').toLowerCase();
      const fullText = `${name} ${addr} ${setor} ${cidade}`;

      let score = 0;
      if (name === q) {
        score = 100;
      } else if (name.startsWith(q)) {
        score = 80;
      } else if (name.includes(q)) {
        score = 60;
      } else {
        const allWordsMatch = words.every(w => fullText.includes(w));
        if (allWordsMatch) {
          score = 40;
        } else {
          const matchCount = words.filter(w => fullText.includes(w)).length;
          if (matchCount > 0 && matchCount >= words.length / 2) {
            score = 20 * matchCount;
          }
        }
      }

      if (score > 0) {
        matches.push({ local: p, score });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, limit).map(({ local }) => {
      const fullAddr = local.endereco || [local.rua, local.numero, local.setor, local.cidade].filter(Boolean).join(', ');
      return {
        id: `fb-${local.id}`,
        name: local.name,
        category: local.setor ? `${local.setor} (Firebase)` : 'Firebase / Local Cadastrado',
        address: fullAddr || local.name,
        coordinates: {
          lat: Number(local.lat),
          lng: Number(local.lng)
        },
        phone: local.telefone,
        website: local.site,
        description: fullAddr
      } as Place;
    });

    if (topMatches.length > 0) {
      console.log(`[Firebase Places HIT] Encontrados ${topMatches.length} locais no Firebase para "${queryStr}" (economizou chamada de API do Google)`);
    }

    return topMatches;
  }

  /**
   * SALVA LOCAL BUSCADO NO FIREBASE
   * Sempre que uma busca no Google Maps ou link retornar um novo local,
   * ele é salvo no Firebase Firestore (default) para que as próximas buscas economizem requisições.
   */
  public async saveSearchedPlace(place: Place): Promise<void> {
    if (!place || !place.name || !place.coordinates) return;
    await this.init();

    const targetId = String(place.id).replace(/^fb-/, '');
    const existing = this.places.get(targetId);
    if (existing) return; // Já está indexado

    const newLocal: BackendLocal = {
      id: targetId.startsWith('loc-') ? targetId : `loc-${Date.now()}`,
      name: place.name,
      endereco: place.address || place.description || '',
      cidade: place.destinationCity || 'Goiânia',
      lat: place.coordinates.lat,
      lng: place.coordinates.lng,
      telefone: place.phone,
      site: place.website,
      place_id: (place as any).place_id || undefined
    };

    this.places.set(String(newLocal.id), newLocal);
    this.persistCache();
    await this.pushPlaceToFirebase(newLocal);
    console.log(`[Firebase Places STORED] Local "${place.name}" salvo no Firebase para futuras buscas.`);
  }
}

export const firebasePlaceService = new FirebasePlaceService();
