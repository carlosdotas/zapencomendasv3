/**
 * Serviço de Gerenciamento de Pedidos via Firebase Firestore (banco default)
 * 
 * Sincronização direta com o projeto zapencomendas-507212 e database (default).
 * Garante que todos os pedidos fiquem salvos permanentemente no Firestore.
 */

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc,
  Firestore,
  query,
  limit as fsLimit
} from 'firebase/firestore';
import { BackendPedido, ApiResponse } from './apiTypes';
import { getFirebaseFirestore, FirebaseConfig } from './firebaseClient';
import { sanitizeForFirestore } from './firestoreUtils';
import { getImageServerUrl, getImageServerPassword } from './api';
import seedOrdersJson from '../data/importedPedidos.json';

const STORAGE_ORDERS_CACHE = 'encomendaszap_firebase_orders_cache';

class FirebaseOrderService {
  private orders: Map<string | number, BackendPedido> = new Map();
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

    // 0. Semente inicial instantânea com pedidos importados (garante markers no mapa ao iniciar)
    if (this.orders.size === 0 && Array.isArray(seedOrdersJson)) {
      for (const o of seedOrdersJson as BackendPedido[]) {
        if (o && o.id !== undefined && o.id !== null) {
          this.orders.set(String(o.id), { ...o });
        }
      }
    }

    // 1. Carrega do localStorage se houver (sobrescrevendo com os dados locais mais recentes)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = localStorage.getItem(STORAGE_ORDERS_CACHE);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            for (const o of parsed) {
              if (o && o.id !== undefined && o.id !== null) {
                this.orders.set(String(o.id), { ...o });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Firebase Orders] Erro ao ler cache local de pedidos:', e);
    }

    // 2. Conecta ao Firestore database (default)
    try {
      this.firestore = getFirebaseFirestore();
      console.log('[Firebase Orders] Conectado ao Firestore (default)');
    } catch (e) {
      console.warn('[Firebase Orders] Falha ao conectar ao Firestore (default):', e);
    }

    // 3. Carrega pedidos do Firestore se disponíveis
    if (this.firestore && this.orders.size < 50) {
      await this.loadFromFirestore();
    }

    // 4. Se ainda estiver com poucos pedidos, carrega do servidor local (datastore dos 2000 pedidos)
    if (this.orders.size < 50 && typeof window !== 'undefined') {
      this.loadFromServerDatastore().catch(() => {});
    }

    this.initialized = true;
    console.log(`[Firebase Orders] Serviço inicializado com ${this.orders.size} pedidos ativos.`);
  }

  /**
   * Carrega pedidos recentes diretamente do Firestore (default)
   */
  public async loadFromFirestore(limitCount: number = 300) {
    if (!this.firestore) return;
    try {
      const q = query(collection(this.firestore, 'orders'), fsLimit(limitCount));
      const snap = await getDocs(q);
      let count = 0;
      snap.forEach(d => {
        const data = d.data() as BackendPedido;
        if (data && data.id !== undefined && data.id !== null) {
          this.orders.set(String(data.id), data);
          count++;
        }
      });
      if (count > 0) {
        this.persistCache();
        console.log(`[Firebase Orders] Carregados ${count} pedidos diretamente do Firestore (default).`);
      }
    } catch (err: any) {
      console.warn('[Firebase Orders] Aviso ao consultar Firestore:', err.message);
    }
  }

  /**
   * Carrega os pedidos do endpoint local (datastore dos 2000 pedidos importados)
   */
  private async loadFromServerDatastore() {
    try {
      const res = await fetch('/pedidos/list_pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ limit: 2000 })
      });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json.data) ? json.data : [];
        for (const o of list) {
          if (o && o.id !== undefined && o.id !== null) {
            this.orders.set(String(o.id), { ...o });
          }
        }
        this.persistCache();
        console.log(`[Firebase Orders] Carregados ${list.length} pedidos do datastore para a memória.`);
      }
    } catch (err) {
      // Ignora erro em ambientes sem rede
    }
  }

  /**
   * Persiste os pedidos atualizados no localStorage
   */
  private persistCache() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const array = Array.from(this.orders.values()).slice(0, 300);
        localStorage.setItem(STORAGE_ORDERS_CACHE, JSON.stringify(array));
      }
    } catch (e) {
      // ignore quota exceeded
    }
  }

  /**
   * Salva um pedido no Firebase Firestore database (default) e replica no servidor
   */
  public async pushOrderToFirebase(order: BackendPedido): Promise<void> {
    const docId = String(order.id);
    const cleanOrder = sanitizeForFirestore(order);

    // 1. Envia via Firestore SDK diretamente para o banco (default)
    if (!this.firestore) {
      try {
        this.firestore = getFirebaseFirestore();
      } catch (e) {}
    }

    if (this.firestore) {
      try {
        const orderRef = doc(this.firestore, 'orders', docId);
        await setDoc(orderRef, cleanOrder, { merge: true });
        const pedidosRef = doc(this.firestore, 'pedidos', docId);
        await setDoc(pedidosRef, cleanOrder, { merge: true }).catch(() => {});
        console.log(`[Firebase Orders] Pedido #${docId} salvo com SUCESSO no Firestore (default)!`);
      } catch (err: any) {
        console.error(`[Firebase Orders] Erro ao gravar pedido #${docId} no Firestore (default):`, err.message);
      }
    }

    // 2. Notifica servidor local para sincronização em background
    if (typeof window !== 'undefined') {
      try {
        fetch('/pedidos/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanOrder)
        }).catch(() => {});
      } catch (e) {}
    }
  }

  /**
   * Lista pedidos com suporte a filtros completos (data, status, motorista, tipo, etc.)
   */
  public async listPedidos(filters?: {
    data_ini?: string;
    data_fim?: string;
    tipo_veiculo?: string;
    tipo_encomenda?: string;
    status_pagamento?: string;
    etapa?: string | string[];
    nome?: string;
    id?: string | number;
    motorista_id?: string | number;
    cidade?: string;
    limit?: number;
    page?: number;
  }): Promise<ApiResponse<BackendPedido[]>> {
    await this.init();

    // Se a memória tiver poucos registros, tenta atualizar
    if (this.orders.size < 50 && typeof window !== 'undefined') {
      await this.loadFromServerDatastore();
    }

    let all = Array.from(this.orders.values());

    if (filters?.id !== undefined && filters.id !== null && filters.id !== '') {
      const targetId = String(filters.id);
      all = all.filter(o => String(o.id) === targetId);
    }

    if (filters?.motorista_id !== undefined && filters.motorista_id !== null && filters.motorista_id !== '') {
      const mId = String(filters.motorista_id);
      all = all.filter(o => 
        String(o.motorista_id || '') === mId ||
        String(o.coleta_user_id || '') === mId ||
        String(o.entrega_user_id || '') === mId ||
        (o.coleta_motoristas && o.coleta_motoristas.includes(mId)) ||
        (o.entrega_motoristas && o.entrega_motoristas.includes(mId))
      );
    }

    if (filters?.etapa) {
      const etapas = Array.isArray(filters.etapa) 
        ? filters.etapa.map(e => e.toLowerCase()) 
        : [filters.etapa.toLowerCase()];
      all = all.filter(o => o.etapa && etapas.includes(o.etapa.toLowerCase()));
    }

    if (filters?.tipo_encomenda) {
      const te = filters.tipo_encomenda.toLowerCase();
      all = all.filter(o => (o.tipo_encomenda || '').toLowerCase() === te);
    }

    if (filters?.tipo_veiculo) {
      const tv = filters.tipo_veiculo.toLowerCase();
      all = all.filter(o => (o.tipo_veiculo || '').toLowerCase() === tv);
    }

    if (filters?.status_pagamento) {
      const sp = filters.status_pagamento.toLowerCase();
      all = all.filter(o => (o.status_pagamento || '').toLowerCase() === sp);
    }

    if (filters?.cidade) {
      const cid = filters.cidade.toLowerCase();
      all = all.filter(o => (o.cidade || o.coleta_cidade || o.entrega_cidade || '').toLowerCase().includes(cid));
    }

    if (filters?.nome) {
      const q = filters.nome.toLowerCase().trim();
      all = all.filter(o => 
        (o.cliente || '').toLowerCase().includes(q) ||
        (o.mercadoria_nome || '').toLowerCase().includes(q) ||
        (o.locais_name || '').toLowerCase().includes(q) ||
        (o.coleta_nome || '').toLowerCase().includes(q) ||
        (o.entrega_nome || '').toLowerCase().includes(q) ||
        (o.phone || '').includes(q)
      );
    }

    if (filters?.data_ini) {
      const dIni = filters.data_ini.slice(0, 10);
      all = all.filter(o => (o.data || '').slice(0, 10) >= dIni);
    }

    if (filters?.data_fim) {
      const dFim = filters.data_fim.slice(0, 10);
      all = all.filter(o => (o.data || '').slice(0, 10) <= dFim);
    }

    // Ordena do mais recente para o mais antigo por ID
    all.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

    const page = filters?.page || 1;
    const limit = filters?.limit || 2000;
    const start = (page - 1) * limit;
    const paginated = all.slice(start, start + limit);

    return {
      success: true,
      data: paginated,
      total: all.length,
      page,
      limit
    };
  }

  /**
   * Localiza um pedido no cache em memória por ID, ID com prefixo/sufixo, ou código
   */
  public findOrder(idOrCode: any): BackendPedido | undefined {
    if (idOrCode === undefined || idOrCode === null || idOrCode === '') return undefined;
    const rawStr = String(idOrCode).trim();
    if (this.orders.has(rawStr)) return this.orders.get(rawStr);

    const cleanId = rawStr.replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
    if (cleanId && this.orders.has(cleanId)) return this.orders.get(cleanId);

    const digits = rawStr.replace(/\D/g, '');
    if (digits && this.orders.has(digits)) return this.orders.get(digits);

    for (const order of this.orders.values()) {
      const oIdStr = String(order.id).trim();
      const oCleanId = oIdStr.replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
      const oDigits = oIdStr.replace(/\D/g, '');

      if (oIdStr === rawStr || oIdStr === cleanId || oCleanId === cleanId) return order;
      if (digits && oDigits && digits === oDigits) return order;
      if (order.codigo && (String(order.codigo) === rawStr || String(order.codigo) === cleanId)) return order;
      if (order.orderCode && (String(order.orderCode) === rawStr || String(order.orderCode) === cleanId)) return order;
    }
    return undefined;
  }

  /**
   * Obtém um pedido específico por ID
   */
  public async getPedido(id: string | number): Promise<ApiResponse<BackendPedido>> {
    await this.init();

    const strId = String(id);
    const found = this.findOrder(id);
    if (found) {
      return { success: true, data: found };
    }

    // 2. Busca no Firestore (default) se disponível
    if (this.firestore) {
      const cleanId = strId.replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim() || strId;
      try {
        const orderRef = doc(this.firestore, 'orders', cleanId);
        let snap = await getDoc(orderRef);
        if (!snap.exists()) {
          snap = await getDoc(doc(this.firestore, 'pedidos', cleanId));
        }
        if (snap.exists()) {
          const data = snap.data() as BackendPedido;
          this.orders.set(cleanId, data);
          return { success: true, data };
        }
      } catch (err) {
        // ignore
      }
    }

    return { success: false, message: 'Pedido não encontrado no Firebase' };
  }

  /**
   * Salva ou atualiza um pedido no Firebase Firestore (default)
   */
  public async savePedido(pedidoData: Partial<BackendPedido>): Promise<ApiResponse<{ id: number | string }>> {
    // Motoristas NÃO possuem permissão para adicionar ou editar pedidos
    const userRole = typeof window !== 'undefined' ? localStorage.getItem('encomendaszap_user_role') : null;
    if (userRole === 'motorista') {
      console.warn('[firebaseOrderService.savePedido] Motoristas não possuem permissão para adicionar ou editar pedidos.');
      return {
        success: false,
        message: 'Motoristas não possuem permissão para adicionar ou editar pedidos.'
      };
    }

    await this.init();

    let targetId = pedidoData.id;
    let existing: BackendPedido | undefined;

    if (targetId !== undefined && targetId !== null && targetId !== '') {
      existing = this.findOrder(targetId);
    }

    if (existing) {
      // Atualização
      const updated: BackendPedido = {
        ...existing,
        ...pedidoData,
        id: existing.id,
        updated_at: new Date().toISOString()
      };
      this.orders.set(String(existing.id), updated);
      this.persistCache();
      await this.pushOrderToFirebase(updated);

      return {
        success: true,
        data: { id: existing.id },
        message: 'Pedido atualizado com sucesso no Firebase!'
      };
    } else {
      // Criação de novo pedido
      const cleanId = String(targetId || '').replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
      let newId: any = cleanId;
      if (!newId) {
        const maxId = Array.from(this.orders.values()).reduce((max, o) => Math.max(max, Number(o.id) || 0), 10000);
        newId = maxId + 1;
      }
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      const newOrder: BackendPedido = {
        id: newId,
        data: dateStr,
        etapa: pedidoData.etapa || 'pendente',
        tipo_encomenda: pedidoData.tipo_encomenda || 'coleta',
        tipo_veiculo: pedidoData.tipo_veiculo || 'moto',
        cliente: pedidoData.cliente || 'Cliente',
        phone: pedidoData.phone || '',
        cidade: pedidoData.cidade || 'Goiânia',
        status_pagamento: pedidoData.status_pagamento || 'pendente',
        total: pedidoData.total || 0,
        created_at: new Date().toISOString(),
        ...pedidoData
      };
      newOrder.id = newId;

      this.orders.set(String(newId), newOrder);
      this.persistCache();
      await this.pushOrderToFirebase(newOrder);

      return {
        success: true,
        data: { id: newId },
        message: 'Pedido salvo com sucesso no Firebase!'
      };
    }
  }

  /**
   * Exclui um pedido definitivamente do Firebase Firestore, RTDB e cache
   */
  public async deletePedido(id: string | number): Promise<ApiResponse> {
    const userRole = typeof window !== 'undefined' ? localStorage.getItem('encomendaszap_user_role') : null;
    if (userRole === 'motorista') {
      return {
        success: false,
        message: 'Motoristas não possuem permissão para excluir pedidos.'
      };
    }

    await this.init();

    const cleanId = String(id || '').replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
    const existing = this.findOrder(cleanId) || this.findOrder(id);

    const targetKey = existing ? String(existing.id) : cleanId;
    if (targetKey) {
      this.orders.delete(targetKey);
      this.orders.delete(String(id));
      this.orders.delete(cleanId);
    }
    this.persistCache();

    // 1. Remove do Firestore
    if (this.firestore && targetKey) {
      try {
        const orderRef = doc(this.firestore, 'pedidos', targetKey);
        await deleteDoc(orderRef);
      } catch (err: any) {
        console.warn('[firebaseOrderService.deletePedido] Erro ao deletar do Firestore:', err.message);
      }
    }

    // 2. Remove do Firebase RTDB
    const rtdbUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_DATABASE_URL) || 'https://zapencomendas-507212-default-rtdb.firebaseio.com';
    if (rtdbUrl && targetKey) {
      try {
        const cleanUrl = rtdbUrl.replace(/\/+$/, '');
        await fetch(`${cleanUrl}/pedidos/${targetKey}.json`, { method: 'DELETE' });
      } catch {}
    }

    // 3. Notifica backend Express local
    try {
      await fetch('/api/pedidos/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetKey })
      });
    } catch {}

    return {
      success: true,
      message: 'Pedido excluído com sucesso!'
    };
  }

  /**
   * Marca coleta, entrega ou troca de pedido
   */
  public async marcarColetaEntrega(
    pedidoId: string | number,
    etapa: 'coletado' | 'trocado' | 'entregue',
    userId?: string | number,
    userName?: string
  ): Promise<ApiResponse<{ pedido_id: string | number; etapa: string }>> {
    await this.init();
    const existing = this.findOrder(pedidoId);
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
    const targetKey = existing?.id ? String(existing.id) : (cleanId || String(pedidoId));

    const nowIso = new Date().toISOString();
    const updates: Partial<BackendPedido> = {
      etapa,
      updated_at: nowIso
    };

    if (etapa === 'coletado') {
      updates.coleta_saida_at = nowIso;
      if (userId) updates.coleta_user_id = userId;
      if (userName) updates.coleta_user_nome = userName;
    } else if (etapa === 'trocado') {
      updates.troca_saida_at = nowIso;
      updates.troca_at = nowIso;
      if (userId) updates.troca_user_id = userId;
      if (userName) updates.troca_user_nome = userName;
    } else if (etapa === 'entregue') {
      updates.entrega_saida_at = nowIso;
      updates.entrega_at = nowIso;
      if (userId) updates.entrega_user_id = userId;
      if (userName) updates.entrega_user_nome = userName;
      updates.status_pagamento = 'pago';
    }

    const merged: BackendPedido = existing 
      ? { ...existing, ...updates, id: existing.id }
      : { id: targetKey, created_at: nowIso, cliente: 'Cliente', ...updates } as BackendPedido;

    this.orders.set(targetKey, merged);
    this.persistCache();
    await this.pushOrderToFirebase(merged);

    return {
      success: true,
      data: { pedido_id: targetKey, etapa }
    };
  }

  /**
   * Atualiza a etapa do pedido
   */
  public async setEtapa(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    await this.init();
    const existing = this.findOrder(pedidoId);
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
    const targetKey = existing?.id ? String(existing.id) : (cleanId || String(pedidoId));
    const nowIso = new Date().toISOString();
    const nextEtapa = existing?.etapa === 'pendente' ? 'coletando' 
      : existing?.etapa === 'coletando' ? 'coletado' 
      : existing?.etapa === 'coletado' ? (existing?.tipo_encomenda === 'troca' ? 'trocando' : 'entregando')
      : existing?.etapa === 'trocando' ? 'trocado'
      : existing?.etapa === 'trocado' ? 'retornando'
      : existing?.etapa === 'retornando' ? 'entregue'
      : existing?.etapa === 'entregando' ? 'entregue'
      : 'finalizado';
    
    const merged: BackendPedido = existing 
      ? { ...existing, etapa: nextEtapa, updated_at: nowIso, id: existing.id }
      : { id: targetKey, etapa: nextEtapa, created_at: nowIso, updated_at: nowIso } as BackendPedido;

    this.orders.set(targetKey, merged);
    this.persistCache();
    await this.pushOrderToFirebase(merged);
    return { success: true };
  }

  /**
   * Finaliza o pedido
   */
  public async finalizarPedido(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    await this.init();
    const strId = String(pedidoId);
    const digits = strId.replace(/\D/g, '');
    const existing = this.orders.get(strId) || (digits ? (this.orders.get(digits) || this.orders.get(`pedido-${digits}`)) : undefined);
    const targetKey = existing?.id ? String(existing.id) : (digits || strId);
    const nowIso = new Date().toISOString();
    const merged: BackendPedido = existing 
      ? { ...existing, etapa: 'finalizado', status_pagamento: 'pago', updated_at: nowIso }
      : { id: targetKey, etapa: 'finalizado', status_pagamento: 'pago', created_at: nowIso, updated_at: nowIso } as BackendPedido;

    this.orders.set(targetKey, merged);
    if (strId !== targetKey) {
      this.orders.set(strId, merged);
    }
    this.persistCache();
    await this.pushOrderToFirebase(merged);
    return { success: true };
  }

  /**
   * Anexa foto ao pedido
   */
  public async appendFoto(
    pedidoId: string | number, 
    fotoPath: string, 
    campo: 'mercadoria_foto' | 'coleta_foto' | 'entrega_foto' = 'coleta_foto'
  ): Promise<ApiResponse<{ path: string }>> {
    const strId = String(pedidoId);
    const existing = this.orders.get(strId);
    if (existing) {
      const currentList: string[] = [];
      try {
        const val = existing[campo];
        if (typeof val === 'string' && val.trim().startsWith('[')) {
          currentList.push(...JSON.parse(val));
        } else if (val) {
          currentList.push(val);
        }
      } catch {}
      currentList.push(fotoPath);

      const merged = { ...existing, [campo]: JSON.stringify(currentList), updated_at: new Date().toISOString() };
      this.orders.set(strId, merged);
      this.persistCache();
      await this.pushOrderToFirebase(merged);
    }
    return { success: true, data: { path: fotoPath } };
  }

  /**
   * Upload de foto em base64 (salva no servidor de imagens PHP configurado ou fallback local)
   */
  public async uploadFoto(
    base64: string, 
    tipo: 'mercadoria' | 'coleta' | 'entrega' | 'comprovante' | 'declaracao' = 'coleta'
  ): Promise<ApiResponse<{ path: string }>> {
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const photoPath = `/uploads/pedidos/${tipo}/${filename}`;

    // 1. Tenta enviar para o Servidor de Imagens PHP dedicado se configurado
    const imgServer = getImageServerUrl();
    if (imgServer) {
      try {
        const pass = getImageServerPassword();
        const separator = imgServer.includes('?') ? '&' : '?';
        const uploadEndpoint = `${imgServer}${separator}action=upload&password=${encodeURIComponent(pass)}`;

        const res = await fetch(uploadEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Password': pass
          },
          body: JSON.stringify({
            image: base64,
            tipo,
            password: pass
          })
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.success && (resData.url || resData.path)) {
            const finalUrl = resData.url || resData.path;
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem(`foto_${finalUrl}`, base64);
              }
            } catch {}
            return {
              success: true,
              data: { path: finalUrl }
            };
          }
        }
      } catch (err: any) {
        console.warn('[Image Server PHP] Falha no upload para o servidor de imagens, aplicando fallback local:', err);
      }
    }

    // 2. Fallback local / Express proxy
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`foto_${photoPath}`, base64);
      }
    } catch {}

    return {
      success: true,
      data: { path: photoPath }
    };
  }

  /**
   * Registra presença do motorista (chegada/saída de coleta ou entrega)
   */
  public async registrarPresenca(
    pedidoId: string | number,
    campo: 'coleta_chegada_at' | 'coleta_saida_at' | 'troca_chegada_at' | 'troca_saida_at' | 'entrega_chegada_at' | 'entrega_saida_at',
    timestamp?: string
  ): Promise<ApiResponse> {
    const strId = String(pedidoId);
    const existing = this.orders.get(strId);
    const finalTs = timestamp || new Date().toISOString();
    if (existing) {
      const merged = { ...existing, [campo]: finalTs, updated_at: finalTs };
      this.orders.set(strId, merged);
      this.persistCache();
      await this.pushOrderToFirebase(merged);
    }
    return { success: true };
  }
}

export const firebaseOrderService = new FirebaseOrderService();
