import { BackendUser, ApiResponse } from './apiTypes';
import { request, startPolling } from './httpClient';

const MAX_PAGE_SIZE = 100;
const USERS_POLL_INTERVAL_MS = 30000;

type UsersPageParams = {
  search?: string;
  page?: number;
  limit?: number;
  cursor?: string;
  access_level?: string;
};

function cleanUserId(id: string | number): string {
  return String(id).trim().replace(/^db-user-/i, '');
}

class UserService {
  /**
   * O backend pagina por número de página; o cursor repassado aos consumidores é o número da próxima página.
   */
  public async listUsers(params?: UsersPageParams): Promise<ApiResponse<BackendUser[]>> {
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, params?.limit || 50));
    const cursorPage = params?.cursor ? parseInt(params.cursor, 10) : NaN;
    const page = Number.isFinite(cursorPage) && cursorPage > 0 ? cursorPage : Math.max(1, params?.page || 1);

    const res = await request<BackendUser[]>('/users/list', 'POST', {
      page,
      limit,
      ...(params?.search?.trim() ? { search: params.search.trim() } : {}),
      ...(params?.access_level?.trim() ? { access_level: params.access_level.trim().toLowerCase() } : {})
    });

    if (!res.success || !Array.isArray(res.data)) {
      return {
        success: false,
        data: [],
        total: 0,
        page,
        limit,
        hasMore: false,
        message: res.message || 'Não foi possível consultar os usuários.'
      };
    }

    const total = typeof res.total === 'number' ? res.total : res.data.length;
    const hasMore = page * limit < total;
    return {
      success: true,
      data: res.data,
      total,
      page,
      limit,
      hasMore,
      cursor: hasMore ? String(page + 1) : undefined
    };
  }

  /**
   * Consulta periódica (polling) de uma página de usuários.
   */
  public subscribeUsersPage(
    params: { search?: string; cursor?: string; limit?: number; access_level?: string },
    onUpdate: (response: ApiResponse<BackendUser[]>) => void,
    onError?: (error: Error) => void
  ): () => void {
    return startPolling(async () => {
      try {
        onUpdate(await this.listUsers(params));
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Não foi possível atualizar a página de usuários.'));
      }
    }, USERS_POLL_INTERVAL_MS);
  }

  public async listUsersCompact(name?: string): Promise<ApiResponse<BackendUser[]>> {
    return this.listUsers({ search: name, limit: 30 });
  }

  public async getUser(id: string | number): Promise<ApiResponse<BackendUser>> {
    return request<BackendUser>('/users/get', 'POST', { id: cleanUserId(id) });
  }

  public async saveUser(user: Partial<BackendUser>): Promise<ApiResponse<BackendUser>> {
    const rawId = user.id === undefined || user.id === null ? '' : cleanUserId(user.id);
    const hasServerId = /^\d+$/.test(rawId);
    const { id: _ignored, ...rest } = user;
    return request<BackendUser>('/users/save', 'POST', {
      ...rest,
      ...(hasServerId ? { id: Number(rawId) } : {})
    });
  }

  public async deleteUser(id: string | number): Promise<ApiResponse> {
    return request('/users/delete', 'POST', { id: cleanUserId(id) });
  }

  public async getMotoristas(): Promise<ApiResponse<BackendUser[]>> {
    return this.listUsers({ access_level: 'motorista', limit: MAX_PAGE_SIZE });
  }

  public async getClientes(): Promise<ApiResponse<BackendUser[]>> {
    return this.listUsers({ access_level: 'cliente', limit: MAX_PAGE_SIZE });
  }

  public async registerUser(user: {
    name: string;
    full_name?: string;
    name_completo?: string;
    phone: string;
    password?: string;
    access_level?: string;
    terms?: boolean;
    cidade?: string;
    cpf?: string;
    tipo_veiculo?: 'moto' | 'carro' | 'utilitario';
    modelo_veiculo?: string;
    placa?: string;
  }): Promise<ApiResponse<{ id: number | string }>> {
    const contactName = (user.full_name || user.name_completo || '').trim();
    if (!contactName) return { success: false, message: 'Nome do contato é obrigatório.' };

    return request<{ id: number | string }>('/users/register', 'POST', {
      ...user,
      full_name: contactName,
      name_completo: contactName
    });
  }
}

export const userService = new UserService();
