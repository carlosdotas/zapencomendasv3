import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { 
  Place, 
  LocationCoordinates, 
  MapLayerType, 
  MapColorTheme, 
  UserProfile, 
  SearchHistoryItem, 
  RouteInfo, 
  Driver,
  VehicleFilterType,
  OperationFilterType,
  OperationsFilterState,
  OperationType,
  UserRequiredFieldsConfig,
  DEFAULT_USER_REQUIRED_FIELDS,
  CompletedWaypointMark,
  DefaultNavigationApp,
  DateRangeFilter
} from '../types/map';
import { driverTrackingClient, isDriverStale, formatDriverLastSeen } from '../services/driverTrackingClient';
import { Customer } from '../types/customer';
import { customerOrderStatsService } from '../services/customerOrderStatsService';
import { 
  getSavedLocation, 
  saveLocationToStorage,
  getSavedOperationsFilter,
  saveOperationsFilterToStorage,
  getSavedVehicleFilter,
  saveVehicleFilterToStorage
} from '../utils/storage';
import { fetchRoute, fetchMultiStopRoute } from '../services/routingService';
import { getOrderLocationsForOperation } from '../utils/customerLocationUtils';
import { getDistanceMeters } from '../utils/geoUtils';
import { recordPlaceUsage } from '../utils/mostUsedPlaces';
import { resolveCustomerCity } from '../utils/addressUtils';
import { normalizeCustomerId } from '../utils/customerIdentity';

import { AuthAccount, UserRole } from '../types/auth';
import { api, getApiBaseUrl, setApiBaseUrl } from '../services/api';
import { 
  backendLocalToPlace, 
  backendPedidoToPlace, 
  backendPedidoToPlaces,
  backendOrderMarkerToPlace,
  backendUserToCustomer, 
  backendMotoristaToDriver,
  formatPhotoUrl,
  extractPhotoUrls,
  getOrderDateBadgeFromDate
} from '../services/apiAdapters';
import { filterPlacesBySequence } from '../utils/orderSequence';
import { BackendPedido, BaixaProximity } from '../services/apiTypes';
import { realtimeAssignmentService } from '../services/realtimeAssignmentService';
import { backgroundGeolocationService, BackgroundTrackingStatus } from '../services/backgroundGeolocationService';

export interface CustomerLocationModalData {
  placeId?: string;
  place?: Place;
  customerName: string;
  customerPhone?: string;
  customerId?: string;
  autoFocusSearch?: boolean;
  onLocationSelected?: (address: string, coordinates: LocationCoordinates, city?: string) => void;
}

interface MapContextType {
  mapInstance: LeafletMap | null;
  setMapInstance: (map: LeafletMap | null) => void;
  currentCoords: LocationCoordinates;
  selectedPlace: Place | null;
  setSelectedPlace: (place: Place | null) => void;
  mapLayer: MapLayerType;
  setMapLayer: (layer: MapLayerType) => void;
  mapTheme: MapColorTheme;
  setMapTheme: (theme: MapColorTheme) => void;
  showTraffic: boolean;
  setShowTraffic: (show: boolean) => void;
  
  // UI states
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  isRegisterModalOpen: boolean;
  setIsRegisterModalOpen: (open: boolean) => void;
  isAdminSettingsOpen: boolean;
  setIsAdminSettingsOpen: (open: boolean) => void;
  isAdminUsersOpen: boolean;
  setIsAdminUsersOpen: (open: boolean) => void;
  isCustomerListOpen: boolean;
  setIsCustomerListOpen: (open: boolean) => void;
  openCustomerList: () => void;
  closeCustomerList: () => void;
  isOrdersModalOpen: boolean;
  routeSelectMode: boolean;
  routeSelectedIds: string[];
  startRouteSelection: () => void;
  cancelRouteSelection: () => void;
  toggleRouteSelection: (ids: string[]) => void;
  isRoutePickerOpen: boolean;
  setIsRoutePickerOpen: (open: boolean) => void;
  setIsOrdersModalOpen: (open: boolean) => void;
  openOrdersModal: () => void;
  closeOrdersModal: () => void;
  dateRangeFilter: DateRangeFilter;
  setDateRangeFilter: (filter: DateRangeFilter) => void;
  clearDateRangeFilter: () => void;
  isCalendarModalOpen: boolean;
  setIsCalendarModalOpen: (open: boolean) => void;
  openCalendarModal: () => void;
  closeCalendarModal: () => void;
  isNewOrderModalOpen: boolean;
  setIsNewOrderModalOpen: (open: boolean) => void;
  newOrderInitialPlace: Partial<Place> | null;
  openNewOrderForm: (initialPlace?: Partial<Place>) => void;
  addNewOrder: (newPlace: Place) => void;
  viewingPhotoUrl: string | null;
  setViewingPhotoUrl: (url: string | null) => void;
  viewingPhotoPlace: Place | null;
  setViewingPhotoPlace: (place: Place | null) => void;
  openPhotoViewer: (photoUrl: string, place?: Place | null) => void;
  closePhotoViewer: () => void;
  isDriverOnline: boolean;
  setIsDriverOnline: (online: boolean) => void;
  driverActiveSeconds: number;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  isAuthenticated: boolean;
  loginWithAccount: (account: AuthAccount) => void;
  logout: () => void;
  
  // Search & Navigation
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchHistory: SearchHistoryItem[];
  addToHistory: (item: { query: string; placeName?: string; coordinates?: LocationCoordinates }) => void;
  clearHistory: () => void;
  
  // Routes & Street Highlighting & GPS Navigation
  activeRoute: RouteInfo | null;
  setActiveRoute: (route: RouteInfo | null) => void;
  calculateRouteToPlace: (dest: Place) => Promise<void>;
  calculateOrderRoute: (place: Place, customerParam?: Customer | null) => Promise<RouteInfo | null>;
  clearActiveRoute: () => void;
  defaultNavApp: DefaultNavigationApp;
  setDefaultNavApp: (app: DefaultNavigationApp) => void;

  // User & Saved
  user: UserProfile;
  updateUser: (updated: Partial<UserProfile>) => void;
  userRequiredFields: UserRequiredFieldsConfig;
  updateUserRequiredFields: (config: Partial<UserRequiredFieldsConfig>) => void;
  savedPlaces: Place[];
  allPlaces: Place[];
  /** Pedidos já entregues/finalizados — usados na tela de pedidos (Central de Pedidos) */
  completedOrders: Place[];
  completedWaypointMarks: CompletedWaypointMark[];
  revertCompletedMark: (markId: string) => Promise<boolean>;
  completePlaceWaypoint: (placeId: string, receiverName?: string, notes?: string, proximity?: BaixaProximity) => void;
  resetWorkflowToColetas: () => void;
  updatePlaceDetails: (placeId: string, partial: Partial<Place>) => void;
  assignPlaceToDriver: (placeId: string, driverId: string | null, driverPhone?: string, driverName?: string) => void;
  claimPublicOrder: (placeId: string) => Promise<boolean>;
  toggleSavePlace: (place: Place) => void;
  isPlaceSaved: (placeId: string) => boolean;
  deletePlace: (placeId: string) => Promise<boolean>;

  // Customers & Contact Book
  customers: Customer[];
  addCustomer: (customerData: Omit<Customer, 'id' | 'createdAt'>, options?: { persist?: boolean }) => Customer;
  persistCustomer: (customer: Customer) => Promise<boolean>;
  updateCustomer: (id: string, partial: Partial<Customer>) => Promise<boolean>;
  deleteCustomer: (id: string) => Promise<boolean>;
  customerLocationModalData: CustomerLocationModalData | null;
  openCustomerLocationModal: (data: CustomerLocationModalData) => void;
  closeCustomerLocationModal: () => void;

  // Drivers & Delivery Fleet
  drivers: Driver[];
  selectedDriver: Driver | null;
  setSelectedDriver: (driver: Driver | null) => void;
  vehicleFilter: VehicleFilterType;
  setVehicleFilter: (filter: VehicleFilterType) => void;

  // Filters
  operationsFilter: OperationsFilterState;
  toggleOperationFilter: (op: OperationType) => void;
  setAllOperationsFilter: (enabled: boolean) => void;
  operationFilter: OperationFilterType;
  setOperationFilter: (filter: OperationFilterType) => void;

  // Actions
  flyToLocation: (coords: LocationCoordinates, zoom?: number) => void;
  locateUser: () => void;
  viewAllMarkers: () => void;
  isLocating: boolean;
  userLocation: LocationCoordinates | null;
  isTrackingUser: boolean;
  toggleUserTracking: () => void;
  stopUserTracking: () => void;
  dismissPlaceProximity: (placeId: string) => void;
  hasRealGpsFix: boolean;
  gpsAccuracy: number | null;
  gpsError: {
    type: 'permission_denied' | 'insecure_context' | 'iframe_blocked' | 'timeout' | 'unavailable';
    message: string;
    canOpenStandalone?: boolean;
  } | null;
  clearGpsError: () => void;
  retryGps: () => void;

  // Integração com Servidor Express
  serverStatus: 'connected' | 'offline' | 'checking';
  serverMessage: string;
  serverLatencyMs: number | null;
  apiBaseUrl: string;
  updateApiBaseUrl: (url: string) => void;
  refreshServerData: (opts?: { silent?: boolean }) => Promise<void>;
  isSyncingServer: boolean;

  // Monitoramento em Segundo Plano (PWA com tela desligada)
  backgroundTrackingStatus: BackgroundTrackingStatus;
  startBackgroundGps: () => void;
  stopBackgroundGps: () => void;
}

const DEFAULT_COORDS: LocationCoordinates = {
  lat: -16.686891,
  lng: -49.264794 // Goiânia - GO (Região Metropolitana)
};

const DEFAULT_USER: UserProfile = {
  id: 'usr-1',
  name: 'EncomendasZap Operações',
  email: 'encomendaszap@gmail.com',
  avatarUrl: '/logo.svg',
  phone: '(62) 98765-4321',
  role: 'Gestor Logístico & Entregas',
  document: '42.123.456/0001-89',
  company: 'EncomendasZap Logística Express',
  city: 'Goiânia - GO',
  rating: 4.9,
  totalDeliveries: 154,
  savedPlacesCount: 3,
  contributionsCount: 28
};

// Pedidos criados no app nascem com id temporário (pedido-<timestamp>) até o servidor devolver o id real.
const tempPedidoIdMap = new Map<string, string>();
const resolvePlaceId = (id: string): string => {
  let current = id;
  for (let i = 0; i < 5 && tempPedidoIdMap.has(current); i++) current = tempPedidoIdMap.get(current)!;
  return current;
};
// Id numérico que não cabe no banco (timestamp) = pedido ainda sem id real do servidor
const isTempPedidoNumber = (num?: string | null): boolean => !num || Number(num) > 2147483647;

const MapContext = createContext<MapContextType | null>(null);

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [currentCoords, setCurrentCoords] = useState<LocationCoordinates>(() => getSavedLocation().coords);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [mapLayer, setMapLayerState] = useState<MapLayerType>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_map_layer');
      if (saved && ['default', 'osm', 'terrain', 'dark', 'satellite'].includes(saved)) {
        return saved as MapLayerType;
      }
    } catch (e) {
      // Ignore
    }
    return 'default';
  });

  const setMapLayer = useCallback((layer: MapLayerType) => {
    setMapLayerState(layer);
    try {
      localStorage.setItem('encomendaszap_map_layer', layer);
    } catch (e) {
      // Ignore
    }
  }, []);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  
  // Filtros de mapa (todas as operações e veículos sempre ativos por padrão)
  const [operationsFilter, setOperationsFilterState] = useState<OperationsFilterState>({
    coleta: true,
    entrega: true,
    troca: true
  });
  const [vehicleFilter, setVehicleFilterState] = useState<VehicleFilterType>('todos');
  const [operationFilter, setOperationFilter] = useState<OperationFilterType>('todas');

  const toggleOperationFilter = useCallback((op: OperationType) => {
    setOperationsFilterState(prev => {
      const next = { ...prev, [op]: !prev[op] };
      saveOperationsFilterToStorage(next);
      return next;
    });
  }, []);

  const setAllOperationsFilter = useCallback((enabled: boolean) => {
    const next = { coleta: enabled, entrega: enabled, troca: enabled };
    setOperationsFilterState(next);
    saveOperationsFilterToStorage(next);
  }, []);

  const setVehicleFilter = useCallback((filter: VehicleFilterType) => {
    setVehicleFilterState(filter);
    saveVehicleFilterToStorage(filter);
  }, []);


  // Mantém o motorista selecionado sincronizado com a telemetria em tempo real
  useEffect(() => {
    if (selectedDriver) {
      const liveDriver = drivers.find(d => d.id === selectedDriver.id);
      if (liveDriver && (
        liveDriver.coordinates.lat !== selectedDriver.coordinates.lat ||
        liveDriver.speedKmH !== selectedDriver.speedKmH ||
        liveDriver.heading !== selectedDriver.heading ||
        liveDriver.lastSeenTimestamp !== selectedDriver.lastSeenTimestamp
      )) {
        setSelectedDriver(liveDriver);
      }
    }
  }, [drivers, selectedDriver]);
  const [mapTheme, setMapThemeState] = useState<MapColorTheme>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_map_theme');
      if (saved && ['blue-corporate', 'blue-vibrant', 'blue-dark', 'blue-clean', 'natural'].includes(saved)) {
        return saved as MapColorTheme;
      }
    } catch (e) {
      // Ignore
    }
    return 'natural';
  });

  const setMapTheme = useCallback((theme: MapColorTheme) => {
    setMapThemeState(theme);
    try {
      localStorage.setItem('encomendaszap_map_theme', theme);
    } catch (e) {
      // Ignore
    }
  }, []);

  const [showTraffic, setShowTraffic] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  // O sistema exige login ao ser aberto; se ainda não houver sessão ativa, solicita o login imediatamente
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('encomendaszap_is_authenticated') !== 'true'
        || !localStorage.getItem('encomendaszap_logged_account');
    } catch {
      return true;
    }
  });
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState<boolean>(false);
  const [isAdminUsersOpen, setIsAdminUsersOpen] = useState<boolean>(false);
  const [isCustomerListOpen, setIsCustomerListOpen] = useState<boolean>(false);
  const openCustomerList = useCallback(() => setIsCustomerListOpen(true), []);
  const closeCustomerList = useCallback(() => setIsCustomerListOpen(false), []);

  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState<boolean>(false);

  // Passar rota: admin/atendente seleciona vários locais e depois escolhe o motorista
  const [routeSelectMode, setRouteSelectMode] = useState<boolean>(false);
  const [routeSelectedIds, setRouteSelectedIds] = useState<string[]>([]);
  const [isRoutePickerOpen, setIsRoutePickerOpen] = useState<boolean>(false);
  const startRouteSelection = useCallback(() => {
    setRouteSelectedIds([]);
    setRouteSelectMode(true);
  }, []);
  const cancelRouteSelection = useCallback(() => {
    setRouteSelectMode(false);
    setRouteSelectedIds([]);
    setIsRoutePickerOpen(false);
  }, []);
  const toggleRouteSelection = useCallback((ids: string[]) => {
    setRouteSelectedIds(prev => {
      const allSelected = ids.every(id => prev.includes(id));
      return allSelected ? prev.filter(id => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
    });
  }, []);
  const openOrdersModal = useCallback(() => setIsOrdersModalOpen(true), []);
  const closeOrdersModal = useCallback(() => setIsOrdersModalOpen(false), []);

  const [dateRangeFilter, setDateRangeFilterState] = useState<DateRangeFilter>({
    startDate: null,
    endDate: null,
    preset: null
  });
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState<boolean>(false);
  const openCalendarModal = useCallback(() => setIsCalendarModalOpen(true), []);
  const closeCalendarModal = useCallback(() => setIsCalendarModalOpen(false), []);

  const setDateRangeFilter = useCallback((filter: DateRangeFilter) => {
    setDateRangeFilterState(filter);
  }, []);

  const clearDateRangeFilter = useCallback(() => {
    setDateRangeFilterState({
      startDate: null,
      endDate: null,
      preset: null
    });
  }, []);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState<boolean>(false);
  const [newOrderInitialPlace, setNewOrderInitialPlace] = useState<Partial<Place> | null>(null);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [viewingPhotoPlace, setViewingPhotoPlace] = useState<Place | null>(null);

  const openPhotoViewer = useCallback((photoUrl: string, place?: Place | null) => {
    setViewingPhotoUrl(photoUrl);
    setViewingPhotoPlace(place || null);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setViewingPhotoUrl(null);
    setViewingPhotoPlace(null);
  }, []);

  const openNewOrderForm = useCallback((initialPlace?: Partial<Place>) => {
    const savedRole = localStorage.getItem('encomendaszap_user_role');
    if (savedRole === 'motorista' || user?.userRole === 'motorista') {
      console.warn('[openNewOrderForm] Motoristas não possuem permissão para adicionar pedidos.');
      return;
    }
    setNewOrderInitialPlace(initialPlace || null);
    if (initialPlace && initialPlace.id && initialPlace.name && initialPlace.coordinates) {
      setSelectedPlace(initialPlace as Place);
    } else {
      const draftPlace: Place = {
        id: initialPlace?.id || `pedido-${Date.now()}`,
        name: initialPlace?.name || 'Novo Local de Encomenda',
        address: initialPlace?.address || 'Endereço a definir',
        coordinates: initialPlace?.coordinates || currentCoords || { lat: -16.6869, lng: -49.2648 },
        operationType: initialPlace?.operationType || 'coleta',
        vehicleType: initialPlace?.vehicleType || 'moto',
        packageType: initialPlace?.packageType || 'caixa',
        orderDateBadge: initialPlace?.orderDateBadge || 'hoje',
        customerName: initialPlace?.customerName || '',
        customerPhone: initialPlace?.customerPhone || '',
        responsibleName: initialPlace?.responsibleName || '',
        responsiblePhone: initialPlace?.responsiblePhone || '',
        observations: initialPlace?.observations || '',
        ...initialPlace
      };
      setSelectedPlace(draftPlace);
    }
  }, [currentCoords]);
  
  // Status do Motorista (Chavinha estilo Uber: Online / Offline para rodar)
  const [isDriverOnline, setIsDriverOnlineState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('encomendaszap_driver_online') === 'true';
    } catch (e) {
      return false;
    }
  });

  const ONLINE_SINCE_KEY = 'encomendaszap_driver_online_since';
  const readOnlineSince = (): number => {
    try {
      const v = Number(localStorage.getItem(ONLINE_SINCE_KEY));
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  };

  const [driverActiveSeconds, setDriverActiveSeconds] = useState<number>(() => {
    const since = readOnlineSince();
    return since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
  });

  const setIsDriverOnline = useCallback((online: boolean) => {
    setIsDriverOnlineState(online);
    try {
      localStorage.setItem('encomendaszap_driver_online', online ? 'true' : 'false');
      if (online) {
        // Mantém o início original se já estava online (ex.: recarregou a página)
        if (!readOnlineSince()) localStorage.setItem(ONLINE_SINCE_KEY, String(Date.now()));
      } else {
        localStorage.removeItem(ONLINE_SINCE_KEY);
      }
    } catch (e) {
      // ignore
    }
    if (online) {
      const since = readOnlineSince();
      setDriverActiveSeconds(since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0);
    } else {
      setDriverActiveSeconds(0);
    }
  }, []);

  // Tempo online = agora - momento em que o motorista virou a chave (sobrevive a recarregar a página)
  useEffect(() => {
    if (!isDriverOnline) return;
    if (!readOnlineSince()) {
      try { localStorage.setItem(ONLINE_SINCE_KEY, String(Date.now())); } catch (e) { /* ignore */ }
    }
    const tick = () => {
      const since = readOnlineSince() || Date.now();
      setDriverActiveSeconds(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isDriverOnline]);
  
  // Perfil e tipo de usuário autenticado
  const [currentRole, setCurrentRoleState] = useState<UserRole>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_user_role') as UserRole;
      if (saved && ['admin_geral', 'atendente', 'terminal', 'motorista'].includes(saved)) {
        return saved;
      }
    } catch (e) {
      // ignore
    }
    return 'atendente'; // Padrão com o mapa completo
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const [completedWaypointMarks, setCompletedWaypointMarks] = useState<CompletedWaypointMark[]>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_completed_marks');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // ignore
    }
    return [];
  });

  const [allPlaces, setAllPlaces] = useState<Place[]>(() => {
    try {
      localStorage.removeItem('encomendaszap_coletas_v2');
      const saved = localStorage.getItem('encomendaszap_all_places');
      if (saved) {
        const parsed: Place[] = JSON.parse(saved);
        // Remove quaisquer markers de teste ou mock legados (plc-*) e concluídos
        // e normaliza as fotos para as URLs com sufixo correto
        const onlyReal = parsed
          .filter(p => !p.id.startsWith('plc-') && p.orderStage !== 'concluido')
          .filter(p => {
            // Pedido criado localmente e nunca confirmado pelo servidor: descarta o resto de cache
            const stamp = Number(p.id.replace('pedido-', '').split('-')[0]);
            return !(p.id.startsWith('pedido-') && stamp > 1000000000 && Date.now() - stamp > 2 * 60 * 1000);
          })
          .map(p => {
            const formattedImg = p.imageUrl ? (formatPhotoUrl(p.imageUrl, 'md') || p.imageUrl) : undefined;
            const formattedPhotos = p.photos ? extractPhotoUrls(p.photos, 'md') : (formattedImg ? [formattedImg] : undefined);
            return {
              ...p,
              imageUrl: formattedImg,
              photos: formattedPhotos && formattedPhotos.length > 0 ? formattedPhotos : undefined
            };
          });
        if (onlyReal.length > 0) return onlyReal;
      }
    } catch (e) {
      // ignore
    }

    return [];
  });

  // Pedidos finalizados/entregues: não aparecem no mapa, mas exibidos na Central de Pedidos
  const [completedOrders, setCompletedOrders] = useState<Place[]>([]);

  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    try {
      localStorage.removeItem('encomendaszap_customers');
    } catch {}
  }, []);

  // Estados de Conexão com o Servidor Express
  const [serverStatus, setServerStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
  const [serverMessage, setServerMessage] = useState<string>('Verificando conexão...');
  const [serverLatencyMs, setServerLatencyMs] = useState<number | null>(null);
  const [apiBaseUrlState, setApiBaseUrlState] = useState<string>(() => getApiBaseUrl());
  const [isSyncingServer, setIsSyncingServer] = useState<boolean>(false);

  // Atualiza a URL do servidor e reconecta
  const updateApiBaseUrl = useCallback((url: string) => {
    setApiBaseUrl(url);
    setApiBaseUrlState(url);
  }, []);

  // Busca todos os dados reais do servidor Express (locais, pedidos, clientes, motoristas)
  const refreshServerData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setIsSyncingServer(true);
      setServerStatus('checking');
    }

    try {
      const conn = await api.checkConnection().catch(() => ({ ok: false, message: 'Servidor Express desconectado', latencyMs: undefined }));
      if (!conn.ok) {
        setServerStatus('offline');
        setServerMessage(conn.message);
      } else {
        setServerStatus('connected');
        setServerMessage(conn.message);
        setServerLatencyMs(conn.latencyMs || null);
      }

      // 1. Busca Markers do endpoint (/tracking/order_markers) para Hoje e Dias Anteriores
      // Regra de negócio explícita:
      // - Hoje e Dias Anteriores: mostra marcadores que não estiverem finalizados (coletas, trocas e entregas)
      // - Finalizados/Entregues: NUNCA aparecem como marcadores ativos no mapa
      const now = new Date();
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const hasDateFilter = Boolean(dateRangeFilter.startDate || dateRangeFilter.endDate);
      const listParams = hasDateFilter 
        ? { 
            data_ini: dateRangeFilter.startDate || undefined, 
            data_fim: dateRangeFilter.endDate || undefined,
            limit: 2000 
          }
        : { limit: 2000 };

      const [markersData, pedidosRes, locaisRes] = await Promise.all([
        api.getActiveOrderMarkersTodayAndYesterday().catch(() => ({ todayMarkers: [], yesterdayPendingMarkers: [], allActiveMarkers: [] })),
        api.listPedidos(listParams).catch(() => ({ success: false, data: [] })),
        api.getLocais({ limit: 100 }).catch(() => ({ success: false, data: [] }))
      ]);

      // Mapeia detalhes completos dos pedidos caso estejam disponíveis no banco
      const pedidosMap = new Map<string, any>();
      if (pedidosRes && pedidosRes.success && Array.isArray(pedidosRes.data)) {
        pedidosRes.data.forEach((p: any) => pedidosMap.set(String(p.id), p));
      }

      // Busca os detalhes completos dos pedidos ativos do banco (/pedidos/get)
      // Isso garante a leitura de coleta_user_id, coleta_user_nome, coleta_motoristas, etc.
      const activePedidoIds = Array.from(new Set([
        ...markersData.todayMarkers.map(m => m.pedido_id),
        ...markersData.yesterdayPendingMarkers.map(m => m.pedido_id)
      ].filter(Boolean)));

      if (activePedidoIds.length > 0) {
        const fullOrders = await Promise.all(
          activePedidoIds.map(id => api.getPedido(id).then(r => r.data).catch(() => null))
        );
        fullOrders.forEach(p => {
          if (p && p.id) {
            pedidosMap.set(String(p.id), p);
          }
        });
      }

      // Converte markers de Hoje
      const todayPlaces: Place[] = markersData.todayMarkers
        .map(m => backendOrderMarkerToPlace(m, 'hoje', pedidosMap.get(String(m.pedido_id))))
        .filter(p => p.orderStage !== 'concluido' && (p.operationType as any) !== 'concluido');

      // Converte markers de Dias Anteriores (ontem, 2 dias atrás, 3 dias atrás, etc.) que NÃO estejam finalizados
      const previousDaysPlaces: Place[] = markersData.yesterdayPendingMarkers
        .map(m => {
          const pOrder = pedidosMap.get(String(m.pedido_id));
          const dateBadge = getOrderDateBadgeFromDate(pOrder?.data || pOrder?.created_at || (m as any).data || (m as any).date);
          return backendOrderMarkerToPlace(m, dateBadge, pOrder);
        })
        .filter(p => p.orderStage !== 'concluido' && (p.operationType as any) !== 'concluido');

      const activeOrderPlaces = [...todayPlaces, ...previousDaysPlaces];

      // Mapeia IDs de pedidos já cobertos pelas markers
      const coveredOrderIds = new Set<string>();
      activeOrderPlaces.forEach(p => {
        const idMatch = p.id.match(/^pedido-(\d+)/);
        if (idMatch) coveredOrderIds.add(idMatch[1]);
        if (p.orderCode) {
          const codeMatch = p.orderCode.match(/^EZ-(\d+)/);
          if (codeMatch) coveredOrderIds.add(codeMatch[1]);
        }
      });

      // Inclui quaisquer pedidos de list_pedidos que estejam ativos (aprovado/coletando/coletado)
      // e que ainda não estejam presentes nas markers de hoje/ontem (cobre todas as makers de hoje e dias anteriores)
      const additionalActivePlaces: Place[] = [];
      if (pedidosRes && pedidosRes.success && Array.isArray(pedidosRes.data)) {
        const activePedidosList = pedidosRes.data.filter((p: any) => {
          const et = (p.etapa || '').toLowerCase().trim();
          return et !== 'entregue' && et !== 'finalizado' && et !== 'concluido' && et !== 'cancelado';
        });

        const processedOrderIds = new Set<string>();

        activePedidosList.forEach((p: any) => {
          const strId = String(p.id);
          if (coveredOrderIds.has(strId) || processedOrderIds.has(strId)) return;

          const numId = Number(p.id);
          let mergedOrder = { ...p };

          if (!isNaN(numId)) {
            const twin = activePedidosList.find((other: any) => {
              const oId = String(other.id);
              if (oId === strId) return false;
              const oNum = Number(other.id);
              return Math.abs(oNum - numId) === 1 && (other.cliente === p.cliente || other.coleta_endereco === p.coleta_endereco);
            });

            if (twin) {
              processedOrderIds.add(String(twin.id));
              mergedOrder = {
                ...twin,
                ...mergedOrder,
                coleta_lat: mergedOrder.coleta_lat || twin.coleta_lat,
                coleta_lng: mergedOrder.coleta_lng || twin.coleta_lng,
                entrega_lat: mergedOrder.entrega_lat || twin.entrega_lat,
                entrega_lng: mergedOrder.entrega_lng || twin.entrega_lng,
                coleta_nome: mergedOrder.coleta_nome || twin.coleta_nome,
                entrega_nome: mergedOrder.entrega_nome || twin.entrega_nome,
                coleta_endereco: mergedOrder.coleta_endereco || twin.coleta_endereco,
                entrega_endereco: mergedOrder.entrega_endereco || twin.entrega_endereco,
              };
            }
          }

          processedOrderIds.add(strId);
          const placesFromPedido = backendPedidoToPlaces(mergedOrder);
          additionalActivePlaces.push(...placesFromPedido);
        });
      }

      // Lê baixas salvas para garantir que encomendas já finalizadas (entrega concluída) não retornem ao mapa
      const completedMarksRaw = localStorage.getItem('encomendaszap_completed_marks');
      const savedMarks: CompletedWaypointMark[] = completedMarksRaw ? JSON.parse(completedMarksRaw) : [];
      const locallyDoneOrderIds = new Set<string>();
      savedMarks.forEach(m => {
        if ((m.operationType === 'entrega' || m.isFinal) && m.status !== 'failed') {
          const match = m.orderId.match(/^pedido-(\d+)/) || (m.orderCode ? m.orderCode.match(/(\d+)/) : null);
          if (match) locallyDoneOrderIds.add(match[1]);
          if (m.orderCode) locallyDoneOrderIds.add(m.orderCode.trim());
          locallyDoneOrderIds.add(m.orderId);
        }
      });

      // Gera marcas com 'X' para coletas de pedidos vindos do backend cuja etapa já foi concluída
      const backendCompletedColetas: CompletedWaypointMark[] = [];
      if (pedidosRes && pedidosRes.success && Array.isArray(pedidosRes.data)) {
        pedidosRes.data.forEach((p: any) => {
          const et = (p.etapa || '').toLowerCase().trim();
          const isColetado = et === 'coletado' || et === 'trocando' || et === 'trocado' || et === 'retornando' || et === 'entregando' || et === 'entregue';
          if (!isColetado) return;

          const cLat = parseFloat(String(p.coleta_lat || p.coleta_locais_lat || ''));
          const cLng = parseFloat(String(p.coleta_lng || p.coleta_locais_lng || ''));
          if (isNaN(cLat) || isNaN(cLng) || cLat === 0 || cLng === 0) return;

          const markId = `backend-coleta-${p.id}`;
          const hasLocal = savedMarks.some(m => (m.orderId === `pedido-${p.id}` || m.orderId === String(p.id)) && m.operationType === 'coleta');
          if (hasLocal) return;

          const rawTime = p.coleta_saida_at || p.coleta_chegada_at || p.data || p.created_at;
          let timeFormatted = '12:00';
          if (rawTime) {
            const timeMatch = String(rawTime).match(/(\d{2}:\d{2})/);
            if (timeMatch) timeFormatted = timeMatch[1];
          }

          const photoRaw = p.coleta_foto || p.foto;
          const photoUrl = photoRaw ? formatPhotoUrl(photoRaw) : undefined;
          const photos = photoUrl ? [photoUrl] : [];

          backendCompletedColetas.push({
            id: markId,
            orderId: `pedido-${p.id}`,
            orderCode: p.order_code || `EZ-${p.id}-GO`,
            operationType: 'coleta',
            completedAt: Date.now(),
            timeStr: timeFormatted,
            completedDate: String(rawTime || todayStr).slice(0, 10),
            placeName: String(p.coleta_nome || p.coleta_local || p.coleta_user_nome || 'Local de Coleta'),
            address: String(p.coleta_endereco || 'Endereço da coleta'),
            customerName: String(p.coleta_user_nome || p.cliente_nome || ''),
            coordinates: { lat: cLat, lng: cLng },
            status: 'success',
            driverName: String(p.coleta_motoristas || p.motorista_nome || 'Motorista'),
            driverId: p.coleta_user_id ? String(p.coleta_user_id) : undefined,
            photos: photos,
            imageUrl: photoUrl || undefined
          });
        });
      }

      if (backendCompletedColetas.length > 0) {
        setCompletedWaypointMarks(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const toAdd = backendCompletedColetas.filter(m => !existingIds.has(m.id));
          if (toAdd.length === 0) return prev;
          return [...prev, ...toAdd];
        });
      }

      const allCombinedActivePlaces = [...activeOrderPlaces, ...additionalActivePlaces].filter(p => {
        if (p.orderStage === 'concluido' || (p.operationType as any) === 'concluido') return false;
        const idMatch = p.id.match(/^pedido-(\d+)/);
        if (idMatch && locallyDoneOrderIds.has(idMatch[1])) return false;
        if (p.orderCode && locallyDoneOrderIds.has(p.orderCode.trim())) return false;
        if (locallyDoneOrderIds.has(p.id)) return false;
        return true;
      }).map(p => {
        // Enriquecimento prioritário com Realtime Assignment (REST + polling)
        const numId = p.id.match(/\d+/)?.[0] || (p.orderCode ? p.orderCode.match(/\d+/)?.[0] : null);
        const rt = realtimeAssignmentService.getAssignmentForOrder(p.id, p.operationType) || 
                   (numId ? realtimeAssignmentService.getAssignmentForOrder(numId, p.operationType) : null);
        if (rt && rt.driverId) {
          return {
            ...p,
            assignedDriverId: rt.driverId,
            assignedDriverName: rt.driverName || p.assignedDriverName,
            assignedDriverPhone: rt.driverPhone || p.assignedDriverPhone,
            driverEnRoute: Boolean(rt.enRoute)
          };
        }
        return p;
      });

      // Atualiza allPlaces: apenas com markers ativas (coletas não coletadas, entregas não entregues e trocas)
      // Encomendas finalizadas/entregues são estritamente excluídas
      setAllPlaces(prev => {
        // Preserva quaisquer encomendas criadas localmente que ainda estejam sendo salvas
        // Preserva só encomendas criadas localmente nos últimos 2 minutos (ainda sendo salvas); as antigas são fantasmas
        const freshLocalWindowMs = 2 * 60 * 1000;
        const locallyCreatedPending = prev.filter(p => {
          if (!p.id.startsWith('pedido-')) return false;
          const stamp = Number(p.id.replace('pedido-', '').split('-')[0]);
          return stamp > 1000000000 && Date.now() - stamp < freshLocalWindowMs;
        });
        const finalPlaces = [...allCombinedActivePlaces];
        locallyCreatedPending.forEach(lp => {
          if (!finalPlaces.some(fp => fp.id === lp.id || (lp.orderCode && fp.orderCode === lp.orderCode))) {
            finalPlaces.unshift(lp);
          }
        });

        const prevKey = prev.map(p => `${p.id}_${p.orderStage}_${p.name}_${p.imageUrl || ''}`).sort().join('|');
        const nextKey = finalPlaces.map(p => `${p.id}_${p.orderStage}_${p.name}_${p.imageUrl || ''}`).sort().join('|');
        if (prevKey === nextKey && prev.length === finalPlaces.length) {
          return prev;
        }
        try {
          localStorage.setItem('encomendaszap_all_places', JSON.stringify(finalPlaces));
        } catch {}
        return finalPlaces;
      });

      // Coleta pedidos concluídos/entregues para exibição na Central de Pedidos (sem aparecer no mapa)
      if (pedidosRes && pedidosRes.success && Array.isArray(pedidosRes.data)) {
        const doneList: Place[] = [];
        pedidosRes.data.forEach((p: any) => {
          const et = (p.etapa || '').toLowerCase().trim();
          if (et !== 'entregue' && et !== 'finalizado' && et !== 'concluido' && et !== 'cancelado') return;
          const place = backendPedidoToPlace(p as BackendPedido);
          // Garante que o orderStage está marcado como concluido
          doneList.push({ ...place, orderStage: 'concluido' });
        });
        setCompletedOrders(doneList);
      }

      // Se há um local atualmente selecionado, sincroniza com os dados frescos do servidor
      setSelectedPlace(curr => {
        if (!curr) return null;
        const refreshed = allCombinedActivePlaces.find(p => p.id === curr.id);
        if (refreshed && (refreshed.imageUrl !== curr.imageUrl || refreshed.photos?.length !== curr.photos?.length)) {
          return {
            ...curr,
            imageUrl: refreshed.imageUrl,
            photos: refreshed.photos,
            orderStage: refreshed.orderStage
          };
        }
        return curr;
      });

      // 3. Busca Clientes / Usuários do backend (POST /pedidos/list_users)
      const usersRes = await api.listUsers({ limit: 50 });
      if (usersRes.success && Array.isArray(usersRes.data)) {
        const serverCustomers = usersRes.data.map(backendUserToCustomer);
        setCustomers(serverCustomers);
      }

      // 4. Busca Motoristas Reais Ativos e em Tempo Real (exclui inativos há mais de 30 minutos)
      if (currentRole !== 'motorista') {
        const liveDrivers = await driverTrackingClient.fetchLiveDrivers();
        const validLiveDrivers = liveDrivers.filter(d => !isDriverStale(d));
        setDrivers(validLiveDrivers);
      } else {
        setDrivers([]);
      }
    } catch (e: any) {
      setServerStatus('offline');
      setServerMessage(e?.message || 'Falha ao buscar dados do servidor.');
    } finally {
      if (!silent) setIsSyncingServer(false);
    }
  }, [dateRangeFilter]);

  // Atualização periódica dos pedidos (só com a aba visível) e imediata ao chegar uma notificação
  useEffect(() => {
    let running = false;
    let queued = false;
    const run = async () => {
      if (document.visibilityState !== 'visible') return;
      if (running) { queued = true; return; }
      running = true;
      try {
        await realtimeAssignmentService.fetchServerAssignments().catch(() => {});
        await refreshServerData({ silent: true });
      } finally {
        running = false;
        if (queued) { queued = false; void run(); }
      }
    };
    const silentRefresh = () => { void run(); };
    const timer = window.setInterval(silentRefresh, 10000);
    window.addEventListener('zap:refresh-orders', silentRefresh);
    document.addEventListener('visibilitychange', silentRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('zap:refresh-orders', silentRefresh);
      document.removeEventListener('visibilitychange', silentRefresh);
    };
  }, [refreshServerData]);

  // Busca inicial única ao montar o app no servidor (SEM releitura ou polling periódico)
  useEffect(() => {
    refreshServerData();
  }, [refreshServerData]);

  // Sincronização em tempo real de atribuições (REST + polling)
  useEffect(() => {
    const unsubscribe = realtimeAssignmentService.subscribe((assignments) => {
      setAllPlaces(prev => {
        let hasChanges = false;
        const next = prev.map(p => {
          const numId = p.id.match(/\d+/)?.[0] || (p.orderCode ? p.orderCode.match(/\d+/)?.[0] : null);
          const assignment = assignments[p.id] || 
                             (p.operationType && numId ? assignments[`${numId}_${p.operationType}`] : null) ||
                             (p.operationType && numId ? assignments[`pedido-${numId}-${p.operationType}`] : null);
          if (assignment && assignment.driverId) {
            if (p.assignedDriverId !== assignment.driverId || p.assignedDriverName !== assignment.driverName || Boolean(p.driverEnRoute) !== Boolean(assignment.enRoute)) {
              hasChanges = true;
              return {
                ...p,
                assignedDriverId: assignment.driverId,
                assignedDriverName: assignment.driverName || p.assignedDriverName,
                assignedDriverPhone: assignment.driverPhone || p.assignedDriverPhone,
                driverEnRoute: Boolean(assignment.enRoute)
              };
            }
          }
          return p;
        });

        if (hasChanges) {
          try {
            localStorage.setItem('encomendaszap_all_places', JSON.stringify(next));
          } catch {}
          return next;
        }
        return prev;
      });

      setSelectedPlace(prev => {
        if (!prev) return null;
        const numId = prev.id.match(/\d+/)?.[0] || (prev.orderCode ? prev.orderCode.match(/\d+/)?.[0] : null);
        const assignment = assignments[prev.id] || 
                           (prev.operationType && numId ? assignments[`${numId}_${prev.operationType}`] : null) ||
                           (prev.operationType && numId ? assignments[`pedido-${numId}-${prev.operationType}`] : null);
        if (assignment && assignment.driverId && (prev.assignedDriverId !== assignment.driverId || prev.assignedDriverName !== assignment.driverName || Boolean(prev.driverEnRoute) !== Boolean(assignment.enRoute))) {
          return {
            ...prev,
            assignedDriverId: assignment.driverId,
            assignedDriverName: assignment.driverName || prev.assignedDriverName,
            assignedDriverPhone: assignment.driverPhone || prev.assignedDriverPhone,
            driverEnRoute: Boolean(assignment.enRoute)
          };
        }
        return prev;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const persistCustomer = useCallback(async (customer: Customer): Promise<boolean> => {
    const normalizedId = customer.id.trim().replace(/^db-user-/, '');
    const serverId = /^\d+$/.test(normalizedId) ? normalizedId : undefined;
    const phone = customer.phone?.trim();
    if (!serverId && !phone) return false;

    try {
      const city = resolveCustomerCity(customer);
      const result = await api.saveUser({
        ...(serverId ? { id: serverId } : {}),
        name: customer.contactName?.trim() || customer.fullName,
        full_name: customer.fullName?.trim() || customer.contactName,
        name_completo: customer.fullName?.trim() || customer.contactName,
        phone,
        cpf: customer.cpf,
        cnpj: customer.cnpj,
        person_type: customer.personType,
        address: customer.address || '',
        endereco: customer.address || '',
        coordinates: customer.coordinates || null,
        additionalAddresses: customer.additionalAddresses || [],
        additional_addresses: customer.additionalAddresses || [],
        ...(city ? { city, cidade: city } : {}),
        access_level: 'cliente'
      });
      if (!result.success) return false;

      const savedId = String(result.id ?? result.data?.id ?? normalizedId);
      setCustomers(prev => {
        const normalizedCustomerId = customer.id.replace(/^db-user-/, '');
        const matchingIds = prev
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.id.replace(/^db-user-/, '') === normalizedCustomerId);
        const phoneDigits = phone?.replace(/\D/g, '') || '';
        const phoneMatches = phoneDigits
          ? prev.map((item, index) => ({ item, index })).filter(({ item }) => item.phone.replace(/\D/g, '') === phoneDigits)
          : [];
        const matchIndex = matchingIds[0]?.index ?? (phoneMatches.length === 1 ? phoneMatches[0].index : -1);
        const savedCustomer = {
          ...(matchIndex >= 0 ? prev[matchIndex] : {}),
          ...customer,
          id: matchIndex >= 0 && !prev[matchIndex].id.replace(/^db-user-/, '').startsWith('cust-')
            ? prev[matchIndex].id.replace(/^db-user-/, '')
            : savedId,
          ...(city ? { city, cidade: city } : {})
        };
        const next = [...prev];
        if (matchIndex >= 0) next[matchIndex] = savedCustomer;
        else next.unshift(savedCustomer);
        return next;
      });
      return true;
    } catch (error) {
      console.warn('[Customers] Falha ao persistir cliente:', error);
      return false;
    }
  }, []);

  const addCustomer = useCallback((customerData: Omit<Customer, 'id' | 'createdAt'>, options?: { persist?: boolean }): Customer => {
    const city = resolveCustomerCity(customerData);
    const newCustomer: Customer = {
      ...customerData,
      ...(city ? { city, cidade: city } : {}),
      id: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now()
    };
    setCustomers(prev => [newCustomer, ...prev]);

    if (options?.persist !== false) {
      void persistCustomer(newCustomer);
    }

    return newCustomer;
  }, [persistCustomer]);

  const updateCustomer = useCallback(async (id: string, partial: Partial<Customer>): Promise<boolean> => {
    const existingCustomer = customers.find(customer => customer.id === id);
    const addressChanged = partial.address !== undefined && partial.address !== existingCustomer?.address;
    const cityChanged = partial.city !== undefined && partial.city !== existingCustomer?.city;
    const legacyCityChanged = partial.cidade !== undefined && partial.cidade !== existingCustomer?.cidade;
    const cityFromAddress = addressChanged ? resolveCustomerCity({ address: partial.address }) : undefined;
    const cityFromFields = cityChanged || legacyCityChanged
      ? resolveCustomerCity({ city: partial.city, cidade: partial.cidade })
      : undefined;
    const city = cityFromAddress || cityFromFields || resolveCustomerCity(existingCustomer || {}) || resolveCustomerCity(partial);
    const normalizedPartial = city ? { ...partial, city, cidade: city } : partial;

    const customerToPersist = {
      ...(existingCustomer || {}),
      ...normalizedPartial,
      id
    } as Customer;
    const saved = await persistCustomer(customerToPersist);
    if (!saved) return false;

    return true;
  }, [customers, persistCustomer]);

  const deleteCustomer = useCallback(async (id: string): Promise<boolean> => {
    const normalizedId = normalizeCustomerId(id);
    if (!/^\d+$/.test(normalizedId)) return false;

    const result = await api.deleteUser(normalizedId);
    if (!result.success) return false;

    setCustomers(prev => {
      return prev.filter(customer => normalizeCustomerId(customer.id) !== normalizedId);
    });
    return true;
  }, []);

  const [customerLocationModalData, setCustomerLocationModalData] = useState<CustomerLocationModalData | null>(null);

  const openCustomerLocationModal = useCallback((data: CustomerLocationModalData) => {
    setCustomerLocationModalData(data);
  }, []);

  const closeCustomerLocationModal = useCallback(() => {
    setCustomerLocationModalData(null);
  }, []);

  const updatePlaceDetails = useCallback((placeId: string, partial: Partial<Place>) => {
    setAllPlaces(prev => {
      const next = prev.map(p => p.id === placeId ? { ...p, ...partial } : p);
      try {
        localStorage.setItem('encomendaszap_all_places', JSON.stringify(next));
      } catch (e) {
        // ignore
      }
      return next;
    });

    setSavedPlaces(prev => {
      const next = prev.map(p => p.id === placeId ? { ...p, ...partial } : p);
      return next;
    });

    setSelectedPlace(prev => {
      if (prev && prev.id === placeId) {
        return { ...prev, ...partial };
      }
      return prev;
    });

    // Sincroniza atualização de pedido no servidor (Motoristas NÃO podem editar pedidos)
    const isDriver = currentRole === 'motorista' || user?.userRole === 'motorista' || localStorage.getItem('encomendaszap_user_role') === 'motorista';
    if (isDriver) {
      return;
    }

    const numId = resolvePlaceId(placeId).match(/pedido-(\d+)/)?.[1] || placeId.match(/\d+/)?.[0];
    if (numId && !isTempPedidoNumber(numId)) {
      api.savePedido({
        id: numId,
        ...(partial.customerName ? { cliente: partial.customerName } : {}),
        ...(partial.customerPhone ? { phone: partial.customerPhone } : {}),
        // orderStage (coleta/troca/entrega/retorno) é só a visão da parada ativa no mapa, não a etapa do banco.
        // Enviá-lo como etapa fazia o backend gravar "pendente" e reabrir pedidos já entregues.
        ...(partial.orderStage === 'concluido' ? { etapa: 'entregue' } : {}),
        ...(partial.operationType && !partial.orderStage ? { tipo_encomenda: partial.operationType } : {}),
        ...(partial.vehicleType ? { tipo_veiculo: partial.vehicleType } : {}),
        ...(partial.driverNotes || partial.observations ? { detalhes: partial.driverNotes || partial.observations } : {}),
        ...(partial.price ? { total: partial.price } : {}),
        ...(partial.name ? { local: partial.name } : {}),
        ...(partial.pickupName ? { coleta_nome: partial.pickupName, coleta_local: partial.pickupName } : {}),
        ...(partial.pickupAddress ? { coleta_endereco: partial.pickupAddress } : {}),
        ...(partial.pickupCoordinates?.lat ? { coleta_lat: partial.pickupCoordinates.lat } : {}),
        ...(partial.pickupCoordinates?.lng ? { coleta_lng: partial.pickupCoordinates.lng } : {}),
        ...(partial.pickupContact ? { coleta_contato: partial.pickupContact } : {}),
        ...(partial.pickupPhone ? { coleta_phone: partial.pickupPhone } : {}),
        ...(partial.pickupNotes ? { coleta_obs: partial.pickupNotes } : {}),
        ...(partial.deliveryName ? { entrega_nome: partial.deliveryName, entrega_local: partial.deliveryName } : {}),
        ...(partial.deliveryAddress ? { entrega_endereco: partial.deliveryAddress } : {}),
        ...(partial.deliveryCoordinates?.lat ? { entrega_lat: partial.deliveryCoordinates.lat } : {}),
        ...(partial.deliveryCoordinates?.lng ? { entrega_lng: partial.deliveryCoordinates.lng } : {}),
        ...(partial.deliveryContact ? { entrega_contato: partial.deliveryContact } : {}),
        ...(partial.deliveryPhone ? { entrega_phone: partial.deliveryPhone } : {}),
        ...(partial.deliveryNotes ? { entrega_obs: partial.deliveryNotes } : {}),
        ...(partial.exchangeName ? { troca_nome: partial.exchangeName } : {}),
        ...(partial.exchangeAddress ? { troca_endereco: partial.exchangeAddress } : {}),
        ...(partial.exchangeCoordinates?.lat ? { troca_lat: partial.exchangeCoordinates.lat } : {}),
        ...(partial.exchangeCoordinates?.lng ? { troca_lng: partial.exchangeCoordinates.lng } : {}),
        ...(partial.exchangeNotes ? { troca_obs: partial.exchangeNotes } : {})
      }).catch(() => {});
    }
  }, []);

  const assignPlaceToDriver = useCallback((placeId: string, driverId: string | null, driverPhone?: string, driverName?: string) => {
    const numericPedidoId = resolvePlaceId(placeId).match(/pedido-(\d+)/)?.[1] || placeId.match(/\d+/)?.[0];
    const cleanMotoristaId = driverId ? parseInt(driverId.replace(/\D/g, ''), 10) || null : null;
    const finalDriverId = cleanMotoristaId ? String(cleanMotoristaId) : (driverId || undefined);

    const targetPlace = allPlaces.find(p => p.id === placeId) || (selectedPlace?.id === placeId ? selectedPlace : null);
    const op: OperationType = targetPlace?.operationType || (placeId.includes('entrega') ? 'entrega' : placeId.includes('troca') ? 'troca' : 'coleta');

    // 1. Sincroniza via Realtime Assignment Service (REST)
    if (finalDriverId) {
      realtimeAssignmentService.assignOrder(placeId, {
        id: finalDriverId,
        name: driverName,
        phone: driverPhone
      }, op);

      if (typeof window !== 'undefined' && window.AndroidApp) {
        window.AndroidApp.showNotification?.("EncomendasZap", "Pedido direcionado ao entregador!");
        window.AndroidApp.vibrate?.(200);
      }
    } else {
      realtimeAssignmentService.unassignOrder(placeId, op);
    }

    setAllPlaces(prev => {
      const next = prev.map(p => {
        const matchesPlace = p.id === placeId;
        if (matchesPlace) {
          return {
            ...p,
            assignedDriverId: finalDriverId,
            assignedDriverPhone: driverPhone || undefined,
            assignedDriverName: driverName || undefined
          };
        }
        return p;
      });
      try {
        localStorage.setItem('encomendaszap_all_places', JSON.stringify(next));
      } catch (e) {
        // ignore
      }
      return next;
    });

    setSavedPlaces(prev => {
      const next = prev.map(p => {
        const matchesPlace = p.id === placeId;
        if (matchesPlace) {
          return {
            ...p,
            assignedDriverId: finalDriverId,
            assignedDriverPhone: driverPhone || undefined,
            assignedDriverName: driverName || undefined
          };
        }
        return p;
      });
      return next;
    });

    setSelectedPlace(prev => {
      if (prev && prev.id === placeId) {
        return {
          ...prev,
          assignedDriverId: finalDriverId,
          assignedDriverPhone: driverPhone || undefined,
          assignedDriverName: driverName || undefined
        };
      }
      return prev;
    });

    // Sincroniza persistência do motorista no backend Express (/pedidos/save)
    // Atualiza estritamente os campos da operação correspondente (coleta ou entrega)
    if (numericPedidoId && !isTempPedidoNumber(numericPedidoId)) {
      const payload: Partial<BackendPedido> = {
        id: numericPedidoId,
      };

      if (op === 'coleta') {
        payload.coleta_motoristas = cleanMotoristaId ? `[${cleanMotoristaId}]` : '[]';
        payload.coleta_user_id = cleanMotoristaId ?? null;
        payload.coleta_user_nome = driverName || null;
      } else if (op === 'entrega') {
        payload.entrega_motoristas = cleanMotoristaId ? `[${cleanMotoristaId}]` : '[]';
        payload.entrega_user_id = cleanMotoristaId ?? null;
        payload.entrega_user_nome = driverName || null;
      } else {
        payload.coleta_motoristas = cleanMotoristaId ? `[${cleanMotoristaId}]` : '[]';
        payload.entrega_motoristas = cleanMotoristaId ? `[${cleanMotoristaId}]` : '[]';
        payload.coleta_user_id = cleanMotoristaId ?? null;
        payload.coleta_user_nome = driverName || null;
        payload.entrega_user_id = cleanMotoristaId ?? null;
        payload.entrega_user_nome = driverName || null;
      }

      api.savePedido(payload).then(res => {
        console.log(`[Driver Assignment] Pedido #${numericPedidoId} (${op}) salvo no banco:`, res);
      }).catch(err => {
        console.warn('[Driver Assignment] Falha ao persistir motorista no servidor:', err);
      });
    }
  }, [allPlaces, selectedPlace]);

  const [savedPlaces, setSavedPlaces] = useState<Place[]>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_saved_places');
      if (saved) {
        const parsed: Place[] = JSON.parse(saved);
        return parsed.filter(p => !p.id.startsWith('plc-') && p.orderStage !== 'concluido');
      }
    } catch {}
    return [];
  });

  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([
    {
      id: 'h1',
      query: 'Flamboyant Shopping',
      placeName: 'Flamboyant Shopping, Jardim Goiás, Goiânia',
      coordinates: { lat: -16.7118, lng: -49.2346 },
      timestamp: Date.now() - 3600000
    },
    {
      id: 'h2',
      query: 'Buriti Shopping',
      placeName: 'Buriti Shopping, Aparecida de Goiânia',
      coordinates: { lat: -16.7328, lng: -49.2802 },
      timestamp: Date.now() - 86400000
    },
    {
      id: 'h3',
      query: 'Terminal Senador Canedo',
      placeName: 'Terminal Central, Senador Canedo',
      coordinates: { lat: -16.7065, lng: -49.0925 },
      timestamp: Date.now() - 172800000
    }
  ]);

  const [userRequiredFields, setUserRequiredFields] = useState<UserRequiredFieldsConfig>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_user_required_fields');
      if (saved) {
        return { ...DEFAULT_USER_REQUIRED_FIELDS, ...JSON.parse(saved) };
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_USER_REQUIRED_FIELDS;
  });

  const updateUserRequiredFields = useCallback((config: Partial<UserRequiredFieldsConfig>) => {
    setUserRequiredFields(prev => {
      const next = { ...prev, ...config };
      try {
        localStorage.setItem('encomendaszap_user_required_fields', JSON.stringify(next));
      } catch (e) {
        // ignore
      }
      return next;
    });
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('encomendaszap_is_authenticated') === 'true'
        && !!localStorage.getItem('encomendaszap_logged_account');
    } catch {
      return false;
    }
  });

  const [user, setUser] = useState<UserProfile>(() => {
    try {
      const isAuth = localStorage.getItem('encomendaszap_is_authenticated') === 'true';
      const customAvatar = localStorage.getItem('encomendaszap_user_avatar');
      if (isAuth) {
        const savedAccountStr = localStorage.getItem('encomendaszap_logged_account');
        if (savedAccountStr) {
          const acc = JSON.parse(savedAccountStr);
          return {
            ...DEFAULT_USER,
            id: acc.id || DEFAULT_USER.id,
            name: acc.name,
            phone: acc.phone,
            role: acc.roleLabel,
            userRole: acc.role,
            avatarUrl: customAvatar || acc.avatarUrl,
            vehicle: acc.vehicle,
            vehicleType: acc.vehicleType || (acc.role === 'motorista' ? 'moto' : undefined)
          };
        }
        return {
          ...DEFAULT_USER,
          name: 'Não Conectado',
          phone: '',
          role: 'Aguardando Login',
          userRole: 'atendente',
          avatarUrl: '/logo.svg'
        };
      }
    } catch (e) {
      // ignore
    }
    return {
      ...DEFAULT_USER,
      name: 'Não Conectado',
      phone: '',
      role: 'Aguardando Login',
      userRole: 'atendente',
      avatarUrl: '/logo.svg'
    };
  });

  const setCurrentRole = useCallback((newRole: UserRole) => {
    // Troca de perfil só é permitida a partir da conta real logada (admin geral)
    let loggedRole: UserRole | null = null;
    try {
      const loggedStr = localStorage.getItem('encomendaszap_logged_account');
      if (loggedStr) loggedRole = JSON.parse(loggedStr).role;
    } catch {}
    if (loggedRole !== 'admin_geral' && loggedRole !== newRole) return;
    setCurrentRoleState(newRole);
    try {
      localStorage.setItem('encomendaszap_user_role', newRole);
    } catch (e) {
      // ignore
    }
    setUser(prev => ({ ...prev, userRole: newRole }));
  }, []);

  const loginWithAccount = useCallback((account: AuthAccount) => {
    setIsAuthenticated(true);
    setCurrentRoleState(account.role);
    const finalAvatar = account.avatarUrl;
    setSelectedPlace(null);
    try {
      localStorage.removeItem('encomendaszap_user_avatar');
      localStorage.setItem('encomendaszap_user_role', account.role);
      localStorage.setItem('encomendaszap_is_authenticated', 'true');
      localStorage.setItem('encomendaszap_logged_account', JSON.stringify({ ...account, avatarUrl: finalAvatar }));
    } catch (e) {
      // ignore
    }
    setUser(prev => ({
      ...prev,
      id: account.id || '',
      name: account.name,
      phone: account.phone,
      role: account.roleLabel,
      userRole: account.role,
      avatarUrl: finalAvatar,
      vehicle: account.vehicle,
      vehicleType: account.vehicleType || (account.role === 'motorista' ? 'moto' : undefined)
    }));
    setIsLoginModalOpen(false);
    window.dispatchEvent(new Event('zap:refresh-orders'));
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setSelectedPlace(null);
    setAllPlaces([]);
    try {
      localStorage.removeItem('encomendaszap_all_places');
      localStorage.removeItem('encomendaszap_completed_marks');
      localStorage.removeItem('encomendaszap_is_authenticated');
      localStorage.removeItem('encomendaszap_logged_account');
      localStorage.removeItem('encomendaszap_user_avatar');
    } catch (e) {
      // ignore
    }
    setUser(prev => ({
      ...prev,
      id: '',
      vehicle: undefined,
      vehicleType: undefined,
      name: 'Não Conectado',
      phone: '',
      role: 'Aguardando Login',
      userRole: 'atendente',
      avatarUrl: '/logo.svg'
    }));
    setIsLoginModalOpen(true);
  }, []);

  /**
   * Permite que o motorista assuma/confirme um pedido público disponível.
   * Transforma o pedido em privado atribuído a este motorista.
   * A marker pública some imediatamente para todos os outros motoristas
   * e vira a marker normal da rota para este motorista que confirmou.
   */
  const claimPublicOrder = useCallback(async (placeId: string): Promise<boolean> => {
    const driverId = user.id || (user.phone === '62996157343' ? 'usr-mot-04' : user.phone === '62996157344' ? 'usr-mot-05' : 'usr-mot-me');
    const driverName = user.name || 'Motorista Parceiro';
    const driverPhone = user.phone || '';
    const claimOp: OperationType | undefined = allPlaces.find(p => p.id === placeId)?.operationType;

    // Reserva o pedido no servidor primeiro: se outro motorista aceitou antes, este perde
    const won = await realtimeAssignmentService.claimOrder(placeId, { id: driverId, name: driverName, phone: driverPhone }, claimOp);
    if (!won) return false;

    // Atribui o motorista via serviço de tempo real
    assignPlaceToDriver(placeId, driverId, driverPhone, driverName);

    // Atualiza visibilidade como privado para consolidar que não é mais aberto/público
    setAllPlaces(prev => {
      const next = prev.map(p => {
        if (p.id === placeId) {
          return {
            ...p,
            orderVisibility: 'privado' as const,
            assignedDriverId: driverId,
            assignedDriverName: driverName,
            assignedDriverPhone: driverPhone
          };
        }
        return p;
      });
      try {
        localStorage.setItem('encomendaszap_all_places', JSON.stringify(next));
      } catch {}
      return next;
    });

    setSavedPlaces(prev => {
      const next = prev.map(p => {
        if (p.id === placeId) {
          return {
            ...p,
            orderVisibility: 'privado' as const,
            assignedDriverId: driverId,
            assignedDriverName: driverName,
            assignedDriverPhone: driverPhone
          };
        }
        return p;
      });
      try {
        localStorage.setItem('encomendaszap_saved_places', JSON.stringify(next));
      } catch {}
      return next;
    });

    setSelectedPlace(prev => {
      if (prev && prev.id === placeId) {
        return {
          ...prev,
          orderVisibility: 'privado' as const,
          assignedDriverId: driverId,
          assignedDriverName: driverName,
          assignedDriverPhone: driverPhone
        };
      }
      return prev;
    });

    return true;
  }, [user, assignPlaceToDriver, allPlaces]);

  // Sincroniza sessão ativa e foto de perfil diretamente com o servidor central
  useEffect(() => {
    const isAuth = localStorage.getItem('encomendaszap_is_authenticated') === 'true';
    if (!isAuth) return;

    api.isLogged().then((res) => {
      if (res.success && res.logged && res.data) {
        const u = res.data;
        const mappedRole: UserRole = 
          u.access_level === 'admin' || u.access_level === 'admin_geral' ? 'admin_geral'
          : u.access_level === 'motorista' ? 'motorista'
          : u.access_level === 'terminal' ? 'terminal'
          : 'atendente';

        const rawPhoto = u.foto || u.avatarUrl || u.photo;
        const photoUrl = rawPhoto ? (formatPhotoUrl(rawPhoto) || rawPhoto) : null;
        setIsAuthenticated(true);
        setCurrentRoleState(mappedRole);
        setUser(prev => {
          const finalAvatar = photoUrl || prev.avatarUrl;
          if (photoUrl) {
            try {
              localStorage.setItem('encomendaszap_user_avatar', photoUrl);
            } catch {}
          }
          return {
            ...prev,
            name: u.name || prev.name,
            phone: u.phone || prev.phone,
            role: mappedRole === 'admin_geral' ? 'Administrador Geral' : mappedRole === 'motorista' ? 'Motorista Parceiro' : mappedRole === 'terminal' ? 'Operador de Terminal' : 'Atendente',
            userRole: mappedRole,
            avatarUrl: finalAvatar
          };
        });
        setIsLoginModalOpen(false);
      }
    }).catch(() => {});

    // Sincroniza foto e dados do usuário cadastrado no banco pelo telefone
    const cleanPhone = (user.phone || '').replace(/\D/g, '');
    if (cleanPhone) {
      api.listUsers({ search: cleanPhone, limit: 10 }).then(res => {
        if (res.success && res.data && res.data.length > 0) {
          const found = res.data.find(u => {
            const uPhone = (u.phone || '').replace(/\D/g, '');
            if (uPhone && cleanPhone) {
              return uPhone === cleanPhone || (cleanPhone.length >= 8 && uPhone.length >= 8 && (uPhone.endsWith(cleanPhone) || cleanPhone.endsWith(uPhone)));
            }
            return false;
          });
          if (found && (found.foto || (found as any).avatarUrl)) {
            const rawPhoto = found.foto || (found as any).avatarUrl;
            const resolvedPhoto = formatPhotoUrl(rawPhoto) || rawPhoto;
            setUser(prev => ({
              ...prev,
              avatarUrl: resolvedPhoto
            }));
            try {
              localStorage.setItem('encomendaszap_user_avatar', resolvedPhoto);
              const loggedStr = localStorage.getItem('encomendaszap_logged_account');
              if (loggedStr) {
                const acc = JSON.parse(loggedStr);
                acc.avatarUrl = resolvedPhoto;
                localStorage.setItem('encomendaszap_logged_account', JSON.stringify(acc));
              }
            } catch {}
          }
        }
      }).catch(() => {});
    }
  }, [user.phone]);
  const [activeRoute, setActiveRoute] = useState<RouteInfo | null>(null);
  const [hasRealGpsFix, setHasRealGpsFix] = useState<boolean>(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<LocationCoordinates | null>(null);
  const [isTrackingUser, setIsTrackingUser] = useState<boolean>(false);
  const watchIdRef = useRef<number | null>(null);
  const hasCenteredInitialRef = useRef<boolean>(false);

  const calculateRouteToPlace = useCallback(async (dest: Place) => {
    const origin = userLocation || currentCoords;
    const result = await fetchRoute(origin, dest.coordinates);
    if (result) {
      setActiveRoute(result);
      if (mapInstance && result.coordinates.length > 0) {
        const bounds = [
          [Math.min(...result.coordinates.map(c => c.lat)), Math.min(...result.coordinates.map(c => c.lng))],
          [Math.max(...result.coordinates.map(c => c.lat)), Math.max(...result.coordinates.map(c => c.lng))]
        ] as [[number, number], [number, number]];
        mapInstance.fitBounds(bounds, { padding: [70, 70], maxZoom: 17 });
      }
    }
  }, [userLocation, currentCoords, mapInstance]);

  /**
   * Traça a rota da encomenda conforme a regra:
   * - Coleta: Local do mapa -> Cliente
   * - Entrega: Cliente -> Local do mapa
   * - Troca: Cliente -> Local do mapa -> Cliente
   * Se o cliente não tiver local, NÃO traça rota e limpa rota ativa.
   */
  const calculateOrderRoute = useCallback(async (place: Place, customerParam?: Customer | null): Promise<RouteInfo | null> => {
    const op = place.operationType || 'coleta';
    const currentCustomers = customerParam ? [customerParam, ...customers] : customers;
    const resolved = getOrderLocationsForOperation(place, op, currentCustomers);

    if (!resolved.canTraceRoute || resolved.waypoints.length < 2) {
      console.log('[Order Routing] Cliente sem localização cadastrada - rota não traçada.');
      setActiveRoute(null);
      return null;
    }

    try {
      const result = await fetchMultiStopRoute(resolved.waypoints);
      if (result) {
        setActiveRoute(result);
        return result;
      }
    } catch (err) {
      console.warn('[Order Routing] Erro ao traçar rota do pedido:', err);
    }
    return null;
  }, [customers]);

  const clearActiveRoute = useCallback(() => {
    setActiveRoute(null);
  }, []);

  // Monitoramento contínuo em segundo plano (PWA com tela desligada)
  const [backgroundTrackingStatus, setBackgroundTrackingStatus] = useState<BackgroundTrackingStatus>(() => backgroundGeolocationService.getStatus());

  useEffect(() => {
    return backgroundGeolocationService.subscribe((status) => {
      setBackgroundTrackingStatus(status);
      if (status.lastPosition) {
        setUserLocation(status.lastPosition);
        setCurrentCoords(status.lastPosition);
        setHasRealGpsFix(true);
      }
    });
  }, []);

  const startBackgroundGps = useCallback(() => {
    if (currentRole === 'motorista') {
      const activeLoc = userLocation || currentCoords;
      const driverData: Driver = {
        id: String(user.id || 'driver-me'),
        name: user.name || 'Motorista Parceiro',
        nickname: user.name?.split(' ')[0] || 'Motorista',
        vehicleType: 'moto',
        vehicleModel: 'Moto / Veículo de Entrega',
        vehiclePlate: 'BRA-2025',
        color: '#FF5E00',
        coordinates: {
          lat: activeLoc?.lat || DEFAULT_COORDS.lat,
          lng: activeLoc?.lng || DEFAULT_COORDS.lng,
          heading: activeLoc?.heading,
          speed: activeLoc?.speed,
          timestamp: Date.now()
        },
        phone: user.phone || '',
        avatarUrl: user.avatarUrl,
        status: 'em_rota',
        isOnline: true
      };
      backgroundGeolocationService.startBackgroundTracking(driverData);
    }
  }, [currentRole, userLocation, currentCoords, user]);

  const stopBackgroundGps = useCallback(() => {
    backgroundGeolocationService.stopBackgroundTracking();
  }, []);

  // 1. Telemetria do Motorista Ativo: sincroniza em tempo real com tela ligada ou desligada
  useEffect(() => {
    if (currentRole !== 'motorista' || !isDriverOnline) {
      backgroundGeolocationService.stopBackgroundTracking();
      return;
    }

    const activeLoc = userLocation || currentCoords;
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const myDriverData: Driver = {
      id: String(user.id || 'driver-me'),
      name: user.name || 'Motorista Parceiro',
      nickname: user.name?.split(' ')[0] || 'Motorista',
      vehicleType: 'moto',
      vehicleModel: 'Moto / Veículo de Entrega',
      vehiclePlate: 'BRA-2025',
      color: '#FF5E00',
      coordinates: {
        lat: activeLoc?.lat || DEFAULT_COORDS.lat,
        lng: activeLoc?.lng || DEFAULT_COORDS.lng,
        heading: activeLoc?.heading,
        speed: activeLoc?.speed,
        timestamp: now
      },
      heading: activeLoc?.heading ?? 0,
      speedKmH: activeLoc?.speed ? Math.round(activeLoc.speed * 3.6) : 0,
      status: 'em_rota',
      phone: user.phone || '',
      avatarUrl: user.avatarUrl,
      isOnline: true,
      lastSeenTimestamp: now,
      lastUpdatedStr: timeStr
    };

    // Inicia rastreamento contínuo em segundo plano (silent audio loop + screen wake lock + dual watcher)
    backgroundGeolocationService.startBackgroundTracking(myDriverData);

    const sendCurrentTelemetry = () => {
      const liveLoc = userLocation || currentCoords;
      if (!liveLoc || typeof liveLoc.lat !== 'number' || typeof liveLoc.lng !== 'number') return;
      backgroundGeolocationService.transmitLocation(liveLoc);
    };

    sendCurrentTelemetry();
    const sendInterval = setInterval(sendCurrentTelemetry, 6000);

    return () => {
      clearInterval(sendInterval);
    };
  }, [currentRole, isDriverOnline, userLocation, currentCoords, user.id, user.name, user.phone, user.avatarUrl]);

  // 2. Recepção em Tempo Real para Administradores, Terminal e Atendentes
  useEffect(() => {
    if (currentRole === 'motorista') {
      setDrivers([]);
      return;
    }

    driverTrackingClient.connect();

    driverTrackingClient.fetchLiveDrivers().then((liveList) => {
      setDrivers(liveList.filter(d => !isDriverStale(d)));
    });

    const unsubInit = driverTrackingClient.onDriversInit((initList) => {
      setDrivers(initList.filter(d => !isDriverStale(d)));
    });

    const unsubUpdate = driverTrackingClient.onDriverUpdate((driver) => {
      if (isDriverStale(driver)) {
        setDrivers(prev => prev.filter(d => d.id !== driver.id));
        return;
      }
      setDrivers(prev => {
        const index = prev.findIndex(d => d.id === driver.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = driver;
          return next;
        }
        return [...prev, driver];
      });
    });

    const unsubRemove = driverTrackingClient.onDriverRemove((driverId) => {
      setDrivers(prev => prev.filter(d => d.id !== driverId));
    });

    // Regra: Motoristas sem atualização ou offline há > 30 minutos somem do mapa
    const purgeInterval = setInterval(() => {
      setDrivers(prev => {
        const filtered = prev.filter(d => !isDriverStale(d));
        if (filtered.length !== prev.length) {
          return filtered;
        }
        return prev;
      });
    }, 15000);

    return () => {
      unsubInit();
      unsubUpdate();
      unsubRemove();
      clearInterval(purgeInterval);
    };
  }, [currentRole]);

  const [defaultNavApp, setDefaultNavAppState] = useState<DefaultNavigationApp>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_default_navigation_app');
      if (saved === 'google_maps' || saved === 'waze') {
        return saved;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const setDefaultNavApp = useCallback((app: DefaultNavigationApp) => {
    setDefaultNavAppState(app);
    try {
      if (app) {
        localStorage.setItem('encomendaszap_default_navigation_app', app);
      } else {
        localStorage.removeItem('encomendaszap_default_navigation_app');
      }
    } catch {
      // ignore
    }
  }, []);

  const [gpsError, setGpsError] = useState<{
    type: 'permission_denied' | 'insecure_context' | 'iframe_blocked' | 'timeout' | 'unavailable';
    message: string;
    canOpenStandalone?: boolean;
  } | null>(null);

  const clearGpsError = useCallback(() => {
    setGpsError(null);
  }, []);

  // Helper resiliente para obter a melhor posição GPS sem travar em timeout no navegador normal ou publicado
  const acquireBestPosition = useCallback((
    onPosition: (coords: LocationCoordinates) => void,
    onError?: (errInfo: { type: 'permission_denied' | 'insecure_context' | 'iframe_blocked' | 'timeout' | 'unavailable'; message: string; canOpenStandalone?: boolean }) => void
  ) => {
    if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const msg = 'Geolocalização requer conexão segura HTTPS. Acesse este site via HTTPS.';
      const info = { type: 'insecure_context' as const, message: msg };
      setGpsError(info);
      if (onError) onError(info);
      return;
    }

    if (!navigator.geolocation) {
      const msg = 'Geolocalização não é suportada por este navegador.';
      const info = { type: 'unavailable' as const, message: msg };
      setGpsError(info);
      if (onError) onError(info);
      return;
    }

    const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
    let hasReceivedPosition = false;

    // Se o serviço nativo Android estiver disponível, utiliza as coordenadas nativas em tempo real
    if (typeof window !== 'undefined' && window.AndroidApp?.getLatitude && window.AndroidApp?.getLongitude) {
      try {
        const nativeLat = window.AndroidApp.getLatitude();
        const nativeLng = window.AndroidApp.getLongitude();
        if (typeof nativeLat === 'number' && typeof nativeLng === 'number' && !isNaN(nativeLat) && !isNaN(nativeLng) && nativeLat !== 0 && nativeLng !== 0) {
          hasReceivedPosition = true;
          setGpsError(null);
          setHasRealGpsFix(true);
          onPosition({ lat: nativeLat, lng: nativeLng, timestamp: Date.now() });
        }
      } catch {}
    }

    // 1. TENTATIVA RÁPIDA (Cellular / Wi-Fi / Cache do OS) - Responde em < 400ms sem timeout
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        hasReceivedPosition = true;
        setGpsError(null);
        setHasRealGpsFix(true);
        if (typeof pos.coords.accuracy === 'number') {
          setGpsAccuracy(Math.round(pos.coords.accuracy));
        }
        const fastCoords: LocationCoordinates = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
          timestamp: pos.timestamp || Date.now()
        };
        onPosition(fastCoords);

        // 2. Refina logo após com alta precisão (satélite) com timeout generoso (25s) sem travar o app
        navigator.geolocation.getCurrentPosition(
          (highPos) => {
            setHasRealGpsFix(true);
            if (typeof highPos.coords.accuracy === 'number') {
              setGpsAccuracy(Math.round(highPos.coords.accuracy));
            }
            const highCoords: LocationCoordinates = {
              lat: highPos.coords.latitude,
              lng: highPos.coords.longitude,
              heading: highPos.coords.heading ?? undefined,
              speed: highPos.coords.speed ?? undefined,
              timestamp: highPos.timestamp || Date.now()
            };
            onPosition(highCoords);
          },
          () => {
            // Falha silenciosa no refinamento pois já temos as coordenadas rápidas
          },
          { enableHighAccuracy: true, timeout: 25000, maximumAge: 5000 }
        );
      },
      (err) => {
        if (err.code === 1) { // PERMISSION_DENIED
          if (isInIframe) {
            const msg = 'Acesso ao GPS bloqueado pelo iframe. Para funcionar dentro do site, adicione allow="geolocation" na tag <iframe>.';
            const info = { type: 'iframe_blocked' as const, message: msg, canOpenStandalone: true };
            setGpsError(info);
            if (onError) onError(info);
          } else {
            const msg = 'Permissão de GPS negada. Permita a localização nas configurações do seu navegador.';
            const info = { type: 'permission_denied' as const, message: msg };
            setGpsError(info);
            if (onError) onError(info);
          }
          return;
        }

        // Se a primeira tentativa rápida falhou por timeout ou indisponibilidade, tentar com alta precisão
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            hasReceivedPosition = true;
            setGpsError(null);
            setHasRealGpsFix(true);
            if (typeof pos.coords.accuracy === 'number') {
              setGpsAccuracy(Math.round(pos.coords.accuracy));
            }
            const accurateCoords: LocationCoordinates = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading ?? undefined,
              speed: pos.coords.speed ?? undefined,
              timestamp: pos.timestamp || Date.now()
            };
            onPosition(accurateCoords);
          },
          (highErr) => {
            if (!hasReceivedPosition) {
              const msg = highErr.code === 3
                ? 'Sinal de GPS demorou a responder. Verifique se o GPS do aparelho está ativo.'
                : 'Não foi possível obter sinal de satélite GPS no momento.';
              const info = { type: (highErr.code === 3 ? 'timeout' : 'unavailable') as 'timeout' | 'unavailable', message: msg };
              setGpsError(info);
              if (onError) onError(info);
            }
          },
          { enableHighAccuracy: true, timeout: 25000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Rastreamento contínuo de GPS do dispositivo em tempo real
  useEffect(() => {
    if (!navigator.geolocation) return;

    let passiveWatchId: number | null = null;
    let highAccuracyMode = true;

    // Fix inicial resiliente diretamente do navegador nativo
    acquireBestPosition((coords) => {
      setHasRealGpsFix(true);
      setUserLocation(coords);
      setCurrentCoords(coords);
      saveLocationToStorage(coords, mapInstance ? mapInstance.getZoom() : 16);
      if (!hasCenteredInitialRef.current && mapInstance) {
        hasCenteredInitialRef.current = true;
        mapInstance.setView([coords.lat, coords.lng], 16, { animate: true });
      }
    });

    const startWatcher = (useHighAccuracy: boolean) => {
      try {
        if (passiveWatchId !== null) {
          navigator.geolocation.clearWatch(passiveWatchId);
        }
        passiveWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            setGpsError(null);
            setHasRealGpsFix(true);
            if (typeof pos.coords.accuracy === 'number') {
              setGpsAccuracy(Math.round(pos.coords.accuracy));
            }
            const liveCoords: LocationCoordinates = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading ?? undefined,
              speed: pos.coords.speed ?? undefined,
              timestamp: pos.timestamp || Date.now()
            };
            setUserLocation(liveCoords);
            setCurrentCoords(liveCoords);
            if (!hasCenteredInitialRef.current && mapInstance) {
              hasCenteredInitialRef.current = true;
              mapInstance.setView([liveCoords.lat, liveCoords.lng], 16, { animate: true });
            }
          },
          (err) => {
            // Se falhar em alta precisão por timeout (3) ou indisponibilidade (2),
            // troca automaticamente para modo resiliente sem parar o rastreamento!
            if (highAccuracyMode && (err.code === 3 || err.code === 2)) {
              highAccuracyMode = false;
              startWatcher(false);
            } else if (err.code === 1) {
              const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
              setGpsError({
                type: isInIframe ? 'iframe_blocked' : 'permission_denied',
                message: isInIframe
                  ? 'Acesso ao GPS bloqueado pelo iframe. Adicione allow="geolocation" no iframe.'
                  : 'Permissão de localização negada.',
                canOpenStandalone: isInIframe
              });
            }
          },
          useHighAccuracy
            ? { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
            : { enableHighAccuracy: false, maximumAge: 10000, timeout: 30000 }
        );
      } catch (e) {
        console.warn('Erro ao iniciar watchPosition passivo:', e);
      }
    };

    startWatcher(true);

    return () => {
      if (passiveWatchId !== null) {
        navigator.geolocation.clearWatch(passiveWatchId);
      }
    };
  }, [acquireBestPosition, mapInstance]);

  // Se as coordenadas reais do navegador chegarem antes do mapa estar pronto, centraliza assim que o mapa carregar
  useEffect(() => {
    if (mapInstance && userLocation && hasRealGpsFix && !hasCenteredInitialRef.current) {
      hasCenteredInitialRef.current = true;
      mapInstance.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
    }
  }, [mapInstance, userLocation, hasRealGpsFix]);

  // =========================================================================
  // GEOFENCING / PROXIMIDADE AUTOMÁTICA DE CHEGADA:
  // Ao chegar próximo (<= 75 metros) a uma marker de coleta, entrega ou troca,
  // já abre os dados e detalhes da encomenda automaticamente.
  // Se o entregador fechar o card, não abre de novo enquanto estiver em movimento
  // naquele local, só quando chegar perto de outro ou se afastar (> 180m) e voltar.
  // =========================================================================
  const dismissedProximityPlacesRef = useRef<Map<string, { dismissedAt: number; coords: { lat: number; lng: number } }>>(new Map());

  const dismissPlaceProximity = useCallback((placeId: string) => {
    const target = allPlaces.find(p => p.id === placeId);
    if (target) {
      dismissedProximityPlacesRef.current.set(placeId, {
        dismissedAt: Date.now(),
        coords: target.coordinates
      });
    } else if (selectedPlace && selectedPlace.id === placeId) {
      dismissedProximityPlacesRef.current.set(placeId, {
        dismissedAt: Date.now(),
        coords: selectedPlace.coordinates
      });
    }
  }, [allPlaces, selectedPlace]);

  useEffect(() => {
    if (!userLocation) return;

    const now = Date.now();
    const currentLoc = { lat: userLocation.lat, lng: userLocation.lng };

    // 1. Limpa locais dispensados se o entregador se afastou (> 180m) ou se passou o cooldown de 5 minutos
    dismissedProximityPlacesRef.current.forEach((data, placeId) => {
      const dist = getDistanceMeters(currentLoc, data.coords);
      const elapsed = now - data.dismissedAt;
      if (dist > 180 || elapsed > 5 * 60 * 1000) {
        dismissedProximityPlacesRef.current.delete(placeId);
      }
    });

    // Se já estiver com um local selecionado aberto ou modal de novo pedido, não interrompe
    if (selectedPlace || isNewOrderModalOpen) {
      return;
    }

    // 2. Busca markers ativas da sequência atual que não estejam concluídas
    const activePlaces = filterPlacesBySequence(allPlaces).filter(p => {
      if (p.orderStage === 'concluido' || (p.operationType as any) === 'concluido') {
        return false;
      }

      // Se foi dispensado recentemente e ainda está nas proximidades, não reabre
      if (dismissedProximityPlacesRef.current.has(p.id)) {
        return false;
      }

      // Se for perfil de motorista e o ponto foi atribuído a outro entregador, ignora
      if (currentRole === 'motorista') {
        const currentDriverId = 'usr-mot-04';
        if (p.assignedDriverId && p.assignedDriverId !== currentDriverId) {
          return false;
        }
      }

      return true;
    });

    if (activePlaces.length === 0) return;

    // 3. Encontra o ponto mais próximo dentro do raio de chegada (75 metros)
    let closestPlace: Place | null = null;
    let minDistance = Infinity;

    for (const place of activePlaces) {
      const dist = getDistanceMeters(currentLoc, place.coordinates);
      if (dist <= 75 && dist < minDistance) {
        minDistance = dist;
        closestPlace = place;
      }
    }

    // 4. Ao chegar pertinho (<= 75m):
    // Regra EncomendasZap solicitada:
    // - Se for entrega: abre a foto da coleta (ou entrega)
    // - Se for coleta: abre os detalhes
    // - Se for troca: abre os detalhes também
    if (closestPlace) {
      if (mapInstance) {
        mapInstance.flyTo([closestPlace.coordinates.lat, closestPlace.coordinates.lng], 17, {
          duration: 1.2,
          easeLinearity: 0.25
        });
      }

      if (closestPlace.operationType === 'entrega') {
        // Busca a foto da coleta ou da entrega
        let photoToOpen: string | null = closestPlace.photos?.[0] || closestPlace.imageUrl || null;
        if (!photoToOpen) {
          const siblingColeta = allPlaces.find(p => 
            p.id !== closestPlace!.id &&
            ((closestPlace!.orderCode && p.orderCode === closestPlace!.orderCode) ||
             (closestPlace!.id.match(/\d+/)?.[0] && p.id.startsWith(`pedido-${closestPlace!.id.match(/\d+/)?.[0]}-`))) &&
            (p.imageUrl || p.photos?.length)
          );
          photoToOpen = siblingColeta?.photos?.[0] || siblingColeta?.imageUrl || null;
        }

        if (!photoToOpen) {
          try {
            const numericId = closestPlace.id.match(/\d+/)?.[0];
            const cachedColeta = numericId ? localStorage.getItem(`encomendaszap_photos_pedido-${numericId}-coleta`) : null;
            const cachedSelf = localStorage.getItem(`encomendaszap_photos_${closestPlace.id}`);
            const raw = cachedColeta || cachedSelf;
            if (raw) {
              const parsed = JSON.parse(raw);
              photoToOpen = Array.isArray(parsed) ? parsed[0] : parsed;
            }
          } catch {}
        }

        setSelectedPlace(closestPlace);
        if (photoToOpen) {
          openPhotoViewer(photoToOpen, closestPlace);
        }
      } else {
        // Se for coleta ou se for troca: abre os detalhes
        closePhotoViewer();
        setSelectedPlace(closestPlace);
      }
    }
  }, [userLocation, allPlaces, selectedPlace, isNewOrderModalOpen, currentRole, mapInstance, openPhotoViewer, closePhotoViewer]);

  const flyToLocation = useCallback((coords: LocationCoordinates, zoom: number = 16) => {
    setCurrentCoords(coords);
    saveLocationToStorage(coords, zoom);
    if (mapInstance) {
      mapInstance.flyTo([coords.lat, coords.lng], zoom, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [mapInstance]);

  const addNewOrder = useCallback((newPlace: Place) => {
    // Regra de permissão: Motorista NÃO PODE adicionar pedidos
    if (currentRole === 'motorista' || user?.userRole === 'motorista') {
      console.warn('[addNewOrder] Motoristas não possuem permissão para adicionar pedidos.');
      return;
    }

    // Se o pedido já é um pedido existente no sistema, apenas atualiza para evitar duplicação de marker
    const isExistingOrder = typeof newPlace.id === 'string' && (newPlace.id.startsWith('pedido-') || (newPlace.orderCode && !newPlace.orderCode.startsWith('TEMP-')));
    if (isExistingOrder) {
      updatePlaceDetails(newPlace.id, newPlace);
      return;
    }

    setAllPlaces(prev => {
      const next = [newPlace, ...prev.filter(p => p.id !== newPlace.id)];
      try {
        localStorage.setItem('encomendaszap_all_places', JSON.stringify(next));
      } catch (e) {
        // ignore
      }
      return next;
    });

    setSavedPlaces(prev => [newPlace, ...prev.filter(p => p.id !== newPlace.id)]);
    setSelectedPlace(newPlace);
    flyToLocation(newPlace.coordinates, 16);

    // Marca e incrementa imediatamente o contador de pedidos nos dados do cliente
    if (newPlace.customerPhone || newPlace.customerName || newPlace.customerId) {
      const custPhoneDigits = (newPlace.customerPhone || '').replace(/\D/g, '');
      const custName = (newPlace.customerName || '').toLowerCase().trim();
      const custId = newPlace.customerId;

      setCustomers(prev => {
        const next = prev.map(c => {
          const cPhoneDigits = (c.phone || '').replace(/\D/g, '');
          const cName = (c.fullName || '').toLowerCase().trim();
          const matches = (custId && c.id === custId) ||
            (custPhoneDigits && custPhoneDigits.length >= 8 && cPhoneDigits && (cPhoneDigits === custPhoneDigits || cPhoneDigits.endsWith(custPhoneDigits) || custPhoneDigits.endsWith(cPhoneDigits))) ||
            (custName && cName && (custName === cName || cName.includes(custName) || custName.includes(cName)));

          if (matches) {
            const updatedCount = (c.orderCount || 0) + 1;
            customerOrderStatsService.registerOrder(c);
            return { ...c, orderCount: updatedCount };
          }
          return c;
        });

        return next;
      });

      customerOrderStatsService.registerOrder({
        fullName: newPlace.customerName,
        phone: newPlace.customerPhone,
        id: newPlace.customerId
      });
    }

    // Regra EncomendasZap: "ao add, e o cliente nao tiver local setado, deve add apenas um maker."
    const op = newPlace.operationType || 'coleta';
    const hasColetaCoords = Boolean(newPlace.pickupCoordinates?.lat && newPlace.pickupCoordinates?.lng);
    const hasEntregaCoords = Boolean(newPlace.deliveryCoordinates?.lat && newPlace.deliveryCoordinates?.lng);
    const hasTrocaCoords = Boolean(newPlace.exchangeCoordinates?.lat && newPlace.exchangeCoordinates?.lng);

    const coletaLat = hasColetaCoords 
      ? newPlace.pickupCoordinates!.lat 
      : (op === 'coleta' ? newPlace.coordinates?.lat : undefined);
    const coletaLng = hasColetaCoords 
      ? newPlace.pickupCoordinates!.lng 
      : (op === 'coleta' ? newPlace.coordinates?.lng : undefined);

    const entregaLat = hasEntregaCoords 
      ? newPlace.deliveryCoordinates!.lat 
      : (op === 'entrega' ? newPlace.coordinates?.lat : undefined);
    const entregaLng = hasEntregaCoords 
      ? newPlace.deliveryCoordinates!.lng 
      : (op === 'entrega' ? newPlace.coordinates?.lng : undefined);

    const trocaLat = hasTrocaCoords 
      ? newPlace.exchangeCoordinates!.lat 
      : (op === 'troca' ? newPlace.coordinates?.lat : undefined);
    const trocaLng = hasTrocaCoords 
      ? newPlace.exchangeCoordinates!.lng 
      : (op === 'troca' ? newPlace.coordinates?.lng : undefined);

    // Envia o novo pedido para a API Express (/pedidos/save)
    api.savePedido({
      cliente: newPlace.customerName || 'Cliente EncomendasZap',
      phone: newPlace.customerPhone || '',
      cidade: newPlace.originCity || 'Goiânia',
      tipo_encomenda: newPlace.operationType || 'coleta',
      tipo_veiculo: newPlace.vehicleType || 'moto',
      detalhes: newPlace.driverNotes || '',
      local: newPlace.name,
      coleta_local: op === 'coleta' ? (newPlace.pickupName || newPlace.name) : (hasColetaCoords ? (newPlace.pickupName || 'Ponto de Coleta') : undefined),
      coleta_nome: op === 'coleta' ? (newPlace.pickupName || newPlace.name) : (hasColetaCoords ? (newPlace.pickupName || 'Ponto de Coleta') : undefined),
      coleta_endereco: op === 'coleta' ? (newPlace.pickupAddress || newPlace.address) : (hasColetaCoords ? newPlace.pickupAddress : undefined),
      coleta_lat: coletaLat,
      coleta_lng: coletaLng,
      coleta_contato: newPlace.pickupContact,
      coleta_phone: newPlace.pickupPhone,
      coleta_obs: newPlace.pickupNotes,
      entrega_local: op === 'entrega' ? (newPlace.deliveryName || newPlace.name) : (hasEntregaCoords ? (newPlace.deliveryName || 'Ponto de Entrega') : undefined),
      entrega_nome: op === 'entrega' ? (newPlace.deliveryName || newPlace.name) : (hasEntregaCoords ? (newPlace.deliveryName || 'Ponto de Entrega') : undefined),
      entrega_endereco: op === 'entrega' ? (newPlace.deliveryAddress || newPlace.address) : (hasEntregaCoords ? newPlace.deliveryAddress : undefined),
      entrega_lat: entregaLat,
      entrega_lng: entregaLng,
      entrega_contato: newPlace.deliveryContact,
      entrega_phone: newPlace.deliveryPhone,
      entrega_obs: newPlace.deliveryNotes,
      troca_nome: op === 'troca' ? (newPlace.exchangeName || newPlace.name) : (hasTrocaCoords ? (newPlace.exchangeName || 'Ponto de Troca') : undefined),
      troca_endereco: op === 'troca' ? (newPlace.exchangeAddress || newPlace.address) : (hasTrocaCoords ? newPlace.exchangeAddress : undefined),
      troca_lat: trocaLat,
      troca_lng: trocaLng
    }).then(res => {
      if (res && res.success && res.data?.id) {
        const savedId = String(res.data.id);
        const serverPlaceId = `pedido-${savedId}`;
        const serverOrderCode = `EZ-${savedId}-GO`;
        tempPedidoIdMap.set(newPlace.id, serverPlaceId);
        setAllPlaces(prev => {
          const next = prev.map(p => p.id === newPlace.id ? { ...p, id: serverPlaceId, orderCode: serverOrderCode } : p);
          try {
            localStorage.setItem('encomendaszap_all_places', JSON.stringify(next));
          } catch {}
          return next;
        });
        setSavedPlaces(prev => prev.map(p => p.id === newPlace.id ? { ...p, id: serverPlaceId, orderCode: serverOrderCode } : p));
        setSelectedPlace(prev => prev && prev.id === newPlace.id ? { ...prev, id: serverPlaceId, orderCode: serverOrderCode } : prev);
      }
    }).catch((err) => {
      console.warn('Erro ao salvar pedido na API:', err);
    });
  }, [flyToLocation, updatePlaceDetails, currentRole, user]);

  // Dá baixa em um ponto (coleta, troca ou entrega) e avança para a próxima etapa conforme as regras do EncomendasZap
  const completePlaceWaypoint = useCallback(async (rawPlaceId: string, receiverName?: string, notes?: string, proximity?: BaixaProximity) => {
    const placeId = resolvePlaceId(rawPlaceId);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const todayStr = now.toISOString().split('T')[0];

    // Localiza o local alvo de forma síncrona imediata
    const place = allPlaces.find(p => p.id === placeId) || 
                  savedPlaces.find(p => p.id === placeId) || 
                  (selectedPlace?.id === placeId ? selectedPlace : null);

    const currentOp: OperationType = place?.operationType || 'coleta';
    const rawId = (place as any)?.pedido_id || (place as any)?.orderId || placeId;
    const cleanId = String(rawId).replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
    const matchFromId = String(rawId).match(/pedido-(\d+)/) || String(rawId).match(/^(\d+)$/);
    const orderNum = matchFromId 
      ? matchFromId[1] 
      : (cleanId.match(/\d+/)?.[0] || String(placeId).match(/pedido-(\d+)/)?.[1] || String(placeId).match(/\d+/)?.[0] || (place?.orderCode ? place.orderCode.match(/(\d+)/)?.[1] : ''));
    const targetPedidoId = orderNum || cleanId || placeId;
    const orderCode = place?.orderCode || (orderNum ? `EZ-${orderNum}-GO` : '');
    const isExchange = Boolean(place?.isExchangeOrder || place?.category?.toLowerCase().includes('troca'));
    const isFailedAttempt = Boolean(receiverName?.toLowerCase().includes('insucesso') || notes?.toLowerCase().includes('insucesso'));

    // Verifica se possui local de entrega real e válido configurado
    const hasRealDeliveryLocation = Boolean(
      place &&
      place.deliveryCoordinates &&
      typeof place.deliveryCoordinates.lat === 'number' &&
      !isNaN(place.deliveryCoordinates.lat) &&
      place.deliveryCoordinates.lat !== 0 &&
      (
        (place.deliveryAddress && place.deliveryAddress.trim() && place.deliveryAddress !== 'Ponto de Entrega' && place.deliveryAddress !== place.pickupAddress) ||
        (place.deliveryName && place.deliveryName.trim() && place.deliveryName !== 'Ponto de Entrega' && place.deliveryName !== place.pickupName) ||
        (place.pickupCoordinates && (Math.abs(place.deliveryCoordinates.lat - place.pickupCoordinates.lat) > 0.0001 || Math.abs(place.deliveryCoordinates.lng - place.pickupCoordinates.lng) > 0.0001))
      )
    );

    const hasRealExchangeLocation = Boolean(
      isExchange &&
      (
        (place?.exchangeCoordinates && typeof place.exchangeCoordinates.lat === 'number' && !isNaN(place.exchangeCoordinates.lat) && place.exchangeCoordinates.lat !== 0) ||
        hasRealDeliveryLocation
      )
    );

    // Determina se é a etapa final da encomenda:
    // 1. Se é entrega -> É final!
    // 2. Se é coleta SEM local de entrega e SEM troca -> "primeiro aparece o local de coleta, se nao tiver local de entrega ela some" -> É final!
    // 3. Se não é troca e não tem entrega -> É final!
    let isFinalOrderCompletion = false;
    if (currentOp === 'entrega') {
      isFinalOrderCompletion = true;
    } else if (currentOp === 'coleta' && !hasRealDeliveryLocation && !hasRealExchangeLocation) {
      isFinalOrderCompletion = true;
    } else if (!isExchange && currentOp !== 'coleta' && !hasRealDeliveryLocation) {
      isFinalOrderCompletion = true;
    }

    // 1. Marcação visual no solo (Xzinho no asfalto com horário e tipo exato da operação)
    let placePhotos: string[] = [];
    try {
      const savedPhotosRaw = localStorage.getItem(`encomendaszap_photos_${placeId}`);
      if (savedPhotosRaw) {
        const parsed = JSON.parse(savedPhotosRaw);
        if (Array.isArray(parsed)) placePhotos = parsed;
      }
    } catch {}
    if (placePhotos.length === 0 && place?.photos && place.photos.length > 0) {
      placePhotos = [...place.photos];
    }
    if (placePhotos.length === 0 && place?.imageUrl) {
      placePhotos = [place.imageUrl];
    }

    const assignedDriverName = user?.name || place?.assignedDriverName || 'Motorista';

    const newCompletedMark: CompletedWaypointMark = {
      id: `mark-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      orderId: placeId,
      orderCode,
      operationType: currentOp,
      completedAt: Date.now(),
      timeStr,
      completedDate: todayStr,
      placeName: currentOp === 'coleta' 
        ? (place?.pickupName || place?.name || 'Local de Coleta')
        : (place?.name || 'Local'),
      address: currentOp === 'coleta'
        ? (place?.pickupAddress || place?.address || '')
        : (place?.address || ''),
      customerName: place?.customerName,
      coordinates: place ? { ...place.coordinates } : currentCoords,
      receiverName,
      details: notes,
      status: isFailedAttempt ? 'failed' : 'success',
      isFinal: isFinalOrderCompletion,
      driverName: assignedDriverName,
      driverId: user?.id ? String(user.id) : undefined,
      driverPhone: user?.phone || place?.assignedDriverPhone,
      driverPhoto: user?.avatarUrl,
      photos: placePhotos,
      imageUrl: placePhotos[0] || place?.imageUrl
    };

    setCompletedWaypointMarks(prev => {
      const nextMarks = [newCompletedMark, ...prev];
      try {
        localStorage.setItem('encomendaszap_completed_marks', JSON.stringify(nextMarks));
      } catch (e) {}
      return nextMarks;
    });

    if (typeof window !== 'undefined' && window.AndroidApp) {
      const msg = isFailedAttempt ? 'Tentativa registrada' : isFinalOrderCompletion ? 'Entrega concluída!' : 'Status do pedido atualizado!';
      window.AndroidApp.showNotification?.("EncomendasZap", msg);
      window.AndroidApp.vibrate?.(200);
    }

    // 2. Atualiza estado de allPlaces conforme as 4 regras do EncomendasZap:
    // - Coleta sem entrega: ela some!
    // - Coleta com entrega: ao coletar aparece o local de entrega!
    // - Coleta com troca: ao coletar aparece o local de troca!
    // - Troca concluída: por último o local de coleta vira o local de entrega!
    setAllPlaces(prev => {
      let nextList: Place[];
      if (isFinalOrderCompletion) {
        // Encomenda totalmente concluída: remove do mapa ("ela some")
        nextList = prev.filter(p => {
          if (p.id === placeId) return false;
          if (orderNum && p.id.startsWith(`pedido-${orderNum}`)) return false;
          if (orderCode && p.orderCode === orderCode) return false;
          return true;
        });
      } else if (currentOp === 'coleta') {
        // Remove a marker pendente da Coleta
        nextList = prev.filter(p => {
          if (p.id === placeId) return false;
          if (orderNum && p.id === `pedido-${orderNum}-coleta`) return false;
          return true;
        });

        if (isExchange && hasRealExchangeLocation && place) {
          // "se for troca primeiro e coleta, depois e local de troca"
          const exchangeCoords = place.exchangeCoordinates || place.deliveryCoordinates;
          const exchangeAddress = place.exchangeAddress || place.deliveryAddress || place.address;
          const exchangeName = place.exchangeName || (place.customerName ? `Troca: ${place.customerName}` : 'Ponto de Troca');
          const nextStepId = orderNum ? `pedido-${orderNum}-troca` : `troca-${placeId}`;

          if (exchangeCoords && !nextList.some(p => p.id === nextStepId)) {
            nextList.push({
              ...place,
              id: nextStepId,
              name: exchangeName,
              address: exchangeAddress,
              coordinates: exchangeCoords,
              imageUrl: undefined,
              photos: undefined,
              operationType: 'troca',
              orderStage: 'troca',
              category: 'Troca de Mercadoria',
              isExchangeOrder: true
            });
          }
        } else if (hasRealDeliveryLocation && place && place.deliveryCoordinates) {
          // "se tiver local de entrega ela aparece depois da coleta"
          const destCoords = place.deliveryCoordinates;
          const destAddress = place.deliveryAddress || place.address;
          const destName = place.deliveryName || (place.customerName ? `Entrega: ${place.customerName}` : 'Ponto de Entrega');
          const nextStepId = orderNum ? `pedido-${orderNum}-entrega` : `entrega-${placeId}`;

          if (!nextList.some(p => p.id === nextStepId)) {
            nextList.push({
              ...place,
              id: nextStepId,
              name: destName,
              address: destAddress,
              coordinates: destCoords,
              imageUrl: undefined,
              photos: undefined,
              operationType: 'entrega',
              orderStage: 'entrega',
              category: 'Entrega Expressa',
              isExchangeOrder: false
            });
          }
        }
      } else if (currentOp === 'troca' && isExchange && place) {
        // Troca concluída: remove o ponto de troca
        nextList = prev.filter(p => {
          if (p.id === placeId) return false;
          if (orderNum && p.id === `pedido-${orderNum}-troca`) return false;
          return true;
        });

        // "por ultimo o local de coleta vira o local de entrega" (retorno no mesmo local da coleta original)
        const returnCoords = place.pickupCoordinates || place.coordinates;
        const returnAddress = place.pickupAddress || place.address;
        const returnName = `2ª Entrega (Retorno à Coleta): ${place.pickupName || place.name}`;
        const returnId = orderNum ? `pedido-${orderNum}-retorno` : `retorno-${placeId}`;

        if (!nextList.some(p => p.id === returnId)) {
          nextList.push({
            ...place,
            id: returnId,
            name: returnName,
            address: returnAddress,
            coordinates: returnCoords,
            imageUrl: undefined,
            photos: undefined,
            operationType: 'entrega',
            orderStage: 'retorno',
            category: 'Troca de Mercadoria',
            isExchangeOrder: true
          });
        }
      } else {
        nextList = prev.filter(p => p.id !== placeId);
      }

      try {
        localStorage.setItem('encomendaszap_all_places', JSON.stringify(nextList));
      } catch (e) {}
      return nextList;
    });

    // 3. Atualiza savedPlaces acompanhando o mesmo ciclo de vida
    setSavedPlaces(prevSaved => {
      let nextSaved: Place[];
      if (isFinalOrderCompletion) {
        nextSaved = prevSaved.filter(p => {
          if (p.id === placeId) return false;
          if (orderNum && (p.id.includes(orderNum) || (p.orderCode && p.orderCode.includes(orderNum)))) return false;
          if (orderCode && p.orderCode === orderCode) return false;
          return true;
        });
      } else if (currentOp === 'coleta') {
        nextSaved = prevSaved.filter(p => {
          if (p.id === placeId) return false;
          if (orderNum && p.id === `pedido-${orderNum}-coleta`) return false;
          return true;
        });

        if (isExchange && hasRealExchangeLocation && place) {
          const exchangeCoords = place.exchangeCoordinates || place.deliveryCoordinates;
          const exchangeAddress = place.exchangeAddress || place.deliveryAddress || place.address;
          const exchangeName = place.exchangeName || (place.customerName ? `Troca: ${place.customerName}` : 'Ponto de Troca');
          const nextStepId = orderNum ? `pedido-${orderNum}-troca` : `troca-${placeId}`;

          if (exchangeCoords && !nextSaved.some(p => p.id === nextStepId)) {
            nextSaved.push({
              ...place,
              id: nextStepId,
              name: exchangeName,
              address: exchangeAddress,
              coordinates: exchangeCoords,
              imageUrl: undefined,
              photos: undefined,
              operationType: 'troca',
              orderStage: 'troca',
              category: 'Troca de Mercadoria',
              isExchangeOrder: true
            });
          }
        } else if (hasRealDeliveryLocation && place && place.deliveryCoordinates) {
          const destCoords = place.deliveryCoordinates;
          const destAddress = place.deliveryAddress || place.address;
          const destName = place.deliveryName || (place.customerName ? `Entrega: ${place.customerName}` : 'Ponto de Entrega');
          const nextStepId = orderNum ? `pedido-${orderNum}-entrega` : `entrega-${placeId}`;

          if (!nextSaved.some(p => p.id === nextStepId)) {
            nextSaved.push({
              ...place,
              id: nextStepId,
              name: destName,
              address: destAddress,
              coordinates: destCoords,
              imageUrl: undefined,
              photos: undefined,
              operationType: 'entrega',
              orderStage: 'entrega',
              category: 'Entrega Expressa',
              isExchangeOrder: false
            });
          }
        }
      } else if (currentOp === 'troca' && isExchange && place) {
        nextSaved = prevSaved.filter(p => {
          if (p.id === placeId) return false;
          if (orderNum && p.id === `pedido-${orderNum}-troca`) return false;
          return true;
        });

        const returnCoords = place.pickupCoordinates || place.coordinates;
        const returnAddress = place.pickupAddress || place.address;
        const returnName = `2ª Entrega (Retorno à Coleta): ${place.pickupName || place.name}`;
        const returnId = orderNum ? `pedido-${orderNum}-retorno` : `retorno-${placeId}`;

        if (!nextSaved.some(p => p.id === returnId)) {
          nextSaved.push({
            ...place,
            id: returnId,
            name: returnName,
            address: returnAddress,
            coordinates: returnCoords,
            imageUrl: undefined,
            photos: undefined,
            operationType: 'entrega',
            orderStage: 'retorno',
            category: 'Troca de Mercadoria',
            isExchangeOrder: true
          });
        }
      } else {
        nextSaved = prevSaved.filter(p => p.id !== placeId);
      }

      try {
        localStorage.setItem('encomendaszap_saved_places', JSON.stringify(nextSaved));
      } catch {}
      return nextSaved;
    });

    // 4. Fecha imediatamente o card de detalhes
    setSelectedPlace(null);
    setViewingPhotoPlace(null);
    setViewingPhotoUrl(null);

    // 5. SINCRONIZAÇÃO COMPLETA E GARANTIDA COM O SERVIDOR
    if (targetPedidoId && !isTempPedidoNumber(String(targetPedidoId).replace(/\D/g, '') || null)) {
      const cleanUserId = user?.id ? parseInt(String(user.id).replace(/\D/g, ''), 10) || 1 : 1;
      const operatorName = receiverName || user?.name || 'Operador';
      const nowIso = now.toISOString();

      if (isFailedAttempt) {
        await api.savePedido({
          id: targetPedidoId,
          entrega_obs: notes || receiverName,
          status_pagamento: 'tentativa_sem_sucesso'
        }).catch(() => {});
        const presenceCampo = currentOp === 'coleta' ? 'coleta_saida_at' : currentOp === 'troca' ? 'troca_saida_at' : 'entrega_saida_at';
        await api.registrarPresenca(targetPedidoId, presenceCampo, nowIso).catch(() => {});
      } else {
        const etapaBackend = isFinalOrderCompletion && currentOp === 'coleta'
          ? 'coletado'
          : currentOp === 'coleta' 
          ? 'coletado' 
          : currentOp === 'troca' 
          ? 'trocado' 
          : 'entregue';

        // 5.1 Marca etapa no servidor
        try {
          await api.marcarColetaEntrega(targetPedidoId, etapaBackend, cleanUserId, operatorName, proximity);
        } catch (err) {
          console.warn('[Baixa] Erro em marcarColetaEntrega:', err);
        }

        // 5.2 Persiste etapa e campos de saída no registro do pedido
        try {
          await api.savePedido({
            id: targetPedidoId,
            etapa: isFinalOrderCompletion ? (currentOp === 'coleta' ? 'finalizado' : 'entregue') : etapaBackend,
            ...(currentOp === 'coleta' 
              ? { coleta_obs: notes || operatorName, coleta_saida_at: timeStr, coleta_user_id: cleanUserId, coleta_user_nome: operatorName } 
              : currentOp === 'troca' 
              ? { troca_obs: notes || operatorName, troca_saida_at: timeStr, troca_at: timeStr, troca_user_id: cleanUserId, troca_user_nome: operatorName } 
              : { entrega_obs: notes || operatorName, entrega_saida_at: timeStr, entrega_at: timeStr, entrega_user_id: cleanUserId, entrega_user_nome: operatorName, status_pagamento: 'pago' }
            ),
            ...(isFinalOrderCompletion ? { status_pagamento: 'pago', etapa: 'finalizado' } : {})
          });
        } catch (err) {
          console.warn('[Baixa] Erro em savePedido:', err);
        }

        // 5.3 Registra presença de saída no servidor
        const presenceCampo = currentOp === 'coleta' ? 'coleta_saida_at' : currentOp === 'troca' ? 'troca_saida_at' : 'entrega_saida_at';
        await api.registrarPresenca(targetPedidoId, presenceCampo, nowIso).catch(() => {});

        // 5.4 Se foi a conclusão final da entrega ou coleta única, finaliza o pedido oficialmente
        if (isFinalOrderCompletion) {
          try {
            await api.finalizarPedido(targetPedidoId, cleanUserId);
          } catch (err) {
            console.warn('[Baixa] Erro em finalizarPedido:', err);
          }
        }
      }
    }
  }, [allPlaces, savedPlaces, selectedPlace, currentCoords, flyToLocation, user]);

  // Reinicia / sincroniza as encomendas ativas diretamente do servidor
  const resetWorkflowToColetas = useCallback(() => {
    setCompletedWaypointMarks([]);
    try {
      localStorage.setItem('encomendaszap_completed_marks', JSON.stringify([]));
    } catch (e) {}
    setSelectedPlace(null);
    refreshServerData();
  }, [refreshServerData]);

  // Admin/atendente desfaz a baixa: o pedido volta ao estado anterior e a marca de concluído some
  const revertCompletedMark = useCallback(async (markId: string): Promise<boolean> => {
    const mark = completedWaypointMarks.find(m => m.id === markId);
    if (!mark) return false;
    const pedidoId = mark.orderId.match(/pedido-(\d+)/)?.[1] || mark.orderCode?.match(/(\d+)/)?.[1] || mark.orderId.match(/\d+/)?.[0];
    if (!pedidoId) return false;
    const res: any = await api.reverterBaixa(pedidoId, mark.operationType);
    if (!res?.success) {
      console.warn('[Reverter baixa]', res?.message);
      return false;
    }
    setCompletedWaypointMarks(prev => {
      const next = prev.filter(m => !(
        (m.orderId.match(/pedido-(\d+)/)?.[1] || m.orderId) === pedidoId && m.operationType === mark.operationType
      ));
      try {
        localStorage.setItem('encomendaszap_completed_marks', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    refreshServerData();
    return true;
  }, [completedWaypointMarks, refreshServerData]);

  const stopUserTracking = useCallback(() => {
    setIsTrackingUser(false);
    setIsLocating(false);
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const toggleUserTracking = useCallback(() => {
    if (isTrackingUser) {
      stopUserTracking();
      return;
    }

    setIsLocating(true);
    setIsTrackingUser(true);

    const trackingZoom = 18;

    // Se já tiver coordenadas reais confirmadas do navegador, voa até elas
    if (userLocation && hasRealGpsFix) {
      flyToLocation(userLocation, trackingZoom);
    }

    acquireBestPosition(
      (coords) => {
        setHasRealGpsFix(true);
        setUserLocation(coords);
        setCurrentCoords(coords);
        flyToLocation(coords, trackingZoom);
        saveLocationToStorage(coords, trackingZoom);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        if (userLocation && hasRealGpsFix) {
          flyToLocation(userLocation, trackingZoom);
        }
      }
    );

    // Clear any prior watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    // Set up continuous watch with automatic degradation from high to low accuracy on error
    let activeHighAccuracy = true;
    const startActiveWatcher = (highAccuracy: boolean) => {
      try {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const liveCoords: LocationCoordinates = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              heading: position.coords.heading,
              speed: position.coords.speed,
              timestamp: position.timestamp || Date.now()
            };
            setUserLocation(liveCoords);
            setCurrentCoords(liveCoords);
            saveLocationToStorage(liveCoords, mapInstance ? mapInstance.getZoom() : trackingZoom);
            setIsLocating(false);
            setGpsError(null);
          },
          (error) => {
            console.warn('Active geolocation tracking notice:', error);
            if (activeHighAccuracy && (error.code === 3 || error.code === 2)) {
              activeHighAccuracy = false;
              startActiveWatcher(false);
            }
          },
          highAccuracy
            ? { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
            : { enableHighAccuracy: false, maximumAge: 10000, timeout: 30000 }
        );
      } catch (e) {
        console.warn('Erro ao configurar watcher ativo:', e);
      }
    };

    startActiveWatcher(true);
  }, [isTrackingUser, userLocation, stopUserTracking, flyToLocation, mapInstance, acquireBestPosition]);

  const locateUser = useCallback(() => {
    toggleUserTracking();
  }, [toggleUserTracking]);

  const viewAllMarkers = useCallback(() => {
    if (!mapInstance) return;

    // Se estiver seguindo a posição GPS, desativa para manter a visualização em todas as makers
    stopUserTracking();

    // Agrupa todas as makers ativas (allPlaces + savedPlaces)
    const placesMap = new Map<string, Place>();
    (allPlaces || []).forEach(p => placesMap.set(p.id, p));
    (savedPlaces || []).forEach(p => placesMap.set(p.id, p));

    const validPlaces = Array.from(placesMap.values()).filter(p => 
      p.coordinates &&
      typeof p.coordinates.lat === 'number' &&
      typeof p.coordinates.lng === 'number' &&
      !isNaN(p.coordinates.lat) &&
      !isNaN(p.coordinates.lng) &&
      p.coordinates.lat !== 0 &&
      p.coordinates.lng !== 0
    );

    if (validPlaces.length === 0) {
      if (userLocation) {
        mapInstance.flyTo([userLocation.lat, userLocation.lng], 15, { animate: true, duration: 1 });
      } else if (currentCoords) {
        mapInstance.flyTo([currentCoords.lat, currentCoords.lng], 14, { animate: true, duration: 1 });
      }
      return;
    }

    if (validPlaces.length === 1) {
      const single = validPlaces[0];
      mapInstance.flyTo([single.coordinates.lat, single.coordinates.lng], 16, { animate: true, duration: 1.2 });
      return;
    }

    const lats = validPlaces.map(p => p.coordinates.lat);
    const lngs = validPlaces.map(p => p.coordinates.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    if (minLat === maxLat && minLng === maxLng) {
      mapInstance.flyTo([minLat, minLng], 16, { animate: true, duration: 1.2 });
    } else {
      mapInstance.fitBounds(
        [
          [minLat, minLng],
          [maxLat, maxLng]
        ],
        {
          padding: [70, 70],
          maxZoom: 16,
          animate: true,
          duration: 1.2
        }
      );
    }
  }, [mapInstance, allPlaces, savedPlaces, userLocation, currentCoords, stopUserTracking]);

  const retryGps = useCallback(() => {
    setGpsError(null);
    setIsLocating(true);
    acquireBestPosition(
      (coords) => {
        setUserLocation(coords);
        setCurrentCoords(coords);
        flyToLocation(coords, 18);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      }
    );
  }, [acquireBestPosition, flyToLocation]);

  const addToHistory = useCallback((item: { query: string; placeName?: string; coordinates?: LocationCoordinates }) => {
    recordPlaceUsage({
      id: `hist-${Date.now()}`,
      name: item.query,
      address: item.placeName || item.query,
      coordinates: item.coordinates || { lat: -16.6869, lng: -49.2648 }
    });

    setSearchHistory(prev => [
      {
        id: `hist-${Date.now()}`,
        query: item.query,
        placeName: item.placeName,
        coordinates: item.coordinates,
        timestamp: Date.now()
      },
      ...prev.filter(h => h.query.toLowerCase() !== item.query.toLowerCase()).slice(0, 19)
    ]);
  }, []);

  const clearHistory = useCallback(() => {
    setSearchHistory([]);
  }, []);

  const toggleSavePlace = useCallback((place: Place) => {
    setSavedPlaces(prev => {
      const exists = prev.some(p => p.id === place.id);
      if (exists) {
        return prev.filter(p => p.id !== place.id);
      } else {
        return [...prev, place];
      }
    });
  }, []);

  const isPlaceSaved = useCallback((placeId: string) => {
    return savedPlaces.some(p => p.id === placeId);
  }, [savedPlaces]);

  const deletePlace = useCallback(async (placeId: string): Promise<boolean> => {
    if (currentRole === 'motorista') {
      console.warn('[MapContext.deletePlace] Motoristas não possuem permissão para excluir pedidos.');
      return false;
    }

    setAllPlaces(prev => {
      const next = prev.filter(p => p.id !== placeId);
      try {
        localStorage.setItem('encomendaszap_all_places', JSON.stringify(next));
      } catch {}
      return next;
    });

    setSavedPlaces(prev => {
      const next = prev.filter(p => p.id !== placeId);
      try {
        localStorage.setItem('encomendaszap_saved_places', JSON.stringify(next));
      } catch {}
      return next;
    });

    setSelectedPlace(prev => (prev?.id === placeId ? null : prev));

    try {
      await api.deletePedido(placeId);
    } catch (err) {
      console.warn('[MapContext.deletePlace] Erro ao excluir pedido na API:', err);
    }

    return true;
  }, [currentRole]);

  const updateUser = useCallback((updated: Partial<UserProfile>) => {
    setUser(prev => {
      const next = { ...prev, ...updated };
      if (updated.avatarUrl) {
        try {
          if (!updated.avatarUrl.startsWith('data:') || updated.avatarUrl.length < 100000) {
            localStorage.setItem('encomendaszap_user_avatar', updated.avatarUrl);
            const loggedStr = localStorage.getItem('encomendaszap_logged_account');
            if (loggedStr) {
              const acc = JSON.parse(loggedStr);
              acc.avatarUrl = updated.avatarUrl;
              localStorage.setItem('encomendaszap_logged_account', JSON.stringify(acc));
            }
          }
        } catch {}
      }
      return next;
    });
  }, []);

  return (
    <MapContext.Provider
      value={{
        mapInstance,
        setMapInstance,
        currentCoords,
        selectedPlace,
        setSelectedPlace,
        mapLayer,
        setMapLayer,
        mapTheme,
        setMapTheme,
        showTraffic,
        setShowTraffic,
        isSidebarOpen,
        setIsSidebarOpen,
        isProfileOpen,
        setIsProfileOpen,
        isLoginModalOpen,
        setIsLoginModalOpen,
        isRegisterModalOpen,
        setIsRegisterModalOpen,
        isAdminSettingsOpen,
        setIsAdminSettingsOpen,
        isAdminUsersOpen,
        setIsAdminUsersOpen,
        isCustomerListOpen,
        setIsCustomerListOpen,
        openCustomerList,
        closeCustomerList,
        isOrdersModalOpen,
        routeSelectMode,
        routeSelectedIds,
        startRouteSelection,
        cancelRouteSelection,
        toggleRouteSelection,
        isRoutePickerOpen,
        setIsRoutePickerOpen,
        setIsOrdersModalOpen,
        openOrdersModal,
        closeOrdersModal,
        dateRangeFilter,
        setDateRangeFilter,
        clearDateRangeFilter,
        isCalendarModalOpen,
        setIsCalendarModalOpen,
        openCalendarModal,
        closeCalendarModal,
        isNewOrderModalOpen,
        setIsNewOrderModalOpen,
        newOrderInitialPlace,
        openNewOrderForm,
        addNewOrder,
        viewingPhotoUrl,
        setViewingPhotoUrl,
        viewingPhotoPlace,
        setViewingPhotoPlace,
        openPhotoViewer,
        closePhotoViewer,
        isDriverOnline,
        setIsDriverOnline,
        driverActiveSeconds,
        currentRole,
        setCurrentRole,
        isAuthenticated,
        loginWithAccount,
        logout,
        searchQuery,
        setSearchQuery,
        searchHistory,
        addToHistory,
        clearHistory,
        activeRoute,
        setActiveRoute,
        calculateRouteToPlace,
        calculateOrderRoute,
        clearActiveRoute,
        defaultNavApp,
        setDefaultNavApp,
        user,
        updateUser,
        userRequiredFields,
        updateUserRequiredFields,
        savedPlaces,
        allPlaces,
        completedOrders,
        completedWaypointMarks,
        revertCompletedMark,
        completePlaceWaypoint,
        resetWorkflowToColetas,
        updatePlaceDetails,
        customers,
        addCustomer,
        persistCustomer,
        updateCustomer,
        deleteCustomer,
        customerLocationModalData,
        openCustomerLocationModal,
        closeCustomerLocationModal,
        assignPlaceToDriver,
        claimPublicOrder,
        toggleSavePlace,
        isPlaceSaved,
        deletePlace,
        drivers,
        selectedDriver,
        setSelectedDriver,
        vehicleFilter,
        setVehicleFilter,
        operationFilter,
        setOperationFilter,
        operationsFilter,
        toggleOperationFilter,
        setAllOperationsFilter,
        flyToLocation,
        locateUser,
        viewAllMarkers,
        isLocating,
        userLocation,
        isTrackingUser,
        toggleUserTracking,
        stopUserTracking,
        dismissPlaceProximity,
        hasRealGpsFix,
        gpsAccuracy,
        gpsError,
        clearGpsError,
        retryGps,

        // Integração com Servidor Express
        serverStatus,
        serverMessage,
        serverLatencyMs,
        apiBaseUrl: apiBaseUrlState,
        updateApiBaseUrl,
        refreshServerData,
        isSyncingServer,

        // Monitoramento em Segundo Plano (PWA com tela desligada)
        backgroundTrackingStatus,
        startBackgroundGps,
        stopBackgroundGps
      }}
    >
      {children}
    </MapContext.Provider>
  );
};

export const useMapStore = () => {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapStore must be used within a MapProvider');
  }
  return context;
};
