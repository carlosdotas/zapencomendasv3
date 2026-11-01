/**
 * Serviço de Gerenciamento de Empresas e Transportadoras via Firebase Firestore
 * 
 * Regras:
 * - Somente o Administrador Master (62996157340) tem acesso de gestão.
 * - Empresas enxergam apenas seus próprios dados (pedidos e clientes).
 * - Locais / Pontos de mapa são públicos e disponíveis para todos.
 * - Motoboys têm acesso restrito apenas aos pedidos das empresas que os autorizarem.
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  Firestore,
  Unsubscribe 
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebaseClient';
import { sanitizeForFirestore } from './firestoreUtils';
import { 
  CompanyTransportadora, 
  MASTER_ADMIN_PHONE, 
  MASTER_ADMIN_CLEAN 
} from '../types/company';
import { Place } from '../types/map';
import { Customer } from '../types/customer';

const COMPANIES_COLLECTION = 'companies';
const LOCAL_STORAGE_CACHE_KEY = 'encomendaszap_companies_cache_v1';

// Empresas padrão iniciais (são criadas caso o banco esteja vazio)
const INITIAL_COMPANIES: CompanyTransportadora[] = [
  {
    id: 'emp-matriz',
    name: 'ZapLog Transportes & Entregas Rápidas',
    tradeName: 'ZapLog Express',
    cnpj: '45.182.903/0001-88',
    phone: '(62) 99615-7340',
    cleanPhone: '62996157340',
    email: 'operacoes@zaplog.com.br',
    city: 'Goiânia',
    state: 'GO',
    address: 'Av. T-63, Qd. 14, St. Bueno',
    status: 'ativa',
    createdAt: Date.now() - 30 * 86400000,
    adminPhones: ['62996157340'],
    attendantPhones: ['62996157341'],
    motoboyPhones: ['62996157342', '62996157343'],
    pricingModel: 'discriminado'
  },
  {
    id: 'emp-cerrado',
    name: 'Cerrado Express Logística Integrada',
    tradeName: 'Cerrado Log',
    cnpj: '38.291.442/0001-19',
    phone: '(62) 98844-1234',
    cleanPhone: '62988441234',
    email: 'contato@cerradolog.com.br',
    city: 'Aparecida de Goiânia',
    state: 'GO',
    address: 'Pólo Empresarial Goiás, Galpão 04',
    status: 'ativa',
    createdAt: Date.now() - 15 * 86400000,
    adminPhones: ['62988441234'],
    attendantPhones: ['62988441235'],
    motoboyPhones: ['62996157342'],
    pricingModel: 'frete_unico',
    customFreightRate: 28.0
  }
];

class FirebaseCompanyService {
  private companies: Map<string, CompanyTransportadora> = new Map();
  private listeners: Set<(companies: CompanyTransportadora[]) => void> = new Set();
  private isSubscribed: boolean = false;
  private unsubscribeFn: Unsubscribe | null = null;

  constructor() {
    this.loadFromLocalCache();
    // Inicia a escuta em tempo real no Firestore imediatamente
    this.initRealtimeSync();
  }

  /**
   * Verifica se o telefone informado é do Administrador Master (62996157340)
   */
  public isMasterAdmin(rawPhone?: string | null): boolean {
    if (!rawPhone) return false;
    const clean = rawPhone.replace(/\D/g, '');
    return clean === MASTER_ADMIN_CLEAN || clean.endsWith('62996157340') || clean === '62996157340';
  }

  private loadFromLocalCache() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
      if (raw) {
        const parsed: CompanyTransportadora[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.companies.clear();
          parsed.forEach(c => this.companies.set(c.id, c));
          return;
        }
      }
      // Se não há cache, inicia com as empresas de exemplo
      INITIAL_COMPANIES.forEach(c => this.companies.set(c.id, c));
    } catch (e) {
      console.warn('[Firebase Company] Erro ao ler cache local:', e);
      INITIAL_COMPANIES.forEach(c => this.companies.set(c.id, c));
    }
  }

  private saveToLocalCache() {
    if (typeof window === 'undefined') return;
    try {
      const arr = Array.from(this.companies.values());
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(arr));
    } catch {}
  }

  /**
   * Monitora em tempo real a coleção 'companies' no Firestore
   */
  public initRealtimeSync(): void {
    if (this.isSubscribed) return;

    try {
      const firestore = getFirebaseFirestore();
      if (!firestore) return;

      const collRef = collection(firestore, COMPANIES_COLLECTION);
      this.isSubscribed = true;

      this.unsubscribeFn = onSnapshot(collRef, (snapshot) => {
        if (!snapshot.empty) {
          this.companies.clear();
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as CompanyTransportadora;
            this.companies.set(data.id || docSnap.id, {
              ...data,
              id: data.id || docSnap.id
            });
          });
          this.saveToLocalCache();
          this.notifyListeners();
        } else {
          // Se vazia na nuvem, faz seed inicial
          this.seedInitialCompanies();
        }
      }, (err) => {
        console.warn('[Firebase Company] Erro na escuta em tempo real:', err);
      });
    } catch (e) {
      console.warn('[Firebase Company] Falha ao conectar ao Firestore:', e);
    }
  }

  private async seedInitialCompanies() {
    const firestore = getFirebaseFirestore();
    if (!firestore) return;

    for (const comp of INITIAL_COMPANIES) {
      try {
        await setDoc(doc(firestore, COMPANIES_COLLECTION, comp.id), sanitizeForFirestore(comp));
      } catch {}
    }
  }

  private notifyListeners() {
    const list = Array.from(this.companies.values());
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (e) {
        console.error(e);
      }
    }
  }

  public subscribe(callback: (companies: CompanyTransportadora[]) => void): () => void {
    this.listeners.add(callback);
    callback(Array.from(this.companies.values()));
    this.initRealtimeSync();

    return () => {
      this.listeners.delete(callback);
    };
  }

  public getAll(): CompanyTransportadora[] {
    return Array.from(this.companies.values());
  }

  public getById(id: string): CompanyTransportadora | undefined {
    return this.companies.get(id);
  }

  /**
   * Salva ou atualiza empresa no Firestore e localmente
   */
  public async saveCompany(company: CompanyTransportadora): Promise<boolean> {
    const cleanId = company.id || `emp-${Date.now()}`;
    const toSave: CompanyTransportadora = {
      ...company,
      id: cleanId,
      cleanPhone: (company.phone || '').replace(/\D/g, ''),
      adminPhones: (company.adminPhones || []).map(p => p.replace(/\D/g, '')),
      attendantPhones: (company.attendantPhones || []).map(p => p.replace(/\D/g, '')),
      motoboyPhones: (company.motoboyPhones || []).map(p => p.replace(/\D/g, '')),
      updatedAt: Date.now()
    };

    this.companies.set(cleanId, toSave);
    this.saveToLocalCache();
    this.notifyListeners();

    try {
      const firestore = getFirebaseFirestore();
      if (firestore) {
        await setDoc(doc(firestore, COMPANIES_COLLECTION, cleanId), sanitizeForFirestore(toSave), { merge: true });
      }
      return true;
    } catch (e) {
      console.error('[Firebase Company] Erro ao salvar empresa:', e);
      return false;
    }
  }

  /**
   * Remove empresa
   */
  public async deleteCompany(id: string): Promise<boolean> {
    this.companies.delete(id);
    this.saveToLocalCache();
    this.notifyListeners();

    try {
      const firestore = getFirebaseFirestore();
      if (firestore) {
        await deleteDoc(doc(firestore, COMPANIES_COLLECTION, id));
      }
      return true;
    } catch (e) {
      console.error('[Firebase Company] Erro ao deletar empresa:', e);
      return false;
    }
  }

  /**
   * Retorna a empresa onde o usuário atua como Admin ou Atendente
   */
  public getUserCompany(rawPhone?: string): CompanyTransportadora | null {
    if (!rawPhone) return null;
    const clean = rawPhone.replace(/\D/g, '');
    for (const comp of this.companies.values()) {
      if (comp.adminPhones?.includes(clean) || comp.attendantPhones?.includes(clean) || comp.cleanPhone === clean) {
        return comp;
      }
    }
    return null;
  }

  /**
   * Retorna as empresas das quais o motoboy pode receber pedidos
   */
  public getCompaniesForMotoboy(rawPhone?: string): CompanyTransportadora[] {
    if (!rawPhone) return [];
    const clean = rawPhone.replace(/\D/g, '');
    return Array.from(this.companies.values()).filter(c => c.motoboyPhones?.includes(clean));
  }

  /**
   * Filtro de Acesso aos Pedidos (Ordens)
   * Regras:
   * 1. Master Admin (62996157340) enxerga tudo.
   * 2. Locais físicos (POIs do mapa sem operação de frete) estão disponíveis para TODOS.
   * 3. Se for motoboy: enxerga pedidos das empresas que o autorizaram.
   * 4. Se for admin de transportadora ou atendente: enxerga somente pedidos da sua empresa.
   */
  public canUserAccessPlace(place: Place, userPhone?: string, userRole?: string): boolean {
    // Locais físicos (POIs de mapa / pontos sem operação ativa de entrega) são públicos para todos
    if (!place.operationType) {
      return true;
    }

    if (this.isMasterAdmin(userPhone)) {
      return true;
    }

    if (!userPhone) return true;
    const clean = userPhone.replace(/\D/g, '');

    // Se o pedido não tem empresa associada, fica visível como geral/aberto
    if (!place.companyId) {
      return true;
    }

    // Se for motoboy
    if (userRole === 'motorista') {
      // Pedidos públicos ou sem empresa vinculada são acessíveis a todos os motoristas
      if (!place.companyId || place.orderVisibility === 'publico') {
        return true;
      }
      const allowedCompanies = this.getCompaniesForMotoboy(clean);
      // Se não há empresas restritas cadastradas para este motoboy, ele tem acesso geral
      if (allowedCompanies.length === 0) {
        return true;
      }
      return allowedCompanies.some(c => c.id === place.companyId);
    }

    // Se for admin de empresa ou atendente
    const userCompany = this.getUserCompany(clean);
    if (userCompany) {
      return userCompany.id === place.companyId;
    }

    // Caso padrão
    return true;
  }

  /**
   * Filtro de Acesso aos Clientes
   * Regras:
   * 1. Master Admin enxerga todos os clientes.
   * 2. Clientes sem empresa vinculada são globais.
   * 3. Empresa enxerga apenas seus próprios clientes cadastrados.
   */
  public canUserAccessCustomer(customer: Customer, userPhone?: string): boolean {
    if (this.isMasterAdmin(userPhone)) {
      return true;
    }

    if (!customer.companyId) {
      return true;
    }

    if (!userPhone) return true;
    const clean = userPhone.replace(/\D/g, '');
    const userCompany = this.getUserCompany(clean);

    if (userCompany) {
      return userCompany.id === customer.companyId;
    }

    return false;
  }
}

export const firebaseCompanyService = new FirebaseCompanyService();
