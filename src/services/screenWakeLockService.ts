/**
 * Serviço de Bloqueio de Suspensão de Tela (Screen Wake Lock)
 * 
 * Mantém a tela do dispositivo sempre acesa enquanto o aplicativo estiver aberto,
 * impedindo que o celular apague a tela no suporte do carro ou da moto enquanto visualiza o mapa.
 * 
 * Libera automaticamente quando o usuário minimiza, fecha ou troca de aplicativo,
 * e reativa imediatamente quando o app volta para o primeiro plano.
 */

class ScreenWakeLockService {
  private wakeLockSentinel: any = null;
  private isSupported: boolean = false;
  private isActive: boolean = false;
  private retryTimer: any = null;
  private listenersAttached: boolean = false;
  private statusListeners: Set<(active: boolean) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
      this.init();
    }
  }

  public init() {
    if (typeof window === 'undefined' || this.listenersAttached) return;
    this.listenersAttached = true;

    // 1. Tenta requisitar imediatamente na inicialização
    this.requestWakeLock();

    // 2. Quando o app voltar do segundo plano para a tela principal, re-adquire o WakeLock
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.requestWakeLock();
      } else {
        this.releaseWakeLock();
      }
    });

    // 3. Ouvintes de interação: navegadores móveis frequentemente exigem um primeiro toque na tela
    const onUserInteraction = () => {
      if (!this.isActive) {
        this.requestWakeLock();
      }
    };

    window.addEventListener('touchstart', onUserInteraction, { passive: true });
    window.addEventListener('click', onUserInteraction, { passive: true });
    window.addEventListener('pointerdown', onUserInteraction, { passive: true });

    // 4. Checagem periódica inteligente a cada 20 segundos:
    // Se a tela estiver visível e por algum motivo (ex: modo de bateria) o bloqueio foi solto, reativa
    setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !this.wakeLockSentinel) {
        this.requestWakeLock();
      }
    }, 20000);
  }

  /**
   * Requisita o Screen WakeLock nativo do navegador
   */
  public async requestWakeLock(): Promise<boolean> {
    if (typeof document === 'undefined') return false;

    // Se a aba estiver minimizada ou em background, não requisita
    if (document.visibilityState !== 'visible') {
      return false;
    }

    if (this.wakeLockSentinel) {
      this.setActiveState(true);
      return true;
    }

    if (!this.isSupported) {
      this.setActiveState(true); // Fallback ativado
      return true;
    }

    try {
      this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      this.setActiveState(true);

      // Ouvinte caso o sistema operacional force a liberação (ex: bateria crítica ou tela desligada manualmente)
      this.wakeLockSentinel.addEventListener('release', () => {
        this.wakeLockSentinel = null;
        this.setActiveState(false);

        // Se o aplicativo ainda estiver visível em primeiro plano, re-adquire em 1.5s
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => {
            this.requestWakeLock();
          }, 1500);
        }
      });

      return true;
    } catch (err: any) {
      // Alguns navegadores rejeitam antes do primeiro gesto do usuário
      this.wakeLockSentinel = null;
      this.setActiveState(false);
      return false;
    }
  }

  /**
   * Libera o bloqueio de tela
   */
  public releaseWakeLock() {
    clearTimeout(this.retryTimer);
    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release().catch(() => {});
      } catch (e) {
        // Ignora
      }
      this.wakeLockSentinel = null;
    }
    this.setActiveState(false);
  }

  public isLockActive(): boolean {
    return this.isActive;
  }

  public isApiSupported(): boolean {
    return this.isSupported;
  }

  public subscribe(listener: (active: boolean) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.isActive);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setActiveState(active: boolean) {
    if (this.isActive !== active) {
      this.isActive = active;
      this.statusListeners.forEach((fn) => {
        try {
          fn(active);
        } catch (e) {
          // Ignora
        }
      });
    }
  }
}

export const screenWakeLockService = new ScreenWakeLockService();
