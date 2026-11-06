import { request, getAuthToken } from './httpClient';
import { androidBridge } from './androidBridge';

export interface ServerNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  orderId: number | null;
  createdAt: string;
  read: boolean;
}

export const notificationService = {
  async list(): Promise<ServerNotification[]> {
    if (!getAuthToken()) return [];
    const res = await request<ServerNotification[]>('/notificacoes/list', 'POST', {});
    return res.success && Array.isArray(res.data) ? res.data : [];
  },

  // Traz só o que ainda não foi entregue ao aparelho (o servidor marca como entregue)
  async pull(): Promise<ServerNotification[]> {
    if (!getAuthToken()) return [];
    const res = await request<ServerNotification[]>('/notificacoes/pull', 'POST', {});
    return res.success && Array.isArray(res.data) ? res.data : [];
  },

  async markRead(ids?: number[]): Promise<void> {
    await request('/notificacoes/read', 'POST', { ids: ids || [] });
  },

  async clear(ids?: number[]): Promise<void> {
    await request('/notificacoes/clear', 'POST', { ids: ids || [] });
  },

  // Alerta nativo no app Android; no navegador usa a Notification API quando permitido
  alert(item: Pick<ServerNotification, 'title' | 'message'>) {
    if (androidBridge.isAvailable()) {
      androidBridge.notifyAndVibrate(item.title, item.message, 300);
      return;
    }
    androidBridge.notifyAndVibrate(item.title, item.message, 200);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(item.title, { body: item.message, icon: '/icon-192.png' });
      }
    } catch {
      // alerta web é opcional
    }
  }
};
