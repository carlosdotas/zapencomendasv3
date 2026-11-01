import React, { useEffect, useState } from 'react';
import { FloatingSearchBar } from '../search/FloatingSearchBar';
import { useMapStore } from '../../context/MapContext';

interface SharedMapData {
  raw?: string;
  url?: string;
  lat?: number | null;
  lng?: number | null;
}

export const BottomSearchBar: React.FC = () => {
  const { selectedPlace, currentRole, searchQuery, setSearchQuery } = useMapStore();
  const [hasSharedMap, setHasSharedMap] = useState(false);

  useEffect(() => {
    const applySharedMap = (data: SharedMapData) => {
      const query = data.url?.trim() || (
        typeof data.lat === 'number' && typeof data.lng === 'number'
          ? `${data.lat}, ${data.lng}`
          : data.raw?.trim()
      );

      if (query) {
        setSearchQuery(query);
        setHasSharedMap(true);
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
      className="absolute bottom-3 sm:bottom-4 left-0 right-0 z-20 px-3 sm:px-6 pointer-events-none flex justify-center animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md sm:max-w-2xl pointer-events-auto">
        <FloatingSearchBar dropdownDirection="up" autoFocus={hasSharedMap} />
      </div>
    </div>
  );
};
