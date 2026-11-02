import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Search, 
  MapPin, 
  Navigation, 
  Check, 
  Loader2, 
  ArrowLeft,
  ArrowDownToLine,
  Package,
  Repeat,
  Edit3,
  Crosshair
} from 'lucide-react';
import L from 'leaflet';
import { LocationCoordinates, Place } from '../../types/map';
import { searchAddress, reverseGeocode, isGoogleMapsUrl, resolveGoogleMapsUrl } from '../../services/geocodingService';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';
import { useBackButton } from '../../hooks/useBackButton';

interface MapLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'coleta' | 'entrega' | 'troca' | 'cliente';
  initialAddress?: string;
  initialCoords?: LocationCoordinates;
  onConfirm: (result: { address: string; coordinates: LocationCoordinates; name?: string }) => void | Promise<void>;
  /** Oculta o selo do tipo ("Coleta") da barra superior */
  hideTypeBadge?: boolean;
  /** Texto do botão de confirmação (padrão: "Confirmar <tipo>") */
  confirmLabel?: string;
}

const DEFAULT_COORDS: LocationCoordinates = { lat: -16.6869, lng: -49.2648 }; // Centro de Goiânia

export const MapLocationPickerModal: React.FC<MapLocationPickerModalProps> = ({
  isOpen,
  onClose,
  targetType,
  initialAddress = '',
  initialCoords,
  onConfirm,
  hideTypeBadge = false,
  confirmLabel
}) => {
  useBackButton('map-location-picker', isOpen, onClose, 100);

  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string>('');
  const [address, setAddress] = useState<string>(initialAddress);
  const [coords, setCoords] = useState<LocationCoordinates>(initialCoords || DEFAULT_COORDS);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isEditingAddress, setIsEditingAddress] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const themeConfig = {
    coleta: {
      label: 'Coleta',
      fullLabel: 'Local de Coleta',
      icon: ArrowDownToLine,
      color: '#0B5187',
      bgClass: 'bg-[#0B5187]',
      hoverBg: 'hover:bg-blue-800',
      textClass: 'text-[#0B5187]',
      badgeBg: 'bg-blue-50 text-[#0B5187] border-blue-200',
      ringClass: 'ring-[#0B5187]/30'
    },
    entrega: {
      label: 'Entrega',
      fullLabel: 'Local de Entrega',
      icon: Package,
      color: '#FF5E00',
      bgClass: 'bg-[#FF5E00]',
      hoverBg: 'hover:bg-orange-600',
      textClass: 'text-[#FF5E00]',
      badgeBg: 'bg-orange-50 text-[#FF5E00] border-orange-200',
      ringClass: 'ring-[#FF5E00]/30'
    },
    troca: {
      label: 'Troca',
      fullLabel: 'Ponto de Troca',
      icon: Repeat,
      color: '#7C3AED',
      bgClass: 'bg-[#7C3AED]',
      hoverBg: 'hover:bg-purple-800',
      textClass: 'text-[#7C3AED]',
      badgeBg: 'bg-purple-50 text-[#7C3AED] border-purple-200',
      ringClass: 'ring-[#7C3AED]/30'
    },
    cliente: {
      label: 'Cliente',
      fullLabel: 'Localização do Cliente',
      icon: MapPin,
      color: '#059669',
      bgClass: 'bg-emerald-600',
      hoverBg: 'hover:bg-emerald-700',
      textClass: 'text-emerald-700',
      badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      ringClass: 'ring-emerald-600/30'
    }
  }[targetType];

  // Marcador minimalista e nítido
  const createPinIcon = useCallback(() => {
    return L.divIcon({
      className: 'custom-picker-pin',
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:grab;">
          <div style="background-color:${themeConfig.color};width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:3px solid white;box-shadow:0 6px 16px rgba(0,0,0,0.35);font-size:15px;font-weight:900;">
            📍
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${themeConfig.color};margin-top:-2px;"></div>
          <div style="width:8px;height:4px;border-radius:50%;background:rgba(0,0,0,0.3);margin-top:2px;"></div>
        </div>
      `,
      iconSize: [34, 46],
      iconAnchor: [17, 44]
    });
  }, [themeConfig.color]);

  // Atualiza endereço via coordenadas (reverse geocoding)
  const updateAddressFromCoords = useCallback(async (newCoords: LocationCoordinates) => {
    setSelectedPlaceName('');
    setIsGeocoding(true);
    try {
      const place = await reverseGeocode(newCoords);
      if (place && place.address) {
        setAddress(place.address);
      }
    } catch {
      // Mantém coordenadas mesmo se falhar
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  // Inicializa mapa quando modal abre usando o MESMO mapa (CachedTileLayer + OpenStreetMap HOT)
  useEffect(() => {
    if (!isOpen) return;

    setAddress(initialAddress);
    const startCoords = initialCoords || DEFAULT_COORDS;
    setCoords(startCoords);
    setSearchQuery('');
    setSearchResults([]);
    setIsEditingAddress(false);

    if (!initialAddress.trim()) {
      updateAddressFromCoords(startCoords);
    }

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Inicializa com controle de zoom discreto
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([startCoords.lat, startCoords.lng], 16);

      // Adiciona controle de zoom no canto superior direito discreto
      L.control.zoom({ position: 'topright' }).addTo(map);

      // MESMO TILE LAYER DA TELA PRINCIPAL (Humanitarian OpenStreetMap com cache local sem chaves)
      const tileLayer = new CachedTileLayer(PRIMARY_TILE_CONFIG.url, {
        maxZoom: PRIMARY_TILE_CONFIG.maxZoom,
        subdomains: PRIMARY_TILE_CONFIG.subdomains,
        attribution: PRIMARY_TILE_CONFIG.attribution
      });
      tileLayer.addTo(map);

      // Adiciona Marcador arrastável apenas se já existir endereço inicial
      const hasInitialAddr = Boolean(initialAddress && initialAddress.trim());
      if (hasInitialAddr) {
        const marker = L.marker([startCoords.lat, startCoords.lng], {
          draggable: true,
          icon: createPinIcon()
        }).addTo(map);

        // Evento ao arrastar o marcador
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const updated = { lat: pos.lat, lng: pos.lng };
          setCoords(updated);
          updateAddressFromCoords(updated);
        });

        markerRef.current = marker;
      } else {
        markerRef.current = null;
      }

      // Evento ao clicar em qualquer lugar do mapa
      map.on('click', (e: L.LeafletMouseEvent) => {
        const clicked = { lat: e.latlng.lat, lng: e.latlng.lng };
        setCoords(clicked);
        if (!markerRef.current) {
          const newMarker = L.marker([clicked.lat, clicked.lng], {
            draggable: true,
            icon: createPinIcon()
          }).addTo(map);
          newMarker.on('dragend', () => {
            const pos = newMarker.getLatLng();
            const updated = { lat: pos.lat, lng: pos.lng };
            setCoords(updated);
            updateAddressFromCoords(updated);
          });
          markerRef.current = newMarker;
        } else {
          markerRef.current.setLatLng([clicked.lat, clicked.lng]);
        }
        map.panTo([clicked.lat, clicked.lng]);
        updateAddressFromCoords(clicked);
      });

      mapInstanceRef.current = map;

      // Invalida tamanho para renderização perfeita
      setTimeout(() => map.invalidateSize(), 150);
      setTimeout(() => map.invalidateSize(), 400);
    }, 80);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, initialAddress, initialCoords, createPinIcon, updateAddressFromCoords]);

  // Foco automático imediato no campo de busca ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      const focusTimer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 120);
      return () => clearTimeout(focusTimer);
    }
  }, [isOpen]);

  // Busca de endereços com debounce e suporte a links do Google Maps
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Se for link do Google Maps, resolve imediatamente!
    if (isGoogleMapsUrl(val)) {
      setIsSearching(true);
      resolveGoogleMapsUrl(val)
        .then((place) => {
          if (place) {
            handleSelectSearchResult(place);
          }
        })
        .finally(() => setIsSearching(false));
      return;
    }

    if (val.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchAddress(val);
        setSearchResults(res);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);
  };

  // Busca imediata com Enter
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (!searchQuery.trim()) return;

      setIsSearching(true);
      try {
        const res = await searchAddress(searchQuery.trim());
        setSearchResults(res);
        if (res.length > 0) {
          handleSelectSearchResult(res[0]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }
  };

  // Seleciona um resultado da busca
  const handleSelectSearchResult = (place: Place) => {
    setAddress(place.address || place.name);
    setSelectedPlaceName(place.name || '');
    setCoords(place.coordinates);
    setSearchResults([]);
    setSearchQuery('');

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([place.coordinates.lat, place.coordinates.lng], 17);
      if (!markerRef.current) {
        const newMarker = L.marker([place.coordinates.lat, place.coordinates.lng], {
          draggable: true,
          icon: createPinIcon()
        }).addTo(mapInstanceRef.current);
        newMarker.on('dragend', () => {
          const pos = newMarker.getLatLng();
          const updated = { lat: pos.lat, lng: pos.lng };
          setCoords(updated);
          updateAddressFromCoords(updated);
        });
        markerRef.current = newMarker;
      } else {
        markerRef.current.setLatLng([place.coordinates.lat, place.coordinates.lng]);
      }
    }
  };

  // Obter localização atual do GPS
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada neste dispositivo.');
      return;
    }

    setIsLocating(true);

    const applyPos = (pos: GeolocationPosition) => {
      const userCoords: LocationCoordinates = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      setCoords(userCoords);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 17);
        if (!markerRef.current) {
          const newMarker = L.marker([userCoords.lat, userCoords.lng], {
            draggable: true,
            icon: createPinIcon()
          }).addTo(mapInstanceRef.current);
          newMarker.on('dragend', () => {
            const p = newMarker.getLatLng();
            const updated = { lat: p.lat, lng: p.lng };
            setCoords(updated);
            updateAddressFromCoords(updated);
          });
          markerRef.current = newMarker;
        } else {
          markerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
        }
      }
      updateAddressFromCoords(userCoords);
      setIsLocating(false);
    };

    // 1. Tenta fix rápido (cache / antenas / wi-fi)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPos(pos);
        // Refina logo em seguida com alta precisão
        navigator.geolocation.getCurrentPosition(
          (highPos) => applyPos(highPos),
          () => {},
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );
      },
      () => {
        // Fallback para alta precisão com timeout generoso (20s)
        navigator.geolocation.getCurrentPosition(
          (pos) => applyPos(pos),
          (err) => {
            console.warn('Erro ao obter localização:', err);
            setIsLocating(false);
            if (err.code === 1) {
              alert('Permissão de GPS negada. Ative a localização nas configurações do navegador.');
            } else {
              alert('Sinal de GPS fraco ou indisponível. Verifique se o GPS está ativo.');
            }
          },
          { timeout: 20000, enableHighAccuracy: true }
        );
      },
      { timeout: 8000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  };

  // Confirmar localização selecionada
  const handleConfirmLocation = async () => {
    if (!address.trim() || isConfirming) return;
    setIsConfirming(true);
    try {
      await onConfirm({
        address: address.trim(),
        coordinates: coords,
        name: selectedPlaceName || undefined
      });
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar o local.');
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex flex-col animate-in fade-in duration-150">
      
      {/* MAPA EM TELA CHEIA (FULL BLEED) */}
      <div className="relative w-full h-full flex-1 overflow-hidden bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* 1. BARRA SUPERIOR INTEGRADA E MINIMALISTA */}
        <div className="absolute top-3 sm:top-4 left-3 right-3 sm:left-4 sm:right-auto sm:w-[480px] z-[500] space-y-1.5">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200/90 flex items-center p-1.5 gap-1.5 transition-all">
            
            {/* Botão Voltar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Input de Busca Integrado */}
            <div className="relative flex-1 flex items-center min-w-0">
              <div className="pl-1 pr-1.5 text-slate-400 shrink-0">
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0B5187]" />
                ) : (
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                onPaste={async (e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (isGoogleMapsUrl(pasted)) {
                    e.preventDefault();
                    setSearchQuery(pasted);
                    setIsSearching(true);
                    try {
                      const place = await resolveGoogleMapsUrl(pasted);
                      if (place) {
                        handleSelectSearchResult(place);
                      }
                    } finally {
                      setIsSearching(false);
                    }
                  }
                }}
                placeholder="Cole o link do Google Maps ou digite endereço..."
                className="w-full py-1.5 pr-2 text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Botão GPS */}
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={isLocating}
              className="px-2 py-1.5 text-xs font-bold text-slate-700 hover:text-[#0B5187] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Centralizar no meu GPS"
            >
              <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-[#0B5187]' : ''}`} />
              <span className="hidden sm:inline text-[11px]">GPS</span>
            </button>

            {/* Badge do Tipo de Local */}
            {!hideTypeBadge && (
              <span className={`text-[10px] sm:text-xs font-black px-2 py-1 rounded-lg border shrink-0 ${themeConfig.badgeBg}`}>
                {themeConfig.label}
              </span>
            )}

            {/* Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* LISTA FLUTUANTE DE SUGESTÕES DA BUSCA */}
          {searchResults.length > 0 && (
            <div className="bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto animate-in fade-in duration-100">
              {searchResults.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectSearchResult(item)}
                  className="p-2.5 sm:p-3 hover:bg-blue-50/70 cursor-pointer transition-colors flex items-start gap-2.5"
                >
                  <MapPin className="w-4 h-4 text-[#0B5187] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium line-clamp-1">
                      {item.address}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DICA FLUTUANTE DISCRETA NO TOPO DIREITO */}
        <div className="absolute top-3 right-12 z-[400] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-full border border-slate-200/90 shadow-xs pointer-events-none hidden md:flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <span>📍</span>
          <span>Toque no mapa ou arraste o pin</span>
        </div>

        {/* 2. CARD INFERIOR FLUTUANTE MINIMALISTA DE CONFIRMAÇÃO */}
        <div className="absolute bottom-3 sm:bottom-4 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-[540px] z-[500] animate-in slide-in-from-bottom-2 duration-150">
          <div className="bg-white/95 backdrop-blur-md p-3 sm:p-3.5 rounded-2xl shadow-xl border border-slate-200/90 space-y-2.5">
            
            {/* Linha do Endereço */}
            <div className="flex items-start gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs mt-0.5 ${themeConfig.bgClass}`}>
                <MapPin className="w-4 h-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <span>{themeConfig.fullLabel}</span>
                    {isGeocoding && <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-400" />}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress(!isEditingAddress)}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingAddress ? 'Pronto' : 'Editar texto'}</span>
                  </button>
                </div>

                {isEditingAddress ? (
                  <input
                    type="text"
                    autoFocus
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Adicione número, sala, complemento..."
                    className="w-full mt-1 px-2.5 py-1 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B5187]"
                  />
                ) : (
                  <p 
                    onClick={() => setIsEditingAddress(true)}
                    className="text-xs sm:text-sm font-extrabold text-slate-900 line-clamp-2 cursor-pointer hover:text-blue-900 mt-0.5"
                    title="Clique para editar número ou complemento"
                  >
                    {address || 'Clique no mapa para marcar o local...'}
                  </p>
                )}
              </div>
            </div>

            {/* Linha de Ações */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  if (mapInstanceRef.current && coords) {
                    mapInstanceRef.current.setView([coords.lat, coords.lng], 18, { animate: true });
                  }
                }}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                title="Aproximar o mapa e ajustar a posição exata da entrada"
              >
                <Crosshair className="w-3.5 h-3.5 text-slate-600" />
                <span>Ajustar Local</span>
              </button>

              <button
                type="button"
                disabled={!address.trim() || isConfirming}
                onClick={() => void handleConfirmLocation()}
                className={`flex-1 py-2 px-4 rounded-xl text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-[0.98] disabled:opacity-50 ${themeConfig.bgClass} ${themeConfig.hoverBg}`}
              >
                {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{confirmLabel || `Confirmar ${themeConfig.label}`}</span>
              </button>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
