import { registerSW } from 'virtual:pwa-register';
import { useState, useEffect } from 'react';

export interface PWAUpdateState {
  needRefresh: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  lastCheck: Date;
  buildId: string | null;
  serverBuildId: string | null;
}

type Listener = (state: PWAUpdateState) => void;

let registrationRef: ServiceWorkerRegistration | null = null;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<Listener>();

let currentState: PWAUpdateState = {
  needRefresh: false,
  isChecking: false,
  isUpdating: false,
  lastCheck: new Date(),
  buildId: null,
  serverBuildId: null,
};

function notify() {
  listeners.forEach((listener) => listener({ ...currentState }));
}

function updateState(partial: Partial<PWAUpdateState>) {
  currentState = { ...currentState, ...partial };
  notify();
}

/**
 * Consulta o endpoint /api/app-version para saber se o servidor compilou/publicou uma versão mais recente
 */
async function checkServerVersion(): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return false;
  }

  try {
    const res = await fetch(`/api/app-version?_t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });

    if (res.ok) {
      const data = await res.json();
      const serverId = data.buildId;

      if (!currentState.buildId) {
        // Primeira checagem inicial registra o build corrente
        updateState({ buildId: serverId, serverBuildId: serverId, lastCheck: new Date() });
        return false;
      }

      updateState({ serverBuildId: serverId, lastCheck: new Date() });

      // Se o servidor possui um buildId diferente do que está rodando nesta aba
      if (serverId && serverId !== currentState.buildId) {
        console.log(`[PWA] Nova versão detectada no servidor! (Local: ${currentState.buildId} -> Servidor: ${serverId})`);
        updateState({ needRefresh: true });
        return true;
      }
    }
  } catch (err) {
    // Ignora erros transitórios de rede em modo offline
  }
  return false;
}

/**
 * Dispara uma verificação completa: tanto no Service Worker quanto no endpoint de versão
 */
export async function checkForUpdate(): Promise<boolean> {
  if (currentState.isChecking) return false;
  updateState({ isChecking: true });

  let hasNew = false;
  try {
    // 1. Checa versão no servidor
    const serverHasNew = await checkServerVersion();
    if (serverHasNew) hasNew = true;

    // 2. Checa service worker via registration.update()
    if (registrationRef) {
      await registrationRef.update();
    }
  } catch (err) {
    console.warn('[PWA] Erro ao verificar atualização:', err);
  } finally {
    updateState({ isChecking: false, lastCheck: new Date() });
  }

  return hasNew || currentState.needRefresh;
}

/**
 * Aplica a atualização imediatamente: aciona o service worker para skipWaiting e recarrega
 */
export async function applyUpdate(): Promise<void> {
  updateState({ isUpdating: true });
  console.log('[PWA] Aplicando atualização e recarregando aplicação...');

  try {
    if (updateSWFn) {
      await updateSWFn(true);
    } else {
      window.location.reload();
    }
  } catch (err) {
    console.error('[PWA] Falha ao acionar updateSW:', err);
    window.location.reload();
  }
}

/**
 * Inicializador único do Service Worker e das rotinas automáticas de verificação
 */
export function initPWAUpdateService() {
  if (typeof window === 'undefined') return;

  updateSWFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('[PWA] onNeedRefresh disparado: nova versão pronta para ativação!');
      updateState({ needRefresh: true });
    },
    onOfflineReady() {
      console.log('[PWA] Aplicativo pronto para funcionar 100% offline.');
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        registrationRef = registration;

        // Checagem inicial
        registration.update().catch(() => {});
        checkServerVersion().catch(() => {});

        // Checagem periódica a cada 30 segundos enquanto o site estiver aberto
        setInterval(() => {
          if (navigator.onLine && !document.hidden) {
            registration.update().catch(() => {});
            checkServerVersion().catch(() => {});
          }
        }, 30 * 1000);
      }
    },
  });

  // Checa automaticamente quando o usuário voltar para a aba ou desbloquear o aparelho
  window.addEventListener('focus', () => {
    if (navigator.onLine) {
      checkForUpdate().catch(() => {});
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      checkForUpdate().catch(() => {});
    }
  });

  // Checa automaticamente assim que a conexão de rede for restabelecida
  window.addEventListener('online', () => {
    console.log('[PWA] Dispositivo reconectado à internet. Verificando atualizações...');
    checkForUpdate().catch(() => {});
  });

  // Se o Service Worker mudar o controller, recarrega a página automaticamente com a nova versão
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] Novo Service Worker assumiu o controle. Recarregando...');
      window.location.reload();
    });
  }
}

/**
 * Hook do React para qualquer componente reagir a novas atualizações
 */
export function usePWAUpdate(): PWAUpdateState & {
  checkForUpdate: () => Promise<boolean>;
  applyUpdate: () => Promise<void>;
} {
  const [state, setState] = useState<PWAUpdateState>(currentState);

  useEffect(() => {
    const listener: Listener = (newState) => setState(newState);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    ...state,
    checkForUpdate,
    applyUpdate,
  };
}
