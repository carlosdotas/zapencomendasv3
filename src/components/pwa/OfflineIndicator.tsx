import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });
  const [showReconnected, setShowReconnected] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (showReconnected) {
    return (
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[4000] px-4 py-2 bg-emerald-600/95 text-white text-xs font-semibold rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2 border border-emerald-400/40 animate-in fade-in slide-in-from-top-2 duration-300">
        <Wifi className="w-3.5 h-3.5" />
        <span>Conexão restabelecida. Sincronizando dados...</span>
      </div>
    );
  }

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[4000] px-4 py-2 bg-slate-900/95 text-amber-300 text-xs font-medium rounded-full shadow-xl backdrop-blur-xs flex items-center gap-2.5 border border-amber-500/40 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="relative flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute" />
        <span className="w-2 h-2 rounded-full bg-amber-500 relative" />
      </div>
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span className="font-semibold text-white">Modo Offline</span>
      <span className="text-amber-200/90 hidden sm:inline">• Mapa em cache e pedidos salvos ativos</span>
    </div>
  );
};
