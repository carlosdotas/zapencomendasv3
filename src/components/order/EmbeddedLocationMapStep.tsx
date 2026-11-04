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
  Check,
  Search,
  Bike,
  Users,
  Zap,
  CheckCircle2
} from 'lucide-react';
import L from 'leaflet';
import { LocationCoordinates, Place, OperationType, OrderVisibilityType } from '../../types/map';
import { Customer } from '../../types/customer';
import { reverseGeocode } from '../../services/geocodingService';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';
import { extractCityFromAddress } from '../../utils/addressUtils';
import { createPlaceMarkerIcon } from '../map/FullscreenMap';
import { FloatingSearchBar } from '../search/FloatingSearchBar';
import { OrderScheduleModal } from './OrderScheduleModal';
import { useMapStore } from '../../context/MapContext';
import { getDriverPermanentColor } from '../../utils/driverColorUtils';

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

  routePointConfigs?: Record<'pickup' | 'exchange' | 'delivery', {
    visibility: OrderVisibilityType;
    driverId: string;
    sellerName: string;
    sellerPhone: string;
  }>;
  onUpdateRoutePointConfig?: (point: 'pickup' | 'exchange' | 'delivery', update: Partial<{
    visibility: OrderVisibilityType;
    driverId: string;
    sellerName: string;
    sellerPhone: string;
  }>) => void;
  onSelectCustomer?: (customer: Customer) => void;
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
  onUpdateCustomerLocation,
  routePointConfigs,
  onUpdateRoutePointConfig,
  onSelectCustomer
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

  const { drivers, customers } = useMapStore();

  // Modais de Controle: Tipo, Agenda, Responsável, Motorista e Cliente
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isResponsibleModalOpen, setIsResponsibleModalOpen] = useState(false);
  const [responsibleDialogTab, setResponsibleDialogTab] = useState<'coleta' | 'entrega' | 'troca'>(operationType);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  const activePointKey: 'pickup' | 'exchange' | 'delivery' = 
    activeTargetPoint === 'coleta' ? 'pickup' 
    : activeTargetPoint === 'troca' ? 'exchange' 
    : 'delivery';

  const isColetaStop = activeTargetPoint === 'coleta';
  const isEntregaStop = activeTargetPoint === 'entrega';
  const isTrocaStop = activeTargetPoint === 'troca';

  const activePointConfig = routePointConfigs ? routePointConfigs[activePointKey] : undefined;
  const assignedDriver = activePointConfig?.driverId 
    ? drivers.find(d => d.id === activePointConfig.driverId) 
    : null;

  const activeResponsibleName = isColetaStop 
    ? pickupContact 
    : isEntregaStop 
    ? deliveryContact 
    : exchangeContact;

  const activeResponsiblePhone = isColetaStop 
    ? pickupPhone 
    : isEntregaStop 
    ? deliveryPhone 
    : exchangePhone;

  const hasActiveResponsible = Boolean(activeResponsibleName?.trim());

  const activeNotesValue = isColetaStop 
    ? pickupNotes 
    : isEntregaStop 
    ? deliveryNotes 
    : isTrocaStop 
    ? exchangeNotes 
    : pickupNotes;

  const handleActiveNotesChange = (val: string) => {
    if (isColetaStop) {
      onUpdatePickup({ notes: val });
    } else if (isEntregaStop) {
      onUpdateDelivery({ notes: val });
    } else if (isTrocaStop) {
      onUpdateExchange({ notes: val });
    } else {
      onUpdatePickup({ notes: val });
      onUpdateDelivery({ notes: val });
    }
  };

  const filteredModalCustomers = useMemo(() => {
    const q = customerSearchTerm.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => 
      (c.fullName && c.fullName.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      (c.cpf && c.cpf.includes(q))
    );
  }, [customers, customerSearchTerm]);

  const todayStr = getTodayDateString();
  const hasScheduleSet = Boolean(
    (pickupDate && pickupDate !== todayStr) ||
    (deliveryDate && deliveryDate !== todayStr) ||
    (operationType === 'troca' && exchangeDate && exchangeDate !== todayStr) ||
    pickupTime ||
    deliveryTime ||
    (operationType === 'troca' && exchangeTime)
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
                  <span>{isEditingAddressText ? 'Salvar' : 'Alterar Nome'}</span>
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
              <div 
                className="min-w-0 flex-1 cursor-pointer group"
                onClick={() => setIsEditingAddressText(true)}
                title="Toque para alterar o nome do endereço"
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-xs sm:text-sm font-black text-slate-900 leading-snug line-clamp-2 group-hover:text-[#0B5187] transition-colors">
                    {activeData.address}
                  </p>
                  <Edit3 className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100 group-hover:text-[#0B5187] shrink-0" />
                </div>
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
            <div className="pt-1 border-t border-slate-100 animate-in fade-in duration-100 flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                value={activeData.address}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingAddressText(false);
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  if (activeTargetPoint === 'coleta') onUpdatePickup({ address: val });
                  else if (activeTargetPoint === 'entrega') onUpdateDelivery({ address: val });
                  else if (activeTargetPoint === 'cliente') {
                    onUpdatePickup({ address: val });
                    onUpdateDelivery({ address: val });
                  } else onUpdateExchange({ address: val });
                }}
                placeholder="Ex: Nome do local ou complemento..."
                className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-[#0B5187] rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setIsEditingAddressText(false)}
                className="px-2.5 py-1.5 bg-[#0B5187] hover:bg-[#083D66] text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                Salvar
              </button>
            </div>
          )}

          {/* OS TRÊS BOTÕES NA MESMA LINHA: CLIENTE | MOTORISTA | RESPONSÁVEL / VENDEDOR */}
          <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-100">
            {/* BOTÃO 1: CLIENTE */}
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className={`py-1.5 px-1.5 sm:px-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 shadow-2xs ${
                selectedCustomer 
                  ? 'bg-blue-50/90 border-blue-200 text-[#0B5187]' 
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-700 hover:text-slate-900'
              }`}
              title={selectedCustomer ? `Cliente: ${selectedCustomer.fullName}` : "Selecionar cliente"}
            >
              <div className="flex items-center gap-1 min-w-0 max-w-full">
                <span className="text-xs">👤</span>
                <span className="text-[11px] sm:text-xs font-black truncate max-w-[80px] sm:max-w-[110px]">
                  {selectedCustomer ? selectedCustomer.fullName : 'Definir Cliente'}
                </span>
              </div>
              <span className="text-[9px] font-bold text-slate-400 leading-none mt-0.5 truncate max-w-full">
                {selectedCustomer ? 'Cliente' : 'Toque p/ definir'}
              </span>
            </button>

            {/* BOTÃO 2: MOTORISTA */}
            <button
              type="button"
              onClick={() => setIsDriverModalOpen(true)}
              className={`py-1.5 px-1.5 sm:px-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 shadow-2xs ${
                assignedDriver 
                  ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900' 
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-700 hover:text-slate-900'
              }`}
              title={assignedDriver ? `Motorista direcionado: ${assignedDriver.name}` : "Definir motorista"}
            >
              <div className="flex items-center gap-1 min-w-0 max-w-full">
                {assignedDriver ? (
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0 border border-white"
                    style={{ backgroundColor: getDriverPermanentColor(assignedDriver.id || assignedDriver.phone || assignedDriver.name) }}
                  />
                ) : (
                  <span className="text-xs">🛵</span>
                )}
                <span className="text-[11px] sm:text-xs font-black truncate max-w-[80px] sm:max-w-[110px]">
                  {assignedDriver ? assignedDriver.name : 'Definir Motorista'}
                </span>
              </div>
              <span className="text-[9px] font-bold text-slate-400 leading-none mt-0.5 truncate max-w-full">
                {assignedDriver ? (assignedDriver.vehicleType || 'Motorista') : 'Aberto / Público'}
              </span>
            </button>

            {/* BOTÃO 3: RESPONSÁVEL (NA COLETA) OU VENDEDOR (NA ENTREGA) */}
            <button
              type="button"
              onClick={() => {
                setResponsibleDialogTab(activePointKey === 'pickup' ? 'coleta' : activePointKey === 'exchange' ? 'troca' : 'entrega');
                setIsResponsibleModalOpen(true);
              }}
              className={`py-1.5 px-1.5 sm:px-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer active:scale-95 shadow-2xs ${
                hasActiveResponsible 
                  ? 'bg-amber-50/90 border-amber-200 text-amber-900' 
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-700 hover:text-slate-900'
              }`}
              title={isEntregaStop ? "Definir Vendedor / Responsável" : "Definir Responsável no local"}
            >
              <div className="flex items-center gap-1 min-w-0 max-w-full">
                <span className="text-xs">{isEntregaStop ? '🏷️' : '📦'}</span>
                <span className="text-[11px] sm:text-xs font-black truncate max-w-[80px] sm:max-w-[110px]">
                  {activeResponsibleName || (isEntregaStop ? 'Definir Vendedor' : 'Definir Responsável')}
                </span>
              </div>
              <span className="text-[9px] font-bold text-slate-400 leading-none mt-0.5 truncate max-w-full">
                {isEntregaStop ? 'Vendedor' : 'Responsável'}
              </span>
            </button>
          </div>

          {/* TEXTAREA DIRETO DE OBSERVAÇÕES PARA O MOTORISTA */}
          <div className="pt-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px] font-black text-slate-700">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#0B5187]" />
                <span>Observações para o Motorista ({activeData.key === 'coleta' ? 'Coleta' : activeData.key === 'entrega' ? 'Entrega' : 'Troca'})</span>
              </div>
              <span className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                Destaque Motorista
              </span>
            </div>
            <textarea
              rows={2}
              value={activeNotesValue}
              onChange={(e) => handleActiveNotesChange(e.target.value)}
              placeholder={
                activeData.key === 'coleta'
                  ? "Instruções na coleta (ex: retirar no balcão 2, procurar por Maria, portão verde)..."
                  : activeData.key === 'entrega'
                  ? "Instruções na entrega (ex: interfonar 203, deixar na portaria, falar com Carlos)..."
                  : "Instruções de troca no local..."
              }
              className="w-full px-2.5 py-1.5 bg-amber-50/30 hover:bg-white focus:bg-white border-2 border-amber-200/90 focus:border-[#0B5187] rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0B5187] shadow-2xs resize-none transition-all"
            />
          </div>

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
          DIALOG 2: RESPONSÁVEL / VENDEDOR NO LOCAL
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
                  <h3 className="text-sm font-black">
                    {responsibleDialogTab === 'entrega' 
                      ? 'Vendedor / Responsável pela Entrega' 
                      : responsibleDialogTab === 'coleta'
                      ? 'Responsável pela Coleta'
                      : 'Responsável no Local'}
                  </h3>
                  <p className="text-[10px] text-white/70">
                    {responsibleDialogTab === 'entrega'
                      ? 'Vendedor ou contato para entrega do produto'
                      : 'Quem irá atender ou liberar o pacote'}
                  </p>
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
                { id: 'coleta', label: 'Coleta (Responsável)', color: '#0B5187', contact: pickupContact },
                { id: 'entrega', label: 'Entrega (Vendedor)', color: '#FF5E00', contact: deliveryContact },
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
                    <span className="truncate">{tab.label}</span>
                    {tab.contact && (
                      <Check className="w-3 h-3 text-emerald-600 shrink-0 stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Formulário do Responsável / Vendedor */}
            <div className="p-4 flex flex-col gap-3">
              {/* Nome */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-700">
                    {responsibleDialogTab === 'entrega' ? 'Nome do Vendedor / Responsável:' : 'Nome do Responsável:'}
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
                    placeholder={responsibleDialogTab === 'entrega' ? "Nome do vendedor ou destinatário..." : "Nome de quem vai liberar ou receber..."}
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
          DIALOG 3: DEFINIR MOTORISTA (PARA ESTE PONTO)
          ======================================================== */}
      {isDriverModalOpen && (
        <div 
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsDriverModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="px-4 py-3 bg-[#0B5187] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Definir Motorista</h3>
                  <p className="text-[10px] text-white/70">
                    Etapa: {isColetaStop ? 'Coleta' : isEntregaStop ? 'Entrega' : 'Troca'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDriverModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo: Lista de Motoristas */}
            <div className="p-3 overflow-y-auto max-h-[60vh] flex flex-col gap-2">
              {/* Opção Público / Aberto */}
              <button
                type="button"
                onClick={() => {
                  if (onUpdateRoutePointConfig) {
                    onUpdateRoutePointConfig(activePointKey, { driverId: '', visibility: 'publico' });
                  }
                  setIsDriverModalOpen(false);
                }}
                className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                  !activePointConfig?.driverId 
                    ? 'border-emerald-500 bg-emerald-50/70 shadow-xs' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold shadow-xs">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900">Aberto / Público</span>
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                        Todos
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">Qualquer motorista disponível da cidade poderá aceitar</p>
                  </div>
                </div>
                {!activePointConfig?.driverId && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
              </button>

              <div className="px-1 pt-2 pb-1 text-[10px] font-black uppercase text-slate-400">
                Ou selecione um motorista específico:
              </div>

              {drivers && drivers.length > 0 ? (
                drivers.map((driver) => {
                  const isAssigned = activePointConfig?.driverId === driver.id;
                  const permanentColor = getDriverPermanentColor(driver.id || driver.name);
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => {
                        if (onUpdateRoutePointConfig) {
                          onUpdateRoutePointConfig(activePointKey, { driverId: driver.id, visibility: 'privado' });
                        }
                        setIsDriverModalOpen(false);
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        isAssigned 
                          ? 'border-[#0B5187] bg-blue-50/70 shadow-xs' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-9 h-9 rounded-xl text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0"
                          style={{ backgroundColor: permanentColor }}
                        >
                          <Bike className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-slate-900 truncate">{driver.name}</span>
                            {driver.vehicleType && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700">
                                {driver.vehicleType}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-medium">
                            {driver.phone && <span>{driver.phone}</span>}
                            {driver.currentCity && <span>• {driver.currentCity}</span>}
                          </div>
                        </div>
                      </div>
                      {isAssigned && (
                        <CheckCircle2 className="w-5 h-5 text-[#0B5187] shrink-0" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-medium">
                  Nenhum motorista cadastrado no sistema.
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDriverModalOpen(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          DIALOG 4: SELECIONAR CLIENTE
          ======================================================== */}
      {isCustomerModalOpen && (
        <div 
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsCustomerModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="px-4 py-3 bg-[#0B5187] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Selecionar Cliente</h3>
                  <p className="text-[10px] text-white/70">
                    Vincule o cliente para preencher endereço e calcular a rota
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Campo de Busca */}
            <div className="p-3 bg-slate-50 border-b border-slate-200">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  autoFocus
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  placeholder="Buscar por nome, telefone, endereço, documento..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-[#0B5187]"
                />
                {customerSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setCustomerSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Conteúdo: Lista de Clientes */}
            <div className="p-3 overflow-y-auto max-h-[55vh] flex flex-col gap-2">
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    if (onSelectCustomer) {
                      onSelectCustomer(null as any);
                    }
                    setIsCustomerModalOpen(false);
                  }}
                  className="w-full p-2.5 rounded-xl border border-dashed border-rose-300 bg-rose-50/60 hover:bg-rose-100/60 text-left transition-all flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <X className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-black text-rose-700">Desvincular cliente atual ({selectedCustomer.fullName})</span>
                  </div>
                  <span className="text-[10px] font-bold text-rose-600">Limpar</span>
                </button>
              )}

              {filteredModalCustomers && filteredModalCustomers.length > 0 ? (
                filteredModalCustomers.map((cust) => {
                  const isCurrent = selectedCustomer?.id === cust.id;
                  return (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => {
                        if (onSelectCustomer) {
                          onSelectCustomer(cust);
                        }
                        setIsCustomerModalOpen(false);
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        isCurrent 
                          ? 'border-[#0B5187] bg-blue-50/70 shadow-xs' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#0B5187] flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-slate-900 truncate">{cust.fullName}</span>
                            {cust.cpf && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                                {cust.cpf}
                              </span>
                            )}
                          </div>
                          {cust.phone && (
                            <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{cust.phone}</span>
                            </p>
                          )}
                          {cust.address && (
                            <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mt-0.5 line-clamp-1">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{cust.address}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      {isCurrent && (
                        <CheckCircle2 className="w-5 h-5 text-[#0B5187] shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  {customerSearchTerm ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado.'}
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
