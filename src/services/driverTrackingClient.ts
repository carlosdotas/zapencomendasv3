import { Driver } from '../types/map';

export const MAX_OFFLINE_MINUTES = 30;
export const MAX_OFFLINE_MS = MAX_OFFLINE_MINUTES * 60 * 1000;

/**
 * Retorna true se o motorista está inativo/offline há mais de 30 minutos
 */
export function isDriverStale(driver: Driver, maxMs: number = MAX_OFFLINE_MS): boolean {
  if (!driver.lastSeenTimestamp) return true;
  return (Date.now() - driver.lastSeenTimestamp) > maxMs;
}

/**
 * Formata o horário da última atualização para exibição nos marcadores e cards
 * Ex: "14:32:10 (há 2 min)" ou "Agora mesmo"
 */
export function formatDriverLastSeen(timestamp?: number, fallbackStr?: string): string {
  if (!timestamp) return fallbackStr || 'Sem registro recente';
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  const timeStr = new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  if (elapsedSeconds < 20) {
    return `Agora mesmo (${timeStr})`;
  }
  if (elapsedSeconds < 60) {
    return `Há ${elapsedSeconds}s (${timeStr})`;
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes === 1) {
    return `Há 1 min (${timeStr})`;
  }
  if (elapsedMinutes < 60) {
    return `Há ${elapsedMinutes} min (${timeStr})`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `Há ${elapsedHours}h (${timeStr})`;
}

type DriverUpdateCallback = (driver: Driver) => void;
type DriversInitCallback = (drivers: Driver[]) => void;
type DriverRemoveCallback = (driverId: string) => void;

class DriverTrackingClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private isConnecting: boolean = false;
  private onUpdateCallbacks: Set<DriverUpdateCallback> = new Set();
  private onInitCallbacks: Set<DriversInitCallback> = new Set();
  private onRemoveCallbacks: Set<DriverRemoveCallback> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public connect() {
    if (typeof window === 'undefined' || this.isConnecting) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/tracking`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        console.log('[Tracking WS] Conectado ao servidor de telemetria em tempo real.');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'drivers:init' && Array.isArray(msg.drivers)) {
            const freshDrivers = msg.drivers.filter((d: Driver) => !isDriverStale(d));
            this.onInitCallbacks.forEach(cb => cb(freshDrivers));
          } else if (msg.type === 'driver:update' && msg.driver) {
            if (!isDriverStale(msg.driver)) {
              this.onUpdateCallbacks.forEach(cb => cb(msg.driver));
            }
          } else if (msg.type === 'driver:offline' && msg.driver) {
            this.onUpdateCallbacks.forEach(cb => cb(msg.driver));
          } else if (msg.type === 'driver:remove' && msg.driverId) {
            this.onRemoveCallbacks.forEach(cb => cb(msg.driverId));
          }
        } catch (e) {
          // Ignora mensagens mal formatadas
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (typeof window !== 'undefined' && navigator.onLine) {
        this.connect();
      }
    }, 4000);
  }

  public onDriverUpdate(cb: DriverUpdateCallback) {
    this.onUpdateCallbacks.add(cb);
    return () => this.onUpdateCallbacks.delete(cb);
  }

  public onDriversInit(cb: DriversInitCallback) {
    this.onInitCallbacks.add(cb);
    return () => this.onInitCallbacks.delete(cb);
  }

  public onDriverRemove(cb: DriverRemoveCallback) {
    this.onRemoveCallbacks.add(cb);
    return () => this.onRemoveCallbacks.delete(cb);
  }

  /**
   * Envia atualização de localização do motorista ativo
   */
  public async sendLocation(driver: Driver): Promise<void> {
    const payload = {
      type: 'driver:update_location',
      driver: {
        ...driver,
        lastSeenTimestamp: Date.now()
      }
    };

    // 1. Tenta enviar via WebSocket imediatamente
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return;
    }

    // 2. Fallback HTTP caso o socket esteja reconectando
    try {
      await fetch('/api/tracking/update-driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(driver)
      });
    } catch (e) {
      // Ignora erro transitório
    }
  }

  /**
   * Busca lista de motoristas ativos via REST (filtra > 30 minutos inativos)
   */
  public async fetchLiveDrivers(): Promise<Driver[]> {
    try {
      const res = await fetch(`/api/tracking/live-drivers?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data.filter((d: Driver) => !isDriverStale(d));
        }
      }
    } catch (err) {
      // ignore
    }
    return [];
  }
}

export const driverTrackingClient = new DriverTrackingClient();
