/**
 * Serviço de Gerenciamento de Pedidos (cliente HTTP do backend /pedidos)
 */

import { BackendPedido, ApiResponse } from './apiTypes';
import { uploadImage } from './imageUploadService';
import { request, getStoredUserRole } from './httpClient';

const cleanOrderId = (id: string | number): string =>
  String(id ?? '').replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();

class OrderService {
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
    const res = await request<BackendPedido[]>('/pedidos/list_pedidos', 'POST', { limit: 2000, ...(filters || {}) }, 30000);
    if (!res.success || !Array.isArray(res.data)) {
      return { success: false, data: [], total: 0, message: res.message || 'Não foi possível listar os pedidos.' };
    }
    return {
      ...res,
      page: filters?.page || 1,
      limit: filters?.limit || 2000
    };
  }

  /**
   * Obtém um pedido específico por ID
   */
  public async getPedido(id: string | number): Promise<ApiResponse<BackendPedido>> {
    return request<BackendPedido>('/pedidos/get', 'POST', { id: cleanOrderId(id) || id });
  }

  public async ensurePublicTrackingToken(id: string | number): Promise<ApiResponse<{ token: string }>> {
    const cleanId = cleanOrderId(id);
    if (!cleanId) return { success: false, message: 'Pedido inválido.' };

    const res = await request<{ token?: string; public_tracking_token?: string }>(
      '/pedidos/ensure_public_token',
      'POST',
      { pedido_id: cleanId }
    );
    const token = res.data?.token || res.data?.public_tracking_token;
    if (!res.success || !token) {
      return { success: false, message: res.message || 'Não foi possível criar o link público.' };
    }
    return { success: true, data: { token: token.toLowerCase() } };
  }

  /**
   * Salva ou atualiza um pedido; o id retornado é sempre o gerado pelo servidor.
   */
  public async savePedido(pedidoData: Partial<BackendPedido>): Promise<ApiResponse<{ id: number | string }>> {
    if (getStoredUserRole() === 'motorista') {
      return {
        success: false,
        message: 'Motoristas não possuem permissão para adicionar ou editar pedidos.'
      };
    }

    const hasId = pedidoData.id !== undefined && pedidoData.id !== null && pedidoData.id !== '';
    const payload = hasId ? { ...pedidoData, id: cleanOrderId(pedidoData.id as string | number) } : pedidoData;
    const res = await request<{ id: number | string }>('/pedidos/save', 'POST', payload, 20000);
    if (!res.success) return res;

    const id = res.data?.id ?? res.id;
    return { ...res, id, data: { id: id as number | string } };
  }

  public async deletePedido(id: string | number): Promise<ApiResponse> {
    if (getStoredUserRole() === 'motorista') {
      return {
        success: false,
        message: 'Motoristas não possuem permissão para excluir pedidos.'
      };
    }
    return request('/pedidos/delete', 'POST', { id: cleanOrderId(id) || id });
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
    return request('/pedidos/marcar_coleta_entrega', 'POST', {
      pedido_id: cleanOrderId(pedidoId) || pedidoId,
      etapa,
      user_id: userId,
      user_nome: userName
    });
  }

  /**
   * Avança a etapa do pedido
   */
  public async setEtapa(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    return request('/pedidos/set_etapa', 'POST', { pedido_id: cleanOrderId(pedidoId) || pedidoId, user_id: userId });
  }

  /**
   * Finaliza o pedido
   */
  public async finalizarPedido(pedidoId: string | number, userId?: string | number): Promise<ApiResponse> {
    return request('/pedidos/finalizar_pedido', 'POST', { pedido_id: cleanOrderId(pedidoId) || pedidoId, user_id: userId });
  }

  /**
   * Anexa foto ao pedido
   */
  public async appendFoto(
    pedidoId: string | number,
    fotoPath: string,
    campo: 'mercadoria_foto' | 'coleta_foto' | 'entrega_foto' = 'coleta_foto'
  ): Promise<ApiResponse<{ path: string }>> {
    return request('/pedidos/append_foto', 'POST', {
      pedido_id: cleanOrderId(pedidoId) || pedidoId,
      foto: fotoPath,
      campo
    });
  }

  /**
   * Upload de foto em base64 (servidor de imagens configurado ou fallback do backend)
   */
  public async uploadFoto(
    base64: string,
    tipo: 'mercadoria' | 'coleta' | 'entrega' | 'comprovante' | 'declaracao' = 'coleta'
  ): Promise<ApiResponse<{ path: string }>> {
    try {
      const path = await uploadImage(base64, {
        type: tipo,
        fallbackEndpoint: '/pedidos/upload_foto'
      });
      return { success: true, data: { path } };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Não foi possível salvar a foto do pedido.'
      };
    }
  }

  /**
   * Registra presença do motorista (chegada/saída de coleta ou entrega)
   */
  public async registrarPresenca(
    pedidoId: string | number,
    campo: 'coleta_chegada_at' | 'coleta_saida_at' | 'troca_chegada_at' | 'troca_saida_at' | 'entrega_chegada_at' | 'entrega_saida_at',
    timestamp?: string
  ): Promise<ApiResponse> {
    return request('/pedidos/registrar_presenca', 'POST', {
      pedido_id: cleanOrderId(pedidoId) || pedidoId,
      campo,
      timestamp: timestamp || new Date().toISOString()
    });
  }
}

export const orderService = new OrderService();
