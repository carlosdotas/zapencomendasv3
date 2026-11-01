import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  ArrowDownToLine, 
  Package, 
  Repeat, 
  Loader2, 
  X, 
  Edit3,
  Compass,
  AlertCircle,
  Sparkles,
  MapPin,
  Calendar,
  Clock,
  User,
  Phone,
  BookUser,
  FileText,
  ChevronDown,
  Check
} from 'lucide-react';
import L from 'leaflet';
import { LocationCoordinates, Place, OperationType } from '../../types/map';
import { Customer } from '../../types/customer';
import { reverseGeocode } from '../../services/geocodingService';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';
import { extractCityFromAddress } from '../../utils/addressUtils';
import { createPlaceMarkerIcon } from '../map/FullscreenMap';
import { FloatingSearchBar } from '../search/FloatingSearchBar';
import { OrderScheduleModal } from './OrderScheduleModal';

interface EmbeddedLocationMapStepProps {
  selectedCustomer: Customer | null;
  operationType: OperationType;
  onSelectOperationType: (type: OperationType) => void;
  
  // Coleta
  pickupAddress: string;
  pickupCoords: LocationCoordinates;
  pickupContact: string;
  pickupPhone: string;
  pickupNotes: string;
  pickupDate?: string;
  pickupTime?: string;
  pickupTimeMode?: 'ate' | 'apos';
  onUpdatePickup: (data: {
    address?: string;
    coords?: LocationCoordinates;
    contact?: string;
    phone?: string;
    notes?: string;
    date?: string;
    time?: string;
    timeMode?: 'ate' | 'apos';
  }) => void;

  // Entrega
  deliveryAddress: string;
  deliveryCoords: LocationCoordinates;
  deliveryContact: string;
  deliveryPhone: string;
  deliveryNotes: string;
  deliveryDate?: string;
  deliveryTime?: string;
  deliveryTimeMode?: 'ate' | 'apos';
  onUpdateDelivery: (data: {
    address?: string;
    coords?: LocationCoordinates;
    contact?: string;
    phone?: string;
    notes?: string;
    date?: string;
    time?: string;
    timeMode?: 'ate' | 'apos';
  }) => void;

  // Troca
  exchangeAddress: string;
  exchangeCoords: LocationCoordinates;
  exchangeContact: string;
  exchangePhone: string;
  exchangeNotes: string;
  exchangeDate?: string;
  exchangeTime?: string;
  exchangeTimeMode?: 'ate' | 'apos';
  onUpdateExchange: (data: {
    address?: string;
    coords?: LocationCoordinates;
    contact?: string;
    phone?: string;
    notes?: string;
    date?: string;
    time?: string;
    timeMode?: 'ate' | 'apos';
  }) => void;

  stepErrors: Record<string, string>;
  onClearError: (field: string) => void;
  onOpenPhoneAgenda: (target: 'coleta' | 'entrega' | 'troca') => void;
  onChangeCustomer: () => void;
  onOpenFullScreenMap?: () => void;
  onUpdateCustomerLocation?: (address: string, coords: LocationCoordinates) => void;
}

const DEFAULT_COORDS: LocationCoordinates = { lat: -16.6869, lng: -49.2648 }; // Centro de Goiânia

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatPhoneNumber = (val: string) => {
  const digits = val.replace(/\D/g, '');
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

// Helper para extrair título amigável de um endereço
const getPlaceDisplayName = (address: string, fallback: string): string => {
  if (!address || !address.trim()) return fallback;
  if (address.includes(' - ')) {
    return address.split(' - ')[0].trim();
  }
  if (address.startsWith('Local sem nome')) {
    return 'Local sem nome';
  }
  const parts = address.split(',');
  if (parts.length > 0 && parts[0].trim().length > 0) {
    return parts[0].trim();
  }
  return fallback;
};

export const EmbeddedLocationMapStep: React.FC<EmbeddedLocationMapStepProps> = ({
  selectedCustomer,
  operationType,
  onSelectOperationType,

  pickupAddress,
  pickupCoords,
  pickupContact,
  pickupPhone,
  pickupNotes,
  pickupDate,
  pickupTime,
  pickupTimeMode,
  onUpdatePickup,

  deliveryAddress,
  deliveryCoords,
  deliveryContact,
  deliveryPhone,
  deliveryNotes,
  deliveryDate,
  deliveryTime,
  deliveryTimeMode,
  onUpdateDelivery,

  exchangeAddress,
  exchangeCoords,
  exchangeContact,
  exchangePhone,
  exchangeNotes,
  exchangeDate,
  exchangeTime,
  exchangeTimeMode,
  onUpdateExchange,

  stepErrors,
  onClearError,
  onOpenPhoneAgenda,
  onChangeCustomer,
  onOpenFullScreenMap,
  onUpdateCustomerLocation
}) => {
  // Controle de qual ponto está sendo selecionado/editado no mapa:
  // Em Coleta: 'coleta' (Loja) ou 'entrega' (Cliente)
  // Em Entrega: 'coleta' (Cliente) ou 'entrega' (Destino)
  // Em Troca: 'cliente' (Cliente) ou 'troca' (Loja/Destino)
  const [activeTargetPoint, setActiveTargetPoint] = useState<'coleta' | 'entrega' | 'troca' | 'cliente'>(() => {
    if (operationType === 'coleta') {
      return (!deliveryAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) ? 'entrega' : 'coleta';
    } else if (operationType === 'entrega') {
      return (!pickupAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) ? 'coleta' : 'entrega';
    } else {
      return (!pickupAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) ? 'cliente' : 'troca';
    }
  });

  // Atualiza target quando muda o tipo de operação
  useEffect(() => {
    if (operationType === 'coleta') {
      setActiveTargetPoint((!deliveryAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) ? 'entrega' : 'coleta');
    } else if (operationType === 'entrega') {
      setActiveTargetPoint((!pickupAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) ? 'coleta' : 'entrega');
    } else if (operationType === 'troca') {
      setActiveTargetPoint((!pickupAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) ? 'cliente' : 'troca');
    }
  }, [operationType]);

  // Configuração e dados do ponto atualmente ativo no mapa
  const activeData = useMemo(() => {
    if (activeTargetPoint === 'coleta') {
      const isClientPoint = operationType === 'entrega';
      return {
        key: 'coleta' as const,
        address: pickupAddress,
        coords: pickupCoords,
        errorKey: 'pickupAddress',
        label: isClientPoint ? `Cliente (${selectedCustomer?.fullName || 'Origem'})` : 'Ponto de Coleta',
        themeColor: '#0B5187',
        badgeText: isClientPoint ? 'Local do Cliente (Coleta)' : 'Ponto de Coleta (Loja/Origem)',
        isCustomer: isClientPoint
      };
    } else if (activeTargetPoint === 'entrega') {
      const isClientPoint = operationType === 'coleta';
      return {
        key: 'entrega' as const,
        address: deliveryAddress,
        coords: deliveryCoords,
        errorKey: 'deliveryAddress',
        label: isClientPoint ? `Cliente (${selectedCustomer?.fullName || 'Entrega'})` : 'Ponto de Entrega',
        themeColor: '#FF5E00',
        badgeText: isClientPoint ? 'Local do Cliente (Entrega)' : 'Ponto de Entrega (Destino)',
        isCustomer: isClientPoint
      };
    } else if (activeTargetPoint === 'cliente') {
      return {
        key: 'cliente' as const,
        address: pickupAddress || deliveryAddress,
        coords: pickupCoords || deliveryCoords,
        errorKey: 'pickupAddress',
        label: `Cliente (${selectedCustomer?.fullName || 'Troca'})`,
        themeColor: '#059669',
        badgeText: 'Local do Cliente (Troca)',
        isCustomer: true
      };
    } else {
      return {
        key: 'troca' as const,
        address: exchangeAddress,
        coords: exchangeCoords,
        errorKey: 'exchangeAddress',
        label: 'Ponto de Troca',
        themeColor: '#7C3AED',
        badgeText: 'Ponto de Troca (Loja/Destino)',
        isCustomer: false
      };
    }
  }, [activeTargetPoint, operationType, pickupAddress, pickupCoords, deliveryAddress, deliveryCoords, exchangeAddress, exchangeCoords, selectedCustomer]);

  // Modais de Controle Superior: Tipo, Agenda, Responsável e Observações
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isResponsibleModalOpen, setIsResponsibleModalOpen] = useState(false);
  const [responsibleDialogTab, setResponsibleDialogTab] = useState<'coleta' | 'entrega' | 'troca'>(operationType);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [notesDialogTab, setNotesDialogTab] = useState<'coleta' | 'entrega' | 'troca'>(operationType);

  const todayStr = getTodayDateString();
  const hasScheduleSet = Boolean(
    (pickupDate && pickupDate !== todayStr) ||
    (deliveryDate && deliveryDate !== todayStr) ||
    (operationType === 'troca' && exchangeDate && exchangeDate !== todayStr) ||
    pickupTime ||
    deliveryTime ||
    (operationType === 'troca' && exchangeTime)
  );

  const hasResponsibleSet = Boolean(
    (pickupContact && pickupContact.trim()) ||
    (deliveryContact && deliveryContact.trim()) ||
    (operationType === 'troca' && exchangeContact && exchangeContact.trim()) ||
    pickupPhone ||
    deliveryPhone
  );

  const hasNotesSet = Boolean(
    (pickupNotes && pickupNotes.trim()) ||
    (deliveryNotes && deliveryNotes.trim()) ||
    (operationType === 'troca' && exchangeNotes && exchangeNotes.trim())
  );

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isEditingAddressText, setIsEditingAddressText] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Marcadores Leaflet
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const exchangeMarkerRef = useRef<L.Marker | null>(null);

  // Exibe toast rápido
  const showToast = useCallback((msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  // Atualizar dados de acordo com o ponto ativo selecionado
  const updateActiveLocation = useCallback((newAddress: string, newCoords: LocationCoordinates) => {
    if (activeTargetPoint === 'coleta') {
      onUpdatePickup({ address: newAddress, coords: newCoords });
      onClearError('pickupAddress');
      // Se a operação for 'entrega', coleta é o local do cliente
      if (operationType === 'entrega' && onUpdateCustomerLocation) {
        onUpdateCustomerLocation(newAddress, newCoords);
      }
    } else if (activeTargetPoint === 'entrega') {
      onUpdateDelivery({ address: newAddress, coords: newCoords });
      onClearError('deliveryAddress');
      // Se a operação for 'coleta', entrega é o local do cliente
      if (operationType === 'coleta' && onUpdateCustomerLocation) {
        onUpdateCustomerLocation(newAddress, newCoords);
      }
    } else if (activeTargetPoint === 'cliente') {
      onUpdatePickup({ address: newAddress, coords: newCoords });
      onUpdateDelivery({ address: newAddress, coords: newCoords });
      onClearError('pickupAddress');
      onClearError('deliveryAddress');
      if (onUpdateCustomerLocation) {
        onUpdateCustomerLocation(newAddress, newCoords);
      }
    } else if (activeTargetPoint === 'troca') {
      onUpdateExchange({ address: newAddress, coords: newCoords });
      onClearError('exchangeAddress');
    }
  }, [activeTargetPoint, operationType, onUpdatePickup, onUpdateDelivery, onUpdateExchange, onClearError, onUpdateCustomerLocation]);

  // Reverse geocoding de coordenadas clicadas ou arrastadas
  const handleCoordsChange = useCallback(async (newCoords: LocationCoordinates) => {
    setIsGeocoding(true);
    try {
      const place = await reverseGeocode(newCoords);
      if (place && place.address) {
        const displayName = place.name && place.name !== place.address ? `${place.name} - ${place.address}` : place.address;
        updateActiveLocation(displayName, newCoords);
      } else {
        updateActiveLocation(`Localização (${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)})`, newCoords);
      }
    } catch {
      updateActiveLocation(`Localização (${newCoords.lat.toFixed(4)}, ${newCoords.lng.toFixed(4)})`, newCoords);
    } finally {
      setIsGeocoding(false);
    }
  }, [updateActiveLocation]);

  // Selecionar resultado vindo do FloatingSearchBar (idêntico à busca principal)
  const handleSelectSearchResult = useCallback((item: Place) => {
    const newCoords = item.coordinates;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([newCoords.lat, newCoords.lng], 16, { animate: true });
    }

    const display = item.name && item.name !== item.address && !item.address.startsWith(item.name)
      ? `${item.name} - ${item.address}`
      : item.address;

    updateActiveLocation(display, newCoords);

    if (item.name === 'Local sem nome') {
      showToast('Local sem nome identificado. Coordenadas salvas!');
    } else {
      showToast(`Ponto marcado: ${item.name || 'Local selecionado'}`);
    }
  }, [showToast, updateActiveLocation]);

  // Obter localização atual do GPS
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    setIsLocating(true);

    const applyPos = (pos: GeolocationPosition) => {
      const userCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 16, { animate: true });
      }
      handleCoordsChange(userCoords);
      setIsLocating(false);
      showToast('Localização GPS obtida!');
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPos(pos);
      },
      (err) => {
        console.warn('Erro ao obter localização:', err);
        setIsLocating(false);
        showToast('Não foi possível obter sua localização GPS.');
      },
      { timeout: 15000, enableHighAccuracy: true }
    );
  };

  // Inicialização do Mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialCoords = (activeData.coords && activeData.coords.lat && activeData.coords.lng)
        ? activeData.coords
        : (selectedCustomer?.coordinates || DEFAULT_COORDS);

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([initialCoords.lat, initialCoords.lng], 15);

      const tileLayer = new CachedTileLayer(PRIMARY_TILE_CONFIG.url, {
        maxZoom: PRIMARY_TILE_CONFIG.maxZoom,
        subdomains: PRIMARY_TILE_CONFIG.subdomains,
        attribution: PRIMARY_TILE_CONFIG.attribution
      });
      tileLayer.addTo(map);

      // Clique no mapa: move ou cria o ponto ativo e faz reverse geocoding
      map.on('click', (e: L.LeafletMouseEvent) => {
        const clicked = { lat: e.latlng.lat, lng: e.latlng.lng };
        map.panTo([clicked.lat, clicked.lng], { animate: true });
        handleCoordsChange(clicked);
      });

      mapInstanceRef.current = map;

      // Invalidação inicial de tamanho para preenchimento de tela total
      setTimeout(() => map.invalidateSize(), 80);
      setTimeout(() => map.invalidateSize(), 250);
      setTimeout(() => map.invalidateSize(), 500);

      const ro = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      ro.observe(mapContainerRef.current);
    }
  }, [activeData.coords, handleCoordsChange, selectedCustomer?.coordinates]);

  // Sincronização dos marcadores com as MESMAS MAKERS DO MAPA PRINCIPAL (createPlaceMarkerIcon)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Define quais marcadores estão ativos para arrastar e destacar
    const isPickupActive = activeTargetPoint === 'coleta' || activeTargetPoint === 'cliente';
    const isDeliveryActive = activeTargetPoint === 'entrega' || activeTargetPoint === 'cliente';
    const isExchangeActive = activeTargetPoint === 'troca';

    // 1. MARCADOR DE COLETA (Azul #0B5187)
    const hasPickup = Boolean(pickupAddress && pickupAddress.trim() && pickupCoords && pickupCoords.lat && pickupCoords.lng);

    if (hasPickup) {
      const coletaPlace: Place = {
        id: 'embedded-coleta',
        name: getPlaceDisplayName(pickupAddress, 'Ponto de Coleta'),
        address: pickupAddress,
        coordinates: pickupCoords,
        operationType: 'coleta',
        customerName: pickupContact || (operationType === 'entrega' ? selectedCustomer?.fullName : undefined) || 'Coleta',
        vehicleType: 'moto',
        orderDateBadge: 'hoje'
      };

      const icon = createPlaceMarkerIcon(coletaPlace, isPickupActive);

      if (!pickupMarkerRef.current) {
        const m = L.marker([pickupCoords.lat, pickupCoords.lng], {
          draggable: isPickupActive,
          icon,
          zIndexOffset: isPickupActive ? 1000 : 500
        }).addTo(map);

        m.on('dragend', () => {
          const pos = m.getLatLng();
          handleCoordsChange({ lat: pos.lat, lng: pos.lng });
        });

        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setActiveTargetPoint(operationType === 'troca' ? 'cliente' : 'coleta');
        });

        pickupMarkerRef.current = m;
      } else {
        pickupMarkerRef.current.setIcon(icon);
        pickupMarkerRef.current.setLatLng([pickupCoords.lat, pickupCoords.lng]);
        pickupMarkerRef.current.setZIndexOffset(isPickupActive ? 1000 : 500);
        if (isPickupActive) {
          pickupMarkerRef.current.dragging?.enable();
        } else {
          pickupMarkerRef.current.dragging?.disable();
        }
      }
    } else {
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.remove();
        pickupMarkerRef.current = null;
      }
    }

    // 2. MARCADOR DE ENTREGA (Laranja #FF5E00)
    const hasDelivery = Boolean(deliveryAddress && deliveryAddress.trim() && deliveryCoords && deliveryCoords.lat && deliveryCoords.lng);

    if (hasDelivery) {
      const entregaPlace: Place = {
        id: 'embedded-entrega',
        name: getPlaceDisplayName(deliveryAddress, 'Ponto de Entrega'),
        address: deliveryAddress,
        coordinates: deliveryCoords,
        operationType: 'entrega',
        customerName: deliveryContact || (operationType === 'coleta' ? selectedCustomer?.fullName : undefined) || 'Entrega',
        vehicleType: 'moto',
        orderDateBadge: 'hoje'
      };

      const icon = createPlaceMarkerIcon(entregaPlace, isDeliveryActive);

      if (!deliveryMarkerRef.current) {
        const m = L.marker([deliveryCoords.lat, deliveryCoords.lng], {
          draggable: isDeliveryActive,
          icon,
          zIndexOffset: isDeliveryActive ? 1000 : 500
        }).addTo(map);

        m.on('dragend', () => {
          const pos = m.getLatLng();
          handleCoordsChange({ lat: pos.lat, lng: pos.lng });
        });

        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setActiveTargetPoint(operationType === 'troca' ? 'cliente' : 'entrega');
        });

        deliveryMarkerRef.current = m;
      } else {
        deliveryMarkerRef.current.setIcon(icon);
        deliveryMarkerRef.current.setLatLng([deliveryCoords.lat, deliveryCoords.lng]);
        deliveryMarkerRef.current.setZIndexOffset(isDeliveryActive ? 1000 : 500);
        if (isDeliveryActive) {
          deliveryMarkerRef.current.dragging?.enable();
        } else {
          deliveryMarkerRef.current.dragging?.disable();
        }
      }
    } else {
      if (deliveryMarkerRef.current) {
        deliveryMarkerRef.current.remove();
        deliveryMarkerRef.current = null;
      }
    }

    // 3. MARCADOR DE TROCA (Roxo #7C3AED - Deve aparecer SOMENTE se a operação for 'troca')
    const hasExchange = operationType === 'troca' && Boolean(
      exchangeAddress && exchangeAddress.trim() && exchangeCoords && exchangeCoords.lat && exchangeCoords.lng
    );

    if (hasExchange) {
      const trocaPlace: Place = {
        id: 'embedded-troca',
        name: getPlaceDisplayName(exchangeAddress, 'Ponto de Troca'),
        address: exchangeAddress,
        coordinates: exchangeCoords,
        operationType: 'troca',
        customerName: exchangeContact || selectedCustomer?.fullName || 'Troca',
        vehicleType: 'moto',
        orderDateBadge: 'hoje'
      };

      const icon = createPlaceMarkerIcon(trocaPlace, isExchangeActive);

      if (!exchangeMarkerRef.current) {
        const m = L.marker([exchangeCoords.lat, exchangeCoords.lng], {
          draggable: isExchangeActive,
          icon,
          zIndexOffset: isExchangeActive ? 1000 : 500
        }).addTo(map);

        m.on('dragend', () => {
          const pos = m.getLatLng();
          handleCoordsChange({ lat: pos.lat, lng: pos.lng });
        });

        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setActiveTargetPoint('troca');
        });

        exchangeMarkerRef.current = m;
      } else {
        exchangeMarkerRef.current.setIcon(icon);
        exchangeMarkerRef.current.setLatLng([exchangeCoords.lat, exchangeCoords.lng]);
        exchangeMarkerRef.current.setZIndexOffset(isExchangeActive ? 1000 : 500);
        if (isExchangeActive) {
          exchangeMarkerRef.current.dragging?.enable();
        } else {
          exchangeMarkerRef.current.dragging?.disable();
        }
      }
    } else {
      if (exchangeMarkerRef.current) {
        exchangeMarkerRef.current.remove();
        exchangeMarkerRef.current = null;
      }
    }
  }, [
    pickupAddress,
    pickupCoords,
    pickupContact,
    deliveryAddress,
    deliveryCoords,
    deliveryContact,
    exchangeAddress,
    exchangeCoords,
    exchangeContact,
    operationType,
    activeTargetPoint,
    selectedCustomer?.fullName,
    selectedCustomer?.address,
    selectedCustomer?.coordinates,
    handleCoordsChange,
    onSelectOperationType
  ]);

  // Centraliza o mapa quando o usuário troca o botão Coleta / Entrega / Troca
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const coords = activeData.coords;
    if (coords && coords.lat && coords.lng && activeData.address) {
      map.panTo([coords.lat, coords.lng], { animate: true });
    }
  }, [operationType, activeData.address, activeData.coords]);

  // Limpar localização ativa
  const handleClearActiveLocation = () => {
    updateActiveLocation('', DEFAULT_COORDS);
  };

  // Ajustar visualização para ver todos os pontos preenchidos
  const handleFitAllPoints = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const points: L.LatLngExpression[] = [];
    if (pickupAddress && pickupCoords?.lat && pickupCoords?.lng) {
      points.push([pickupCoords.lat, pickupCoords.lng]);
    }
    if (deliveryAddress && deliveryCoords?.lat && deliveryCoords?.lng) {
      points.push([deliveryCoords.lat, deliveryCoords.lng]);
    }
    if (operationType === 'troca' && exchangeAddress && exchangeCoords?.lat && exchangeCoords?.lng) {
      points.push([exchangeCoords.lat, exchangeCoords.lng]);
    }

    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [80, 80], animate: true });
    } else if (points.length === 1) {
      map.setView(points[0], 16, { animate: true });
    }
  };

  const customerHasLocation = Boolean(
    selectedCustomer?.coordinates &&
    selectedCustomer.coordinates.lat &&
    selectedCustomer.coordinates.lng &&
    selectedCustomer?.address &&
    selectedCustomer.address.trim()
  );

  const hasMultiplePoints = customerHasLocation && Boolean(
    (pickupAddress && deliveryAddress) ||
    (operationType === 'troca' && exchangeAddress && (pickupAddress || deliveryAddress))
  );

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden select-none bg-slate-100 flex flex-col">
      
      {/* ========================================================
          1. O MAPA CHEIO NA TELA (FULL CANVAS INTERATIVO)
          ======================================================== */}
      <div 
        ref={mapContainerRef} 
        className="absolute inset-0 w-full h-full z-0 pointer-events-auto cursor-crosshair"
      />

      {/* ========================================================
          2. TOPO FLUTUANTE: 4 BOTÕES
             1) Tipo (Coleta / Entrega / Troca com Dropdown)
             2) Agenda (Abre Dialog de Data e Horário)
             3) Responsável (Abre Dialog de Responsável/Contato)
             4) Observações (Abre Dialog de Observações)
          ======================================================== */}
      <div className="absolute top-3 inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-[400] w-auto max-w-xl pointer-events-none flex justify-center">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-white/70 flex items-center gap-1.5 transition-all">
          
          {/* BOTÃO 1: TIPO (COLETA / ENTREGA / TROCA) COM DROPDOWN */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsTypeDropdownOpen(prev => !prev);
              }}
              className={`py-2 px-3 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer font-black text-xs sm:text-sm select-none active:scale-95 shadow-sm text-white ${
                operationType === 'coleta' 
                  ? 'bg-[#0B5187] hover:bg-[#083D66]' 
                  : operationType === 'entrega' 
                  ? 'bg-[#FF5E00] hover:bg-[#E05300]' 
                  : 'bg-[#7C3AED] hover:bg-[#6D28D9]'
              }`}
              title="Alternar entre Coleta, Entrega e Troca"
            >
              {operationType === 'coleta' && <ArrowDownToLine className="w-4 h-4 shrink-0" />}
              {operationType === 'entrega' && <Package className="w-4 h-4 shrink-0" />}
              {operationType === 'troca' && <Repeat className="w-4 h-4 shrink-0" />}
              <span>{activeData.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isTypeDropdownOpen ? 'rotate-180' : ''}`} />
              {activeData.address.trim() && (
                <span className="w-2 h-2 rounded-full bg-emerald-300 shrink-0" title="Ponto marcado no mapa" />
              )}
            </button>

            {/* DROPDOWN DO TIPO */}
            {isTypeDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-[410]" 
                  onClick={() => setIsTypeDropdownOpen(false)} 
                />
                <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 p-1.5 z-[420] animate-in fade-in zoom-in-95 flex flex-col gap-1">
                  <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Selecione a Operação
                  </div>
                  {[
                    { id: 'coleta', label: 'Coleta', desc: 'Retirar no local', icon: ArrowDownToLine, color: 'text-[#0B5187]', bgActive: 'bg-blue-50 border-blue-200', isSet: Boolean(pickupAddress.trim()) },
                    { id: 'entrega', label: 'Entrega', desc: 'Entregar no local', icon: Package, color: 'text-[#FF5E00]', bgActive: 'bg-orange-50 border-orange-200', isSet: Boolean(deliveryAddress.trim()) },
                    { id: 'troca', label: 'Troca', desc: 'Troca de produto', icon: Repeat, color: 'text-[#7C3AED]', bgActive: 'bg-purple-50 border-purple-200', isSet: Boolean(exchangeAddress.trim()) },
                  ].map(t => {
                    const TIcon = t.icon;
                    const isSelected = operationType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onSelectOperationType(t.id as OperationType);
                          setIsTypeDropdownOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-all cursor-pointer border ${isSelected ? `${t.bgActive} font-black` : 'border-transparent hover:bg-slate-50 font-bold text-slate-700'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-white shadow-xs' : 'bg-slate-100'} ${t.color}`}>
                            <TIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 leading-none">{t.label}</p>
                            <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{t.desc}</p>
                          </div>
                        </div>
                        {t.isSet && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Endereço preenchido" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* BOTÃO 2: AGENDA (ABRE DIALOG DE DATA E HORÁRIO) */}
          <button
            type="button"
            onClick={() => {
              setIsTypeDropdownOpen(false);
              setIsScheduleModalOpen(true);
            }}
            className={`py-2 px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer font-bold text-xs sm:text-sm select-none active:scale-95 border ${
              hasScheduleSet 
                ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs' 
                : 'bg-white/80 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200/80'
            }`}
            title="Agendar data e horário da encomenda"
          >
            <Calendar className={`w-4 h-4 shrink-0 ${hasScheduleSet ? 'text-amber-600' : 'text-slate-500'}`} />
            <span className="hidden xs:inline">Agenda</span>
            {hasScheduleSet && (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Agendamento configurado" />
            )}
          </button>

          {/* BOTÃO 3: RESPONSÁVEL (ABRE DIALOG DE RESPONSÁVEL/CONTATO) */}
          <button
            type="button"
            onClick={() => {
              setIsTypeDropdownOpen(false);
              setResponsibleDialogTab(operationType);
              setIsResponsibleModalOpen(true);
            }}
            className={`py-2 px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer font-bold text-xs sm:text-sm select-none active:scale-95 border ${
              hasResponsibleSet 
                ? 'bg-blue-50 border-blue-300 text-[#0B5187] shadow-xs' 
                : 'bg-white/80 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200/80'
            }`}
            title="Definir responsável e telefone no local"
          >
            <User className={`w-4 h-4 shrink-0 ${hasResponsibleSet ? 'text-[#0B5187]' : 'text-slate-500'}`} />
            <span className="hidden xs:inline">Responsável</span>
            {hasResponsibleSet && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Responsável informado" />
            )}
          </button>

          {/* BOTÃO 4: OBSERVAÇÕES (ABRE DIALOG DE INSTRUÇÕES / NOTAS) */}
          <button
            type="button"
            onClick={() => {
              setIsTypeDropdownOpen(false);
              setNotesDialogTab(operationType);
              setIsNotesModalOpen(true);
            }}
            className={`py-2 px-2.5 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer font-bold text-xs sm:text-sm select-none active:scale-95 border ${
              hasNotesSet 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs' 
                : 'bg-white/80 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200/80'
            }`}
            title="Instruções e observações para o motorista"
          >
            <FileText className={`w-4 h-4 shrink-0 ${hasNotesSet ? 'text-emerald-600' : 'text-slate-500'}`} />
            <span className="hidden xs:inline">Obs</span>
            {hasNotesSet && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Observações adicionadas" />
            )}
          </button>

        </div>
      </div>

      {/* ========================================================
          3. CONTROLES DE ZOOM E VISÃO FLUTUANTES (LADO DIREITO)
          ======================================================== */}
      <div className="absolute top-16 right-3 z-[300] flex flex-col gap-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="w-8 h-8 bg-white/95 backdrop-blur-xs hover:bg-white text-slate-800 rounded-xl flex items-center justify-center font-black text-lg border border-slate-200 shadow-md cursor-pointer active:scale-90 transition-all"
          title="Aproximar (+)"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="w-8 h-8 bg-white/95 backdrop-blur-xs hover:bg-white text-slate-800 rounded-xl flex items-center justify-center font-black text-lg border border-slate-200 shadow-md cursor-pointer active:scale-90 transition-all"
          title="Afastar (−)"
        >
          −
        </button>
        {hasMultiplePoints && (
          <button
            type="button"
            onClick={handleFitAllPoints}
            className="w-8 h-8 bg-white/95 backdrop-blur-xs hover:bg-white text-[#0B5187] rounded-xl flex items-center justify-center font-black text-xs border border-slate-200 shadow-md cursor-pointer active:scale-90 transition-all"
            title="Ajustar visualização para ver todos os pontos"
          >
            <Compass className="w-4 h-4 text-[#0B5187]" />
          </button>
        )}
      </div>

      {/* ========================================================
          4. BADGE DE STATUS OU GEOCODIFICAÇÃO (TOPO CENTRO)
          ======================================================== */}
      {isGeocoding && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/90 text-white backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-black shadow-lg flex items-center gap-2 animate-in fade-in zoom-in-95 pointer-events-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
          <span>Identificando endereço no Google Maps...</span>
        </div>
      )}

      {feedbackToast && !isGeocoding && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[400] bg-[#0B5187]/95 text-white backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-black shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* ========================================================
          5. PARTE INFERIOR FLUTUANTE: CARD DE ENDEREÇO + BUSCA PRINCIPAL (FloatingSearchBar)
          ======================================================== */}
      <div className="absolute bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-[400] max-w-xl mx-auto flex flex-col gap-2 pointer-events-none items-center">
        
        {/* SELETOR DOS PONTOS DA ENCOMENDA (ORIGEM & DESTINO / CLIENTE) */}
        <div className="w-full pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl p-1 shadow-lg border border-slate-200/90 grid grid-cols-2 gap-1 transition-all">
          {operationType === 'coleta' ? (
            <>
              {/* PONTO 1: COLETA (LOJA / FORNECEDOR) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTargetPoint('coleta');
                  if (pickupCoords && pickupCoords.lat) {
                    mapInstanceRef.current?.panTo([pickupCoords.lat, pickupCoords.lng], { animate: true });
                  }
                }}
                className={`py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer font-bold text-xs select-none ${
                  activeTargetPoint === 'coleta'
                    ? 'bg-[#0B5187] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs">📦</span>
                  <span className="truncate">Coleta (Loja)</span>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  pickupAddress.trim() ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                }`} />
              </button>

              {/* PONTO 2: ENTREGA (CLIENTE) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTargetPoint('entrega');
                  if (deliveryCoords && deliveryCoords.lat) {
                    mapInstanceRef.current?.panTo([deliveryCoords.lat, deliveryCoords.lng], { animate: true });
                  }
                }}
                className={`py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer font-bold text-xs select-none ${
                  activeTargetPoint === 'entrega'
                    ? 'bg-[#FF5E00] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs">👤</span>
                  <span className="truncate">Local do Cliente</span>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  deliveryAddress.trim() ? 'bg-emerald-400' : 'bg-red-500 animate-ping'
                }`} />
              </button>
            </>
          ) : operationType === 'entrega' ? (
            <>
              {/* PONTO 1: COLETA (CLIENTE) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTargetPoint('coleta');
                  if (pickupCoords && pickupCoords.lat) {
                    mapInstanceRef.current?.panTo([pickupCoords.lat, pickupCoords.lng], { animate: true });
                  }
                }}
                className={`py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer font-bold text-xs select-none ${
                  activeTargetPoint === 'coleta'
                    ? 'bg-[#0B5187] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs">👤</span>
                  <span className="truncate">Local do Cliente</span>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  pickupAddress.trim() ? 'bg-emerald-400' : 'bg-red-500 animate-ping'
                }`} />
              </button>

              {/* PONTO 2: ENTREGA (DESTINO) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTargetPoint('entrega');
                  if (deliveryCoords && deliveryCoords.lat) {
                    mapInstanceRef.current?.panTo([deliveryCoords.lat, deliveryCoords.lng], { animate: true });
                  }
                }}
                className={`py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer font-bold text-xs select-none ${
                  activeTargetPoint === 'entrega'
                    ? 'bg-[#FF5E00] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs">📦</span>
                  <span className="truncate">Ponto de Entrega</span>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  deliveryAddress.trim() ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                }`} />
              </button>
            </>
          ) : (
            <>
              {/* PONTO 1: CLIENTE (TROCA) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTargetPoint('cliente');
                  if (pickupCoords && pickupCoords.lat) {
                    mapInstanceRef.current?.panTo([pickupCoords.lat, pickupCoords.lng], { animate: true });
                  }
                }}
                className={`py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer font-bold text-xs select-none ${
                  activeTargetPoint === 'cliente'
                    ? 'bg-[#059669] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs">👤</span>
                  <span className="truncate">Local do Cliente</span>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  pickupAddress.trim() ? 'bg-emerald-400' : 'bg-red-500 animate-ping'
                }`} />
              </button>

              {/* PONTO 2: TROCA (LOJA / DESTINO) */}
              <button
                type="button"
                onClick={() => {
                  setActiveTargetPoint('troca');
                  if (exchangeCoords && exchangeCoords.lat) {
                    mapInstanceRef.current?.panTo([exchangeCoords.lat, exchangeCoords.lng], { animate: true });
                  }
                }}
                className={`py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer font-bold text-xs select-none ${
                  activeTargetPoint === 'troca'
                    ? 'bg-[#7C3AED] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs">🔄</span>
                  <span className="truncate">Ponto de Troca</span>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  exchangeAddress.trim() ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                }`} />
              </button>
            </>
          )}
        </div>

        {/* CARD DO ENDEREÇO ATIVO SELECIONADO / AVISO */}
        <div className="w-full pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 shadow-xl border border-slate-200/90 flex flex-col gap-1.5 transition-all">
          
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span 
                className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md text-white shrink-0 shadow-2xs"
                style={{ backgroundColor: activeData.themeColor }}
              >
                {activeData.badgeText}
              </span>
              {activeData.address ? (
                <span className="text-[11px] font-bold text-slate-500 truncate flex items-center gap-1">
                  <span>📍</span>
                  <strong className="text-slate-800">{extractCityFromAddress(activeData.address)}</strong>
                </span>
              ) : null}
            </div>

            {activeData.address ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditingAddressText(!isEditingAddressText)}
                  className="text-[11px] font-extrabold text-[#0B5187] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingAddressText ? 'Salvar' : 'Complemento'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearActiveLocation}
                  className="text-[11px] font-extrabold text-slate-400 hover:text-red-600 flex items-center gap-0.5 cursor-pointer"
                  title="Limpar endereço e remover marcação"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              </div>
            ) : null}
          </div>

          {activeData.address ? (
            <div className="flex items-start gap-2 pt-0.5">
              <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: activeData.themeColor }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-black text-slate-900 leading-snug line-clamp-2">
                  {activeData.address}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 py-0.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span>Toque no mapa ou digite na busca abaixo para posicionar a marcação.</span>
            </div>
          )}

          {/* Campo de ajuste de complemento / texto inline */}
          {isEditingAddressText && activeData.address && (
            <div className="pt-1 border-t border-slate-100 animate-in fade-in duration-100">
              <input
                type="text"
                autoFocus
                value={activeData.address}
                onChange={(e) => {
                  const val = e.target.value;
                  if (activeTargetPoint === 'coleta') onUpdatePickup({ address: val });
                  else if (activeTargetPoint === 'entrega') onUpdateDelivery({ address: val });
                  else if (activeTargetPoint === 'cliente') {
                    onUpdatePickup({ address: val });
                    onUpdateDelivery({ address: val });
                  } else onUpdateExchange({ address: val });
                }}
                placeholder="Ex: Apto 102, Bloco B, portão verde..."
                className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-[#0B5187] rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white shadow-2xs"
              />
            </div>
          )}

          {/* Erro de validação da etapa */}
          {stepErrors[activeData.errorKey] && (
            <div className="text-xs font-black text-red-600 flex items-center gap-1 pt-0.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{stepErrors[activeData.errorKey]}</span>
            </div>
          )}
        </div>

        {/* ========================================================
            BARRA DE BUSCA: O MESMO COMPONENTE DA BUSCA PRINCIPAL (FloatingSearchBar)
            ======================================================== */}
        <div className="w-full pointer-events-auto">
          <FloatingSearchBar
            dropdownDirection="up"
            onSelectPlace={handleSelectSearchResult}
            onGetLocation={handleGetLocation}
            isLocating={isLocating}
            placeholder="Cole o link do Google Maps ou busque endereço..."
          />
        </div>

      </div>

      {/* ========================================================
          DIALOG 1: AGENDAMENTO (DATA E HORÁRIO)
          ======================================================== */}
      <OrderScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        operationType={operationType}
        pickupDate={pickupDate || todayStr}
        pickupTime={pickupTime || ''}
        pickupTimeMode={pickupTimeMode || 'ate'}
        onChangePickup={(data) => onUpdatePickup(data)}
        deliveryDate={deliveryDate || todayStr}
        deliveryTime={deliveryTime || ''}
        deliveryTimeMode={deliveryTimeMode || 'ate'}
        onChangeDelivery={(data) => onUpdateDelivery(data)}
        exchangeDate={exchangeDate || todayStr}
        exchangeTime={exchangeTime || ''}
        exchangeTimeMode={exchangeTimeMode || 'ate'}
        onChangeExchange={(data) => onUpdateExchange(data)}
      />

      {/* ========================================================
          DIALOG 2: RESPONSÁVEL NO LOCAL
          ======================================================== */}
      {isResponsibleModalOpen && (
        <div 
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsResponsibleModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="px-4 py-3 bg-[#0B5187] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Responsável no Local</h3>
                  <p className="text-[10px] text-white/70">Quem irá atender ou receber o pacote</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResponsibleModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Abas Coleta / Entrega / Troca */}
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5">
              {[
                { id: 'coleta', label: 'Coleta', color: '#0B5187', contact: pickupContact },
                { id: 'entrega', label: 'Entrega', color: '#FF5E00', contact: deliveryContact },
                ...(operationType === 'troca' ? [{ id: 'troca', label: 'Troca', color: '#7C3AED', contact: exchangeContact }] : [])
              ].map((tab) => {
                const isSelected = responsibleDialogTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setResponsibleDialogTab(tab.id as any)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                      isSelected 
                        ? 'bg-white shadow-xs text-slate-900 border-slate-200' 
                        : 'text-slate-500 hover:text-slate-800 border-transparent'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tab.color }} />
                    <span>{tab.label}</span>
                    {tab.contact && (
                      <Check className="w-3 h-3 text-emerald-600 shrink-0 stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Formulário do Responsável */}
            <div className="p-4 flex flex-col gap-3">
              {/* Nome */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-700">
                    Nome do Responsável ({responsibleDialogTab === 'coleta' ? 'Coleta' : responsibleDialogTab === 'entrega' ? 'Entrega' : 'Troca'}):
                  </label>
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={() => {
                        const name = selectedCustomer.fullName;
                        const phone = selectedCustomer.phone;
                        if (responsibleDialogTab === 'coleta') onUpdatePickup({ contact: name, phone });
                        else if (responsibleDialogTab === 'entrega') onUpdateDelivery({ contact: name, phone });
                        else onUpdateExchange({ contact: name, phone });
                      }}
                      className="text-[10px] font-black text-[#0B5187] hover:underline cursor-pointer"
                    >
                      Copiar do Cliente
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={
                      responsibleDialogTab === 'coleta' 
                        ? pickupContact 
                        : responsibleDialogTab === 'entrega' 
                        ? deliveryContact 
                        : exchangeContact
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (responsibleDialogTab === 'coleta') onUpdatePickup({ contact: val });
                      else if (responsibleDialogTab === 'entrega') onUpdateDelivery({ contact: val });
                      else onUpdateExchange({ contact: val });
                    }}
                    placeholder="Nome de quem vai receber ou entregar..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-[#0B5187]"
                  />
                </div>
              </div>

              {/* Telefone */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-700">Telefone / WhatsApp:</label>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenPhoneAgenda(responsibleDialogTab);
                    }}
                    className="text-[10px] font-black text-[#0B5187] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <BookUser className="w-3 h-3" />
                    <span>Agenda Telefônica</span>
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={
                      responsibleDialogTab === 'coleta' 
                        ? pickupPhone 
                        : responsibleDialogTab === 'entrega' 
                        ? deliveryPhone 
                        : exchangePhone
                    }
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      if (responsibleDialogTab === 'coleta') onUpdatePickup({ phone: formatted });
                      else if (responsibleDialogTab === 'entrega') onUpdateDelivery({ phone: formatted });
                      else onUpdateExchange({ phone: formatted });
                    }}
                    placeholder="(XX) XXXXX-XXXX"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-[#0B5187]"
                  />
                </div>
              </div>
            </div>

            {/* Rodapé do Dialog */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsResponsibleModalOpen(false)}
                className="px-5 py-2 bg-[#0B5187] hover:bg-[#083D66] text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          DIALOG 3: OBSERVAÇÕES E INSTRUÇÕES
          ======================================================== */}
      {isNotesModalOpen && (
        <div 
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsNotesModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="px-4 py-3 bg-[#0B5187] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Instruções e Observações</h3>
                  <p className="text-[10px] text-white/70">Avisos importantes para o entregador</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNotesModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Abas Coleta / Entrega / Troca */}
            <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5">
              {[
                { id: 'coleta', label: 'Coleta', color: '#0B5187', notes: pickupNotes },
                { id: 'entrega', label: 'Entrega', color: '#FF5E00', notes: deliveryNotes },
                ...(operationType === 'troca' ? [{ id: 'troca', label: 'Troca', color: '#7C3AED', notes: exchangeNotes }] : [])
              ].map((tab) => {
                const isSelected = notesDialogTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setNotesDialogTab(tab.id as any)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                      isSelected 
                        ? 'bg-white shadow-xs text-slate-900 border-slate-200' 
                        : 'text-slate-500 hover:text-slate-800 border-transparent'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tab.color }} />
                    <span>{tab.label}</span>
                    {tab.notes && (
                      <Check className="w-3 h-3 text-emerald-600 shrink-0 stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Textarea e Sugestões */}
            <div className="p-4 flex flex-col gap-2.5">
              <label className="text-xs font-black text-slate-700">
                Observações de {notesDialogTab === 'coleta' ? 'Coleta' : notesDialogTab === 'entrega' ? 'Entrega' : 'Troca'}:
              </label>
              <textarea
                rows={3}
                autoFocus
                value={
                  notesDialogTab === 'coleta' 
                    ? pickupNotes 
                    : notesDialogTab === 'entrega' 
                    ? deliveryNotes 
                    : exchangeNotes
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (notesDialogTab === 'coleta') onUpdatePickup({ notes: val });
                  else if (notesDialogTab === 'entrega') onUpdateDelivery({ notes: val });
                  else onUpdateExchange({ notes: val });
                }}
                placeholder="Ex: Tocar interfone 204, falar com portaria social, ligar antes de chegar..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-[#0B5187] resize-none"
              />

              {/* Sugestões Rápidas */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5">Sugestões Rápidas:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Portaria social',
                    'Falar com a recepção',
                    'Tocar interfone',
                    'Ligar antes de chegar',
                    'Deixar com vizinho',
                    'Horário comercial'
                  ].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        const current = notesDialogTab === 'coleta' 
                          ? pickupNotes 
                          : notesDialogTab === 'entrega' 
                          ? deliveryNotes 
                          : exchangeNotes;
                        const updated = current ? `${current}. ${sug}` : sug;
                        if (notesDialogTab === 'coleta') onUpdatePickup({ notes: updated });
                        else if (notesDialogTab === 'entrega') onUpdateDelivery({ notes: updated });
                        else onUpdateExchange({ notes: updated });
                      }}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border border-slate-200"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Rodapé do Dialog */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsNotesModalOpen(false)}
                className="px-5 py-2 bg-[#0B5187] hover:bg-[#083D66] text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
