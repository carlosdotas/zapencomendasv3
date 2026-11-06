/**
 * Ponte de Integração Nativa Android (Capacitor / WebView)
 * Conecta com o objeto global window.AndroidApp injetado pelo aplicativo oficial da EncomendasZap.
 * 
 * Mantém total retrocompatibilidade e fallbacks limpos para navegadores web comuns.
 */

export interface AndroidAppBridge {
  pickContact?: () => void;
  saveContact?: (name: string, phone: string) => void;
  showNotification?: (title: string, message: string) => void;
  requireUrgentFullScreenPermission?: () => void;
  prepareUrgentAlerts?: () => boolean;
  clearUrgentFullScreenRequirement?: () => void;
  showUrgentOffer?: (offerId: string, name: string, expiresAt: number) => void;
  cancelUrgentOffer?: (offerId: string) => void;
  vibrate?: (ms: number) => void;
  getLatitude?: () => number;
  getLongitude?: () => number;
  configureBackgroundTracking?: (endpoint: string, driverJson: string) => boolean;
  configureBackgroundTrackingWithAlerts?: (endpoint: string, driverJson: string, socketUrl: string, token: string) => boolean;
  getNativeUrgentOffers?: () => string;
  getNativeUrgentCancellations?: () => string;
  stopBackgroundTracking?: () => void;
  getLastSharedMap?: () => string | null;
  clearLastSharedMap?: () => void;
  openWhatsApp?: (phone: string, message: string) => void;
}

declare global {
  interface Window {
    AndroidApp?: AndroidAppBridge;
  }
}

export const androidBridge = {
  /**
   * Verifica se o aplicativo oficial Android com a ponte nativa está ativo
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.AndroidApp);
  },

  prepareDriverAlerts(): boolean {
    if (typeof window === 'undefined' || !window.AndroidApp) return true;
    try {
      if (window.AndroidApp.prepareUrgentAlerts) {
        return window.AndroidApp.prepareUrgentAlerts();
      }
      window.AndroidApp.requireUrgentFullScreenPermission?.();
      return true;
    } catch (error) {
      console.error('[Alertas] Não foi possível verificar as permissões:', error);
      return false;
    }
  },

  /**
   * 1. 📖 Agenda de Contatos: Solicita abertura da agenda nativa do celular
   * O retorno será emitido pelo Android através do evento 'contactSelected'
   */
  pickContact(): boolean {
    if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.pickContact) {
      window.AndroidApp.pickContact();
      return true;
    }
    return false;
  },

  /**
   * 1. 📖 Salva um contato na agenda do celular
   */
  saveContact(name: string, phone: string) {
    if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.saveContact) {
      window.AndroidApp.saveContact(name, phone);
    }
  },

  /**
   * 2. 🔔 Notificação e Vibração nativa ao mudar status de pedidos
   */
  notifyAndVibrate(title: string, message: string, vibrateMs: number = 200) {
    if (typeof window !== 'undefined') {
      if (window.AndroidApp) {
        window.AndroidApp.showNotification?.(title, message);
        window.AndroidApp.vibrate?.(vibrateMs);
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator && navigator.vibrate) {
        try {
          navigator.vibrate(vibrateMs);
        } catch {}
      }
    }
  },

  /**
   * 3. 📍 Leitura direta das coordenadas do serviço nativo Android em segundo plano
   */
  getNativeCoordinates(): { lat: number; lng: number } | null {
    if (typeof window !== 'undefined' && window.AndroidApp?.getLatitude && window.AndroidApp?.getLongitude) {
      try {
        const lat = window.AndroidApp.getLatitude();
        const lng = window.AndroidApp.getLongitude();
        if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          return { lat, lng };
        }
      } catch {}
    }
    return null;
  },

  configureBackgroundTracking(endpoint: string, driver: unknown, socketUrl: string, token: string): boolean {
    if (!endpoint || typeof window === 'undefined' || !window.AndroidApp?.configureBackgroundTracking) {
      return false;
    }
    try {
      if (window.AndroidApp.configureBackgroundTrackingWithAlerts) {
        return window.AndroidApp.configureBackgroundTrackingWithAlerts(endpoint, JSON.stringify(driver), socketUrl, token);
      }
      return window.AndroidApp.configureBackgroundTracking(endpoint, JSON.stringify(driver));
    } catch (error) {
      console.error('[GPS] Falha ao configurar rastreamento nativo:', error);
      return false;
    }
  },

  stopBackgroundTracking(): void {
    try {
      window.AndroidApp?.stopBackgroundTracking?.();
    } catch {}
  },

  /**
   * 5. 💬 Roteamento nativo direto do WhatsApp
   */
  openWhatsApp(phone: string, message: string = '') {
    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.openWhatsApp) {
      window.AndroidApp.openWhatsApp(fullPhone, message);
    } else if (typeof window !== 'undefined') {
      const encodedMsg = message ? encodeURIComponent(message) : '';
      const url = encodedMsg ? `https://wa.me/${fullPhone}?text=${encodedMsg}` : `https://wa.me/${fullPhone}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
};
