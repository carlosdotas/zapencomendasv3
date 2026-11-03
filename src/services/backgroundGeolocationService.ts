import { Driver, LocationCoordinates } from '../types/map';
import { getApiBaseUrl } from './httpClient';
import { androidBridge } from './androidBridge';

export interface BackgroundTrackingStatus {
  isActive: boolean;
  isAudioKeepAliveActive: boolean;
  isWakeLockActive: boolean;
  lastPosition: LocationCoordinates | null;
  lastTransmittedAt: number | null;
  transmissionsCount: number;
  error: string | null;
}

type StatusListener = (status: BackgroundTrackingStatus) => void;

class BackgroundGeolocationService {
  private isActive: boolean = false;
  private lastError: string | null = null;
  private listeners: Set<StatusListener> = new Set();

  /**
   * Obtém o status operacional atual
   */
  public getStatus(): BackgroundTrackingStatus {
    return {
      isActive: this.isActive,
      isAudioKeepAliveActive: false,
      isWakeLockActive: false,
      lastPosition: null,
      lastTransmittedAt: null,
      transmissionsCount: 0,
      error: this.lastError
    };
  }

  /**
   * Assina notificações de mudança de status
   */
  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const status = this.getStatus();
    this.listeners.forEach(fn => fn(status));
  }

  private configureNativeTracking(driver: Driver): boolean {
    if (typeof window === 'undefined') return false;

    const configuredBaseUrl = getApiBaseUrl();
    const sameOrigin = /^https?:$/i.test(window.location.protocol) ? window.location.origin : '';
    const baseUrl = (configuredBaseUrl || sameOrigin).replace(/\/+$/, '');

    if (!baseUrl) {
      this.lastError = 'Configure a URL do servidor para usar rastreamento nativo em segundo plano.';
      return false;
    }

    return androidBridge.configureBackgroundTracking(`${baseUrl}/api/tracking/update-driver`, driver);
  }

  /**
   * Inicia o monitoramento de localização em segundo plano
   * @param driver Dados do motorista autenticado
   */
  public startBackgroundTracking(driver: Driver) {
    if (this.isActive) return;

    this.lastError = null;
    const nativeTrackingActive = this.configureNativeTracking(driver);

    // O Fused Location Provider e o receiver Java continuam ativos mesmo sem WebView.
    if (nativeTrackingActive) {
      this.isActive = true;
      this.notifyListeners();
      return;
    }

    this.lastError = 'O rastreamento contínuo requer o serviço Java do APK.';
    this.notifyListeners();
  }

  /**
   * Para o monitoramento e libera os recursos do sistema
   */
  public stopBackgroundTracking() {
    this.isActive = false;
    androidBridge.stopBackgroundTracking();
    this.notifyListeners();
  }
}

export const backgroundGeolocationService = new BackgroundGeolocationService();
