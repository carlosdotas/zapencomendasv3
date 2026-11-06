/**
 * backgroundScheduler.ts
 * Utilitários para processamento em segundo plano sem travamento da interface (Zero Main-Thread Jank).
 * - Comparação rápida de listas sem JSON.stringify
 * - Execução de tarefas pesadas em momentos ociosos (requestIdleCallback / setTimeout)
 * - Gravação assíncrona debounced no localStorage para evitar I/O síncrono bloqueante
 */

/**
 * Compara dois arrays de forma ultrarrápida e determinística sem usar JSON.stringify.
 * Retorna true se ambos contêm os mesmos elementos pela chave/assinatura fornecida.
 */
export function areArraysEqualFast<T>(
  prev: T[] | undefined | null,
  next: T[] | undefined | null,
  signatureFn: (item: T) => string | number
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  if (prev.length === 0) return true;

  for (let i = 0; i < prev.length; i++) {
    if (signatureFn(prev[i]) !== signatureFn(next[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Assinatura rápida de Place para detecção de mudanças sem serializar o objeto inteiro.
 */
export function getPlaceSignature(p: any): string {
  if (!p) return '';
  return JSON.stringify([p.id, p.orderStage, p.orderVisibility, p.assignedDriverId, p.assignedDriverName, p.assignedDriverPhone, p.acceptedByDriver, p.pickupVisibility, p.pickupAssignedDriverId, p.pickupAssignedDriverName, p.pickupAssignedDriverPhone, p.exchangeVisibility, p.exchangeAssignedDriverId, p.exchangeAssignedDriverName, p.exchangeAssignedDriverPhone, p.deliveryVisibility, p.deliveryAssignedDriverId, p.deliveryAssignedDriverName, p.deliveryAssignedDriverPhone, p.collectionRestricted, p.collectionOwnerId, p.price, p.paymentStatus, p.updatedAt, p.imageUrl, p.photos?.length]);
}

/**
 * Assinatura rápida de Customer para detecção de mudanças.
 */
export function getCustomerSignature(c: any): string {
  if (!c) return '';
  return `${c.id}_${c.fullName || c.name || ''}_${c.phone || ''}_${c.address || ''}_${c.coordinates?.lat || 0},${c.coordinates?.lng || 0}`;
}

/**
 * Assinatura rápida de Driver para detecção de telemetria.
 */
export function getDriverSignature(d: any): string {
  if (!d) return '';
  const lat = typeof d.coordinates?.lat === 'number' ? d.coordinates.lat.toFixed(5) : '0';
  const lng = typeof d.coordinates?.lng === 'number' ? d.coordinates.lng.toFixed(5) : '0';
  return `${d.id}_${d.isOnline ? 1 : 0}_${d.status || ''}_${lat},${lng}_${d.speedKmH || 0}_${d.heading || 0}`;
}

/**
 * Executa uma tarefa em tempo ocioso (requestIdleCallback) ou fallback assíncrono,
 * garantindo que a tela permaneça a 60fps sem pequenos congelamentos.
 */
export function scheduleIdleTask(task: () => void, timeoutMs: number = 2000): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(
      () => {
        try {
          task();
        } catch (err) {
          console.warn('[backgroundScheduler] Erro em tarefa ociosa:', err);
        }
      },
      { timeout: timeoutMs }
    );
  } else {
    setTimeout(task, 16);
  }
}

/**
 * Executa uma função computacional pesada dividindo em fatias ou rodando em segundo plano.
 */
export function runInBackground<T>(task: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    scheduleIdleTask(() => {
      try {
        resolve(task());
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Fila de gravação assíncrona com debounce para localStorage.
 * Impede que escritas pesadas de centenas de KBs travem a renderização da UI.
 */
const pendingStorageSaves = new Map<string, any>();
let storageTimer: any = null;

export function scheduleStorageSave(key: string, data: any, delayMs: number = 200): void {
  pendingStorageSaves.set(key, data);

  if (storageTimer !== null) {
    clearTimeout(storageTimer);
  }

  storageTimer = setTimeout(() => {
    storageTimer = null;
    scheduleIdleTask(() => {
      pendingStorageSaves.forEach((value, storageKey) => {
        try {
          const serialized = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(storageKey, serialized);
        } catch (err) {
          console.warn(`[backgroundScheduler] Falha ao persistir chave ${storageKey}:`, err);
        }
      });
      pendingStorageSaves.clear();
    }, 1000);
  }, delayMs);
}
