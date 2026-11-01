import React, { useEffect, useRef } from 'react';
import { MapPin, Navigation, Maximize2 } from 'lucide-react';
import L from 'leaflet';
import { LocationCoordinates } from '../../types/map';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';

interface MiniMapPreviewProps {
  address: string;
  coordinates?: LocationCoordinates | null;
  targetType: 'coleta' | 'entrega' | 'troca';
  onClick: () => void;
  className?: string;
  hasError?: boolean;
}

export const MiniMapPreview: React.FC<MiniMapPreviewProps> = ({
  address,
  coordinates,
  targetType,
  onClick,
  className = '',
  hasError = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const themeConfig = {
    coleta: {
      color: '#0B5187',
      label: 'Coleta',
      badgeClass: 'bg-blue-100 text-[#0B5187] border-blue-200',
      activeBorder: 'border-[#0B5187]',
      emptyBg: 'bg-blue-50/40 hover:bg-blue-50',
      emptyBorder: 'border-blue-300 hover:border-[#0B5187]',
      btnBg: 'bg-[#0B5187] text-white hover:bg-blue-800'
    },
    entrega: {
      color: '#FF5E00',
      label: 'Entrega',
      badgeClass: 'bg-orange-100 text-[#FF5E00] border-orange-200',
      activeBorder: 'border-[#FF5E00]',
      emptyBg: 'bg-orange-50/40 hover:bg-orange-50',
      emptyBorder: 'border-orange-300 hover:border-[#FF5E00]',
      btnBg: 'bg-[#FF5E00] text-white hover:bg-orange-600'
    },
    troca: {
      color: '#7C3AED',
      label: 'Troca',
      badgeClass: 'bg-purple-100 text-[#7C3AED] border-purple-200',
      activeBorder: 'border-[#7C3AED]',
      emptyBg: 'bg-purple-50/40 hover:bg-purple-50',
      emptyBorder: 'border-purple-300 hover:border-[#7C3AED]',
      btnBg: 'bg-[#7C3AED] text-white hover:bg-purple-800'
    }
  }[targetType];

  const validCoords = (coordinates && coordinates.lat && coordinates.lng)
    ? coordinates
    : { lat: -16.686893, lng: -49.264843 };

  const hasSelectedAddress = Boolean(address?.trim());

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false
    }).setView([validCoords.lat, validCoords.lng], hasSelectedAddress ? 16 : 14);

    const tileLayer = new CachedTileLayer(PRIMARY_TILE_CONFIG.url, {
      maxZoom: PRIMARY_TILE_CONFIG.maxZoom,
      subdomains: PRIMARY_TILE_CONFIG.subdomains,
      attribution: PRIMARY_TILE_CONFIG.attribution
    });
    tileLayer.addTo(map);

    if (hasSelectedAddress) {
      const pinIcon = L.divIcon({
        className: 'custom-preview-pin',
        html: `
          <div style="background-color:${themeConfig.color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:13px;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.35);">
            📍
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      L.marker([validCoords.lat, validCoords.lng], { icon: pinIcon }).addTo(map);
    }

    mapInstanceRef.current = map;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [hasSelectedAddress, validCoords.lat, validCoords.lng, themeConfig.color]);

  return (
    <div
      onClick={onClick}
      className={`relative w-full h-36 sm:h-44 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer shadow-xs group ${
        hasError
          ? 'border-red-400 ring-2 ring-red-400/30'
          : hasSelectedAddress
          ? `${themeConfig.activeBorder} shadow-sm`
          : 'border-slate-300 hover:border-slate-500'
      } ${className}`}
      title="Clique para abrir o mapa em tela cheia e definir ou ajustar a localização"
    >
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Overlay sutil ao passar o mouse */}
      <div className="absolute inset-0 bg-slate-900/5 group-hover:bg-slate-900/20 transition-colors pointer-events-none" />

      {/* Quando não tem endereço selecionado: Pill minimalista e direto */}
      {!hasSelectedAddress && (
        <div className="absolute inset-0 bg-slate-900/10 flex items-center justify-center p-3 pointer-events-none z-10">
          <div className={`px-3.5 py-2 rounded-xl border shadow-md backdrop-blur-xs flex items-center gap-2 group-hover:scale-105 transition-transform ${
            hasError
              ? 'bg-red-50/95 border-red-400 text-red-800'
              : 'bg-white/95 border-slate-200 text-slate-900'
          }`}>
            <MapPin className="w-4 h-4" style={{ color: themeConfig.color }} />
            <span className="text-xs font-black">
              {hasError ? 'Defina o local no mapa' : 'Toque para abrir o mapa'}
            </span>
          </div>
        </div>
      )}

      {/* Quando tem endereço selecionado: Pill limpa na parte inferior */}
      {hasSelectedAddress && (
        <div className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none z-10">
          <div className="bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-slate-200/90 shadow-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: themeConfig.color }} />
              <span className="text-xs font-black text-slate-900 truncate">
                {address}
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 shrink-0">
              (Ajustar)
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
