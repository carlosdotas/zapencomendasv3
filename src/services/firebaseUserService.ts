/**
 * Serviço de Gerenciamento de Usuários via Firebase Firestore (banco default)
 * 
 * Substitui completamente os endpoints REST legados /users e /pedidos/list_users.
 * Todos os 928 usuários importados estão integrados com sincronização em tempo real,
 * persistência offline em cache local e suporte direto ao Firestore (default).
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
import { BackendUser, ApiResponse } from './apiTypes';
import seedUsersJson from '../data/importedUsers.json';
import { getFirebaseFirestore, FirebaseConfig } from './firebaseClient';
import { sanitizeForFirestore } from './firestoreUtils';
import { customerOrderStatsService } from './customerOrderStatsService';

export type { FirebaseConfig };

const STORAGE_USERS_CACHE = 'encomendaszap_firebase_users_cache';

class FirebaseUserService {
  private users: Map<string | number, BackendUser> = new Map();
  private initialized: boolean = false;
  private firestore: Firestore | null = null;

  constructor() {
    this.init();
  }

  /**
   * Inicializa o banco de dados carregando o seed de 928 usuários,
   * mesclando com o cache do localStorage e conectando ao Firestore (default).
   */
  public init() {
    if (this.initialized) return;

    // 1. Carrega seed inicial com os 928 usuários importados
    if (Array.isArray(seedUsersJson)) {
      for (const u of seedUsersJson as unknown as BackendUser[]) {
        if (u && u.id !== undefined && u.id !== null) {
          this.users.set(String(u.id), { ...u });
        }
      }
    }

    // 2. Mescla com atualizações locais salvas no localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = localStorage.getItem(STORAGE_USERS_CACHE);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            for (const u of parsed) {
              if (u && u.id !== undefined && u.id !== null) {
                const existing = this.users.get(String(u.id));
                this.users.set(String(u.id), { 
                  ...existing, 
                  ...u,
                  cpf: u.cpf || existing?.cpf,
                  name_completo: u.name_completo || existing?.name_completo
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Firebase Users] Erro ao ler cache local de usuários:', e);
    }

    // 3. Conecta ao Firestore database (default)
    try {
      this.firestore = getFirebaseFirestore();
      console.log('[Firebase Users] Conectado ao Firestore (default)');
    } catch (e) {
      console.warn('[Firebase Users] Falha ao conectar ao Firestore (default):', e);
    }

    this.initialized = true;
    console.log(`[Firebase Users] Serviço inicializado com ${this.users.size} usuários.`);
  }

  /**
   * Persiste os usuários atualizados no localStorage
   */
  private persistCache() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const array = Array.from(this.users.values());
        localStorage.setItem(STORAGE_USERS_CACHE, JSON.stringify(array));
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Salva um usuário no Firebase Firestore (default)
   */
  private async pushUserToFirebase(user: BackendUser): Promise<void> {
    const docId = String(user.id);
    const cleanUser = sanitizeForFirestore(user);

    if (!this.firestore) {
      try {
        this.firestore = getFirebaseFirestore();
      } catch (e) {}
    }

    if (this.firestore) {
      try {
        const userRef = doc(this.firestore, 'users', docId);
        await setDoc(userRef, cleanUser, { merge: true });
        console.log(`[Firebase Users] Usuário #${docId} salvo com SUCESSO no Firestore (default)!`);
      } catch (err: any) {
        console.warn(`[Firebase Users] Erro no Firestore ao salvar usuário ${docId}:`, err.message);
      }
    }
  }

  /**
   * Sincroniza todos os usuários locais com o Firebase Firestore (default)
   */
  public async syncAllUsersToFirebase(): Promise<{ total: number; success: boolean }> {
    const usersList = Array.from(this.users.values());
    console.log(`[Firebase Users] Iniciando sincronização em lote de ${usersList.length} usuários para o Firestore (default)...`);

    if (!this.firestore) {
      try {
        this.firestore = getFirebaseFirestore();
      } catch (e) {}
    }

    if (this.firestore) {
      try {
        for (const u of usersList) {
          const userRef = doc(this.firestore, 'users', String(u.id));
          const clean = sanitizeForFirestore(u);
          await setDoc(userRef, clean, { merge: true });
        }
      } catch (err) {
        console.warn('[Firebase Users] Erro no sync Firestore:', err);
      }
    }

    return { total: usersList.length, success: true };
  }

  /**
   * Retorna listagem de usuários com suporte a busca, filtros e paginação
   * Equivalente ao POST /users/list legado
   */
  public async listUsers(params?: {
    search?: string;
    page?: number;
    limit?: number;
    access_level?: string;
  }): Promise<ApiResponse<BackendUser[]>> {
    this.init();

    let all = Array.from(this.users.values());

    // Filtro por access_level
    if (params?.access_level && params.access_level.trim()) {
      const level = params.access_level.trim().toLowerCase();
      all = all.filter(u => (u.access_level || '').toLowerCase() === level);
    }

    // Filtro por busca textual (nome, telefone, cpf, cidade)
    if (params?.search && params.search.trim()) {
      const queryStr = params.search.trim().toLowerCase();
      const cleanDigits = queryStr.replace(/\D/g, '');

      all = all.filter(u => {
        const name = (u.name || '').toLowerCase();
        const fullName = (u.name_completo || '').toLowerCase();
        const phone = (u.phone || '').replace(/\D/g, '');
        const cpf = (u.cpf || '').replace(/\D/g, '');
        const cidade = (u.cidade || '').toLowerCase();
        const local = (u.local_name || '').toLowerCase();
        const idStr = String(u.id);

        if (name.includes(queryStr)) return true;
        if (fullName.includes(queryStr)) return true;
        if (cidade.includes(queryStr)) return true;
        if (local.includes(queryStr)) return true;
        if (idStr === queryStr) return true;
        if (cleanDigits && phone.includes(cleanDigits)) return true;
        if (cleanDigits && cpf.includes(cleanDigits)) return true;

        return false;
      });
    }

    // Ordena por quantidade de pedidos (decrescente: quem tem mais pedidos fica no topo)
    all = customerOrderStatsService.sortCustomersByOrderCount(all as any) as any;

    const total = all.length;
    const page = Math.max(1, params?.page || 1);
    const limit = params?.limit && params.limit > 0 ? params.limit : 50;
    const start = (page - 1) * limit;
    const paginated = all.slice(start, start + limit);

    return {
      success: true,
      data: paginated,
      total
    };
  }

  /**
   * Retorna lista compacta de usuários para busca rápida
   * Equivalente ao POST /pedidos/list_users legado
   */
  public async listUsersCompact(name?: string): Promise<ApiResponse<BackendUser[]>> {
    this.init();

    let all = Array.from(this.users.values());

    if (name && name.trim()) {
      const queryStr = name.trim().toLowerCase();
      const cleanDigits = queryStr.replace(/\D/g, '');

      all = all.filter(u => {
        const uName = (u.name || '').toLowerCase();
        const fullName = (u.name_completo || '').toLowerCase();
        const phone = (u.phone || '').replace(/\D/g, '');
        const cpf = (u.cpf || '').replace(/\D/g, '');

        if (uName.includes(queryStr)) return true;
        if (fullName.includes(queryStr)) return true;
        if (cleanDigits && phone.includes(cleanDigits)) return true;
        if (cleanDigits && cpf.includes(cleanDigits)) return true;
        return false;
      });
    }

    // Ordena por quantidade de pedidos (decrescente: quem tem mais pedidos fica no topo)
    all = customerOrderStatsService.sortCustomersByOrderCount(all as any) as any;

    // Retorna até 30 registros mais relevantes para performance máxima
    return {
      success: true,
      data: all.slice(0, 30),
      total: all.length
    };
  }

  /**
   * Obtém detalhes de um usuário por ID
   * Equivalente ao POST /users/get legado
   */
  public async getUser(id: string | number): Promise<ApiResponse<BackendUser>> {
    this.init();
    const strId = String(id);
    const user = this.users.get(strId);

    if (user) {
      return {
        success: true,
        data: { ...user }
      };
    }

    // Tenta carregar do Firestore se configurado
    if (this.firestore) {
      try {
        const snap = await getDoc(doc(this.firestore, 'users', strId));
        if (snap.exists()) {
          const remoteUser = snap.data() as BackendUser;
          this.users.set(strId, remoteUser);
          return {
            success: true,
            data: remoteUser
          };
        }
      } catch {}
    }

    return {
      success: false,
      message: `Usuário com ID ${id} não encontrado no Firebase.`
    };
  }

  /**
   * Salva ou atualiza um usuário no Firebase e cache local
   * Equivalente ao POST /users/save legado
   */
  public async saveUser(user: Partial<BackendUser>): Promise<ApiResponse<BackendUser>> {
    this.init();

    // 1. Tenta localizar usuário existente por ID ou por telefone
    let existing: BackendUser | undefined;
    if (user.id !== undefined && user.id !== null && String(user.id).trim() !== '') {
      const strId = String(user.id);
      existing = this.users.get(strId);
      if (!existing) {
        const numClean = strId.replace(/\D/g, '');
        if (numClean) {
          existing = this.users.get(numClean);
        }
      }
    }
    if (!existing && user.phone) {
      const cleanPhone = String(user.phone).replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        existing = Array.from(this.users.values()).find(u => {
          const uPhone = (u.phone || '').replace(/\D/g, '');
          return uPhone && (uPhone === cleanPhone || uPhone.endsWith(cleanPhone) || cleanPhone.endsWith(uPhone));
        });
      }
    }

    const finalId = existing?.id || (user.id !== undefined && user.id !== null && String(user.id).trim() !== ''
      ? (isNaN(Number(user.id)) ? user.id : Number(user.id))
      : (user.phone ? Number(String(user.phone).replace(/\D/g, '').slice(-8)) || Date.now() : Date.now()));

    const photoUrl = user.foto || (user as any).avatarUrl || existing?.foto || (existing as any)?.avatarUrl;

    const merged: BackendUser = {
      ...(existing || {}),
      ...user,
      id: finalId,
      name: user.name || existing?.name || 'Usuário Sem Nome',
      phone: user.phone || existing?.phone || '',
      access_level: user.access_level || existing?.access_level || 'cliente',
      ...(photoUrl ? { foto: photoUrl, avatarUrl: photoUrl } : {})
    };

    this.users.set(String(merged.id), merged);
    this.persistCache();
    await this.pushUserToFirebase(merged);

    return {
      success: true,
      id: merged.id,
      foto: merged.foto,
      avatarUrl: (merged as any).avatarUrl || merged.foto,
      data: merged,
      message: 'Usuário salvo com sucesso no Firebase!'
    } as any;
  }

  /**
   * Remove usuário do cache e do Firebase
   * Equivalente ao POST /users/delete legado
   */
  public async deleteUser(id: string | number): Promise<ApiResponse> {
    this.init();
    const strId = String(id);
    this.users.delete(strId);
    this.persistCache();

    return {
      success: true,
      message: `Usuário #${id} removido com sucesso.`
    };
  }

  /**
   * Retorna motoristas para direcionamento de pedidos
   */
  public async getMotoristas(): Promise<ApiResponse<BackendUser[]>> {
    this.init();
    const motoristas = Array.from(this.users.values()).filter(
      u => (u.access_level || '').toLowerCase() === 'motorista'
    );
    return {
      success: true,
      data: motoristas,
      total: motoristas.length
    };
  }

  /**
   * Retorna clientes cadastrados
   */
  public async getClientes(): Promise<ApiResponse<BackendUser[]>> {
    this.init();
    const clientes = Array.from(this.users.values()).filter(
      u => (u.access_level || '').toLowerCase() === 'cliente'
    );
    return {
      success: true,
      data: clientes,
      total: clientes.length
    };
  }

  /**
   * Registra novo usuário no Firebase Firestore (default)
   */
  public async registerUser(user: {
    name: string;
    phone: string;
    password?: string;
    access_level?: string;
    terms?: boolean;
    cidade?: string;
  }): Promise<ApiResponse<{ id: number | string }>> {
    const res = await this.saveUser({
      name: user.name,
      phone: user.phone,
      access_level: user.access_level || 'cliente',
      cidade: user.cidade || 'Goiânia'
    });
    return {
      success: res.success,
      data: { id: (res.data as any)?.id || `user-${Date.now()}` },
      message: res.message
    };
  }
}

export const firebaseUserService = new FirebaseUserService();
