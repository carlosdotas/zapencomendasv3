import { useState, useEffect } from 'react';
import { screenWakeLockService } from '../services/screenWakeLockService';

/**
 * Hook para monitorar e garantir que a tela continue acesa enquanto o app estiver aberto.
 */
export function useScreenWakeLock() {
  const [isActive, setIsActive] = useState(() => screenWakeLockService.isLockActive());
  const [isSupported] = useState(() => screenWakeLockService.isApiSupported());

  useEffect(() => {
    // Inicializa e requisita
    screenWakeLockService.requestWakeLock();

    const unsubscribe = screenWakeLockService.subscribe((active) => {
      setIsActive(active);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isActive,
    isSupported,
    requestWakeLock: () => screenWakeLockService.requestWakeLock(),
    releaseWakeLock: () => screenWakeLockService.releaseWakeLock()
  };
}
