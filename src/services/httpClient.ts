/**
 * Cliente HTTP base para o backend Express (mesma origem por padrão).
 */

import { ApiResponse } from './apiTypes';

const STORAGE_API_URL_KEY = 'encomendaszap_api_base_url';
const STORAGE_TOKEN_KEY = 'encomendaszap_auth_token';
const STORAGE_ROLE_KEY = 'encomendaszap_user_role';

export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_API_URL_KEY);
    if (
      saved &&
      saved.trim() &&
      saved !== 'http://localhost:3000' &&
      saved !== 'http://127.0.0.1:3000'
    ) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {}

  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // Padrão: rota relativa, atendida pelo próprio servidor Express do app
  return '';
}

export function setApiBaseUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_API_URL_KEY, url.trim().replace(/\/+$/, ''));
  } catch {}
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

export function getStoredUserRole(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(STORAGE_ROLE_KEY) : null;
  } catch {
    return null;
  }
}

/**
 * Função genérica de requisição HTTP
 */
export async function request<T = any>(
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

  const userRole = getStoredUserRole();
  if (userRole) {
    headers['X-User-Role'] = userRole;
  }

  let requestBody: string | undefined = undefined;

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify({
      ...(bodyData || {}),
      ...(token ? { token } : {})
    });
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
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      success: false,
      message: error.name === 'AbortError'
        ? 'Tempo limite de conexão esgotado.'
        : (error.message || 'Falha ao conectar com o servidor.')
    };
  }
}

/**
 * Executa `fetchOnce` imediatamente e depois a cada `intervalMs`, devolvendo a função de cancelamento.
 */
export function startPolling(fetchOnce: () => Promise<void> | void, intervalMs: number): () => void {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await fetchOnce();
    } catch (error) {
      console.warn('[Polling] Falha na atualização periódica:', error);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  if (typeof (timer as any)?.unref === 'function') (timer as any).unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
