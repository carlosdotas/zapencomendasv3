/**
 * Cliente HTTP EncomendasZap para comunicação com o backend Express
 * Conforme contratos documentados em src/routes
 */

import { 
  ApiResponse, 
  BackendLoginData, 
  BackendLocal, 
  BackendPedido, 
  BackendUser, 
  BackendMotorista, 
  BackendLiveLocation,
  BackendCidade,
  BackendOrderMarker
} from './apiTypes';
import { firebaseUserService } from './firebaseUserService';
import { firebaseOrderService } from './firebaseOrderService';
import { firebasePlaceService } from './firebasePlaceService';
import { uploadImage } from './imageUploadService';

const STORAGE_API_URL_KEY = 'encomendaszap_api_base_url';
const STORAGE_TOKEN_KEY = 'encomendaszap_auth_token';
const STORAGE_DEVICE_ID_KEY = 'encomendaszap_device_id';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_DEVICE_ID_KEY);
    if (!id) {
      id = 'dev-' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(STORAGE_DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev-browser-client';
  }
}

export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_API_URL_KEY);
    if (
      saved && 
      saved.trim() && 
      saved !== 'http://localhost:3000' && 
      saved !== 'http://127.0.0.1:3000' &&
      saved !== 'https://dotas.online' &&
      saved !== 'https://dotas.online/'
    ) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {}

  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() && envUrl !== 'https://dotas.online') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // Padrão do sistema: rota relativa (proxy Express do próprio app)
  // No navegador (seja no dev, no preview ou em produção), as requisições relativas
  // vão para o próprio servidor Node/Express do applet, que repassa para o dotas.online
  // sem qualquer bloqueio de CORS ou Mixed Content!
  return '';
}

export function setApiBaseUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_API_URL_KEY, url.trim().replace(/\/+$/, ''));
  } catch {}
}

export const STORAGE_IMAGE_SERVER_URL_KEY = 'encomendaszap_image_server_url';
export const STORAGE_IMAGE_SERVER_PASSWORD_KEY = 'encomendaszap_image_server_password';
export const STORAGE_SETTINGS_CACHE_KEY = 'encomendaszap_firebase_settings_cache_v2';

export function getImageServerUrl(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // 1. Prioridade máxima: Configurações do Firebase/Painel do Administrador
      const globalRaw = localStorage.getItem(STORAGE_SETTINGS_CACHE_KEY);
      if (globalRaw) {
        try {
          const parsed = JSON.parse(globalRaw);
          if (parsed?.imageServer?.url && typeof parsed.imageServer.url === 'string' && parsed.imageServer.url.trim()) {
            return parsed.imageServer.url.trim().replace(/\/+$/, '');
          }
        } catch {}
      }

      // 2. Chave individual no localStorage
      const saved = localStorage.getItem(STORAGE_IMAGE_SERVER_URL_KEY);
      if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    }

    return 'http://localhost/imagens/images.php';
  } catch {
    return 'http://localhost/imagens/images.php';
  }
}

export function setImageServerUrl(url: string): void {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    localStorage.setItem(STORAGE_IMAGE_SERVER_URL_KEY, cleanUrl);

    // Sincroniza também no cache consolidado de configurações para consistência
    const globalRaw = localStorage.getItem(STORAGE_SETTINGS_CACHE_KEY);
    if (globalRaw) {
      try {
        const parsed = JSON.parse(globalRaw);
        parsed.imageServer = { ...(parsed.imageServer || {}), url: cleanUrl };
        localStorage.setItem(STORAGE_SETTINGS_CACHE_KEY, JSON.stringify(parsed));
      } catch {}
    }
  } catch {}
}

export function getImageServerPassword(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const globalRaw = localStorage.getItem(STORAGE_SETTINGS_CACHE_KEY);
      if (globalRaw) {
        try {
          const parsed = JSON.parse(globalRaw);
          if (parsed?.imageServer?.password && typeof parsed.imageServer.password === 'string' && parsed.imageServer.password.trim()) {
            return parsed.imageServer.password.trim();
          }
        } catch {}
      }

      const saved = localStorage.getItem(STORAGE_IMAGE_SERVER_PASSWORD_KEY);
      if (saved && saved.trim() && saved.trim() !== 'zap123') return saved.trim();
    }
    return '821332';
  } catch {
    return '821332';
  }
}

export function setImageServerPassword(pass: string): void {
  try {
    const cleanPass = pass.trim();
    localStorage.setItem(STORAGE_IMAGE_SERVER_PASSWORD_KEY, cleanPass);

    const globalRaw = localStorage.getItem(STORAGE_SETTINGS_CACHE_KEY);
    if (globalRaw) {
      try {
        const parsed = JSON.parse(globalRaw);
        parsed.imageServer = { ...(parsed.imageServer || {}), password: cleanPass };
        localStorage.setItem(STORAGE_SETTINGS_CACHE_KEY, JSON.stringify(parsed));
      } catch {}
    }
  } catch {}
}

/**
 * Envia foto de perfil diretamente para o Servidor de Fotos PHP (images.php)
 * com tipo 'perfil' e autenticação segura via header + parâmetro password.
 */
export async function uploadProfilePhoto(
  base64: string,
  userId?: string | number,
  phone?: string
): Promise<string> {
  if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:image/')) {
    return base64;
  }

  return uploadImage(base64, {
    type: 'perfil',
    imageServerUrl: getImageServerUrl(),
    imageServerPassword: getImageServerPassword(),
    fallbackEndpoint: '/users/upload_foto',
    fallbackData: { user_id: userId, id: userId, phone }
  });
}

export async function testImageServerConnection(url?: string, password?: string): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  const targetUrl = (url || getImageServerUrl()).trim().replace(/\/+$/, '');
  if (!targetUrl) {
    return { success: false, message: 'URL do servidor de imagens não informada.' };
  }
  const pass = password !== undefined ? password : getImageServerPassword();

  try {
    const separator = targetUrl.includes('?') ? '&' : '?';
    const pingUrl = `${targetUrl}${separator}action=ping`;
    const res = await fetch(pingUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Access-Password': pass
      }
    });

    if (!res.ok) {
      return { success: false, message: `Servidor respondeu com status HTTP ${res.status}` };
    }

    const data = await res.json();
    if (data && data.success) {
      return {
        success: true,
        message: `Servidor PHP Online! (PHP ${data.php_version || 'OK'} • GD: ${data.gd_installed ? 'Ativo' : 'Inativo'})`,
        details: data
      };
    }
    return { success: false, message: data.message || 'Resposta inesperada do servidor' };
  } catch (err: any) {
    return { success: false, message: `Falha de conexão: ${err.message || 'Verifique se a URL está correta e acessível.'}` };
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
  } catch {}
}

/**
 * Função genérica de requisição HTTP
 */
async function request<T = any>(
  path: string, 
  method: 'GET' | 'POST' | 'DELETE' = 'GET', 
  bodyData?: any,
  customTimeoutMs: number = 8000
): Promise<ApiResponse<T>> {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  const userRole = typeof window !== 'undefined' ? localStorage.getItem('encomendaszap_user_role') : null;
  if (userRole) {
    headers['X-User-Role'] = userRole;
  }

  let requestBody: string | undefined = undefined;

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    const payload = {
      ...(bodyData || {}),
      ...(token ? { token } : {})
    };
    requestBody = JSON.stringify(payload);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), customTimeoutMs);

  try {
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: requestBody,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok && response.status === 404) {
      throw new Error(`Endpoint não encontrado (404)`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Fallback: se a chamada principal falhou e não estava chamando https://dotas.online diretamente, tenta fallback direto
    if (baseUrl !== 'https://dotas.online') {
      try {
        const fallbackRes = await fetch(`https://dotas.online${cleanPath}`, {
          method,
          headers,
          body: requestBody
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          return fallbackData;
        }
      } catch {
        // Ignora erro do fallback
      }
    }

    return {
      success: false,
      message: error.name === 'AbortError' 
        ? 'Tempo limite de conexão esgotado.' 
        : (error.message || 'Falha ao conectar com o servidor Express.')
    };
  }
}

export const api = {
  // Teste de conexão com o servidor
  async checkConnection(): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
    const start = performance.now();
    try {
      const res = await request('/cidades', 'GET', undefined, 4000);
      const latencyMs = Math.round(performance.now() - start);
      if (res && res.success !== false) {
        return { ok: true, message: `Conectado (${latencyMs}ms)`, latencyMs };
      }
      return { ok: false, message: res.message || 'Servidor respondeu com erro.' };
    } catch (e: any) {
      return { ok: false, message: e.message || 'Não foi possível alcançar o servidor.' };
    }
  },

  // ==========================================
  // AUTENTICAÇÃO (/login)
  // ==========================================
  async login(phone: string, password: string): Promise<ApiResponse<BackendLoginData>> {
    const cleanPhone = phone.replace(/\D/g, '');
    const deviceId = getDeviceId();
    const res = await request<BackendLoginData>('/login/login', 'POST', {
      phone: cleanPhone,
      password,
      device_id: deviceId,
      source: 'web'
    });

    if (res.success && res.data?.token) {
      setAuthToken(res.data.token);
    }
    return res;
  },

  async isLogged(): Promise<ApiResponse<BackendLoginData>> {
    const token = getAuthToken();
    if (!token) return { success: false, message: 'Sem token salvo' };
    const deviceId = getDeviceId();
    return request<BackendLoginData>('/login/islogged', 'POST', {
      token,
      device_id: deviceId
    });
  },

  async logout(): Promise<ApiResponse> {
    const token = getAuthToken();
    setAuthToken(null);
    if (!token) return { success: true };
    return request('/login/logout', 'POST', { token });
  },

  // ==========================================
  // LOCAIS (Firebase Firestore & Realtime Database)
  // Integrado aos 3636 locais importados com busca prioritária
  // ==========================================
  async getLocais(params?: {
    search?: string;
    page?: number;
    limit?: number;
    cidade?: string;
    setor?: string;
    central_coletas?: boolean | number;
    sort_by?: string;
    sort_dir?: 'ASC' | 'DESC';
  }): Promise<ApiResponse<BackendLocal[]>> {
    return firebasePlaceService.getLocais(params);
  },

  async getLocaisCentrais(): Promise<ApiResponse<Array<{ id: number | string; name: string; cidade: string; lat: number; lng: number }>>> {
    return firebasePlaceService.getLocaisCentrais();
  },

  async getLocalById(id: string | number): Promise<ApiResponse<BackendLocal>> {
    return firebasePlaceService.getLocalById(id);
  },

  async buscarLocalLink(link: string): Promise<ApiResponse<BackendLocal>> {
    return firebasePlaceService.buscarLocalLink(link);
  },

  async getLocaisNearby(lat: number, lng: number, radiusKm: number = 0.5): Promise<ApiResponse<{ id: number; name: string; lat: number; lng: number; dist_km?: number } | null>> {
    return firebasePlaceService.getLocaisNearby(lat, lng, radiusKm);
  },

  async updateLocal(id: number | string, data: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    return firebasePlaceService.updateLocal(id, data);
  },

  async saveLocal(data: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    return firebasePlaceService.saveLocal(data);
  },

  /** Referência ao serviço Firebase de locais */
  places: firebasePlaceService,

  // ==========================================
  // PEDIDOS (Firebase Firestore & Realtime Database)
  // Integrado aos 2000 pedidos importados com sincronização em tempo real
  // ==========================================
  async listPedidos(filters?: {
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
  }): Promise<ApiResponse<BackendPedido[]>> {
    return firebaseOrderService.listPedidos(filters);
  },

  async getPedido(id: string | number): Promise<ApiResponse<BackendPedido>> {
    return firebaseOrderService.getPedido(id);
  },

  async createPublicTrackingLink(id: string | number): Promise<ApiResponse<{ token: string }>> {
    return firebaseOrderService.ensurePublicTrackingToken(id);
  },

  async savePedido(pedidoData: Partial<BackendPedido>): Promise<ApiResponse<{ id: number | string }>> {
    // Motoristas NÃO possuem permissão para adicionar ou editar pedidos
    const userRole = typeof window !== 'undefined' ? localStorage.getItem('encomendaszap_user_role') : null;
    if (userRole === 'motorista') {
      console.warn('[api.savePedido] Motoristas não possuem permissão para adicionar ou editar pedidos.');
      return {
        success: false,
        message: 'Motoristas não possuem permissão para adicionar ou editar pedidos.'
      };
    }

    // 1. Salva no Firebase Firestore (default) e cache local
    const fbRes = await firebaseOrderService.savePedido(pedidoData);

    // 2. Manda para o servidor backend Express/Dotas.online (/pedidos/save)
    try {
      const serverRes = await request<{ id: number | string }>('/pedidos/save', 'POST', pedidoData);
      console.log(`[API savePedido] Resposta servidor backend:`, serverRes);
      if (serverRes && serverRes.success) {
        return serverRes;
      }
    } catch (err: any) {
      console.warn(`[API savePedido] Aviso ao enviar para servidor Express:`, err.message);
    }

    return fbRes;
  },

  async deletePedido(id: string | number): Promise<ApiResponse> {
    return firebaseOrderService.deletePedido(id);
  },

  async marcarColetaEntrega(
    pedidoId: string | number, 
    etapa: 'coletado' | 'trocado' | 'entregue', 
    userId?: string | number, 
    userName?: string
  ): Promise<ApiResponse<{ pedido_id: string | number; etapa: string }>> {
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
    const finalId = cleanId || pedidoId;

    // 1. Atualiza no Firebase Firestore (default) e cache local imediatamente
    const fbRes = await firebaseOrderService.marcarColetaEntrega(finalId, etapa, userId, userName);

    // 2. Manda para o servidor backend Express/Dotas.online (/pedidos/marcar_coleta_entrega)
    try {
      const serverRes = await request<{ pedido_id: string | number; etapa: string }>('/pedidos/marcar_coleta_entrega', 'POST', {
        pedido_id: finalId,
        etapa: etapa,
        user_id: userId,
        user_nome: userName
      });
      console.log(`[API marcarColetaEntrega] Servidor backend respondeu:`, serverRes);
    } catch (err: any) {
      console.warn(`[API marcarColetaEntrega] Aviso servidor:`, err.message);
    }

    // 3. Garante que /pedidos/save também receba a etapa no servidor backend
    try {
      const nowIso = new Date().toISOString();
      await request('/pedidos/save', 'POST', {
        id: finalId,
        etapa: etapa,
        ...(etapa === 'coletado' ? { coleta_saida_at: nowIso, coleta_user_id: userId, coleta_user_nome: userName } : {}),
        ...(etapa === 'trocado' ? { troca_saida_at: nowIso, troca_at: nowIso, troca_user_id: userId, troca_user_nome: userName } : {}),
        ...(etapa === 'entregue' ? { entrega_saida_at: nowIso, entrega_at: nowIso, entrega_user_id: userId, entrega_user_nome: userName, status_pagamento: 'pago' } : {})
      });
    } catch (err: any) {
      console.warn(`[API savePedido Baixa] Aviso:`, err.message);
    }

    return fbRes;
  },

  async setEtapa(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim() || pedidoId;
    const fbRes = await firebaseOrderService.setEtapa(cleanId, userId);
    try {
      await request('/pedidos/set_etapa', 'POST', { pedido_id: cleanId, user_id: userId });
    } catch (e) {}
    return fbRes;
  },

  async finalizarPedido(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim() || pedidoId;
    const fbRes = await firebaseOrderService.finalizarPedido(cleanId, userId);
    try {
      await request('/pedidos/finalizar_pedido', 'POST', { pedido_id: cleanId, user_id: userId });
      await request('/pedidos/save', 'POST', { id: cleanId, etapa: 'finalizado', status_pagamento: 'pago' });
    } catch (e) {}
    return fbRes;
  },

  async uploadFoto(base64: string, tipo: 'mercadoria' | 'coleta' | 'entrega' | 'comprovante' | 'declaracao' = 'coleta'): Promise<ApiResponse<{ path: string }>> {
    return firebaseOrderService.uploadFoto(base64, tipo);
  },

  async appendFoto(pedidoId: string | number, fotoPath: string, campo: 'mercadoria_foto' | 'coleta_foto' | 'entrega_foto' = 'coleta_foto'): Promise<ApiResponse<{ path: string }>> {
    return firebaseOrderService.appendFoto(pedidoId, fotoPath, campo);
  },

  async registrarPresenca(
    pedidoId: string | number,
    campo: 'coleta_chegada_at' | 'coleta_saida_at' | 'troca_chegada_at' | 'troca_saida_at' | 'entrega_chegada_at' | 'entrega_saida_at',
    timestamp?: string
  ): Promise<ApiResponse> {
    const fbRes = await firebaseOrderService.registrarPresenca(pedidoId, campo, timestamp);
    try {
      await request('/pedidos/registrar_presenca', 'POST', {
        pedido_id: pedidoId,
        campo,
        timestamp: timestamp || new Date().toISOString()
      });
    } catch (e) {}
    return fbRes;
  },

  /** Referência ao serviço Firebase de pedidos */
  orders: firebaseOrderService,

  // ==========================================
  // CLIENTES & USUÁRIOS (Firebase Firestore & Realtime Database)
  // Integrado aos 928 usuários importados com sincronização em tempo real
  // ==========================================
  async listUsers(params?: {
    search?: string;
    page?: number;
    limit?: number;
    access_level?: string;
  }): Promise<ApiResponse<BackendUser[]>> {
    return firebaseUserService.listUsers(params);
  },

  async listUsersCompact(name?: string): Promise<ApiResponse<BackendUser[]>> {
    return firebaseUserService.listUsersCompact(name);
  },

  async getUser(id: string | number): Promise<ApiResponse<BackendUser>> {
    return firebaseUserService.getUser(id);
  },

  async saveUser(user: Partial<BackendUser>): Promise<ApiResponse<{ id: number | string; foto?: string; avatarUrl?: string }>> {
    let savedFotoUrl = user.foto || (user as any).avatarUrl;

    // Se a foto for enviada em base64, sobe para o servidor de fotos PHP primeiro
    if (savedFotoUrl && typeof savedFotoUrl === 'string' && savedFotoUrl.startsWith('data:image/')) {
      try {
        const phpUrl = await uploadProfilePhoto(savedFotoUrl, user.id, user.phone);
        if (phpUrl && !phpUrl.startsWith('data:image/')) {
          savedFotoUrl = phpUrl;
        }
      } catch (e) {
        console.warn('Erro ao subir foto de perfil para o PHP no saveUser:', e);
        return { success: false, message: 'Não foi possível enviar a foto do perfil.' } as any;
      }
    }

    const payloadWithCleanPhoto: Partial<BackendUser> = {
      ...user,
      ...(savedFotoUrl ? { foto: savedFotoUrl, avatarUrl: savedFotoUrl } : {})
    };

    // 1. Envia para o backend Express (/users/save)
    try {
      const serverRes = await request<{ id: number | string; foto?: string; avatarUrl?: string }>(
        '/users/save',
        'POST',
        payloadWithCleanPhoto
      );
      if (serverRes && serverRes.success) {
        const foundUrl = (serverRes as any)?.foto || (serverRes as any)?.avatarUrl || serverRes.data?.foto || serverRes.data?.avatarUrl;
        if (foundUrl) {
          savedFotoUrl = foundUrl;
        }
      }
    } catch (e) {
      console.warn('Erro ao salvar usuário no backend Express:', e);
    }

    // 2. Atualiza no Firebase Firestore & Realtime com a URL limpa da foto (evita estouro de 1MB do Firestore e quota do localStorage)
    const userToSave: Partial<BackendUser> = {
      ...payloadWithCleanPhoto,
      ...(savedFotoUrl ? { foto: savedFotoUrl, avatarUrl: savedFotoUrl } : {})
    };
    const fbRes = await firebaseUserService.saveUser(userToSave);

    const finalFoto = savedFotoUrl || (fbRes as any).foto;
    const finalAvatar = savedFotoUrl || (fbRes as any).avatarUrl || finalFoto;

    return {
      success: true,
      id: userToSave.id || (fbRes as any).id || (fbRes.data as any)?.id,
      foto: finalFoto,
      avatarUrl: finalAvatar,
      data: {
        id: userToSave.id || (fbRes as any).id || (fbRes.data as any)?.id,
        foto: finalFoto,
        avatarUrl: finalAvatar,
        ...(fbRes.data || {})
      },
      message: 'Usuário salvo com sucesso!'
    } as any;
  },

  async uploadUserFoto(params: {
    foto: string;
    userId?: string | number;
    phone?: string;
  }): Promise<ApiResponse<{ path: string; foto: string; avatarUrl: string }>> {
    let finalUrl = params.foto;
    if (finalUrl && typeof finalUrl === 'string' && finalUrl.startsWith('data:image/')) {
      finalUrl = await uploadProfilePhoto(finalUrl, params.userId, params.phone);
    }
    return request('/users/upload_foto', 'POST', {
      ...params,
      user_id: params.userId,
      foto: finalUrl,
      avatarUrl: finalUrl
    });
  },

  async registerUser(user: {
    name: string;
    phone: string;
    password?: string;
    access_level?: string;
    terms?: boolean;
    cidade?: string;
  }): Promise<ApiResponse<{ id: number | string }>> {
    return firebaseUserService.registerUser(user);
  },

  /** Referência ao serviço Firebase de usuários */
  users: firebaseUserService,

  // ==========================================
  // MOTORISTAS & TRACKING (/motoristas & /tracking)
  // ==========================================
  async listMotoristas(params?: {
    status?: string;
    tipo_veiculo?: string;
    busca?: string;
  }): Promise<ApiResponse<BackendMotorista[]>> {
    return request<BackendMotorista[]>('/motoristas/list', 'POST', params || {});
  },

  async saveMotorista(motorista: {
    nome: string;
    telefone: string;
    cpf?: string;
    cnh?: string;
    tipo_veiculo?: string;
    status?: string;
    [key: string]: any;
  }): Promise<ApiResponse<{ id: number | string }>> {
    return request('/motoristas/save', 'POST', motorista);
  },

  async getLiveLocations(): Promise<ApiResponse<BackendLiveLocation[]>> {
    return request<BackendLiveLocation[]>('/tracking/live_locations', 'POST');
  },

  async updateLocation(coords: {
    user_id: string | number;
    lat: number;
    lng: number;
    user_nome?: string;
    user_foto?: string;
    speed?: number | null;
    heading?: number | null;
  }): Promise<ApiResponse> {
    return request('/tracking/update_location', 'POST', coords);
  },

  async sendHeartbeat(data: {
    user_id: string | number;
    user_nome?: string;
    user_foto?: string;
    access_level?: string;
  }): Promise<ApiResponse> {
    return request('/tracking/heartbeat', 'POST', data);
  },

  async getOrderMarkers(date: string): Promise<ApiResponse<BackendOrderMarker[]>> {
    return request<BackendOrderMarker[]>('/tracking/order_markers', 'POST', { date });
  },

  /**
   * Busca as markers ativas de Hoje e Dias Anteriores no endpoint Dotas.online:
   * 1. Hoje: traz todas não finalizadas (coletas não coletadas, trocas e entregas ativas).
   * 2. Dias anteriores: traz todas as markers ativas pendentes/em rota dos dias anteriores.
   * Encomendas finalizadas/entregues são estritamente excluídas do mapa.
   */
  async getActiveOrderMarkersTodayAndYesterday(): Promise<{
    todayMarkers: BackendOrderMarker[];
    yesterdayPendingMarkers: BackendOrderMarker[];
    allActiveMarkers: BackendOrderMarker[];
  }> {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Consulta os últimos 30 dias (Hoje + 29 dias anteriores) para cobrir todas as markers
    const datesToFetch: { dateStr: string; isToday: boolean }[] = [];
    for (let i = 0; i <= 29; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      datesToFetch.push({
        dateStr: d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
        isToday: i === 0
      });
    }

    // Regra explícita: "as que já foi entregue, que acabou, não, não, não pode buscar não"
    const isFinalized = (m: BackendOrderMarker) => {
      const et = (m.etapa || '').toLowerCase().trim();
      return et === 'entregue' || et === 'finalizado' || et === 'concluido' || et === 'cancelado';
    };

    // Regra estrita de sequência EncomendasZap:
    // "Para a entrega depois que fizer a coleta. E a troca também. 
    // Só pode mostrar a troca depois que fizer a coleta. 
    // Aí nesse caso, só pode mostrar a entrega depois que fizer a troca. Tem uma sequência."
    const isMarkerActive = (m: BackendOrderMarker) => {
      if (isFinalized(m)) return false;

      const et = (m.etapa || '').toLowerCase().trim();
      const isCollected = et === 'coletado' || et === 'trocando' || et === 'trocado' || et === 'retornando' || et === 'entregando';
      const isExchanged = et === 'trocado' || et === 'retornando' || et === 'segunda_entrega' || et === 'retorno';

      // 1ª Etapa: Coleta (ativa enquanto NÃO foi coletado)
      if (m.tipo === 'coleta') {
        return !isCollected;
      }

      // 2ª Etapa: Troca (só pode mostrar a troca DEPOIS que fizer a coleta)
      if (m.tipo === 'troca') {
        return isCollected && !isExchanged;
      }

      // 2ª / 3ª Etapa: Entrega
      // Para a entrega DEPOIS que fizer a coleta!
      // No caso de troca, só pode mostrar a entrega DEPOIS que fizer a troca!
      const isExchangeOrder = (m as any).is_exchange || (m as any).tipo_encomenda === 'troca' || et === 'trocando' || et === 'trocado' || et === 'retornando' || et === 'segunda_entrega' || et === 'retorno';
      if (isExchangeOrder) {
        return isExchanged;
      }

      // Se for pedido exclusivamente de entrega (sem coleta prévia)
      if (m.tipo === 'entrega' && ((m as any).tipo_encomenda === 'entrega' || !(m as any).has_coleta)) {
        return true;
      }

      return isCollected;
    };

    try {
      const responses = await Promise.all(
        datesToFetch.map(item => this.getOrderMarkers(item.dateStr).catch(() => ({ success: false, data: [] })))
      );

      const todayList: BackendOrderMarker[] = [];
      const previousDaysList: BackendOrderMarker[] = [];
      const allActive: BackendOrderMarker[] = [];
      const seenMarkerKeys = new Set<string>();

      responses.forEach((res, index) => {
        const item = datesToFetch[index];
        if (res && res.success && Array.isArray(res.data)) {
          const activeForDate = res.data.filter(isMarkerActive);
          activeForDate.forEach(m => {
            const key = `${m.pedido_id}_${m.tipo}`;
            if (!seenMarkerKeys.has(key)) {
              seenMarkerKeys.add(key);
              allActive.push(m);
              if (item.isToday) {
                todayList.push(m);
              } else {
                previousDaysList.push(m);
              }
            }
          });
        }
      });

      return {
        todayMarkers: todayList,
        yesterdayPendingMarkers: previousDaysList,
        allActiveMarkers: allActive
      };
    } catch {
      return {
        todayMarkers: [],
        yesterdayPendingMarkers: [],
        allActiveMarkers: []
      };
    }
  },

  // ==========================================
  // CIDADES (/cidades)
  // ==========================================
  async getCidades(search?: string): Promise<ApiResponse<BackendCidade[]>> {
    return request<BackendCidade[]>(`/cidades${search ? `?search=${encodeURIComponent(search)}` : ''}`, 'GET');
  },

  // ==========================================
  // TABELA DE PREÇOS (/tabela-precos)
  // ==========================================
  async getPrecosEntreCidades(): Promise<ApiResponse<{ cidades: BackendCidade[]; lista: any[] }>> {
    return request('/tabela-precos/entre-cidades', 'GET');
  },

  async getPrecosColeta(): Promise<ApiResponse<Array<{ local_id: number; nome: string; cidade: string; config: any }>>> {
    return request('/tabela-precos/coleta', 'GET');
  }
};
