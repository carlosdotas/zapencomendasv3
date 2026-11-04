import React, { useEffect, useRef, useState } from 'react';
import { searchAddress } from '../../services/geocodingService';
import { FloatingSearchBar } from '../search/FloatingSearchBar';
import { useMapStore } from '../../context/MapContext';
import { extractSharedMapQuery, readShareParams } from '../../utils/sharedMapLink';
import { useAppVersion } from '../../hooks/useAppVersion';

interface SharedMapData {
  raw?: string;
  url?: string;
  lat?: number | null;
  lng?: number | null;
}

export const BottomSearchBar: React.FC = () => {
  const { selectedPlace, currentRole, searchQuery, setSearchQuery, openNewOrderForm } = useMapStore();
  const [hasSharedMap, setHasSharedMap] = useState(false);
  const appVersion = useAppVersion();
  const openNewOrderFormRef = useRef(openNewOrderForm);
  openNewOrderFormRef.current = openNewOrderForm;

  useEffect(() => {
    // Resolve o local compartilhado e já abre o pedido; se não resolver (ou for motorista), cai na busca
    const openOrderFromShare = async (query: string) => {
      const isDriver = localStorage.getItem('encomendaszap_user_role') === 'motorista';
      if (!isDriver) {
        try {
          const [resolved] = await searchAddress(query);
          if (resolved?.coordinates) {
            openNewOrderFormRef.current({ ...resolved, id: `pedido-${Date.now()}` });
            return;
          }
        } catch (error) {
          console.warn('[BottomSearchBar] Falha ao resolver local compartilhado:', error);
        }
      }
      setSearchQuery(query);
      setHasSharedMap(true);
    };

    const applySharedMap = (data: SharedMapData) => {
      const query = extractSharedMapQuery({ url: data.url, text: data.raw }) || (
        typeof data.lat === 'number' && typeof data.lng === 'number'
          ? `${data.lat}, ${data.lng}`
          : data.raw?.trim()
      );

      if (query) {
        void openOrderFromShare(query);
      }

      window.AndroidApp?.clearLastSharedMap?.();
    };

    const handleMapShare = (event: Event) => {
      applySharedMap((event as CustomEvent<SharedMapData>).detail || {});
    };

    window.addEventListener('mapShareReceived', handleMapShare);

    const pendingShare = window.AndroidApp?.getLastSharedMap?.();
    if (pendingShare) {
      try {
        applySharedMap(JSON.parse(pendingShare) as SharedMapData);
      } catch {
        window.AndroidApp?.clearLastSharedMap?.();
      }
    }

    // PWA instalado: o Android abre o app em /?text=...&url=... ao compartilhar pelo WhatsApp
    const sharedContent = readShareParams(window.location.search);
    if (sharedContent) {
      const query = extractSharedMapQuery(sharedContent);
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      if (query) void openOrderFromShare(query);
    }

    return () => window.removeEventListener('mapShareReceived', handleMapShare);
  }, [setSearchQuery]);

  useEffect(() => {
    if (!searchQuery) setHasSharedMap(false);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedPlace) setHasSharedMap(false);
  }, [selectedPlace]);

  if (!hasSharedMap && (selectedPlace || currentRole === 'motorista')) return null;

  return (
    <div 
      className="absolute bottom-2.5 sm:bottom-3.5 left-0 right-0 z-20 px-3 sm:px-6 pointer-events-none flex flex-col items-center animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md sm:max-w-2xl pointer-events-auto pr-14 sm:pr-0">
        <FloatingSearchBar dropdownDirection="up" autoFocus={hasSharedMap} />
      </div>
      <div className="mt-1 text-[10px] text-slate-500/90 font-medium tracking-tight text-center select-none pointer-events-none drop-shadow-xs bg-white/75 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-slate-200/60 shadow-2xs">
        Criado por: Carlos Dottas {appVersion}
      </div>
    </div>
  );
};
