import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MapPin, 
  X, 
  Check, 
  Navigation, 
  Loader2, 
  User, 
  Phone,
  Crosshair,
  Sparkles,
  ArrowLeft,
  Edit3,
  Compass,
  AlertCircle
} from 'lucide-react';
import L from 'leaflet';
import { useMapStore } from '../../context/MapContext';
import { reverseGeocode, searchAddress } from '../../services/geocodingService';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';
import { Place, LocationCoordinates } from '../../types/map';
import { Customer } from '../../types/customer';
import { getCustomerForPlace, isUnnamedOrGenericPlace, getCustomerPlaceName } from '../../utils/customerLocationUtils';
import { extractCityFromAddress, normalizeCityName, resolveCustomerCity } from '../../utils/addressUtils';
import { useBackButton } from '../../hooks/useBackButton';
import { FloatingSearchBar } from '../search/FloatingSearchBar';

const DEFAULT_COORDS: LocationCoordinates = { lat: -16.6869, lng: -49.2648 }; // Centro de Goiânia

export const SetCustomerLocationModal: React.FC = () => {
  const {
    customerLocationModalData,
    closeCustomerLocationModal,
    customers,
    updateCustomer,
    persistCustomer,
    updatePlaceDetails,
    selectedPlace,
    setSelectedPlace
  } = useMapStore();

  const isOpen = Boolean(customerLocationModalData);

  // Fecha no botão voltar físico do celular (Android)
  useBackButton('set-customer-location-modal', isOpen, closeCustomerLocationModal, 80);

  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [coords, setCoords] = useState<LocationCoordinates | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isEditingAddress, setIsEditingAddress] = useState<boolean>(false);
  const [isAdjustingMode, setIsAdjustingMode] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Exibe toast temporário de feedback
  const showFeedback = useCallback((msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast(prev => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Cria ícone de Pin do Cliente estilizado (com anel pulsante quando em modo de ajuste)
  const createPinIcon = useCallback((isAdjusting = false) => {
    return L.divIcon({
      className: 'custom-customer-pin',
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:grab;">
          ${isAdjusting ? `
            <div style="position:absolute;top:-10px;width:58px;height:58px;border-radius:50%;background:rgba(5,150,105,0.25);border:2px dashed #059669;animation:ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;pointer-events:none;"></div>
          ` : ''}
          <div style="background-color:#059669;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;border:3px solid white;box-shadow:0 8px 20px rgba(0,0,0,0.4);font-size:16px;font-weight:900;transition:transform 0.2s;">
            📍
          </div>
          <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #059669;margin-top:-2px;"></div>
          <div style="width:10px;height:4px;border-radius:50%;background:rgba(0,0,0,0.35);margin-top:2px;"></div>
        </div>
      `,
      iconSize: [38, 50],
      iconAnchor: [19, 48]
    });
  }, []);

  // Atualiza endereço e cidade via coordenadas (reverse geocoding)
  const updateAddressFromCoords = useCallback(async (newCoords: LocationCoordinates, toastMsg?: string) => {
    setIsGeocoding(true);
    try {
      const place = await reverseGeocode(newCoords);
      if (place && place.address) {
        setAddress(place.address);
        const detectedCity = resolveCustomerCity(place);
        if (detectedCity) {
          setCity(detectedCity);
        }
        if (toastMsg) showFeedback(toastMsg);
      } else {
        setAddress(`${newCoords.lat.toFixed(6)}, ${newCoords.lng.toFixed(6)}`);
      }
    } catch {
      setAddress(`${newCoords.lat.toFixed(6)}, ${newCoords.lng.toFixed(6)}`);
    } finally {
      setIsGeocoding(false);
    }
  }, [showFeedback]);

  // Valores lidos via ref para que atualizações em segundo plano não recriem o mapa nem apaguem o local escolhido
  const customersRef = useRef(customers);
  customersRef.current = customers;
  const selectedPlaceRef = useRef(selectedPlace);
  selectedPlaceRef.current = selectedPlace;
  const createPinIconRef = useRef(createPinIcon);
  createPinIconRef.current = createPinIcon;
  const updateAddressFromCoordsRef = useRef(updateAddressFromCoords);
  updateAddressFromCoordsRef.current = updateAddressFromCoords;

  // Inicializa mapa quando modal abre usando o MESMO mapa (CachedTileLayer + OpenStreetMap HOT)
  useEffect(() => {
    if (!isOpen || !customerLocationModalData) return;

    const customers = customersRef.current;
    const selectedPlace = selectedPlaceRef.current;
    const createPinIcon = (...args: Parameters<typeof createPinIconRef.current>) => createPinIconRef.current(...args);
    const updateAddressFromCoords = (...args: Parameters<typeof updateAddressFromCoordsRef.current>) => updateAddressFromCoordsRef.current(...args);

    // Identifica se há coordenadas iniciais vindas do place ou de cliente existente
    const targetPlace = customerLocationModalData.place || (customerLocationModalData.placeId && selectedPlace?.id === customerLocationModalData.placeId ? selectedPlace : null);
    
    let initialCoords: LocationCoordinates | null = null;
    let initialAddr = '';
    let initialCity = '';

    if (targetPlace?.coordinates && targetPlace.coordinates.lat) {
      initialCoords = targetPlace.coordinates;
      initialAddr = targetPlace.address || targetPlace.name || '';
      initialCity = resolveCustomerCity(targetPlace) || extractCityFromAddress(initialAddr);
    } else if (customerLocationModalData.customerId) {
      const found = customers.find(c => c.id === customerLocationModalData.customerId);
      if (found?.coordinates && found.coordinates.lat) {
        initialCoords = found.coordinates;
        initialAddr = found.address || '';
        initialCity = resolveCustomerCity(found) || extractCityFromAddress(initialAddr);
      }
    }

    setCoords(initialCoords);
    setAddress(initialAddr);
    setCity(initialCity);
    setIsEditingAddress(false);
    setIsAdjustingMode(false);
    setSaveSuccess(false);
    setFeedbackToast(null);

    const startCenter = initialCoords || DEFAULT_COORDS;
    const startZoom = initialCoords ? 17 : 14;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Inicializa com controle de zoom discreto no canto superior direito
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([startCenter.lat, startCenter.lng], startZoom);

      L.control.zoom({ position: 'topright' }).addTo(map);

      // Tile layer com cache offline
      const tileLayer = new CachedTileLayer(PRIMARY_TILE_CONFIG.url, {
        maxZoom: PRIMARY_TILE_CONFIG.maxZoom,
        subdomains: PRIMARY_TILE_CONFIG.subdomains,
        attribution: PRIMARY_TILE_CONFIG.attribution
      });
      tileLayer.addTo(map);

      // Adiciona Marcador arrastável se houver coordenadas
      if (initialCoords) {
        const marker = L.marker([initialCoords.lat, initialCoords.lng], {
          draggable: true,
          icon: createPinIcon(false)
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const updated: LocationCoordinates = { lat: pos.lat, lng: pos.lng };
          setCoords(updated);
          updateAddressFromCoords(updated, '📍 Posição do cliente ajustada!');
        });

        markerRef.current = marker;
      } else {
        markerRef.current = null;
      }

      // Evento ao clicar em qualquer lugar do mapa: posiciona ou move o marcador
      map.on('click', (e: L.LeafletMouseEvent) => {
        const clicked: LocationCoordinates = { lat: e.latlng.lat, lng: e.latlng.lng };
        setCoords(clicked);

        if (!markerRef.current) {
          const newMarker = L.marker([clicked.lat, clicked.lng], {
            draggable: true,
            icon: createPinIcon(true)
          }).addTo(map);

          newMarker.on('dragend', () => {
            const pos = newMarker.getLatLng();
            const updated: LocationCoordinates = { lat: pos.lat, lng: pos.lng };
            setCoords(updated);
            updateAddressFromCoords(updated, '📍 Posição do cliente ajustada!');
          });

          markerRef.current = newMarker;
        } else {
          markerRef.current.setLatLng([clicked.lat, clicked.lng]);
        }

        map.panTo([clicked.lat, clicked.lng]);
        updateAddressFromCoords(clicked, '📍 Local marcado no mapa!');
      });

      mapInstanceRef.current = map;

      // Invalida tamanho para garantir renderização instantânea
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
  }, [isOpen, customerLocationModalData]);

  // Ação de Ajuste de Local: centraliza no pin com zoom de precisão e destaca o marcador
  const handleToggleAdjustLocation = () => {
    if (!mapInstanceRef.current) return;

    if (coords && markerRef.current) {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 18, { animate: true });
      setIsAdjustingMode(true);
      markerRef.current.setIcon(createPinIcon(true));
      showFeedback('🎯 Modo de Ajuste: Arraste o pin ou clique no ponto exato');
    } else {
      // Se ainda não tinha pin, posiciona no centro atual da tela
      const center = mapInstanceRef.current.getCenter();
      const newCoords: LocationCoordinates = { lat: center.lat, lng: center.lng };
      setCoords(newCoords);

      const newMarker = L.marker([newCoords.lat, newCoords.lng], {
        draggable: true,
        icon: createPinIcon(true)
      }).addTo(mapInstanceRef.current);

      newMarker.on('dragend', () => {
        const pos = newMarker.getLatLng();
        const updated: LocationCoordinates = { lat: pos.lat, lng: pos.lng };
        setCoords(updated);
        updateAddressFromCoords(updated, '📍 Posição do cliente ajustada!');
      });

      markerRef.current = newMarker;
      setIsAdjustingMode(true);
      updateAddressFromCoords(newCoords, '🎯 Pin posicionado no centro! Arraste se necessário');
    }
  };

  // Seleciona um local da busca inferior (FloatingSearchBar)
  const handleSelectSearchResult = (place: Place) => {
    const newCoords = place.coordinates;
    const newAddr = place.address || place.name;
    const detectedCity = resolveCustomerCity(place) || extractCityFromAddress(newAddr);

    setCoords(newCoords);
    setAddress(newAddr);
    if (detectedCity) {
      setCity(detectedCity);
    }
    setIsAdjustingMode(false);
    showFeedback('📍 Local selecionado da busca');

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([newCoords.lat, newCoords.lng], 17, { animate: true });

      if (!markerRef.current) {
        const newMarker = L.marker([newCoords.lat, newCoords.lng], {
          draggable: true,
          icon: createPinIcon(false)
        }).addTo(mapInstanceRef.current);

        newMarker.on('dragend', () => {
          const pos = newMarker.getLatLng();
          const updated: LocationCoordinates = { lat: pos.lat, lng: pos.lng };
          setCoords(updated);
          updateAddressFromCoords(updated, '📍 Posição do cliente ajustada!');
        });

        markerRef.current = newMarker;
      } else {
        markerRef.current.setLatLng([newCoords.lat, newCoords.lng]);
        markerRef.current.setIcon(createPinIcon(false));
      }
    }
  };

  // Centralizar no GPS atual do dispositivo
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada neste dispositivo.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userCoords: LocationCoordinates = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };

        setCoords(userCoords);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 17, { animate: true });

          if (!markerRef.current) {
            const newMarker = L.marker([userCoords.lat, userCoords.lng], {
              draggable: true,
              icon: createPinIcon(true)
            }).addTo(mapInstanceRef.current);

            newMarker.on('dragend', () => {
              const p = newMarker.getLatLng();
              const updated: LocationCoordinates = { lat: p.lat, lng: p.lng };
              setCoords(updated);
              updateAddressFromCoords(updated, '📍 Posição do cliente ajustada!');
            });

            markerRef.current = newMarker;
          } else {
            markerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
          }
        }
        updateAddressFromCoords(userCoords, '📍 Localização atual obtida pelo GPS!');
        setIsLocating(false);
      },
      (err) => {
        console.warn('Erro ao obter GPS:', err);
        setIsLocating(false);
        alert('Não foi possível obter sua localização atual via GPS. Verifique a permissão do navegador.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  // Salvar localização do cliente
  const handleSaveLocation = async () => {
    if (!coords || !customerLocationModalData) return;

    const { customerName, customerPhone, placeId, place, customerId } = customerLocationModalData;
    const currentPlace = place || (placeId && selectedPlace?.id === placeId ? selectedPlace : null);
    const finalAddress = address.trim() || `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
    const addressCity = resolveCustomerCity({ address: finalAddress });
    const selectedCity = normalizeCityName(city) || resolveCustomerCity(currentPlace || {});

    // 1. Identificar se o cliente já existe no cadastro (por ID, place vinculado, telefone ou nome)
    let existingCustomer: Customer | null = null;
    if (customerId) {
      const normalizedCustomerId = customerId.replace(/^db-user-/, '');
      existingCustomer = customers.find(c => c.id.replace(/^db-user-/, '') === normalizedCustomerId) || null;
    }
    if (!existingCustomer && currentPlace) {
      existingCustomer = getCustomerForPlace(currentPlace, customers);
    }
    if (!existingCustomer && customerPhone) {
      const cleanPhone = customerPhone.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        existingCustomer = customers.find(c => {
          const cPhone = (c.phone || '').replace(/\D/g, '');
          return cPhone === cleanPhone || cPhone.endsWith(cleanPhone) || cleanPhone.endsWith(cPhone);
        }) || null;
      }
    }
    if (!existingCustomer && customerName) {
      const cleanName = customerName.toLowerCase().trim();
      if (cleanName.length > 1) {
        existingCustomer = customers.find(c => (c.fullName || '').toLowerCase().trim() === cleanName) || null;
      }
    }

    const finalCity = addressCity || selectedCity || resolveCustomerCity(existingCustomer || {}) || 'Goiânia - GO';

    let savedCustomerId = existingCustomer?.id;

    // Atualiza ou adiciona o cliente
    if (existingCustomer) {
      const saved = await updateCustomer(existingCustomer.id, {
        address: finalAddress,
        coordinates: coords,
        city: finalCity,
        cidade: finalCity
      });
      if (!saved) {
        showFeedback('Não foi possível gravar o endereço no banco. Verifique a conexão e tente novamente.');
        return;
      }
    } else {
      const newCust: Customer = {
        id: customerId?.replace(/^db-user-/, '') || `cust-${Date.now()}`,
        fullName: customerName || 'Cliente',
        phone: customerPhone || '',
        cpf: '',
        address: finalAddress,
        coordinates: coords,
        city: finalCity,
        cidade: finalCity,
        createdAt: Date.now()
      };
      const savedCustomer = await persistCustomer(newCust);
      if (!savedCustomer) {
        showFeedback('Não foi possível gravar o cliente no banco. Verifique o telefone e tente novamente.');
        return;
      }
      savedCustomerId = savedCustomer.id;
    }

    // 2. Atualizar o pedido/place vinculado se houver
    if (placeId) {
      const isUnnamed = isUnnamedOrGenericPlace(currentPlace);
      const finalName = (isUnnamed && customerName) 
        ? getCustomerPlaceName(customerName) 
        : (currentPlace?.name || getCustomerPlaceName(customerName || 'Cliente'));

      updatePlaceDetails(placeId, {
        name: finalName,
        customerAddress: finalAddress,
        customerCoordinates: coords,
        customerId: savedCustomerId,
        originCity: finalCity,
        destinationCity: finalCity
      });

      if (selectedPlace && selectedPlace.id === placeId) {
        setSelectedPlace({
          ...selectedPlace,
          name: finalName,
          customerAddress: finalAddress,
          customerCoordinates: coords,
          customerId: savedCustomerId,
          originCity: finalCity,
          destinationCity: finalCity
        });
      }
    }

    if (customerLocationModalData.onLocationSelected) {
      customerLocationModalData.onLocationSelected(finalAddress, coords, finalCity);
    }

    setSaveSuccess(true);
    setTimeout(() => {
      closeCustomerLocationModal();
    }, 600);
  };

  if (!isOpen || !customerLocationModalData) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900 text-slate-900 select-none flex flex-col overflow-hidden animate-in fade-in duration-150">
      
      {/* 1. MAPA EM TELA CHEIA (FULL BLEED) */}
      <div className="relative w-full h-full flex-1 overflow-hidden bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* ========================================================
            2. BARRA SUPERIOR FLUTUANTE COM DADOS DO CLIENTE
            ======================================================== */}
        <div className="absolute top-3 sm:top-4 inset-x-3 sm:inset-x-4 z-[500] flex items-center justify-between gap-2 pointer-events-none">
          
          {/* Card com Informações do Cliente & Botão Voltar */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 p-1.5 sm:p-2 flex items-center gap-2 pointer-events-auto min-w-0 max-w-[85vw] sm:max-w-md">
            
            {/* Botão Voltar */}
            <button
              type="button"
              onClick={closeCustomerLocationModal}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Avatar / Ícone do Cliente */}
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
              {customerLocationModalData.customerName ? (
                customerLocationModalData.customerName.charAt(0).toUpperCase()
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>

            {/* Nome do Cliente e Telefone */}
            <div className="min-w-0 flex-1 pr-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded-md">
                  Cliente
                </span>
                <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                  {customerLocationModalData.customerName || 'Cliente'}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-semibold truncate flex items-center gap-1 mt-0.5">
                {customerLocationModalData.customerPhone ? (
                  <>
                    <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                    <span>{customerLocationModalData.customerPhone}</span>
                  </>
                ) : (
                  <span>Cadastrar Localização do Usuário</span>
                )}
              </p>
            </div>

            {/* Fechar */}
            <button
              type="button"
              onClick={closeCustomerLocationModal}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Botão GPS Rápido Flutuante no Topo */}
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={isLocating}
            className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 px-3 py-2 text-xs font-black text-[#0B5187] hover:bg-blue-50 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
            title="Usar minha localização GPS atual"
          >
            <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin text-[#0B5187]' : ''}`} />
            <span className="hidden sm:inline">Meu GPS</span>
          </button>
        </div>

        {/* ========================================================
            3. BADGES FLUTUANTES DE STATUS / DICA DE AJUSTE (TOPO CENTRO)
            ======================================================== */}
        {isGeocoding && (
          <div className="absolute top-18 sm:top-20 left-1/2 -translate-x-1/2 z-[450] bg-slate-900/95 text-white backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-black shadow-xl flex items-center gap-2 animate-in fade-in zoom-in-95 pointer-events-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
            <span>Identificando endereço no mapa...</span>
          </div>
        )}

        {feedbackToast && !isGeocoding && (
          <div className="absolute top-18 sm:top-20 left-1/2 -translate-x-1/2 z-[450] bg-[#059669]/95 text-white backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-black shadow-xl flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2 pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{feedbackToast}</span>
          </div>
        )}

        {/* Dica Flutuante em Modo de Ajuste */}
        {isAdjustingMode && !feedbackToast && !isGeocoding && (
          <div className="absolute top-18 sm:top-20 left-1/2 -translate-x-1/2 z-[450] bg-emerald-950/90 border border-emerald-400 text-emerald-100 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-black shadow-xl flex items-center gap-1.5 animate-in fade-in pointer-events-none max-w-[90vw] text-center">
            <Crosshair className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span className="truncate">Arraste o pin ou clique no ponto exato para reajustar a posição</span>
          </div>
        )}

        {/* ========================================================
            4. PARTE INFERIOR FLUTUANTE: CARD DE ENDEREÇO + BOTÃO AJUSTAR + BUSCA
            ======================================================== */}
        <div className="absolute bottom-3 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-[540px] z-[500] flex flex-col gap-2 pointer-events-none items-center">
          
          {/* CARD DO LOCAL SELECIONADO COM BOTÃO DE AJUSTE E SALVAMENTO */}
          <div className="w-full pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl p-3 sm:p-3.5 shadow-2xl border border-slate-200/90 flex flex-col gap-2 transition-all">
            
            {/* Linha Superior: Badge de Localização e Botão Editar Texto */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md text-white bg-emerald-600 shrink-0 shadow-2xs flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span>Localização Selecionada</span>
                </span>
                {address && (
                  <span className="text-[10.5px] font-bold text-slate-500 truncate hidden xs:inline">
                    📍 {normalizeCityName(city) || extractCityFromAddress(address)}
                  </span>
                )}
              </div>

              {coords && (
                <button
                  type="button"
                  onClick={() => setIsEditingAddress(!isEditingAddress)}
                  className="text-[11px] font-extrabold text-[#0B5187] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingAddress ? 'Concluir' : 'Editar texto'}</span>
                </button>
              )}
            </div>

            {/* Endereço ou Instrução de Toque no Mapa */}
            {coords ? (
              <div className="flex items-start gap-2.5 pt-0.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                  📍
                </div>
                <div className="min-w-0 flex-1">
                  {isEditingAddress ? (
                    <input
                      type="text"
                      autoFocus
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Adicione número, apartamento, complemento..."
                      className="w-full px-2.5 py-1 text-xs font-bold text-slate-900 bg-slate-50 border-2 border-emerald-500 rounded-lg focus:outline-none"
                    />
                  ) : (
                    <>
                      <p 
                        onClick={() => setIsEditingAddress(true)}
                        className="text-xs sm:text-sm font-black text-slate-900 leading-snug line-clamp-2 cursor-pointer hover:text-emerald-800"
                        title="Toque para editar complemento ou número"
                      >
                        {address || 'Endereço selecionado no mapa'}
                      </p>
                      <p className="text-[10px] font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
                        <Crosshair className="w-2.5 h-2.5 text-emerald-600" />
                        <span>{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</span>
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 py-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                <span>Toque no mapa ou digite na busca abaixo para selecionar o local do cliente.</span>
              </div>
            )}

            {/* Linha de Ações: BOTÃO DE AJUSTAR LOCAL + BOTÃO SALVAR */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              
              {/* BOTÃO DE AJUSTE DE LOCAL (REAJUSTAR POSIÇÃO CASO PRECISE) */}
              <button
                type="button"
                onClick={handleToggleAdjustLocation}
                className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer border active:scale-95 shrink-0 ${
                  isAdjustingMode
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-400 ring-2 ring-emerald-400/30'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                }`}
                title="Toque para aproximar o mapa e reajustar o ponto exato da entrada"
              >
                <Crosshair className={`w-3.5 h-3.5 ${isAdjustingMode ? 'text-emerald-700 animate-spin' : 'text-slate-600'}`} />
                <span>{isAdjustingMode ? 'Ajustando...' : 'Ajustar Local'}</span>
              </button>

              {/* BOTÃO CONFIRMAR / SALVAR LOCALIZAÇÃO */}
              <button
                type="button"
                disabled={!coords || saveSuccess}
                onClick={handleSaveLocation}
                className={`flex-1 py-2 px-3.5 rounded-xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                  saveSuccess
                    ? 'bg-emerald-600'
                    : 'bg-[#0B5187] hover:bg-[#083c64] shadow-blue-900/25'
                }`}
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Local Salvo com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Salvar Localização</span>
                  </>
                )}
              </button>

            </div>

          </div>

          {/* ========================================================
              INPUT EM BAIXO PARA BUSCAR O LOCAL (FloatingSearchBar)
              ======================================================== */}
          <div className="w-full pointer-events-auto">
            <FloatingSearchBar
              dropdownDirection="up"
              onSelectPlace={handleSelectSearchResult}
              onGetLocation={handleGetLocation}
              isLocating={isLocating}
              placeholder="Cole o link do Google Maps ou busque endereço..."
              autoFocus={Boolean(customerLocationModalData.autoFocusSearch)}
            />
          </div>

        </div>

      </div>

    </div>
  );
};
