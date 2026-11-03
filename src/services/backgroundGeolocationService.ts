/**
 * Serviço de Rastreamento GPS em Segundo Plano para PWA
 * 
 * Permite que o motorista continue transmitindo sua localização em tempo real
 * para a central mesmo quando:
 * - A tela do celular estiver desligada / bloqueada
 * - O app PWA estiver minimizado em segundo plano
 * - O motorista estiver pilotando/dirigindo com o aparelho no bolso ou no suporte
 * 
 * Técnicas aplicadas para evitar que o sistema operacional (Android / iOS) suspenda a execução:
 * 1. Silent Audio Keep-Alive: Áudio inaudível em loop contínuo mantendo a thread JS acordada.
 * 2. MediaSession API: Registra o processo como mídia em primeiro plano no lock screen do celular.
 * 3. Screen Wake Lock API: Impede o bloqueio indesejado da tela quando o aparelho estiver no suporte.
 * 4. Dual Geolocation Watcher: watchPosition contínuo de alta precisão + heartbeat forçado via getCurrentPosition.
 * 5. WebSocket + HTTP Fallback de transmissão garantida.
 */

import { Driver, LocationCoordinates } from '../types/map';
import { driverTrackingClient } from './driverTrackingClient';
import { screenWakeLockService } from './screenWakeLockService';
import { getApiBaseUrl } from './httpClient';
import { androidBridge } from './androidBridge';

// Áudio WAV minúsculo de 1 segundo de silêncio absoluto codificado em Base64
const SILENT_WAV_BASE64 = 
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

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
  private watchId: number | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private audioKeepAlive: HTMLAudioElement | null = null;
  private currentDriver: Driver | null = null;
  private lastCoords: LocationCoordinates | null = null;
  private lastTransmittedAt: number | null = null;
  private transmissionsCount: number = 0;
  private lastError: string | null = null;
  private listeners: Set<StatusListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      // Re-adquire o WakeLock se o app voltar a ficar visível
      document.addEventListener('visibilitychange', () => {
        if (this.isActive && document.visibilityState === 'visible') {
          this.requestWakeLock();
        }
      });
    }
  }

  /**
   * Obtém o status operacional atual
   */
  public getStatus(): BackgroundTrackingStatus {
    return {
      isActive: this.isActive,
      isAudioKeepAliveActive: Boolean(this.audioKeepAlive && !this.audioKeepAlive.paused),
      isWakeLockActive: screenWakeLockService.isLockActive(),
      lastPosition: this.lastCoords,
      lastTransmittedAt: this.lastTransmittedAt,
      transmissionsCount: this.transmissionsCount,
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

  /**
   * Ativa a reprodução do áudio de silêncio em loop para manter a thread do navegador viva com tela desligada
   */
  private startAudioKeepAlive() {
    try {
      if (!this.audioKeepAlive) {
        this.audioKeepAlive = new Audio(SILENT_WAV_BASE64);
        this.audioKeepAlive.loop = true;
        this.audioKeepAlive.volume = 0.01; // Quase nulo, inaudível
        this.audioKeepAlive.setAttribute('playsinline', 'true');
        this.audioKeepAlive.setAttribute('webkit-playsinline', 'true');
      }

      const playPromise = this.audioKeepAlive.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[BackgroundGPS] Áudio keep-alive ativo. O navegador continuará rodando com a tela desligada.');
            this.setupMediaSession();
            this.notifyListeners();
          })
          .catch((err) => {
            console.warn('[BackgroundGPS] Bloqueio de autoplay no keep-alive:', err);
          });
      }
    } catch (e) {
      console.warn('[BackgroundGPS] Falha ao inicializar keep-alive de áudio:', e);
    }
  }

  /**
   * Registra a sessão de mídia no SO (Android / iOS) para informar que o rastreamento está ativo
   */
  private setupMediaSession() {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'EncomendasZap • Rastreamento Ativo',
          artist: this.currentDriver?.name || 'Motorista em Rota',
          album: 'Monitoramento contínuo em segundo plano (Tela Desligada)',
          artwork: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        });

        navigator.mediaSession.playbackState = 'playing';

        // Previne que botões de mídia encerrem acidentalmente o rastreamento
        navigator.mediaSession.setActionHandler('play', () => {
          if (this.audioKeepAlive) this.audioKeepAlive.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Mantém ativo mesmo se o usuário pausar no lockscreen
          if (this.audioKeepAlive) this.audioKeepAlive.play().catch(() => {});
        });
      } catch (e) {
        // Ignora navegadores que não suportam MediaSession completo
      }
    }
  }

  /**
   * Requisita Screen WakeLock para impedir o apagamento automático da tela no suporte da moto/carro
   */
  private async requestWakeLock() {
    await screenWakeLockService.requestWakeLock();
    this.notifyListeners();
  }

  private configureNativeTracking(driver: Driver) {
    if (typeof window === 'undefined') return;

    const configuredBaseUrl = getApiBaseUrl();
    const sameOrigin = /^https?:$/i.test(window.location.protocol) ? window.location.origin : '';
    const baseUrl = (configuredBaseUrl || sameOrigin).replace(/\/+$/, '');

    if (!baseUrl) {
      this.lastError = 'Configure a URL do servidor para usar rastreamento nativo em segundo plano.';
      return;
    }

    androidBridge.configureBackgroundTracking(`${baseUrl}/api/tracking/update-driver`, driver);
  }

  /**
   * Transmite as coordenadas do motorista para a central e para o backend
   */
  public transmitLocation(coords: LocationCoordinates) {
    this.lastCoords = coords;
    this.lastTransmittedAt = Date.now();
    this.transmissionsCount += 1;

    if (this.currentDriver) {
      const now = Date.now();
      const timeStr = new Date(now).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const updatedDriver: Driver = {
        ...this.currentDriver,
        coordinates: {
          lat: coords.lat,
          lng: coords.lng,
          heading: coords.heading,
          speed: coords.speed,
          timestamp: now
        },
        heading: coords.heading ?? this.currentDriver.heading ?? 0,
        speedKmH: coords.speed ? Math.round(coords.speed * 3.6) : 0,
        status: 'em_rota',
        isOnline: true,
        lastSeenTimestamp: now,
        lastUpdatedStr: timeStr
      };

      // 1. Envia via DriverTrackingClient (WebSocket + REST Fallback)
      driverTrackingClient.sendLocation(updatedDriver).catch(() => {});

      // 2. Notifica o Service Worker do PWA para manter cache fresco em background
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({
            type: 'DRIVER_LOCATION_PING',
            driver: updatedDriver,
            timestamp: now
          });
        } catch {}
      }
    }

    this.notifyListeners();
  }

  /**
   * Inicia o monitoramento de localização em segundo plano
   * @param driver Dados do motorista autenticado
   */
  public startBackgroundTracking(driver: Driver) {
    this.configureNativeTracking(driver);

    if (this.isActive) {
      this.currentDriver = driver;
      return;
    }

    this.isActive = true;
    this.currentDriver = driver;
    this.lastError = null;

    // 1. Inicia o Keep-Alive de Áudio e MediaSession (mantém thread viva com tela desligada)
    this.startAudioKeepAlive();

    // 2. Requisita Screen WakeLock
    this.requestWakeLock();

    // 3. Inicia o observador nativo contínuo de alta precisão
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        if (this.watchId !== null) {
          navigator.geolocation.clearWatch(this.watchId);
        }

        this.watchId = navigator.geolocation.watchPosition(
          (position) => {
            const coords: LocationCoordinates = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              heading: position.coords.heading ?? undefined,
              speed: position.coords.speed ?? undefined,
              timestamp: position.timestamp || Date.now()
            };
            this.transmitLocation(coords);
          },
          (err) => {
            console.warn('[BackgroundGPS] Aviso no watchPosition:', err.message);
            this.lastError = err.message;
            this.notifyListeners();
          },
          {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 15000
          }
        );
      } catch (e: any) {
        this.lastError = e?.message || 'Falha ao iniciar GPS nativo';
      }

      this.heartbeatInterval = setInterval(() => {
        if (!this.isActive) return;

        // 3.1. Lê coordenadas de alta precisão diretamente do serviço nativo em segundo plano do Android
        if (typeof window !== 'undefined' && window.AndroidApp?.getLatitude && window.AndroidApp?.getLongitude) {
          try {
            const lat = window.AndroidApp.getLatitude();
            const lng = window.AndroidApp.getLongitude();
            if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
              this.transmitLocation({ lat, lng, timestamp: Date.now() });
              return;
            }
          } catch {}
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords: LocationCoordinates = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading ?? undefined,
              speed: pos.coords.speed ?? undefined,
              timestamp: pos.timestamp || Date.now()
            };
            this.transmitLocation(coords);
          },
          () => {
            // Se o heartbeat falhar temporariamente, o watchPosition segue ativo
          },
          {
            enableHighAccuracy: true,
            maximumAge: 3000,
            timeout: 10000
          }
        );
      }, 6000);
    }

    this.notifyListeners();
  }

  /**
   * Para o monitoramento e libera os recursos do sistema
   */
  public stopBackgroundTracking() {
    this.isActive = false;
    androidBridge.stopBackgroundTracking();

    // Para o observador de GPS
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    // Limpa o heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }


    // Pausa e descarrega o áudio de silêncio
    if (this.audioKeepAlive) {
      try {
        this.audioKeepAlive.pause();
        this.audioKeepAlive.currentTime = 0;
      } catch {}
    }

    // Limpa a MediaSession
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch {}
    }

    this.notifyListeners();
  }
}

export const backgroundGeolocationService = new BackgroundGeolocationService();
