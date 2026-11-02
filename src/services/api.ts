/**
 * Cliente HTTP EncomendasZap para comunicação com o backend Express (mesma origem)
 * Conforme contratos documentados em src/routes
 */

import { 
  ApiResponse, 
  BaixaProximity,
  BackendLoginData, 
  BackendLocal, 
  BackendPedido, 
  BackendUser, 
  BackendMotorista, 
  BackendLiveLocation,
  BackendCidade,
  BackendOrderMarker
} from './apiTypes';
import { uploadImage } from './imageUploadService';
import { userService } from './userService';
import { orderService } from './orderService';
import { placeService } from './placeService';
import { request, getAuthToken, setAuthToken, getApiBaseUrl, setApiBaseUrl, getStoredUserRole } from './httpClient';

export { getAuthToken, setAuthToken, getApiBaseUrl, setApiBaseUrl };

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

let imageServerUrl = 'http://localhost/imagens/images.php';
let imageServerConfigPromise: Promise<void> | null = null;

export function initializeImageServerConfig(): Promise<void> {
  if (imageServerConfigPromise) return imageServerConfigPromise;
  imageServerConfigPromise = fetch('/api/image-server-config')
    .then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (result?.success && result.data) {
        if (typeof result.data.url === 'string') imageServerUrl = result.data.url.trim().replace(/\/+$/, '');
      }
    })
    .catch(error => {
      console.warn('[Image Server] Não foi possível carregar a configuração do backend:', error);
    });
  return imageServerConfigPromise;
}

export function getImageServerUrl(): string {
  return imageServerUrl;
}

/**
 * Envia a foto pelo backend, que mantém a senha do servidor PHP fora do navegador.
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
    fallbackEndpoint: '/users/upload_foto',
    fallbackData: { user_id: userId, id: userId, phone }
  });
}

export async function testImageServerConnection(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    const res = await fetch('/api/image-server/ping', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.message || `Servidor respondeu com status HTTP ${res.status}` };
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
  // LOCAIS (/locais)
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
    return placeService.getLocais(params);
  },

  async getLocaisCentrais(): Promise<ApiResponse<Array<{ id: number | string; name: string; cidade: string; lat: number; lng: number }>>> {
    return placeService.getLocaisCentrais();
  },

  async getLocalById(id: string | number): Promise<ApiResponse<BackendLocal>> {
    return placeService.getLocalById(id);
  },

  async buscarLocalLink(link: string): Promise<ApiResponse<BackendLocal>> {
    return placeService.buscarLocalLink(link);
  },

  async getLocaisNearby(lat: number, lng: number, radiusKm: number = 0.5): Promise<ApiResponse<{ id: number; name: string; lat: number; lng: number; dist_km?: number } | null>> {
    return placeService.getLocaisNearby(lat, lng, radiusKm);
  },

  async updateLocal(id: number | string, data: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    return placeService.updateLocal(id, data);
  },

  async saveLocal(data: Partial<BackendLocal>): Promise<ApiResponse<BackendLocal>> {
    return placeService.saveLocal(data);
  },

  /** Referência ao serviço de locais */
  places: placeService,

  // ==========================================
  // PEDIDOS (/pedidos)
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
    return orderService.listPedidos(filters);
  },

  async getPedido(id: string | number): Promise<ApiResponse<BackendPedido>> {
    return orderService.getPedido(id);
  },

  async createPublicTrackingLink(id: string | number): Promise<ApiResponse<{ token: string }>> {
    return orderService.ensurePublicTrackingToken(id);
  },

  async savePedido(pedidoData: Partial<BackendPedido>): Promise<ApiResponse<{ id: number | string }>> {
    // Motoristas NÃO possuem permissão para adicionar ou editar pedidos
    if (getStoredUserRole() === 'motorista') {
      console.warn('[api.savePedido] Motoristas não possuem permissão para adicionar ou editar pedidos.');
      return {
        success: false,
        message: 'Motoristas não possuem permissão para adicionar ou editar pedidos.'
      };
    }

    // O id retornado pelo servidor é a referência definitiva do pedido
    return orderService.savePedido(pedidoData);
  },

  async deletePedido(id: string | number): Promise<ApiResponse> {
    return orderService.deletePedido(id);
  },

  async marcarColetaEntrega(
    pedidoId: string | number, 
    etapa: 'coletado' | 'trocado' | 'entregue', 
    userId?: string | number, 
    userName?: string,
    proximity?: BaixaProximity
  ): Promise<ApiResponse<{ pedido_id: string | number; etapa: string }>> {
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
    return orderService.marcarColetaEntrega(cleanId || pedidoId, etapa, userId, userName, proximity);
  },

  async reverterBaixa(pedidoId: string | number, operacao: string): Promise<ApiResponse> {
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim() || pedidoId;
    return orderService.reverterBaixa(cleanId, operacao);
  },

  async setEtapa(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim() || pedidoId;
    return orderService.setEtapa(cleanId, userId);
  },

  async finalizarPedido(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    const cleanId = String(pedidoId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim() || pedidoId;
    return orderService.finalizarPedido(cleanId, userId);
  },

  async uploadFoto(base64: string, tipo: 'mercadoria' | 'coleta' | 'entrega' | 'comprovante' | 'declaracao' = 'coleta'): Promise<ApiResponse<{ path: string }>> {
    return orderService.uploadFoto(base64, tipo);
  },

  async appendFoto(pedidoId: string | number, fotoPath: string, campo: 'mercadoria_foto' | 'coleta_foto' | 'entrega_foto' = 'coleta_foto'): Promise<ApiResponse<{ path: string }>> {
    return orderService.appendFoto(pedidoId, fotoPath, campo);
  },

  async registrarPresenca(
    pedidoId: string | number,
    campo: 'coleta_chegada_at' | 'coleta_saida_at' | 'troca_chegada_at' | 'troca_saida_at' | 'entrega_chegada_at' | 'entrega_saida_at',
    timestamp?: string
  ): Promise<ApiResponse> {
    return orderService.registrarPresenca(pedidoId, campo, timestamp);
  },

  /** Referência ao serviço de pedidos */
  orders: orderService,

  // ==========================================
  // CLIENTES & USUÁRIOS (/users)
  // ==========================================
  async listUsers(params?: {
    search?: string;
    page?: number;
    limit?: number;
    cursor?: string;
    access_level?: string;
  }): Promise<ApiResponse<BackendUser[]>> {
    return userService.listUsers(params);
  },

  watchUsersPage(
    params: { search?: string; cursor?: string; limit?: number; access_level?: string },
    onUpdate: (response: ApiResponse<BackendUser[]>) => void,
    onError?: (error: Error) => void
  ): () => void {
    return userService.subscribeUsersPage(params, onUpdate, onError);
  },

  async listUsersCompact(name?: string): Promise<ApiResponse<BackendUser[]>> {
    return userService.listUsersCompact(name);
  },

  async getUser(id: string | number): Promise<ApiResponse<BackendUser>> {
    return userService.getUser(id);
  },

  async deleteUser(id: string | number): Promise<ApiResponse> {
    return userService.deleteUser(id);
  },

  async saveUser(user: Partial<BackendUser>): Promise<ApiResponse<{ id: number | string; foto?: string; avatarUrl?: string }>> {
    let savedFotoUrl = user.foto || (user as any).avatarUrl;
    let resolvedUserId = user.id;

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

    const serverRes = await userService.saveUser(payloadWithCleanPhoto);
    if (!serverRes.success) {
      return {
        success: false,
        id: resolvedUserId,
        message: serverRes.message || 'Não foi possível gravar o cliente.'
      } as any;
    }

    resolvedUserId = serverRes.id || serverRes.data?.id || resolvedUserId;
    const foundUrl = (serverRes as any)?.foto || (serverRes as any)?.avatarUrl || serverRes.data?.foto || serverRes.data?.avatarUrl;
    if (foundUrl) {
      savedFotoUrl = foundUrl;
    }

    return {
      success: true,
      id: resolvedUserId,
      foto: savedFotoUrl,
      avatarUrl: savedFotoUrl,
      data: {
        ...(serverRes.data || {}),
        id: resolvedUserId,
        foto: savedFotoUrl,
        avatarUrl: savedFotoUrl
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
    full_name?: string;
    name_completo?: string;
    phone: string;
    password?: string;
    access_level?: string;
    terms?: boolean;
    cidade?: string;
  }): Promise<ApiResponse<{ id: number | string }>> {
    return userService.registerUser(user);
  },

  /** Referência ao serviço de usuários */
  users: userService,

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
   * Busca as markers ativas de Hoje e Dias Anteriores no endpoint /tracking/order_markers:
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
