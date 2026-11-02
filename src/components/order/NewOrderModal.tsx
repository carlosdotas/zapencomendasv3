import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  X, 
  ArrowDownToLine, 
  ArrowUpFromLine,
  Package, 
  Repeat, 
  MapPin, 
  User, 
  Phone, 
  Clock, 
  Bike, 
  Car, 
  Truck, 
  ShoppingBag, 
  Mail, 
  Check, 
  Search, 
  AlertCircle, 
  Plus, 
  BookOpen,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Navigation,
  FileText,
  DollarSign,
  Tag,
  Route,
  UserCheck,
  History,
  RotateCcw,
  Calendar,
  Layers,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  BookUser,
  AlertTriangle,
  Scale,
  Ruler,
  Minus,
  Database,
  Loader2,
  CheckCircle2,
  Compass,
  Trash2,
  Globe,
  Lock
} from 'lucide-react';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';
import { createPlaceMarkerIcon } from '../map/FullscreenMap';
import { MapLocationPickerModal } from '../map/MapLocationPickerModal';
import { MiniMapPreview } from '../map/MiniMapPreview';
import { EmbeddedLocationMapStep } from './EmbeddedLocationMapStep';
import { PhoneAgendaModal } from '../customer/PhoneAgendaModal';
import { useMapStore } from '../../context/MapContext';
import { Place, OperationType, VehicleCollectionType, PackageItemType, LocationCoordinates, OrderVisibilityType } from '../../types/map';
import { CustomerSelectorDrawer } from '../customer/CustomerSelectorDrawer';
import { CurrencyCentsInput } from '../common/CurrencyCentsInput';
import { PricingItemAddMenu } from '../common/PricingItemAddMenu';
import { 
  getPricingSettings, 
  generateDefaultPriceItems, 
  PricingSettings 
} from '../../services/pricingSettingsService';
import { CustomerFormFullScreen } from '../customer/CustomerFormFullScreen';
import { CustomerOrderHistoryFullScreen } from './CustomerOrderHistoryFullScreen';
import { Customer, AgendaContact, CustomerAddress } from '../../types/customer';
import { SellerResponsibleModal } from '../place/SellerResponsibleModal';

// Não há fonte de agenda no servidor; lista vazia (sem dados estáticos)
const AGENDA_CONTACTS: AgendaContact[] = [];
import { reverseGeocode, searchAddress } from '../../services/geocodingService';
import { fetchRoute, RouteResult } from '../../services/routingService';
import { searchDatabaseCustomersPage } from '../../services/customerSearchService';
import { checkUserCompleteness, formatTaxId } from '../../utils/userCompleteness';
import { useBackButton } from '../../hooks/useBackButton';
import { companyService } from '../../services/companyService';
import { customerOrderStatsService } from '../../services/customerOrderStatsService';
import { customersRepresentSamePerson, mergeCustomerLists, normalizeCustomerPhone } from '../../utils/customerIdentity';
import { normalizeCityName, resolveCustomerCity } from '../../utils/addressUtils';

// Mini mapa da rota usando Leaflet
import L from 'leaflet';

export interface PastOrderRecord {
  id: string;
  orderCode: string;
  dateStr: string;
  placeName?: string;
  operationType: OperationType;
  pickupAddress: string;
  pickupCoords: LocationCoordinates;
  exchangeAddress?: string;
  exchangeCoords?: LocationCoordinates;
  deliveryAddress: string;
  deliveryCoords: LocationCoordinates;
  vehicleType: VehicleCollectionType;
  packageType: string;
  volumesCount: string;
  responsibleName: string;
  responsiblePhone: string;
  sellerName?: string;
  sellerPhone?: string;
  observations: string;
  price: number;
  executionCount?: number;
  isFragile?: boolean;
  weightKg?: string;
  dimensions?: string;
  distanceKm?: number;
}

const extractCityFromAddress = (address?: string): string => {
  if (!address) return 'Goiânia';
  const match = address.match(/(?:,\s*|;\s*)([A-Za-zÀ-ÿ\s]+)\s*-\s*[A-Z]{2}/);
  if (match && match[1]) {
    return match[1].trim();
  }
  const parts = address.split('-');
  if (parts.length >= 2) {
    const citySegment = parts[parts.length - 2].split(',').pop();
    if (citySegment && citySegment.trim()) return citySegment.trim();
  }
  return 'Goiânia';
};

const DEFAULT_PICKUP_COORDS: LocationCoordinates = { lat: -16.6780, lng: -49.2590 };
const DEFAULT_DELIVERY_COORDS: LocationCoordinates = { lat: -16.7118, lng: -49.2346 };
const DEFAULT_EXCHANGE_COORDS: LocationCoordinates = { lat: -16.6990, lng: -49.2650 };
type RoutePointKey = 'pickup' | 'exchange' | 'delivery';
type RoutePointConfig = {
  visibility: OrderVisibilityType;
  driverId: string;
  sellerName: string;
  sellerPhone: string;
};

const EMPTY_ROUTE_POINT_CONFIG: RoutePointConfig = {
  visibility: 'publico',
  driverId: '',
  sellerName: '',
  sellerPhone: ''
};

export const NewOrderModal: React.FC = () => {
  const { 
    isNewOrderModalOpen, 
    setIsNewOrderModalOpen, 
    newOrderInitialPlace, 
    addOrderDraft,
    drivers,
    customers,
    user,
    currentRole,
    persistCustomer,
    updateCustomer,
    allPlaces,
    openCustomerLocationModal,
    userRequiredFields
  } = useMapStore();

  const isDriverRole = currentRole === 'motorista' || user?.userRole === 'motorista';

  // Motorista NÃO PODE nem adicionar pedidos, nem editar
  useEffect(() => {
    if (isNewOrderModalOpen && isDriverRole) {
      setIsNewOrderModalOpen(false);
    }
  }, [isNewOrderModalOpen, isDriverRole, setIsNewOrderModalOpen]);

  // Etapa atual do assistente:
  // Fluxo em 4 Etapas:
  // 1: Lista cheia de Clientes (com botão para ver últimas encomendas)
  // 2: Selecionar Tipo & Locais (com Mapa Interativo, Busca e Botões no Topo: Tipo, Agenda, Responsável e Obs)
  // 3: Detalhes de Carga (Veículo, Embalagem, Volumes, Medidas & Peso)
  // 4: Detalhes Finais (Mini-mapa, Rota, Km, Preços Discriminados, Descontos & Finalização)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Código único da encomenda atual
  const [orderCode, setOrderCode] = useState<string>('');

  // ----------------------------------------------------
  // ETAPA 1: CLIENTE
  // ----------------------------------------------------
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [clientSearchTerm, setClientSearchTerm] = useState<string>('');

  // Modal / Gaveta de Últimas Encomendas do Cliente
  const [pastOrdersCustomer, setPastOrdersCustomer] = useState<Customer | null>(null);
  const [isPastOrdersModalOpen, setIsPastOrdersModalOpen] = useState<boolean>(false);

  // Contagem de execuções acumuladas das encomendas (organizado por quantidade: o mais usado sobe!)
  const [pastOrdersUsage, setPastOrdersUsage] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_past_orders_usage_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      'mock-1': 8,
      'mock-2': 5,
      'mock-3': 2,
    };
  });

  const getOrderExecutionCount = useCallback((orderId: string): number => {
    if (pastOrdersUsage[orderId] !== undefined) {
      return pastOrdersUsage[orderId];
    }
    if (orderId.includes('mock-1')) return pastOrdersUsage['mock-1'] ?? 8;
    if (orderId.includes('mock-2')) return pastOrdersUsage['mock-2'] ?? 5;
    if (orderId.includes('mock-3')) return pastOrdersUsage['mock-3'] ?? 2;
    return 1;
  }, [pastOrdersUsage]);
  
  // ----------------------------------------------------
  // ETAPA 2: TIPO DE ENCOMENDA & LOCAIS
  // ----------------------------------------------------
  const [operationType, setOperationType] = useState<OperationType>('coleta');
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [pickupCoords, setPickupCoords] = useState<LocationCoordinates>(DEFAULT_PICKUP_COORDS);
  
  const [exchangeAddress, setExchangeAddress] = useState<string>('');
  const [exchangeCoords, setExchangeCoords] = useState<LocationCoordinates>(DEFAULT_EXCHANGE_COORDS);

  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryCoords, setDeliveryCoords] = useState<LocationCoordinates>(DEFAULT_DELIVERY_COORDS);

  // Contato e Observação do Responsável na Coleta (OBRIGATÓRIOS)
  const [pickupContact, setPickupContact] = useState<string>('');
  const [pickupPhone, setPickupPhone] = useState<string>('');
  const [pickupNotes, setPickupNotes] = useState<string>('');

  // Contato e Observação do Responsável na Entrega (OBRIGATÓRIOS)
  const [deliveryContact, setDeliveryContact] = useState<string>('');
  const [deliveryPhone, setDeliveryPhone] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');

  // Contato e Observação do Responsável na Troca (OBRIGATÓRIOS)
  const [exchangeContact, setExchangeContact] = useState<string>('');
  const [exchangePhone, setExchangePhone] = useState<string>('');
  const [exchangeNotes, setExchangeNotes] = useState<string>('');

  // Agendamento de Data e Hora por Local (Data atual padrão obrigatória; Hora opcional com Até / Após)
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [pickupDate, setPickupDate] = useState<string>(getTodayDateString());
  const [pickupTime, setPickupTime] = useState<string>('');
  const [pickupTimeMode, setPickupTimeMode] = useState<'ate' | 'apos'>('ate');

  const [deliveryDate, setDeliveryDate] = useState<string>(getTodayDateString());
  const [deliveryTime, setDeliveryTime] = useState<string>('');
  const [deliveryTimeMode, setDeliveryTimeMode] = useState<'ate' | 'apos'>('ate');

  const [exchangeDate, setExchangeDate] = useState<string>(getTodayDateString());
  const [exchangeTime, setExchangeTime] = useState<string>('');
  const [exchangeTimeMode, setExchangeTimeMode] = useState<'ate' | 'apos'>('ate');

  // Controle do Modal de Seleção no Mapa em Tela Cheia
  const [mapPickerTarget, setMapPickerTarget] = useState<'coleta' | 'entrega' | 'troca' | 'cliente' | null>(null);

  // Múltiplas Localizações do Usuário (Adicionar e Selecionar outras localizações)
  const [addingLocationTarget, setAddingLocationTarget] = useState<'coleta' | 'entrega' | 'troca' | null>(null);
  const [newLocLabel, setNewLocLabel] = useState<string>('Trabalho');
  const [newLocAddress, setNewLocAddress] = useState<string>('');
  const [newLocIsPrimary, setNewLocIsPrimary] = useState<boolean>(false);

  // ----------------------------------------------------
  // ETAPA 3: TRANSPORTE, MEDIDAS, PESO E EMBALAGEM
  // ----------------------------------------------------
  // Presets de Porte: Dimensões padrão e Peso máximo de acordo com o porte do veículo
  const CARGO_SIZE_PRESETS = useMemo(() => ({
    pequeno: {
      id: 'pequeno' as const,
      label: 'Pequeno',
      vehicle: 'Moto',
      sublabel: 'Baú de Moto',
      maxWeightKg: 20,
      maxWeightText: 'Até 20 kg',
      dimensionsText: '40 × 40 × 30 cm',
      defaultWeight: '20',
      defaultLength: '40',
      defaultWidth: '40',
      defaultHeight: '30'
    },
    medio: {
      id: 'medio' as const,
      label: 'Médio',
      vehicle: 'Carro',
      sublabel: 'Porta-malas',
      maxWeightKg: 80,
      maxWeightText: 'Até 80 kg',
      dimensionsText: '90 × 80 × 50 cm',
      defaultWeight: '80',
      defaultLength: '90',
      defaultWidth: '80',
      defaultHeight: '50'
    },
    grande: {
      id: 'grande' as const,
      label: 'Grande',
      vehicle: 'Utilitário',
      sublabel: 'Fiorino / Van',
      maxWeightKg: 500,
      maxWeightText: 'Até 500 kg',
      dimensionsText: '160 × 120 × 110 cm',
      defaultWeight: '500',
      defaultLength: '160',
      defaultWidth: '120',
      defaultHeight: '110'
    }
  }), []);

  // Porte do Transporte: Pequeno (Moto), Médio (Carro), Grande (Utilitário)
  const [packageSize, setPackageSize] = useState<'pequeno' | 'medio' | 'grande'>('pequeno');
  const [vehicleType, setVehicleType] = useState<VehicleCollectionType>('moto');

  // Tipos de encomenda personalizáveis salvos no navegador (localStorage)
  const DEFAULT_PACKAGE_TYPES = useMemo(() => [
    'Documento', 
    'Envelope', 
    'Caixa', 
    'Caixa Frágil', 
    'Pneu', 
    'Peça Automotiva', 
    'Alimento', 
    'Medicamento', 
    'Eletrônico'
  ], []);

  const [packageTypeList, setPackageTypeList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_custom_package_types');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.some((p: string) => p.toLowerCase().includes('cilindro'))) {
            parsed.splice(4, 0, 'Cilindro');
          }
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return [
      'Documento', 
      'Envelope', 
      'Caixa', 
      'Caixa Frágil', 
      'Cilindro',
      'Pneu', 
      'Peça Automotiva', 
      'Alimento', 
      'Medicamento', 
      'Eletrônico'
    ];
  });

  const [selectedPackageType, setSelectedPackageType] = useState<string>('Envelope');
  // Suporte a múltiplos tipos de volumes selecionados (ex: Cilindro + Caixa)
  const [selectedPackageTypes, setSelectedPackageTypes] = useState<string[]>(['Envelope']);
  const [isMultiTypeMode, setIsMultiTypeMode] = useState<boolean>(false);
  const [isAddingNewPackageType, setIsAddingNewPackageType] = useState<boolean>(false);
  const [newPackageTypeInput, setNewPackageTypeInput] = useState<string>('');

  // Opção se a carga é frágil
  const [isFragile, setIsFragile] = useState<boolean>(false);

  // Medidas e peso inicializados com os padrões do porte Pequeno (Moto - 20kg / 40x40x30cm)
  const [weightKg, setWeightKg] = useState<string>('20');
  const [lengthCm, setLengthCm] = useState<string>('40');
  const [widthCm, setWidthCm] = useState<string>('40');
  const [heightCm, setHeightCm] = useState<string>('30');

  const [volumesCount, setVolumesCount] = useState<string>('1 volume');

  // Quantidade numérica de volumes com suporte a botões [+] / [-] e digitação livre
  const [volumeQuantity, setVolumeQuantity] = useState<number>(1);
  const [volumeQuantityInput, setVolumeQuantityInput] = useState<string>('1');

  const handleUpdateVolumeQuantity = (num: number) => {
    const valid = Math.max(1, Math.min(999, num));
    setVolumeQuantity(valid);
    setVolumeQuantityInput(String(valid));
    setVolumesCount(`${valid} ${valid === 1 ? 'volume' : 'volumes'}`);

    // Se houver cilindro selecionado e múltiplos volumes, sugerir ou adequar porte se for pequeno
    const hasCilindro = selectedPackageTypes.some(t => t.toLowerCase().includes('cilindro'));
    if (hasCilindro && valid > 1 && packageSize === 'pequeno') {
      handleSelectPackageSize('medio');
    }
  };

  const handleVolumeInputChange = (val: string) => {
    setVolumeQuantityInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const valid = Math.min(999, parsed);
      setVolumeQuantity(valid);
      setVolumesCount(`${valid} ${valid === 1 ? 'volume' : 'volumes'}`);

      const hasCilindro = selectedPackageTypes.some(t => t.toLowerCase().includes('cilindro'));
      if (hasCilindro && valid > 1 && packageSize === 'pequeno') {
        handleSelectPackageSize('medio');
      }
    }
  };

  const handleVolumeInputBlur = () => {
    const parsed = parseInt(volumeQuantityInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      handleUpdateVolumeQuantity(1);
    } else {
      handleUpdateVolumeQuantity(parsed);
    }
  };

  // Sincroniza se o volumesCount mudar externamente (ex: carregar pedido anterior)
  useEffect(() => {
    const match = volumesCount.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num) && num > 0) {
        setVolumeQuantity(num);
        setVolumeQuantityInput(String(num));
      }
    }
  }, [volumesCount]);

  // Responsável (Preenchido automaticamente a partir da Coleta/Entrega)
  const [responsibleName, setResponsibleName] = useState<string>('Central EncomendasZap');
  const [responsiblePhone, setResponsiblePhone] = useState<string>('(62) 3999-8800');

  // Observações
  const [observations, setObservations] = useState<string>('');

  // Controle de acordions na etapa de Volume e Carga (fechados por padrão)
  const [openCargoAccordions, setOpenCargoAccordions] = useState<Record<string, boolean>>({
    types: false,
    volumes: false,
    dimensions: false,
    notes: false
  });

  const toggleCargoAccordion = (key: string) => {
    setOpenCargoAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSelectPackageSize = (size: 'pequeno' | 'medio' | 'grande', syncMeasurements = true) => {
    setPackageSize(size);
    if (size === 'pequeno') {
      setVehicleType('moto');
    } else if (size === 'medio') {
      setVehicleType('carro');
    } else if (size === 'grande') {
      setVehicleType('utilitario');
    }

    if (syncMeasurements) {
      const preset = CARGO_SIZE_PRESETS[size];
      if (preset) {
        setWeightKg(preset.defaultWeight);
        setLengthCm(preset.defaultLength);
        setWidthCm(preset.defaultWidth);
        setHeightCm(preset.defaultHeight);
      }
    }
  };

  // Limpar todas as medidas e peso (deixar sem nada)
  const handleClearMeasurements = () => {
    setWeightKg('');
    setLengthCm('');
    setWidthCm('');
    setHeightCm('');
  };

  // Restaurar medidas e peso para o padrão do porte selecionado
  const handleResetMeasurementsToDefault = () => {
    const preset = CARGO_SIZE_PRESETS[packageSize];
    if (preset) {
      setWeightKg(preset.defaultWeight);
      setLengthCm(preset.defaultLength);
      setWidthCm(preset.defaultWidth);
      setHeightCm(preset.defaultHeight);
    }
  };

  const applyPackageTypeRules = (types: string[]) => {
    const hasFragile = types.some(t => {
      const lower = t.toLowerCase();
      return lower.includes('frágil') || lower.includes('fragil') || lower.includes('vidro') || lower.includes('sensível');
    });
    if (hasFragile) setIsFragile(true);

    const hasPneu = types.some(t => t.toLowerCase().includes('pneu'));
    const hasCilindro = types.some(t => t.toLowerCase().includes('cilindro'));
    if (hasPneu || (hasCilindro && volumeQuantity > 1)) {
      handleSelectPackageSize('grande');
    } else if (hasCilindro) {
      if (packageSize === 'pequeno') handleSelectPackageSize('medio');
    } else if (types.length === 1 && (types[0] === 'Documento' || types[0] === 'Envelope')) {
      handleSelectPackageSize('pequeno');
    }
  };

  const handleSelectPackageType = (type: string) => {
    setSelectedPackageType(type);
    setSelectedPackageTypes([type]);
    applyPackageTypeRules([type]);
  };

  const handleTogglePackageType = (type: string) => {
    let next: string[];
    if (selectedPackageTypes.includes(type)) {
      if (selectedPackageTypes.length <= 1) {
        next = [type];
      } else {
        next = selectedPackageTypes.filter(t => t !== type);
      }
    } else {
      next = [...selectedPackageTypes, type];
    }
    setSelectedPackageTypes(next);
    setSelectedPackageType(next.join(' + '));
    applyPackageTypeRules(next);
  };

  const handleSaveNewPackageType = () => {
    const trimmed = newPackageTypeInput.trim();
    if (!trimmed) return;

    if (!packageTypeList.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...packageTypeList, trimmed];
      setPackageTypeList(updated);
      try {
        localStorage.setItem('encomendaszap_custom_package_types', JSON.stringify(updated));
      } catch (err) {
        console.error('Erro salvando tipos de pacote:', err);
      }
    }

    handleSelectPackageType(trimmed);
    setNewPackageTypeInput('');
    setIsAddingNewPackageType(false);
  };

  // ----------------------------------------------------
  // ETAPA 4: ROTA, QUILOMETRAGEM, PREÇO E DESCONTO
  // ----------------------------------------------------
  const [calculatedRoute, setCalculatedRoute] = useState<RouteResult | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>(() => getPricingSettings());

  useEffect(() => {
    const handleSettingsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<PricingSettings>;
      if (customEvent.detail) {
        setPricingSettings(customEvent.detail);
      } else {
        setPricingSettings(getPricingSettings());
      }
    };
    window.addEventListener('pricing_settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('pricing_settings_updated', handleSettingsUpdated);
  }, []);

  // Preços discriminados ou frete único editáveis e descontos na etapa final
  const [priceItems, setPriceItems] = useState<Array<{
    id: string;
    name: string;
    value: number;
    category?: 'coleta' | 'transporte' | 'entrega' | 'extra';
    isRemovable?: boolean;
  }>>(() => generateDefaultPriceItems('coleta', 0));

  const [discountItems, setDiscountItems] = useState<{
    id: string;
    name: string;
    value: number;
    isRemovable?: boolean;
  }[]>([
    { id: 'desc-principal', name: 'Desconto Comercial', value: 0, isRemovable: false }
  ]);

  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [routePointConfigs, setRoutePointConfigs] = useState<Record<RoutePointKey, RoutePointConfig>>({
    pickup: { ...EMPTY_ROUTE_POINT_CONFIG },
    exchange: { ...EMPTY_ROUTE_POINT_CONFIG },
    delivery: { ...EMPTY_ROUTE_POINT_CONFIG }
  });
  const [sellerEditPoint, setSellerEditPoint] = useState<RoutePointKey | null>(null);
  const miniMapContainerRef = useRef<HTMLDivElement>(null);
  const miniMapInstanceRef = useRef<L.Map | null>(null);

  const updateRoutePointConfig = (point: RoutePointKey, update: Partial<RoutePointConfig>) => {
    setRoutePointConfigs(previous => ({
      ...previous,
      [point]: { ...previous[point], ...update }
    }));
  };

  const selectedCustomerHasLocation = Boolean(
    selectedCustomer?.coordinates?.lat &&
    selectedCustomer.coordinates.lng &&
    selectedCustomer.address?.trim()
  );

  // Estados de erro por etapa
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  // Modais de suporte: Drawer de seleção de responsável e Tela Cheia de cadastro
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [selectorTargetField, setSelectorTargetField] = useState<'client' | 'responsible'>('client');
  const [isRegistrationFullScreenOpen, setIsRegistrationFullScreenOpen] = useState(false);
  const [registrationInitialData, setRegistrationInitialData] = useState<Partial<Customer> | AgendaContact | null>(null);

  // Agenda de Contatos do Telefone / Celular (para Coleta, Entrega e Troca)
  const [isPhoneAgendaOpen, setIsPhoneAgendaOpen] = useState(false);
  const [phoneAgendaTarget, setPhoneAgendaTarget] = useState<'coleta' | 'entrega' | 'troca'>('coleta');

  const handleSelectPhoneAgendaContact = (contact: { name: string; phone: string }) => {
    if (phoneAgendaTarget === 'coleta') {
      setPickupContact(contact.name);
      setPickupPhone(contact.phone);
      setStepErrors(prev => {
        const next = { ...prev };
        delete next.pickupContact;
        return next;
      });
    } else if (phoneAgendaTarget === 'entrega') {
      setDeliveryContact(contact.name);
      setDeliveryPhone(contact.phone);
      setStepErrors(prev => {
        const next = { ...prev };
        delete next.deliveryContact;
        return next;
      });
    } else if (phoneAgendaTarget === 'troca') {
      setExchangeContact(contact.name);
      setExchangePhone(contact.phone);
      setStepErrors(prev => {
        const next = { ...prev };
        delete next.exchangeContact;
        return next;
      });
    }
    setIsPhoneAgendaOpen(false);
  };

  // ========================================================
  // NAVEGAÇÃO DE RETORNO DO ANDROID NO ASSISTENTE DE ENCOMENDAS
  // Fecha sub-janelas internas primeiro; depois volta etapas (4->3->2->1); por fim fecha o modal
  // ========================================================
  useBackButton('order-phone-agenda', isPhoneAgendaOpen, () => {
    setIsPhoneAgendaOpen(false);
  }, 100);

  useBackButton('order-customer-form', isRegistrationFullScreenOpen, () => {
    setIsRegistrationFullScreenOpen(false);
  }, 100);

  useBackButton('order-past-orders', isPastOrdersModalOpen, () => {
    setIsPastOrdersModalOpen(false);
  }, 100);

  useBackButton('order-customer-selector', isCustomerSelectorOpen, () => {
    setIsCustomerSelectorOpen(false);
  }, 95);

  useBackButton('order-map-picker', !!mapPickerTarget, () => {
    setMapPickerTarget(null);
  }, 95);

  useBackButton('order-adding-location', !!addingLocationTarget, () => {
    setAddingLocationTarget(null);
  }, 95);

  // Navegação de passos do NewOrderModal (Etapa 4 -> 3 -> 2 -> 1 -> Fechar Modal)
  useBackButton('order-modal-step', isNewOrderModalOpen, () => {
    if (currentStep > 1) {
      setCurrentStep(prev => (prev - 1) as any);
      return 'keep_open';
    } else {
      setIsNewOrderModalOpen(false);
      return 'closed';
    }
  }, 85);

  // Lista de clientes mais recente sem reiniciar o formulário a cada sincronização em segundo plano
  const customersRef = useRef(customers);
  customersRef.current = customers;

  // Inicializa a encomenda ao abrir o modal
  useEffect(() => {
    if (isNewOrderModalOpen) {
      setOrderCode(`ZAP-${Math.floor(1000 + Math.random() * 9000)}`);
      setCurrentStep(1);
      setStepErrors({});
      setClientSearchTerm('');
      setDiscountAmount(0);
      setObservations('');
      setOpenCargoAccordions({
        types: false,
        volumes: false,
        dimensions: false,
        notes: false
      });
      setPastOrdersCustomer(null);
      setIsPastOrdersModalOpen(false);
      setMapPickerTarget(null);
      setSellerEditPoint(null);
      setRoutePointConfigs({
        pickup: {
          visibility: newOrderInitialPlace?.pickupVisibility || newOrderInitialPlace?.orderVisibility || 'publico',
          driverId: newOrderInitialPlace?.pickupAssignedDriverId ?? newOrderInitialPlace?.assignedDriverId ?? '',
          sellerName: newOrderInitialPlace?.pickupSellerName || '',
          sellerPhone: newOrderInitialPlace?.pickupSellerPhone || ''
        },
        exchange: {
          visibility: newOrderInitialPlace?.exchangeVisibility || newOrderInitialPlace?.orderVisibility || 'publico',
          driverId: newOrderInitialPlace?.exchangeAssignedDriverId || '',
          sellerName: newOrderInitialPlace?.exchangeSellerName || '',
          sellerPhone: newOrderInitialPlace?.exchangeSellerPhone || ''
        },
        delivery: {
          visibility: newOrderInitialPlace?.deliveryVisibility || newOrderInitialPlace?.orderVisibility || 'publico',
          driverId: newOrderInitialPlace?.deliveryAssignedDriverId ?? newOrderInitialPlace?.assignedDriverId ?? '',
          sellerName: newOrderInitialPlace?.deliverySellerName || '',
          sellerPhone: newOrderInitialPlace?.deliverySellerPhone || ''
        }
      });

      if (newOrderInitialPlace) {
        const addr = newOrderInitialPlace.address || newOrderInitialPlace.name || '';
        const coords = newOrderInitialPlace.coordinates || { lat: -16.7118, lng: -49.2346 };
        const opType = newOrderInitialPlace.operationType || 'coleta';
        
        setOperationType(opType);

        if (opType === 'coleta') {
          setPickupAddress(addr);
          setPickupCoords(coords);
          setDeliveryAddress('');
          setDeliveryCoords(DEFAULT_DELIVERY_COORDS);
          setExchangeAddress('');
          setExchangeCoords(DEFAULT_EXCHANGE_COORDS);
        } else if (opType === 'entrega') {
          setDeliveryAddress(addr);
          setDeliveryCoords(coords);
          setPickupAddress('');
          setPickupCoords(DEFAULT_PICKUP_COORDS);
          setExchangeAddress('');
          setExchangeCoords(DEFAULT_EXCHANGE_COORDS);
        } else if (opType === 'troca') {
          setExchangeAddress(addr);
          setExchangeCoords(coords);
          setPickupAddress('');
          setPickupCoords(DEFAULT_PICKUP_COORDS);
          setDeliveryAddress('');
          setDeliveryCoords(DEFAULT_DELIVERY_COORDS);
        }

        setPickupAddress(newOrderInitialPlace.pickupAddress || (opType === 'coleta' ? addr : ''));
        setPickupCoords(newOrderInitialPlace.pickupCoordinates || DEFAULT_PICKUP_COORDS);
        setPickupContact(newOrderInitialPlace.pickupContact || '');
        setPickupPhone(newOrderInitialPlace.pickupPhone || '');
        setPickupNotes(newOrderInitialPlace.pickupNotes || '');
        setDeliveryAddress(newOrderInitialPlace.deliveryAddress || (opType === 'entrega' ? addr : ''));
        setDeliveryCoords(newOrderInitialPlace.deliveryCoordinates || DEFAULT_DELIVERY_COORDS);
        setDeliveryContact(newOrderInitialPlace.deliveryContact || '');
        setDeliveryPhone(newOrderInitialPlace.deliveryPhone || '');
        setDeliveryNotes(newOrderInitialPlace.deliveryNotes || '');
        setExchangeAddress(newOrderInitialPlace.exchangeAddress || (opType === 'troca' ? addr : ''));
        setExchangeCoords(newOrderInitialPlace.exchangeCoordinates || DEFAULT_EXCHANGE_COORDS);
        setExchangeContact(newOrderInitialPlace.exchangeContact || '');
        setExchangePhone(newOrderInitialPlace.exchangePhone || '');
        setExchangeNotes(newOrderInitialPlace.exchangeNotes || '');

        if (newOrderInitialPlace.customerName) {
          const found = customersRef.current.find(c => c.fullName.toLowerCase() === newOrderInitialPlace.customerName?.toLowerCase());
          if (found) {
            setSelectedCustomer(found);
          }
        }
      } else {
        setOperationType('coleta');
        setPickupAddress('');
        setPickupCoords(DEFAULT_PICKUP_COORDS);
        setPickupContact('');
        setPickupPhone('');
        setPickupNotes('');

        setDeliveryAddress('');
        setDeliveryCoords(DEFAULT_DELIVERY_COORDS);
        setDeliveryContact('');
        setDeliveryPhone('');
        setDeliveryNotes('');

        setExchangeAddress('');
        setExchangeCoords(DEFAULT_EXCHANGE_COORDS);
        setExchangeContact('');
        setExchangePhone('');
        setExchangeNotes('');
      }
    }
  }, [isNewOrderModalOpen, newOrderInitialPlace]);

  // Normalização de texto sem acentos para busca flexível
  const normalize = (val: string) => 
    val.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const cleanSearch = normalize(clientSearchTerm.trim());
  const cleanDigits = clientSearchTerm.replace(/\D/g, '');

  // Filtra em ambos e organiza por ordem de quem tem mais pedidos (decrescente)
  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (cleanSearch || cleanDigits) {
      result = customers.filter(c => {
        const normName = normalize(c.fullName || '');
        const normAddr = normalize(c.address || '');
        const normCity = normalize(c.city || c.cidade || extractCityFromAddress(c.address) || '');
        const normNotes = normalize(c.notes || '');
        const digitsPhone = (c.phone || '').replace(/\D/g, '');
        const digitsCpf = (c.cpf || '').replace(/\D/g, '');

        const matchText = Boolean(cleanSearch && (
          normName.includes(cleanSearch) || 
          normAddr.includes(cleanSearch) || 
          normCity.includes(cleanSearch) ||
          normNotes.includes(cleanSearch)
        ));
        const matchDigits = Boolean(cleanDigits && (digitsPhone.includes(cleanDigits) || digitsCpf.includes(cleanDigits)));

        return matchText || matchDigits;
      });
    }
    return customerOrderStatsService.sortCustomersByOrderCount(result);
  }, [customers, cleanSearch, cleanDigits]);

  const filteredAgenda = useMemo(() => {
    if (!cleanSearch && !cleanDigits) return AGENDA_CONTACTS;
    return AGENDA_CONTACTS.filter(a => {
      const normName = normalize(a.name || '');
      const normAddr = normalize(a.address || '');
      const normCity = normalize(extractCityFromAddress(a.address) || '');
      const normNotes = normalize(a.notes || '');
      const digitsPhone = (a.phone || '').replace(/\D/g, '');

      const matchText = Boolean(cleanSearch && (
        normName.includes(cleanSearch) || 
        normAddr.includes(cleanSearch) || 
        normCity.includes(cleanSearch) ||
        normNotes.includes(cleanSearch)
      ));
      const matchDigits = Boolean(cleanDigits && digitsPhone.includes(cleanDigits));

      return matchText || matchDigits;
    });
  }, [cleanSearch, cleanDigits]);

  // Busca dinâmica e otimizada no banco de dados com debounce e cache instantâneo:
  const [dbCustomers, setDbCustomers] = useState<Customer[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState<boolean>(false);
  const [dbCustomersCursor, setDbCustomersCursor] = useState<string | undefined>();
  const [hasMoreDbCustomers, setHasMoreDbCustomers] = useState(false);
  const [isLoadingMoreDbCustomers, setIsLoadingMoreDbCustomers] = useState(false);
  const databaseScrollRef = useRef<HTMLDivElement>(null);
  const databaseSentinelRef = useRef<HTMLDivElement>(null);
  const databaseLoadingRef = useRef(false);
  const databaseSearchSequenceRef = useRef(0);

  useEffect(() => {
    const term = clientSearchTerm.trim();
    const requestSequence = ++databaseSearchSequenceRef.current;
    if (!term || term.length < 2) {
      setDbCustomers([]);
      setDbCustomersCursor(undefined);
      setHasMoreDbCustomers(false);
      setIsSearchingDb(false);
      return;
    }

    setIsSearchingDb(true);
    const timer = setTimeout(async () => {
      try {
        const page = await searchDatabaseCustomersPage(term, undefined, 30);
        if (requestSequence !== databaseSearchSequenceRef.current) return;
        const filteredDb = page.customers.filter(customer =>
          !customersRef.current.some(local => customersRepresentSamePerson(local, customer))
        );
        setDbCustomers(customerOrderStatsService.sortCustomersByOrderCount(filteredDb));
        setDbCustomersCursor(page.cursor);
        setHasMoreDbCustomers(page.hasMore);
      } catch (err) {
        console.warn('Erro ao consultar banco de dados:', err);
      } finally {
        if (requestSequence === databaseSearchSequenceRef.current) setIsSearchingDb(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [clientSearchTerm]);

  const loadMoreDatabaseCustomers = useCallback(async () => {
    const term = clientSearchTerm.trim();
    const cursor = dbCustomersCursor;
    if (!term || !cursor || !hasMoreDbCustomers || databaseLoadingRef.current || isLoadingMoreDbCustomers) return;

    const requestSequence = databaseSearchSequenceRef.current;
    databaseLoadingRef.current = true;
    setIsLoadingMoreDbCustomers(true);
    try {
      const page = await searchDatabaseCustomersPage(term, cursor, 30);
      if (requestSequence !== databaseSearchSequenceRef.current) return;
      const filteredDb = page.customers.filter(customer =>
        !customersRef.current.some(local => customersRepresentSamePerson(local, customer))
      );
      setDbCustomers(prev => customerOrderStatsService.sortCustomersByOrderCount(
        mergeCustomerLists(prev, filteredDb)
      ));
      setDbCustomersCursor(page.cursor);
      setHasMoreDbCustomers(page.hasMore);
    } catch (error) {
      console.warn('Erro ao carregar mais clientes do banco:', error);
      setHasMoreDbCustomers(false);
    } finally {
      databaseLoadingRef.current = false;
      if (requestSequence === databaseSearchSequenceRef.current) setIsLoadingMoreDbCustomers(false);
    }
  }, [clientSearchTerm, dbCustomersCursor, hasMoreDbCustomers, isLoadingMoreDbCustomers]);

  useEffect(() => {
    if (currentStep !== 1 || !hasMoreDbCustomers || isSearchingDb || isLoadingMoreDbCustomers) return;
    const root = databaseScrollRef.current;
    const sentinel = databaseSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMoreDatabaseCustomers();
    }, { root, rootMargin: '180px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentStep, hasMoreDbCustomers, isLoadingMoreDbCustomers, isSearchingDb, loadMoreDatabaseCustomers]);

  // Validação estrita do cliente selecionado:
  // "Se o cliente não tiver o nome completo salvo no sistema, CPF e localização, não passa para frente."
  const clientValidation = useMemo(() => {
    if (!selectedCustomer) {
      return {
        hasName: false,
        hasCpf: false,
        hasLocation: false,
        isValid: false,
        message: 'Nenhum cliente selecionado.'
      };
    }

    const hasName = Boolean(selectedCustomer.fullName && selectedCustomer.fullName.trim().split(' ').length >= 2);
    
    // Verifica CPF (11 dígitos) ou CNPJ (14 dígitos), respeitando as configurações
    const docDigits = (selectedCustomer.cpf || '').replace(/\D/g, '');
    const isDocRequired = userRequiredFields?.document !== false;
    const hasCpf = isDocRequired ? (docDigits.length === 11 || docDigits.length === 14) : true;

    // Localização completa: endereço e coordenadas geográficas válidas
    const hasLocation = Boolean(
      selectedCustomer.address && 
      selectedCustomer.address.trim().length > 3 &&
      selectedCustomer.coordinates &&
      selectedCustomer.coordinates.lat &&
      selectedCustomer.coordinates.lng
    );

    const isValid = hasName && hasCpf && hasLocation;

    let message = 'Cadastro completo e validado.';
    if (!hasName) message = 'Nome completo com sobrenome é obrigatório.';
    else if (!hasCpf) message = 'CPF de 11 dígitos (ou CNPJ de 14 dígitos) é obrigatório no cadastro.';
    else if (!hasLocation) message = 'Localização no mapa e endereço do cliente são obrigatórios.';

    return { hasName, hasCpf, hasLocation, isValid, message };
  }, [selectedCustomer, userRequiredFields]);

  // Mantém selectedCustomer e os pontos da encomenda sincronizados se o cliente for atualizado em outro modal (ex: SetCustomerLocationModal)
  useEffect(() => {
    if (!selectedCustomer) return;
    const latest = customers.find(c => c.id === selectedCustomer.id);
    if (!latest) return;
    
    const hasAddressChanged = latest.address !== selectedCustomer.address;
    const hasCoordsChanged = (
      latest.coordinates?.lat !== selectedCustomer.coordinates?.lat ||
      latest.coordinates?.lng !== selectedCustomer.coordinates?.lng
    );
    const hasInfoChanged = latest.fullName !== selectedCustomer.fullName || latest.cpf !== selectedCustomer.cpf;

    if (hasAddressChanged || hasCoordsChanged || hasInfoChanged) {
      setSelectedCustomer(latest);
      if (latest.address && latest.coordinates) {
        if (operationType === 'coleta') {
          setDeliveryAddress(latest.address);
          setDeliveryCoords(latest.coordinates);
          setDeliveryContact(latest.fullName);
          setDeliveryPhone(latest.phone);
        } else if (operationType === 'entrega') {
          setPickupAddress(latest.address);
          setPickupCoords(latest.coordinates);
          setPickupContact(latest.fullName);
          setPickupPhone(latest.phone);
        } else if (operationType === 'troca') {
          setPickupAddress(latest.address);
          setDeliveryAddress(latest.address);
          setPickupCoords(latest.coordinates);
          setDeliveryCoords(latest.coordinates);
          setPickupContact(latest.fullName);
          setDeliveryContact(latest.fullName);
          setPickupPhone(latest.phone);
          setDeliveryPhone(latest.phone);
        }
      }
    }
  }, [customers, selectedCustomer, operationType]);

  // Histórico de Últimas Encomendas do Cliente (Organizado por quantidade de execuções: o mais usado sobe!)
  const customerPastOrdersList: PastOrderRecord[] = useMemo(() => {
    if (!pastOrdersCustomer) return [];

    const list: PastOrderRecord[] = [];

    // Busca encomendas reais salvas deste cliente no app
    const realMatches = allPlaces.filter(p => 
      p.customerName?.toLowerCase() === pastOrdersCustomer.fullName.toLowerCase() ||
      (pastOrdersCustomer.phone && p.customerPhone && p.customerPhone.replace(/\D/g, '') === pastOrdersCustomer.phone.replace(/\D/g, ''))
    );

    realMatches.forEach((p, idx) => {
      const orderId = `real-${p.id}`;
      list.push({
        id: orderId,
        orderCode: p.orderCode || `ZAP-${1000 + idx}`,
        dateStr: 'Recentemente no sistema',
        operationType: p.operationType || 'entrega',
        pickupAddress: p.pickupAddress || 'Av. Goiás, 1000 - Setor Central, Goiânia - GO',
        pickupCoords: p.pickupCoordinates || { lat: -16.6780, lng: -49.2590 },
        exchangeAddress: p.exchangeAddress,
        exchangeCoords: p.exchangeCoordinates,
        deliveryAddress: p.deliveryAddress || p.address,
        deliveryCoords: p.deliveryCoordinates || p.coordinates,
        vehicleType: p.vehicleType || 'moto',
        packageType: p.packageType || 'envelope',
        volumesCount: '1 volume',
        responsibleName: p.sellerName || 'Central EncomendasZap',
        responsiblePhone: p.sellerPhone || '(62) 3999-8800',
        observations: p.observations || 'Entrega rápida e segura',
        price: 18.50,
        executionCount: getOrderExecutionCount(orderId)
      });
    });

    // Encomendas históricas realistas adicionais para o cliente
    const defaultCustAddr = pastOrdersCustomer.address || 'Rua 9, 142 - Setor Marista, Goiânia - GO';
    const defaultCustCoords = pastOrdersCustomer.coordinates || { lat: -16.7020, lng: -49.2610 };

    const mock1Id = `mock-1-${pastOrdersCustomer.id}`;
    list.push({
      id: mock1Id,
      orderCode: 'ZAP-8421',
      dateStr: 'Ontem às 14:30',
      operationType: 'entrega',
      pickupAddress: 'Av. Goiás, 1000 - Setor Central, Goiânia - GO',
      pickupCoords: { lat: -16.6780, lng: -49.2590 },
      deliveryAddress: defaultCustAddr,
      deliveryCoords: defaultCustCoords,
      vehicleType: 'moto',
      packageType: 'Envelope',
      volumesCount: '1 volume',
      isFragile: false,
      weightKg: '0.5',
      dimensions: '25x15x2 cm',
      distanceKm: 6.2,
      responsibleName: 'Central EncomendasZap',
      responsiblePhone: '(62) 3999-8800',
      observations: 'Entregar na recepção em mãos com assinatura do cliente.',
      price: 18.50,
      executionCount: getOrderExecutionCount(mock1Id)
    });

    const mock2Id = `mock-2-${pastOrdersCustomer.id}`;
    list.push({
      id: mock2Id,
      orderCode: 'ZAP-6192',
      dateStr: '22 de Setembro às 10:15',
      operationType: 'troca',
      pickupAddress: 'Av. T-63, 145 - Setor Bueno, Goiânia - GO',
      pickupCoords: { lat: -16.6990, lng: -49.2650 },
      exchangeAddress: 'Shopping Flamboyant - Piso 1, Goiânia - GO',
      exchangeCoords: { lat: -16.7118, lng: -49.2346 },
      deliveryAddress: defaultCustAddr,
      deliveryCoords: defaultCustCoords,
      vehicleType: 'carro',
      packageType: 'Caixa',
      volumesCount: '2 volumes',
      isFragile: true,
      weightKg: '8.5',
      dimensions: '50x40x30 cm',
      distanceKm: 12.8,
      responsibleName: 'Distribuidora Carlos Peças',
      responsiblePhone: '(62) 99888-7711',
      observations: 'Troca de produto com defeito e conferência de lacre.',
      price: 32.00,
      executionCount: getOrderExecutionCount(mock2Id)
    });

    const mock3Id = `mock-3-${pastOrdersCustomer.id}`;
    list.push({
      id: mock3Id,
      orderCode: 'ZAP-3305',
      dateStr: '15 de Setembro às 16:40',
      operationType: 'coleta',
      pickupAddress: defaultCustAddr,
      pickupCoords: defaultCustCoords,
      deliveryAddress: 'Av. 85, 2300 - Setor Marista, Goiânia - GO',
      deliveryCoords: { lat: -16.6900, lng: -49.2620 },
      vehicleType: 'moto',
      packageType: 'Sacola',
      volumesCount: '1 volume',
      isFragile: false,
      weightKg: '2.0',
      dimensions: '30x25x15 cm',
      distanceKm: 5.4,
      responsibleName: 'Mariana Balcão',
      responsiblePhone: '(62) 98111-2233',
      observations: 'Coleta de amostra urgente para o escritório.',
      price: 16.00,
      executionCount: getOrderExecutionCount(mock3Id)
    });

    const mock4Id = `mock-4-${pastOrdersCustomer.id}`;
    list.push({
      id: mock4Id,
      orderCode: 'ZAP-9014',
      dateStr: '08 de Setembro às 11:20',
      operationType: 'coleta',
      pickupAddress: 'Av. Perimetral Norte, 3400 - Setor Fazenda Caveiras, Goiânia - GO',
      pickupCoords: { lat: -16.6350, lng: -49.2800 },
      deliveryAddress: defaultCustAddr,
      deliveryCoords: defaultCustCoords,
      vehicleType: 'utilitario',
      packageType: 'Cilindro',
      volumesCount: '2 volumes',
      isFragile: false,
      weightKg: '45.0',
      dimensions: '90x30x30 cm',
      distanceKm: 18.2,
      responsibleName: 'Oxigênio & Gás Centro-Oeste',
      responsiblePhone: '(62) 3211-9988',
      observations: 'Cilindros industriais sob pressão, manusear na vertical com cinta de amarração.',
      price: 58.00,
      executionCount: getOrderExecutionCount(mock4Id)
    });

    // ORGANIZADO POR QUANTIDADE DE EXECUÇÕES: O que for mais usado vai para cima, sobe!
    return list.sort((a, b) => (b.executionCount || 0) - (a.executionCount || 0));
  }, [pastOrdersCustomer, allPlaces, getOrderExecutionCount]);

  // AÇÃO CRUCIAL: REPETE ENCOMENDA (BIEL), ACUMULA EXECUÇÃO E SALTA DIRETO PARA A TELA 4
  const handleRepeatPastOrder = (pastOrder: PastOrderRecord) => {
    if (!pastOrdersCustomer) return;

    // 0. Acumula contagem de execução e salva para que as mais usadas subam
    const currentCount = getOrderExecutionCount(pastOrder.id);
    const newCount = currentCount + 1;
    const updated = {
      ...pastOrdersUsage,
      [pastOrder.id]: newCount,
    };
    if (pastOrder.id.includes('mock-1')) updated['mock-1'] = newCount;
    if (pastOrder.id.includes('mock-2')) updated['mock-2'] = newCount;
    if (pastOrder.id.includes('mock-3')) updated['mock-3'] = newCount;

    setPastOrdersUsage(updated);
    try {
      localStorage.setItem('encomendaszap_past_orders_usage_v1', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }

    // 1. Vincula cliente
    setSelectedCustomer(pastOrdersCustomer);

    // 2. Preenche tipo de operação e endereços
    setOperationType(pastOrder.operationType);
    setPickupAddress(pastOrder.pickupAddress);
    setPickupCoords(pastOrder.pickupCoords);
    if (pastOrder.operationType === 'troca' && pastOrder.exchangeAddress) {
      setExchangeAddress(pastOrder.exchangeAddress);
      if (pastOrder.exchangeCoords) setExchangeCoords(pastOrder.exchangeCoords);
    } else {
      setExchangeAddress('');
      setExchangeCoords(DEFAULT_EXCHANGE_COORDS);
      setExchangeContact('');
      setExchangePhone('');
      setExchangeNotes('');
    }
    setDeliveryAddress(pastOrder.deliveryAddress);
    setDeliveryCoords(pastOrder.deliveryCoords);

    // 3. Preenche transporte, embalagem, responsável e observação
    setVehicleType(pastOrder.vehicleType);
    setPackageSize(pastOrder.vehicleType === 'moto' ? 'pequeno' : pastOrder.vehicleType === 'carro' ? 'medio' : 'grande');
    setSelectedPackageType(pastOrder.packageType || 'Caixa');
    setSelectedPackageTypes([pastOrder.packageType || 'Caixa']);
    setVolumesCount(pastOrder.volumesCount);
    setResponsibleName(pastOrder.responsibleName);
    setResponsiblePhone(pastOrder.responsiblePhone);
    setObservations(pastOrder.observations);

    // 4. Fecha modal de histórico
    setIsPastOrdersModalOpen(false);

    // 5. Inicia cálculo da rota imediatamente
    setIsCalculatingRoute(true);
    fetchRoute(pastOrder.pickupCoords, pastOrder.deliveryCoords)
      .then(res => setCalculatedRoute(res))
      .catch(() => setCalculatedRoute(null))
      .finally(() => setIsCalculatingRoute(false));

    // 6. CAI DIRETO NOS DETALHES FINAIS PARA FINALIZAR!
    setCurrentStep(4);
  };

  // Alternância do tipo de operação com a regra:
  // - O local definido no mapa (endereço, coordenadas, responsável e observação)
  //   continua sendo exatamente aquela localização, mudando apenas de papel:
  //   - Se Coleta: Local do mapa é a Coleta ➔ Entrega é o Cliente
  //   - Se Entrega: Coleta é o Cliente ➔ Local do mapa é a Entrega
  //   - Se Troca: Coleta é o Cliente ➔ Ponto de Troca é o Local do mapa ➔ Retorno no Cliente
  const handleSelectOperationType = (newType: OperationType) => {
    const prevType = operationType;
    setOperationType(newType);
    setStepErrors({});

    // Se saiu de troca ou entrou em coleta/entrega, limpa dados de troca para evitar marcadores fantasmas
    if (newType !== 'troca') {
      setExchangeAddress('');
      setExchangeCoords(DEFAULT_EXCHANGE_COORDS);
      setExchangeContact('');
      setExchangePhone('');
      setExchangeNotes('');
    }

    if (!selectedCustomer) return;

    const custAddr = selectedCustomer.address || '';
    const custCoords = selectedCustomer.coordinates || null;

    // 1. Identifica a localização ativa que estava sendo definida no mapa
    let currentMapAddr = '';
    let currentMapCoords: LocationCoordinates = DEFAULT_PICKUP_COORDS;
    let currentMapContact = '';
    let currentMapPhone = '';
    let currentMapNotes = '';

    if (prevType === 'coleta') {
      currentMapAddr = pickupAddress;
      currentMapCoords = pickupCoords;
      currentMapContact = pickupContact;
      currentMapPhone = pickupPhone;
      currentMapNotes = pickupNotes;
    } else if (prevType === 'entrega') {
      currentMapAddr = deliveryAddress;
      currentMapCoords = deliveryCoords;
      currentMapContact = deliveryContact;
      currentMapPhone = deliveryPhone;
      currentMapNotes = deliveryNotes;
    } else if (prevType === 'troca') {
      currentMapAddr = exchangeAddress;
      currentMapCoords = exchangeCoords;
      currentMapContact = exchangeContact;
      currentMapPhone = exchangePhone;
      currentMapNotes = exchangeNotes;
    }

    // Se o ponto ativo estiver vazio mas algum outro campo tinha endereço customizado, recupera
    if (!currentMapAddr.trim()) {
      if (pickupAddress && pickupAddress !== custAddr) {
        currentMapAddr = pickupAddress;
        currentMapCoords = pickupCoords;
        currentMapContact = pickupContact;
        currentMapPhone = pickupPhone;
        currentMapNotes = pickupNotes;
      } else if (deliveryAddress && deliveryAddress !== custAddr) {
        currentMapAddr = deliveryAddress;
        currentMapCoords = deliveryCoords;
        currentMapContact = deliveryContact;
        currentMapPhone = deliveryPhone;
        currentMapNotes = deliveryNotes;
      } else if (exchangeAddress && exchangeAddress !== custAddr) {
        currentMapAddr = exchangeAddress;
        currentMapCoords = exchangeCoords;
        currentMapContact = exchangeContact;
        currentMapPhone = exchangePhone;
        currentMapNotes = exchangeNotes;
      }
    }

    // 2. Aplica a nova distribuição mantendo a localização no mapa:
    if (newType === 'coleta') {
      // Local do mapa é a COLETA (mantém exatamente a localização e dados)
      setPickupAddress(currentMapAddr);
      setPickupCoords(currentMapCoords);
      setPickupContact(currentMapContact);
      setPickupPhone(currentMapPhone);
      setPickupNotes(currentMapNotes);

      // ENTREGA é o endereço do cliente
      setDeliveryAddress(custAddr);
      setDeliveryCoords(custCoords || DEFAULT_DELIVERY_COORDS);
      setDeliveryContact(selectedCustomer.fullName);
      setDeliveryPhone(selectedCustomer.phone);
      setDeliveryNotes('');
    } else if (newType === 'entrega') {
      // COLETA é o endereço do cliente
      setPickupAddress(custAddr);
      setPickupCoords(custCoords || DEFAULT_PICKUP_COORDS);
      setPickupContact(selectedCustomer.fullName);
      setPickupPhone(selectedCustomer.phone);
      setPickupNotes('');

      // Local do mapa é a ENTREGA (mantém exatamente a localização e dados)
      setDeliveryAddress(currentMapAddr);
      setDeliveryCoords(currentMapCoords);
      setDeliveryContact(currentMapContact);
      setDeliveryPhone(currentMapPhone);
      setDeliveryNotes(currentMapNotes);
    } else if (newType === 'troca') {
      // COLETA e ENTREGA são o endereço do cliente
      setPickupAddress(custAddr);
      setPickupCoords(custCoords || DEFAULT_PICKUP_COORDS);
      setPickupContact(selectedCustomer.fullName);
      setPickupPhone(selectedCustomer.phone);
      setPickupNotes('');

      setDeliveryAddress(custAddr);
      setDeliveryCoords(custCoords || DEFAULT_DELIVERY_COORDS);
      setDeliveryContact(selectedCustomer.fullName);
      setDeliveryPhone(selectedCustomer.phone);
      setDeliveryNotes('');

      // PONTO DE TROCA é o local do mapa (mantém exatamente a localização e dados)
      setExchangeAddress(currentMapAddr);
      setExchangeCoords(currentMapCoords);
      setExchangeContact(currentMapContact);
      setExchangePhone(currentMapPhone);
      setExchangeNotes(currentMapNotes);
    }
  };

  // Inverter endereços e dados de coleta e entrega
  const handleSwapLocations = () => {
    const tempAddr = pickupAddress;
    const tempCoords = pickupCoords;
    const tempContact = pickupContact;
    const tempPhone = pickupPhone;
    const tempNotes = pickupNotes;

    setPickupAddress(deliveryAddress);
    setPickupCoords(deliveryCoords);
    setPickupContact(deliveryContact);
    setPickupPhone(deliveryPhone);
    setPickupNotes(deliveryNotes);

    setDeliveryAddress(tempAddr);
    setDeliveryCoords(tempCoords);
    setDeliveryContact(tempContact);
    setDeliveryPhone(tempPhone);
    setDeliveryNotes(tempNotes);
  };

  // Quando seleciona um cliente válido da lista:
  // "E se clicar no selecionar já deve avançar para a próxima etapa."
  const handleSelectClientFromList = (cust: Customer) => {
    setSelectedCustomer(cust);
    setStepErrors({});

    const custHasLocation = Boolean(
      cust.coordinates && cust.coordinates.lat && cust.coordinates.lng && cust.address && cust.address.trim()
    );

    if (custHasLocation) {
      if (operationType === 'coleta') {
        // Coleta em outro lugar (ex: Loja), entrega no cliente
        setDeliveryAddress(cust.address);
        setDeliveryCoords(cust.coordinates!);
        setDeliveryContact(cust.fullName);
        setDeliveryPhone(cust.phone);
        if (!pickupAddress.trim() && newOrderInitialPlace) {
          setPickupAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setPickupCoords(newOrderInitialPlace.coordinates || DEFAULT_PICKUP_COORDS);
        }
      } else if (operationType === 'entrega') {
        // Coleta no cliente, entrega no destino
        setPickupAddress(cust.address);
        setPickupCoords(cust.coordinates!);
        setPickupContact(cust.fullName);
        setPickupPhone(cust.phone);
        if (!deliveryAddress.trim() && newOrderInitialPlace) {
          setDeliveryAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setDeliveryCoords(newOrderInitialPlace.coordinates || DEFAULT_DELIVERY_COORDS);
        }
      } else if (operationType === 'troca') {
        // Coleta no cliente, troca no destino, entrega no cliente
        setPickupAddress(cust.address);
        setDeliveryAddress(cust.address);
        setPickupContact(cust.fullName);
        setPickupPhone(cust.phone);
        setDeliveryContact(cust.fullName);
        setDeliveryPhone(cust.phone);
        setPickupCoords(cust.coordinates!);
        setDeliveryCoords(cust.coordinates!);
        if (!exchangeAddress.trim() && newOrderInitialPlace) {
          setExchangeAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setExchangeCoords(newOrderInitialPlace.coordinates || DEFAULT_EXCHANGE_COORDS);
        }
      }
    } else {
      // Cliente ainda sem localização definida: preserva contato do cliente e locais de loja
      if (operationType === 'coleta') {
        setDeliveryAddress('');
        setDeliveryContact(cust.fullName);
        setDeliveryPhone(cust.phone);
        if (!pickupAddress.trim() && newOrderInitialPlace) {
          setPickupAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setPickupCoords(newOrderInitialPlace.coordinates || DEFAULT_PICKUP_COORDS);
        }
      } else if (operationType === 'entrega') {
        setPickupAddress('');
        setPickupContact(cust.fullName);
        setPickupPhone(cust.phone);
        if (!deliveryAddress.trim() && newOrderInitialPlace) {
          setDeliveryAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setDeliveryCoords(newOrderInitialPlace.coordinates || DEFAULT_DELIVERY_COORDS);
        }
      } else if (operationType === 'troca') {
        setPickupAddress('');
        setDeliveryAddress('');
        setDeliveryContact(cust.fullName);
        setDeliveryPhone(cust.phone);
        if (!exchangeAddress.trim() && newOrderInitialPlace) {
          setExchangeAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setExchangeCoords(newOrderInitialPlace.coordinates || DEFAULT_EXCHANGE_COORDS);
        }
      }
    }
    // "E se clicar no selecionar já deve avançar para a próxima etapa."
    // AVANÇA DIRETAMENTE PARA A ETAPA 2 (TIPO E LOCAIS)!
    setCurrentStep(2);
  };

  // Ao clicar em contato da agenda:
  // "E se clicar no selecionar já deve avançar para a próxima etapa."
  const handleSelectAgendaContact = async (contact: AgendaContact) => {
    // Busca se já existe no sistema com este telefone
    const cleanPhone = contact.phone.replace(/\D/g, '');
    const existing = cleanPhone ? customers.find(c => c.phone.replace(/\D/g, '') === cleanPhone) : undefined;
    let targetCust: Customer;
    if (existing) {
      targetCust = existing;
    } else {
      targetCust = {
        id: `cust-agenda-${contact.id}`,
        fullName: contact.name,
        phone: contact.phone,
        cpf: '',
        address: contact.address || '',
        createdAt: Date.now()
      };
      const savedCustomer = await persistCustomer(targetCust);
      if (!savedCustomer) {
        window.alert('Não foi possível salvar o contato da agenda como cliente. Verifique a conexão e tente novamente.');
        return;
      }
      targetCust = savedCustomer;
    }
    setSelectedCustomer(targetCust);
    setStepErrors({});

    const targetCustHasLocation = Boolean(
      targetCust.coordinates && targetCust.coordinates.lat && targetCust.coordinates.lng && targetCust.address && targetCust.address.trim()
    );

    if (targetCustHasLocation) {
      if (operationType === 'coleta') {
        setDeliveryAddress(targetCust.address);
        setDeliveryCoords(targetCust.coordinates!);
        setDeliveryContact(targetCust.fullName);
        setDeliveryPhone(targetCust.phone);
        if (!pickupAddress.trim() && newOrderInitialPlace) {
          setPickupAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setPickupCoords(newOrderInitialPlace.coordinates || DEFAULT_PICKUP_COORDS);
        }
      } else if (operationType === 'entrega') {
        setPickupAddress(targetCust.address);
        setPickupCoords(targetCust.coordinates!);
        setPickupContact(targetCust.fullName);
        setPickupPhone(targetCust.phone);
        if (!deliveryAddress.trim() && newOrderInitialPlace) {
          setDeliveryAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setDeliveryCoords(newOrderInitialPlace.coordinates || DEFAULT_DELIVERY_COORDS);
        }
      } else if (operationType === 'troca') {
        setPickupAddress(targetCust.address);
        setDeliveryAddress(targetCust.address);
        setPickupContact(targetCust.fullName);
        setPickupPhone(targetCust.phone);
        setDeliveryContact(targetCust.fullName);
        setDeliveryPhone(targetCust.phone);
        setPickupCoords(targetCust.coordinates!);
        setDeliveryCoords(targetCust.coordinates!);
        if (!exchangeAddress.trim() && newOrderInitialPlace) {
          setExchangeAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setExchangeCoords(newOrderInitialPlace.coordinates || DEFAULT_EXCHANGE_COORDS);
        }
      }
    } else {
      // Cliente da agenda sem localização definida: preserva dados
      if (operationType === 'coleta') {
        setDeliveryAddress('');
        setDeliveryContact(targetCust.fullName);
        setDeliveryPhone(targetCust.phone);
        if (!pickupAddress.trim() && newOrderInitialPlace) {
          setPickupAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setPickupCoords(newOrderInitialPlace.coordinates || DEFAULT_PICKUP_COORDS);
        }
      } else if (operationType === 'entrega') {
        setPickupAddress('');
        setPickupContact(targetCust.fullName);
        setPickupPhone(targetCust.phone);
        if (!deliveryAddress.trim() && newOrderInitialPlace) {
          setDeliveryAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setDeliveryCoords(newOrderInitialPlace.coordinates || DEFAULT_DELIVERY_COORDS);
        }
      } else if (operationType === 'troca') {
        setPickupAddress('');
        setDeliveryAddress('');
        setDeliveryContact(targetCust.fullName);
        setDeliveryPhone(targetCust.phone);
        if (!exchangeAddress.trim() && newOrderInitialPlace) {
          setExchangeAddress(newOrderInitialPlace.address || newOrderInitialPlace.name || '');
          setExchangeCoords(newOrderInitialPlace.coordinates || DEFAULT_EXCHANGE_COORDS);
        }
      }
    }
    // "E se clicar no selecionar já deve avançar para a próxima etapa."
    setCurrentStep(2);
  };

  // Escuta seleção de contato vinda da Agenda Nativa do Android (APK)
  useEffect(() => {
    const handleContactSelected = (e: Event) => {
      const customEvent = e as CustomEvent<{ name?: string; phone?: string }>;
      if (customEvent.detail) {
        const { name, phone } = customEvent.detail;
        if (name || phone) {
          if (currentStep === 1) {
            // "ao add pedido na lista de usuarios, na agenda coloque para buscar da agenda do delefone, usa a integracao do apk para funcionar"
            // Na Etapa 1 (Lista de Usuários), seleciona diretamente como cliente da encomenda e avança para a Etapa 2
            handleSelectAgendaContact({
              id: `apk-contact-${Date.now()}`,
              name: name || 'Contato da Agenda',
              phone: phone || '',
              address: 'Goiânia - GO',
              source: 'agenda'
            });
          } else {
            // Nas etapas seguintes (Etapa 2), preenche o contato do local alvo (coleta, entrega ou troca)
            handleSelectPhoneAgendaContact({
              name: name || '',
              phone: phone || ''
            });
          }
        }
      }
    };

    window.addEventListener('contactSelected', handleContactSelected);
    return () => {
      window.removeEventListener('contactSelected', handleContactSelected);
    };
  }, [currentStep, phoneAgendaTarget, customers, operationType]);

  // Múltiplas Localizações do Usuário: Salvar nova localização e usar imediatamente
  // "No endereço, na localização do usuário, vamos colocar mais de uma, tá? Pode aceitar a principal, mas pode aceitar várias. Se ele quiser colocar outras localizações, está certo."
  const handleSaveAdditionalLocation = async (targetField: 'coleta' | 'entrega' | 'troca') => {
    if (!selectedCustomer || !newLocAddress.trim()) return;

    const geocodingResults = await searchAddress(newLocAddress.trim()).catch(() => []);
    const geocodedPlace = geocodingResults.find(result => result.coordinates);
    const coordsFallback = geocodedPlace?.coordinates || selectedCustomer.coordinates || DEFAULT_PICKUP_COORDS;
    const city = resolveCustomerCity({ ...geocodedPlace, address: newLocAddress.trim() }) ||
      resolveCustomerCity({ address: newLocAddress.trim() }) ||
      normalizeCityName(selectedCustomer.city || selectedCustomer.cidade);
    const newAddrObj: CustomerAddress = {
      id: `addr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label: newLocLabel.trim() || 'Outro',
      address: newLocAddress.trim(),
      ...(city ? { city, cidade: city } : {}),
      coordinates: coordsFallback
    };

    let updatedCust: Customer;
    if (newLocIsPrimary) {
      // Se marcou para ser a principal: guarda a anterior em adicionais e coloca essa como principal
      const prevPrimary = selectedCustomer.address ? [{
        id: `addr-prev-${Date.now()}`,
        label: 'Antigo Principal',
        address: selectedCustomer.address,
        coordinates: selectedCustomer.coordinates
      }] : [];
      updatedCust = {
        ...selectedCustomer,
        address: newLocAddress.trim(),
        coordinates: coordsFallback,
        ...(city ? { city, cidade: city } : {}),
        additionalAddresses: [...prevPrimary, ...(selectedCustomer.additionalAddresses || [])]
      };
    } else {
      updatedCust = {
        ...selectedCustomer,
        additionalAddresses: [...(selectedCustomer.additionalAddresses || []), newAddrObj]
      };
    }

    const saved = await updateCustomer(selectedCustomer.id, updatedCust);
    if (!saved) {
      window.alert('Não foi possível salvar o endereço do cliente. Verifique a conexão e tente novamente.');
      return;
    }
    setSelectedCustomer(updatedCust);

    // Preenche o campo correspondente e coordenadas
    if (targetField === 'coleta') {
      setPickupAddress(newLocAddress.trim());
      setPickupCoords(coordsFallback);
    } else if (targetField === 'entrega') {
      setDeliveryAddress(newLocAddress.trim());
      setDeliveryCoords(coordsFallback);
    } else if (targetField === 'troca') {
      setExchangeAddress(newLocAddress.trim());
      setExchangeCoords(coordsFallback);
    }

    // Reseta estado inline
    setAddingLocationTarget(null);
    setNewLocAddress('');
    setNewLocLabel('Trabalho');
    setNewLocIsPrimary(false);
  };

  // Salva cliente a partir do formulário de cadastro em tela cheia
  const handleSaveCustomerFromRegistration = async (newCust: Customer) => {
    const savedCustomer = await persistCustomer(newCust);
    if (!savedCustomer) {
      window.alert('Não foi possível salvar o endereço do cliente no banco de dados.');
      return;
    }
    if (selectorTargetField === 'client') {
      setSelectedCustomer(savedCustomer);
      if (savedCustomer.address) {
        if (operationType === 'coleta') {
          setDeliveryAddress(savedCustomer.address);
          if (savedCustomer.coordinates) setDeliveryCoords(savedCustomer.coordinates);
          setDeliveryContact(savedCustomer.fullName);
          setDeliveryPhone(savedCustomer.phone);
          if (pickupAddress === savedCustomer.address) {
            setPickupAddress('');
            setPickupCoords(DEFAULT_PICKUP_COORDS);
            setPickupContact('');
            setPickupPhone('');
          }
        } else if (operationType === 'entrega') {
          setPickupAddress(savedCustomer.address);
          if (savedCustomer.coordinates) setPickupCoords(savedCustomer.coordinates);
          setPickupContact(savedCustomer.fullName);
          setPickupPhone(savedCustomer.phone);
          if (deliveryAddress === savedCustomer.address) {
            setDeliveryAddress('');
            setDeliveryCoords(DEFAULT_DELIVERY_COORDS);
            setDeliveryContact('');
            setDeliveryPhone('');
          }
        } else if (operationType === 'troca') {
          setPickupAddress(savedCustomer.address);
          setDeliveryAddress(savedCustomer.address);
          setPickupContact(savedCustomer.fullName);
          setPickupPhone(savedCustomer.phone);
          setDeliveryContact(savedCustomer.fullName);
          setDeliveryPhone(savedCustomer.phone);
          if (savedCustomer.coordinates) {
            setPickupCoords(savedCustomer.coordinates);
            setDeliveryCoords(savedCustomer.coordinates);
          }
        }
      }
      // Ao salvar os dados completos do cliente, AVANÇA DIRETAMENTE PARA A ETAPA 2!
      setCurrentStep(2);
    } else {
      setResponsibleName(savedCustomer.fullName);
      setResponsiblePhone(savedCustomer.phone);
    }
    setIsRegistrationFullScreenOpen(false);
    setRegistrationInitialData(null);
  };

  // Avançar da Etapa 1 (Lista de Clientes) para a Etapa 2 (Selecionar Tipo de Encomenda)
  const handleProceedToStep2 = () => {
    if (!selectedCustomer) {
      setStepErrors({ client: 'Selecione um cliente na lista para continuar.' });
      return;
    }
    if (!clientValidation.isValid) {
      setStepErrors({ client: clientValidation.message });
      return;
    }
    if (operationType !== 'troca') {
      setExchangeAddress('');
      setExchangeCoords(DEFAULT_EXCHANGE_COORDS);
      setExchangeContact('');
      setExchangePhone('');
      setExchangeNotes('');
    }
    setStepErrors({});
    setCurrentStep(2);
  };

  // Avançar da Etapa 2 (Tipo & Locais) para a Etapa 3 (Volume / Carga)
  const handleProceedToStep3 = () => {
    const errors: Record<string, string> = {};

    if (operationType === 'coleta') {
      if (!pickupAddress.trim()) {
        errors.pickupAddress = 'O endereço de coleta é obrigatório! Digite na busca ou clique no mapa para marcar o local.';
      }
      if (selectedCustomer) {
        if (!deliveryAddress.trim() && selectedCustomer.address) {
          setDeliveryAddress(selectedCustomer.address);
          if (selectedCustomer.coordinates) setDeliveryCoords(selectedCustomer.coordinates);
        }
        if (!deliveryContact) setDeliveryContact(selectedCustomer.fullName);
        if (!deliveryPhone) setDeliveryPhone(selectedCustomer.phone);
        if (!deliveryNotes) setDeliveryNotes('Entregar no endereço cadastrado do cliente.');
      }
      if (!deliveryAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) {
        errors.deliveryAddress = 'O endereço do cliente (entrega) é obrigatório! Clique em "Local do Cliente" para marcar no mapa.';
      }
    } else if (operationType === 'entrega') {
      if (!deliveryAddress.trim()) {
        errors.deliveryAddress = 'O endereço de entrega é obrigatório! Digite na busca ou clique no mapa para marcar o local.';
      }
      if (selectedCustomer) {
        if (!pickupAddress.trim() && selectedCustomer.address) {
          setPickupAddress(selectedCustomer.address);
          if (selectedCustomer.coordinates) setPickupCoords(selectedCustomer.coordinates);
        }
        if (!pickupContact) setPickupContact(selectedCustomer.fullName);
        if (!pickupPhone) setPickupPhone(selectedCustomer.phone);
        if (!pickupNotes) setPickupNotes('Retirar no endereço cadastrado do cliente.');
      }
      if (!pickupAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) {
        errors.pickupAddress = 'O endereço do cliente (coleta) é obrigatório! Clique em "Local do Cliente" para marcar no mapa.';
      }
    } else if (operationType === 'troca') {
      if (!exchangeAddress.trim()) {
        errors.exchangeAddress = 'O endereço de troca é obrigatório! Digite na busca ou clique no mapa para marcar o local.';
      }
      if (selectedCustomer) {
        if (!pickupAddress.trim() && selectedCustomer.address) {
          setPickupAddress(selectedCustomer.address);
          setDeliveryAddress(selectedCustomer.address);
          if (selectedCustomer.coordinates) {
            setPickupCoords(selectedCustomer.coordinates);
            setDeliveryCoords(selectedCustomer.coordinates);
          }
        }
        if (!pickupContact) setPickupContact(selectedCustomer.fullName);
        if (!pickupPhone) setPickupPhone(selectedCustomer.phone);
        if (!pickupNotes) setPickupNotes('Retirar produto para troca no cliente.');
        if (!deliveryContact) setDeliveryContact(selectedCustomer.fullName);
        if (!deliveryPhone) setDeliveryPhone(selectedCustomer.phone);
        if (!deliveryNotes) setDeliveryNotes('Entregar produto trocado de volta ao cliente.');
      }
      if (!pickupAddress.trim() && (!selectedCustomer || !selectedCustomer.address)) {
        errors.pickupAddress = 'O endereço do cliente é obrigatório! Clique em "Local do Cliente" para marcar no mapa.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      return;
    }

    // Garante valores padrão para data, contato e observações
    const today = new Date().toISOString().split('T')[0];
    if (!pickupDate) setPickupDate(today);
    if (!deliveryDate) setDeliveryDate(today);
    if (operationType === 'troca' && !exchangeDate) setExchangeDate(today);

    if (!responsibleName.trim() || responsibleName === 'Central EncomendasZap') {
      setResponsibleName(pickupContact || deliveryContact || selectedCustomer?.fullName || 'Responsável');
      setResponsiblePhone(pickupPhone || deliveryPhone || selectedCustomer?.phone || '');
    }

    if (!observations.trim()) {
      const parts = [
        pickupNotes.trim() ? `Coleta: ${pickupNotes.trim()}` : '',
        operationType === 'troca' && exchangeNotes.trim() ? `Troca: ${exchangeNotes.trim()}` : '',
        deliveryNotes.trim() ? `Entrega: ${deliveryNotes.trim()}` : ''
      ].filter(Boolean);
      if (parts.length > 0) {
        setObservations(parts.join(' | '));
      }
    }

    setStepErrors({});
    setCurrentStep(3);
  };

  // Avançar da Etapa 3 (Volume / Carga) para a Etapa 4 (Rota, Preço & Finalização)
  const handleProceedToStep4 = async () => {
    if (!responsibleName.trim()) {
      setResponsibleName(pickupContact || deliveryContact || selectedCustomer?.fullName || 'Responsável');
      setResponsiblePhone(pickupPhone || deliveryPhone || selectedCustomer?.phone || '');
    }

    setStepErrors({});
    setCurrentStep(4);

    const kmRate = vehicleType === 'utilitario' ? 4.5 : vehicleType === 'carro' ? 3.2 : 2.2;
    const coletaRate = vehicleType === 'utilitario' ? 18.0 : vehicleType === 'carro' ? 12.0 : 8.0;
    const entregaRate = vehicleType === 'utilitario' ? 14.0 : vehicleType === 'carro' ? 10.0 : 6.0;
    const currentDist = calculatedRoute?.distanceKm || 7.5;
    const initialTranspRate = Math.round(currentDist * kmRate * 10) / 10;
    const isFreteUnico = pricingSettings.pricingModel === 'frete_unico';

    // Inicializa os preços discriminados ou frete único conforme configuração
    setPriceItems(prev => {
      const isDefault = prev.every(p => !p.isRemovable);
      if (isDefault) {
        if (isFreteUnico) {
          const autoFreight = Math.round((pricingSettings.defaultFreightRate + currentDist * kmRate) * 10) / 10;
          return [
            { id: 'frete', name: 'Preço do Frete', value: autoFreight, category: 'extra', isRemovable: false }
          ];
        }

        const baseItems: Array<{
          id: string;
          name: string;
          value: number;
          category?: 'coleta' | 'transporte' | 'entrega' | 'extra';
          isRemovable?: boolean;
        }> = [
          { id: 'coleta', name: 'Preço de Coleta', value: coletaRate, category: 'coleta', isRemovable: false },
          { id: 'transporte', name: 'Transporte Entre Cidades', value: initialTranspRate, category: 'transporte', isRemovable: false },
          { id: 'entrega', name: 'Preço de Entrega', value: entregaRate, category: 'entrega', isRemovable: false }
        ];
        if (operationType === 'troca') {
          baseItems.push({ id: 'troca', name: 'Taxa Ponto de Troca', value: 8.0, category: 'extra', isRemovable: true });
        }
        return baseItems;
      }
      return prev;
    });

    // Calcula a rota real entre a origem e o destino (considerando ponto de troca se houver)
    setIsCalculatingRoute(true);
    const start = pickupCoords;
    const end = deliveryCoords;
    try {
      if (operationType === 'troca' && exchangeCoords && exchangeCoords.lat && exchangeCoords.lng) {
        const [r1, r2] = await Promise.all([
          fetchRoute(start, exchangeCoords),
          fetchRoute(exchangeCoords, end)
        ]);
        if (r1 && r2) {
          const combined: RouteResult = {
            coordinates: [...r1.coordinates, ...r2.coordinates],
            distanceKm: Math.round((r1.distanceKm + r2.distanceKm) * 10) / 10,
            durationMin: r1.durationMin + r2.durationMin
          };
          setCalculatedRoute(combined);
          if (isFreteUnico) {
            const autoFreight = Math.round((pricingSettings.defaultFreightRate + combined.distanceKm * kmRate) * 10) / 10;
            setPriceItems(prev => prev.map(p => (p.id === 'frete' && !p.isRemovable) ? { ...p, value: autoFreight } : p));
          } else {
            const autoTransp = Math.round(combined.distanceKm * kmRate * 10) / 10;
            setPriceItems(prev => prev.map(p => (p.id === 'transporte' && !p.isRemovable) ? { ...p, value: autoTransp } : p));
          }
        } else if (r1) {
          setCalculatedRoute(r1);
        } else if (r2) {
          setCalculatedRoute(r2);
        }
      } else {
        const res = await fetchRoute(start, end);
        setCalculatedRoute(res);
        if (res) {
          if (isFreteUnico) {
            const autoFreight = Math.round((pricingSettings.defaultFreightRate + res.distanceKm * kmRate) * 10) / 10;
            setPriceItems(prev => prev.map(p => (p.id === 'frete' && !p.isRemovable) ? { ...p, value: autoFreight } : p));
          } else {
            const autoTransp = Math.round(res.distanceKm * kmRate * 10) / 10;
            setPriceItems(prev => prev.map(p => (p.id === 'transporte' && !p.isRemovable) ? { ...p, value: autoTransp } : p));
          }
        }
      }
    } catch {
      setCalculatedRoute(null);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Renderização do mapa real com a rota na Etapa 4 (mapa interativo com marcadores oficiais e CachedTileLayer)
  useEffect(() => {
    if (currentStep !== 4 || !miniMapContainerRef.current) return;

    if (miniMapInstanceRef.current) {
      miniMapInstanceRef.current.remove();
      miniMapInstanceRef.current = null;
    }

    const startCoords = pickupCoords || DEFAULT_PICKUP_COORDS;
    const isTroca = operationType === 'troca' && exchangeCoords && exchangeCoords.lat && exchangeCoords.lng;

    // Inicializa o mapa com todas as interações ativas (mapa de verdade, navegável e com zoom)
    const map = L.map(miniMapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true
    }).setView([startCoords.lat, startCoords.lng], 14);

    // Camada oficial com cache robusto
    const tileLayer = new CachedTileLayer(PRIMARY_TILE_CONFIG.url, {
      maxZoom: PRIMARY_TILE_CONFIG.maxZoom,
      subdomains: PRIMARY_TILE_CONFIG.subdomains,
      attribution: PRIMARY_TILE_CONFIG.attribution
    });
    tileLayer.addTo(map);

    // Controles de zoom
    L.control.zoom({ position: 'topright' }).addTo(map);

    const boundsPoints: L.LatLngExpression[] = [];

    const custHasLocation = Boolean(
      selectedCustomer?.coordinates &&
      selectedCustomer.coordinates.lat &&
      selectedCustomer.coordinates.lng &&
      selectedCustomer?.address &&
      selectedCustomer.address.trim()
    );

    // Se o cliente não tiver local setado, deve exibir e add apenas um maker!
    const shouldShowPickup = operationType === 'coleta' || custHasLocation;
    const shouldShowDelivery = operationType === 'entrega' || custHasLocation;

    // 1. MARCADOR DE COLETA (Azul Oficial #0B5187)
    if (shouldShowPickup && pickupCoords && pickupCoords.lat && pickupCoords.lng) {
      const coletaPlace: Place = {
        id: 'step5-coleta',
        name: pickupAddress ? (pickupAddress.includes(' - ') ? pickupAddress.split(' - ')[0] : (pickupAddress.split(',')[0] || 'Ponto de Coleta')) : 'Ponto de Coleta',
        address: pickupAddress,
        coordinates: pickupCoords,
        operationType: 'coleta',
        customerName: pickupContact || selectedCustomer?.fullName || 'Coleta',
        vehicleType: (vehicleType as any) || 'moto',
        orderDateBadge: 'hoje'
      };
      const coletaIcon = createPlaceMarkerIcon(coletaPlace, false);
      L.marker([pickupCoords.lat, pickupCoords.lng], { icon: coletaIcon, zIndexOffset: 800 }).addTo(map);
      boundsPoints.push([pickupCoords.lat, pickupCoords.lng]);
    }

    // 2. MARCADOR DE TROCA (Roxo Oficial #7C3AED - Se for troca)
    if (isTroca && exchangeCoords && exchangeCoords.lat && exchangeCoords.lng) {
      const trocaPlace: Place = {
        id: 'step5-troca',
        name: exchangeAddress ? (exchangeAddress.includes(' - ') ? exchangeAddress.split(' - ')[0] : (exchangeAddress.split(',')[0] || 'Ponto de Troca')) : 'Ponto de Troca',
        address: exchangeAddress,
        coordinates: exchangeCoords,
        operationType: 'troca',
        customerName: exchangeContact || selectedCustomer?.fullName || 'Troca',
        vehicleType: (vehicleType as any) || 'moto',
        orderDateBadge: 'hoje'
      };
      const trocaIcon = createPlaceMarkerIcon(trocaPlace, false);
      L.marker([exchangeCoords.lat, exchangeCoords.lng], { icon: trocaIcon, zIndexOffset: 750 }).addTo(map);
      boundsPoints.push([exchangeCoords.lat, exchangeCoords.lng]);
    }

    // 3. MARCADOR DE ENTREGA (Laranja Oficial #FF5E00)
    if (shouldShowDelivery && deliveryCoords && deliveryCoords.lat && deliveryCoords.lng) {
      const entregaPlace: Place = {
        id: 'step5-entrega',
        name: deliveryAddress ? (deliveryAddress.includes(' - ') ? deliveryAddress.split(' - ')[0] : (deliveryAddress.split(',')[0] || 'Ponto de Entrega')) : 'Ponto de Entrega',
        address: deliveryAddress,
        coordinates: deliveryCoords,
        operationType: 'entrega',
        customerName: deliveryContact || selectedCustomer?.fullName || 'Entrega',
        vehicleType: (vehicleType as any) || 'moto',
        orderDateBadge: 'hoje'
      };
      const entregaIcon = createPlaceMarkerIcon(entregaPlace, false);
      L.marker([deliveryCoords.lat, deliveryCoords.lng], { icon: entregaIcon, zIndexOffset: 900 }).addTo(map);
      boundsPoints.push([deliveryCoords.lat, deliveryCoords.lng]);
    }

    // 4. TRAÇADO DA ROTA (POLYLINE COM DUPLA CAMADA PARA ALTO CONTRASTE)
    if (custHasLocation && calculatedRoute && calculatedRoute.coordinates && calculatedRoute.coordinates.length > 0) {
      const polyCoords = calculatedRoute.coordinates.map(c => [c.lat, c.lng] as [number, number]);
      // Borda de contraste
      L.polyline(polyCoords, {
        color: '#083D66',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // Linha vibrante
      const mainPolyline = L.polyline(polyCoords, {
        color: '#00D2FF',
        weight: 3.5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      map.fitBounds(mainPolyline.getBounds(), { padding: [55, 55], animate: false });
    } else if (boundsPoints.length >= 2) {
      const directLine = L.polyline(boundsPoints, {
        color: '#0B5187',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.8
      }).addTo(map);
      map.fitBounds(directLine.getBounds(), { padding: [55, 55], animate: false });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 15);
    }

    miniMapInstanceRef.current = map;

    // Invalidação de tamanho escalonada para garantir que renderiza 100% sem falhas de layout
    const timer1 = setTimeout(() => map.invalidateSize(), 50);
    const timer2 = setTimeout(() => map.invalidateSize(), 150);
    const timer3 = setTimeout(() => map.invalidateSize(), 400);

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (miniMapContainerRef.current) {
      ro.observe(miniMapContainerRef.current);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      ro.disconnect();
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove();
        miniMapInstanceRef.current = null;
      }
    };
  }, [currentStep, calculatedRoute, pickupCoords, deliveryCoords, exchangeCoords, operationType, pickupAddress, deliveryAddress, exchangeAddress, pickupContact, deliveryContact, exchangeContact, vehicleType, selectedCustomer?.fullName]);

  // Cálculo financeiro discriminado e editável
  const distanceKm = calculatedRoute?.distanceKm || 7.5;
  const durationMin = calculatedRoute?.durationMin || 16;

  const totalPrices = useMemo(() => {
    return priceItems.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
  }, [priceItems]);

  const totalDiscounts = useMemo(() => {
    return discountItems.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
  }, [discountItems]);

  const basePrice = totalPrices;
  const finalPrice = Math.max(0, Math.round((totalPrices - totalDiscounts) * 100) / 100);

  // Manipulação dos itens de preço discriminados
  const handleUpdatePriceItem = (id: string, updates: Partial<{ name: string; value: number }>) => {
    setPriceItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleAddPriceItem = (preset?: { name: string; value: number }) => {
    const newId = `extra-${Date.now()}`;
    setPriceItems(prev => [
      ...prev,
      { 
        id: newId, 
        name: preset?.name || 'Taxa de Espera', 
        value: preset?.value !== undefined ? preset.value : 10.0, 
        category: 'extra', 
        isRemovable: true 
      }
    ]);
  };

  const handleRemovePriceItem = (id: string) => {
    setPriceItems(prev => prev.filter(item => item.id !== id));
  };

  // Manipulação dos itens de desconto
  const handleUpdateDiscountItem = (id: string, updates: Partial<{ name: string; value: number }>) => {
    setDiscountItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleAddDiscountItem = (preset?: { name: string; value: number }) => {
    const newId = `desc-${Date.now()}`;
    setDiscountItems(prev => [
      ...prev,
      { 
        id: newId, 
        name: preset?.name || 'Desconto Comercial', 
        value: preset?.value !== undefined ? preset.value : 5.0, 
        isRemovable: true 
      }
    ]);
  };

  const handleRemoveDiscountItem = (id: string) => {
    setDiscountItems(prev => prev.filter(item => item.id !== id));
  };

  // Concluir e adicionar a nova encomenda no mapa
  const handleFinalizeOrder = () => {
    if (isDriverRole) {
      setIsNewOrderModalOpen(false);
      return;
    }
    const custFullName = selectedCustomer?.fullName || 'Sem Cliente';
    const custPhone = selectedCustomer?.phone || '';

    const customerHasLocation = Boolean(
      selectedCustomer?.coordinates &&
      selectedCustomer.coordinates.lat &&
      selectedCustomer.coordinates.lng &&
      selectedCustomer?.address &&
      selectedCustomer.address.trim()
    );

    const dimsText = (lengthCm || widthCm || heightCm) 
      ? ` • Medidas: ${lengthCm || '-'}x${widthCm || '-'}x${heightCm || '-'}cm` 
      : '';
    const weightText = weightKg ? ` • Peso: ${weightKg}kg` : '';
    const fragileText = isFragile ? ' • ⚠️ FRÁGIL' : '';
    const activePointKey: RoutePointKey = operationType === 'troca'
      ? 'exchange'
      : operationType === 'entrega'
        ? 'delivery'
        : 'pickup';
    const activePointConfig = routePointConfigs[activePointKey];
    const driver = drivers.find(d => d.id === activePointConfig.driverId);

    const formatDateBr = (d: string) => {
      if (!d) return '';
      const parts = d.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return d;
    };

    const activeSchedule = operationType === 'coleta' 
      ? { date: pickupDate, time: pickupTime, mode: pickupTimeMode, prefixAte: 'Pegar até', prefixApos: 'Pegar após' }
      : operationType === 'entrega'
      ? { date: deliveryDate, time: deliveryTime, mode: deliveryTimeMode, prefixAte: 'Entregar até', prefixApos: 'Entregar após' }
      : { date: exchangeDate, time: exchangeTime, mode: exchangeTimeMode, prefixAte: 'Trocar até', prefixApos: 'Trocar após' };

    const scheduleText = activeSchedule.time 
      ? ` • Agendamento: ${formatDateBr(activeSchedule.date)} (${activeSchedule.mode === 'ate' ? activeSchedule.prefixAte : activeSchedule.prefixApos} às ${activeSchedule.time})`
      : ` • Data: ${formatDateBr(activeSchedule.date)}`;

    const isTroca = operationType === 'troca';
    const isColeta = operationType === 'coleta';
    const isEntrega = operationType === 'entrega';

    // Verifica se possui endereços e coordenadas reais configurados para cada etapa
    const hasRealPickup = Boolean(pickupAddress && pickupAddress.trim() && pickupAddress !== 'Ponto de Coleta' && pickupCoords);
    const hasRealDelivery = Boolean(deliveryAddress && deliveryAddress.trim() && deliveryAddress !== 'Ponto de Entrega' && deliveryCoords);
    const hasRealExchange = Boolean(isTroca && ((exchangeAddress && exchangeAddress.trim() && exchangeAddress !== 'Ponto de Troca' && exchangeCoords) || hasRealDelivery));

    // REGRAS DO ENCOMENDASZAP:
    // - "se nao tiver local de coleta so aparece o local de entrega ou troca"
    // - "primeiro aparece o local de coleta, se nao tiver local de entrega ela some"
    // - "se tiver local de entrega ela aparece depois da coleta"
    // - "se for troca primeiro e coleta, depois e local de troca, por ultimo o local de coleta vira o local de entrega"
    let initialOp: OperationType = 'coleta';
    let initialCoords = pickupCoords || DEFAULT_PICKUP_COORDS;
    let initialAddress = pickupAddress || 'Ponto de Coleta';
    let initialName = `Coleta: ${pickupContact || custFullName}`;

    if (!hasRealPickup) {
      if (isTroca && (hasRealExchange || hasRealDelivery)) {
        initialOp = 'troca';
        initialCoords = exchangeCoords || deliveryCoords || DEFAULT_PICKUP_COORDS;
        initialAddress = exchangeAddress || deliveryAddress || 'Ponto de Troca';
        initialName = `Troca: ${exchangeContact || custFullName}`;
      } else {
        initialOp = 'entrega';
        initialCoords = deliveryCoords || DEFAULT_PICKUP_COORDS;
        initialAddress = deliveryAddress || 'Ponto de Entrega';
        initialName = `Entrega: ${deliveryContact || custFullName}`;
      }
    } else {
      initialOp = 'coleta';
      initialCoords = pickupCoords || DEFAULT_PICKUP_COORDS;
      initialAddress = pickupAddress || 'Ponto de Coleta';
      initialName = `Coleta: ${pickupContact || custFullName}`;
    }

    const userCompany = companyService.getUserCompany(user?.phone);

    const newPlace: Place = {
      id: `pedido-${Date.now()}-${initialOp}`,
      orderCode,
      name: initialName,
      companyId: userCompany?.id,
      companyName: userCompany?.name,
      category: isTroca ? 'Troca de Mercadoria' : initialOp === 'entrega' ? 'Entrega Expressa' : 'Coleta Expressa',
      address: initialAddress,
      coordinates: initialCoords,
      operationType: initialOp,
      orderStage: initialOp,
      vehicleType,
      packageType: 'caixa',
      customerName: custFullName,
      customerPhone: custPhone,
      customerId: selectedCustomer?.id,
      price: finalPrice,
      priceItems: priceItems.map(item => ({ ...item })),
      discountItems: discountItems.map(item => ({ ...item })),
      totalDiscounts,
      scheduledDate: activeSchedule.date,
      data: activeSchedule.date,
      scheduledTime: activeSchedule.time || undefined,
      scheduledTimeMode: activeSchedule.mode === 'apos' ? 'partir' : 'ate',
      packageSize,
      volumesCount: Number.parseFloat(volumesCount) || 1,
      weightKg: weightKg || undefined,
      dimensions: (lengthCm || widthCm || heightCm)
        ? `${lengthCm || '-'}x${widthCm || '-'}x${heightCm || '-'}cm`
        : undefined,
      isFragile,
      sellerName: responsibleName,
      sellerPhone: responsiblePhone,
      managerName: responsibleName,
      managerPhone: responsiblePhone,
      observations: `Item: ${selectedPackageType} (${volumesCount}) • Porte ${packageSize.toUpperCase()} (${vehicleType.toUpperCase()})${fragileText}${weightText}${dimsText}${scheduleText}\nQuilometragem: ${distanceKm} km • Preço: R$ ${finalPrice.toFixed(2)} (${priceItems.map(p => `${p.name}: R$ ${Number(p.value).toFixed(2)}`).join(' | ')}${totalDiscounts > 0 ? ` • Desconto: -R$ ${totalDiscounts.toFixed(2)}` : ''})${observations ? `\nObs: ${observations}` : ''}`,
      driverNotes: `Rota: ${distanceKm} km (~${durationMin} min). ${priceItems.map(p => `${p.name}: R$ ${Number(p.value).toFixed(2)}`).join(' | ')}${totalDiscounts > 0 ? ` • Desconto: -R$ ${totalDiscounts.toFixed(2)}` : ''}`,
      orderVisibility: activePointConfig.visibility,
      assignedDriverId: activePointConfig.visibility === 'privado' ? (activePointConfig.driverId || undefined) : undefined,
      assignedDriverPhone: activePointConfig.visibility === 'privado' ? driver?.phone : undefined,
      pickupVisibility: routePointConfigs.pickup.visibility,
      pickupAssignedDriverId: routePointConfigs.pickup.visibility === 'privado' ? routePointConfigs.pickup.driverId || undefined : undefined,
      pickupAssignedDriverPhone: routePointConfigs.pickup.visibility === 'privado'
        ? drivers.find(item => item.id === routePointConfigs.pickup.driverId)?.phone
        : undefined,
      pickupAssignedDriverName: routePointConfigs.pickup.visibility === 'privado'
        ? drivers.find(item => item.id === routePointConfigs.pickup.driverId)?.name
        : undefined,
      pickupSellerName: routePointConfigs.pickup.sellerName || undefined,
      pickupSellerPhone: routePointConfigs.pickup.sellerPhone || undefined,
      exchangeVisibility: routePointConfigs.exchange.visibility,
      exchangeAssignedDriverId: routePointConfigs.exchange.visibility === 'privado' ? routePointConfigs.exchange.driverId || undefined : undefined,
      exchangeAssignedDriverPhone: routePointConfigs.exchange.visibility === 'privado'
        ? drivers.find(item => item.id === routePointConfigs.exchange.driverId)?.phone
        : undefined,
      exchangeAssignedDriverName: routePointConfigs.exchange.visibility === 'privado'
        ? drivers.find(item => item.id === routePointConfigs.exchange.driverId)?.name
        : undefined,
      exchangeSellerName: routePointConfigs.exchange.sellerName || undefined,
      exchangeSellerPhone: routePointConfigs.exchange.sellerPhone || undefined,
      deliveryVisibility: routePointConfigs.delivery.visibility,
      deliveryAssignedDriverId: routePointConfigs.delivery.visibility === 'privado' ? routePointConfigs.delivery.driverId || undefined : undefined,
      deliveryAssignedDriverPhone: routePointConfigs.delivery.visibility === 'privado'
        ? drivers.find(item => item.id === routePointConfigs.delivery.driverId)?.phone
        : undefined,
      deliveryAssignedDriverName: routePointConfigs.delivery.visibility === 'privado'
        ? drivers.find(item => item.id === routePointConfigs.delivery.driverId)?.name
        : undefined,
      deliverySellerName: routePointConfigs.delivery.sellerName || undefined,
      deliverySellerPhone: routePointConfigs.delivery.sellerPhone || undefined,
      isExchangeOrder: isTroca,
      pickupAddress: hasRealPickup ? pickupAddress : undefined,
      pickupCoordinates: hasRealPickup ? pickupCoords : undefined,
      pickupName: hasRealPickup ? `Coleta: ${pickupContact || custFullName}` : undefined,
      pickupContact: pickupContact || responsibleName,
      pickupPhone: pickupPhone || responsiblePhone,
      pickupNotes,
      exchangeAddress: hasRealExchange ? (exchangeAddress || deliveryAddress) : undefined,
      exchangeCoordinates: hasRealExchange ? (exchangeCoords || deliveryCoords) : undefined,
      exchangeName: hasRealExchange ? `Troca: ${exchangeContact || custFullName}` : undefined,
      exchangeContact: isTroca ? (exchangeContact || responsibleName) : undefined,
      exchangePhone: isTroca ? (exchangePhone || responsiblePhone) : undefined,
      exchangeNotes: isTroca ? exchangeNotes : undefined,
      deliveryAddress: hasRealDelivery ? deliveryAddress : undefined,
      deliveryCoordinates: hasRealDelivery ? deliveryCoords : undefined,
      deliveryName: hasRealDelivery ? `Entrega: ${deliveryContact || custFullName}` : undefined,
      deliveryContact: deliveryContact || custFullName,
      deliveryPhone: deliveryPhone || custPhone,
      deliveryNotes
    };

    const added = addOrderDraft(newPlace);
    if (!added) {
      window.alert('Não foi possível preparar o pedido para revisão.');
      return;
    }
    setIsNewOrderModalOpen(false);
  };

  const routeStops: Array<{
    key: RoutePointKey;
    label: string;
    address: string;
    notes: string;
    setNotes: (value: string) => void;
    color: string;
    border: string;
  }> = [
    { key: 'pickup', label: 'Coleta', address: pickupAddress, notes: pickupNotes, setNotes: setPickupNotes, color: '#0B5187', border: 'border-blue-200 bg-blue-50/80' },
    ...(operationType === 'troca'
      ? [{ key: 'exchange' as const, label: 'Troca', address: exchangeAddress, notes: exchangeNotes, setNotes: setExchangeNotes, color: '#7C3AED', border: 'border-purple-200 bg-purple-50/80' }]
      : []),
    { key: 'delivery', label: 'Entrega', address: deliveryAddress, notes: deliveryNotes, setNotes: setDeliveryNotes, color: '#FF5E00', border: 'border-orange-200 bg-orange-50/80' }
  ];

  if (!isNewOrderModalOpen || isDriverRole) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 md:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150">
      
      {/* CONTAINER OTIMIZADO: APROVEITA O ESPAÇO HORIZONTAL E VERTICAL TOTALMENTE */}
      <div className={`bg-white w-full h-full ${currentStep === 2 ? 'sm:h-[94vh] sm:max-h-[96vh] sm:max-w-6xl xl:max-w-7xl' : 'sm:h-[88vh] sm:max-h-[92vh] sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl'} sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150`}>
        
        {/* CABEÇALHO COMPACTO COM LINHA DO TEMPO SIMPLIFICADA NA BARRA DE TÍTULO */}
        <header className="bg-[#0B5187] text-white shrink-0 shadow-sm">
          
          {/* LINHA PRINCIPAL DA BARRA DE TÍTULO: ÍCONE + TÍTULO + LINHA DO TEMPO SIMPLIFICADA + FECHAR */}
          <div className="px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 border-b border-white/10">
            {/* Lado Esquerdo: Ícone + Título */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white font-black shrink-0">
                <Package className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xs sm:text-sm font-black tracking-tight leading-tight">
                  Nova Encomenda
                </h1>
                <span className="text-[9px] font-black uppercase tracking-wider bg-[#FF5E00] text-white px-1.5 py-0.2 rounded-full">
                  {orderCode}
                </span>
              </div>
            </div>

            {/* CENTRO: LINHA DO TEMPO SIMPLIFICADA DAS ETAPAS NA PRÓPRIA BARRA DE TÍTULO */}
            <nav aria-label="Linha do tempo das etapas" className="flex items-center gap-1 sm:gap-2">
              {[
                { step: 1, label: 'Clientes' },
                { step: 2, label: 'Tipo & Local' },
                { step: 3, label: 'Carga' },
                { step: 4, label: 'Finalizar' }
              ].map((s, index, arr) => {
                const isPast = currentStep > s.step;
                const isCurrent = currentStep === s.step;

                return (
                  <React.Fragment key={s.step}>
                    <button
                      type="button"
                      disabled={!isPast && !isCurrent}
                      onClick={() => {
                        if (isPast) setCurrentStep(s.step as 1 | 2 | 3 | 4);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs sm:text-sm font-black transition-all ${
                        isCurrent 
                          ? 'bg-[#FF5E00] text-white shadow-xs' 
                          : isPast 
                          ? 'bg-white/20 text-emerald-300 hover:bg-white/30 cursor-pointer' 
                          : 'text-white/40 cursor-not-allowed'
                      }`}
                    >
                      <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                        isCurrent 
                          ? 'bg-white text-[#FF5E00]' 
                          : isPast 
                          ? 'bg-emerald-400 text-[#0B5187]' 
                          : 'bg-white/20 text-white/50'
                      }`}>
                        {isPast ? '✓' : s.step}
                      </span>
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>

                    {index < arr.length - 1 && (
                      <div className={`w-2.5 sm:w-4 h-0.5 rounded-full transition-colors ${
                        currentStep > s.step ? 'bg-emerald-400' : 'bg-white/20'
                      }`} />
                    )}
                  </React.Fragment>
                );
              })}
            </nav>

            {/* Lado Direito: Fechar X */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsNewOrderModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white flex items-center justify-center transition-all cursor-pointer"
                title="Fechar formulário"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* LINHA 2 DA BARRA DE TÍTULO: QUANDO NA ETAPA 1 (BUSCANDO CLIENTE), INPUT DE BUSCA + NOVO CLIENTE */}
          {currentStep === 1 && (
            <div className="px-3 sm:px-4 py-2 flex items-center gap-2 bg-[#08426E]">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/70">
                  {isSearchingDb ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin text-amber-300" />
                  ) : (
                    <Search className="w-4.5 h-4.5" />
                  )}
                </div>
                <input
                  type="text"
                  autoFocus
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  placeholder="Buscar no banco de dados, sistema ou agenda (nome, tel, CPF)..."
                  className="w-full pl-10 pr-9 py-2 bg-white/15 hover:bg-white/20 focus:bg-white text-white focus:text-slate-900 placeholder:text-white/75 focus:placeholder:text-slate-400 border border-white/25 focus:border-white rounded-xl text-sm sm:text-base font-bold shadow-inner focus:outline-none transition-all"
                />
                {clientSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setClientSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/75 hover:text-white focus:text-slate-600 cursor-pointer"
                    title="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Botão de Busca Rápida na Agenda de Contatos (com texto completo) */}
              <button
                type="button"
                onClick={() => {
                  setPhoneAgendaTarget('coleta');
                  if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.pickContact) {
                    window.AndroidApp.pickContact();
                  } else {
                    setIsPhoneAgendaOpen(true);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0 border border-sky-400/40"
                title="Buscar contato na agenda de contatos do celular"
              >
                <BookUser className="w-4 h-4 stroke-[2.5]" />
                <span>Buscar na Agenda</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRegistrationInitialData(null);
                  setSelectorTargetField('client');
                  setIsRegistrationFullScreenOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                title="Cadastrar novo cliente"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span className="hidden sm:inline">Novo Cliente</span>
                <span className="sm:hidden">Novo</span>
              </button>
            </div>
          )}

        </header>

        {/* ========================================================
            CORPO DO FORMULÁRIO: APROVEITA O ESPAÇO TOTAL (NA ETAPA 2 MAPA OCUPA 100% SEM BORDAS)
            ======================================================== */}
        <div
          ref={currentStep === 1 ? databaseScrollRef : null}
          onScroll={currentStep === 1 ? (event) => {
            const element = event.currentTarget;
            if (element.scrollHeight - element.scrollTop - element.clientHeight < 180) {
              void loadMoreDatabaseCustomers();
            }
          } : undefined}
          className={`flex-1 min-h-0 ${currentStep === 2 ? 'overflow-hidden p-0 relative flex flex-col' : 'overflow-y-auto p-3 sm:p-4 md:p-5'}`}
        >
          
          {/* ====================================================
              ETAPA 1: LISTA CHEIA DE CLIENTES (GRID MULTI-COLUNA)
              ==================================================== */}
          {currentStep === 1 && (
            <div className="flex flex-col h-full space-y-2">
              
              {/* CARD DE CLIENTE SELECIONADO: LINHA COMPACTA SEM DESPERDÍCIO */}
              {selectedCustomer && (
                <div className={`px-3.5 py-2 rounded-xl border shrink-0 transition-all flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-2xs ${
                  clientValidation.isValid 
                    ? 'bg-emerald-50/90 border-emerald-300' 
                    : 'bg-amber-50/90 border-amber-300'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs text-white shrink-0 shadow-2xs ${
                      clientValidation.isValid ? 'bg-emerald-600' : 'bg-amber-600'
                    }`}>
                      {selectedCustomer.fullName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                        {selectedCustomer.fullName}
                      </span>
                      <span className="text-xs sm:text-sm text-slate-800 font-bold">
                        📞 {selectedCustomer.phone}
                      </span>
                      <span className="text-xs text-slate-700 font-semibold font-mono">
                        {(() => {
                          const docInfo = formatTaxId(selectedCustomer.cpf);
                          return docInfo.clean ? `${docInfo.type}: ${docInfo.formatted}` : 'Sem CPF/CNPJ';
                        })()}
                      </span>
                      {selectedCustomer.address && (
                        <span className="text-xs text-slate-600 font-medium truncate max-w-xs hidden lg:inline">
                          📍 {selectedCustomer.address}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                    {/* Validações inline */}
                    <div className="flex items-center gap-2.5 text-xs font-bold mr-1 hidden sm:flex">
                      <span className={clientValidation.hasName ? 'text-emerald-700' : 'text-red-600'}>
                        {clientValidation.hasName ? '✓' : '✗'} Nome
                      </span>
                      <span className={clientValidation.hasCpf ? 'text-emerald-700' : 'text-red-600'}>
                        {clientValidation.hasCpf ? '✓' : '✗'} CPF
                      </span>
                      <span className={clientValidation.hasLocation ? 'text-emerald-700' : 'text-red-600'}>
                        {clientValidation.hasLocation ? '✓' : '✗'} Local
                      </span>
                    </div>

                    {/* BOTÃO ÚLTIMAS ENCOMENDAS (DISPONÍVEL PARA TODOS OS CLIENTES E AGENDA) */}
                    {selectedCustomer && (
                      <button
                        type="button"
                        onClick={() => {
                          setPastOrdersCustomer(selectedCustomer);
                          setIsPastOrdersModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-[#0B5187] hover:bg-[#083D66] active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Ver histórico de encomendas deste cliente"
                      >
                        <History className="w-4 h-4" />
                        <span>Histórico</span>
                        {customerOrderStatsService.getOrderCount(selectedCustomer) > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-white font-black text-[10.5px]">
                            {customerOrderStatsService.getOrderCount(selectedCustomer)}
                          </span>
                        )}
                      </button>
                    )}

                    {!clientValidation.hasLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          openCustomerLocationModal({
                            customerId: selectedCustomer.id,
                            customerName: selectedCustomer.fullName,
                            customerPhone: selectedCustomer.phone,
                            place: (selectedCustomer.coordinates && selectedCustomer.address) ? {
                              id: `temp-${selectedCustomer.id}`,
                              name: selectedCustomer.fullName,
                              address: selectedCustomer.address,
                              coordinates: selectedCustomer.coordinates
                            } as Place : undefined,
                            onLocationSelected: async (newAddr, newCoords, newCity) => {
                              const updated: Customer = {
                                ...selectedCustomer,
                                address: newAddr,
                                coordinates: newCoords,
                                ...(newCity ? { city: newCity, cidade: newCity } : {})
                              };
                              const saved = await updateCustomer(selectedCustomer.id, updated);
                              if (!saved) {
                                window.alert('Não foi possível salvar o endereço do cliente. Verifique a conexão e tente novamente.');
                                return;
                              }
                              setSelectedCustomer(updated);
                              if (operationType === 'coleta') {
                                setDeliveryAddress(newAddr);
                                setDeliveryCoords(newCoords);
                                setDeliveryContact(updated.fullName);
                                setDeliveryPhone(updated.phone);
                              } else if (operationType === 'entrega') {
                                setPickupAddress(newAddr);
                                setPickupCoords(newCoords);
                                setPickupContact(updated.fullName);
                                setPickupPhone(updated.phone);
                              } else if (operationType === 'troca') {
                                setPickupAddress(newAddr);
                                setPickupCoords(newCoords);
                                setDeliveryAddress(newAddr);
                                setDeliveryCoords(newCoords);
                                setPickupContact(updated.fullName);
                                setDeliveryContact(updated.fullName);
                              }
                            }
                          });
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
                        title="Setar localização do cliente no mapa"
                      >
                        <MapPin className="w-4 h-4" />
                        <span>Setar Local</span>
                      </button>
                    )}

                    {clientValidation.isValid ? (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Avançar com este cliente"
                      >
                        <span>Avançar</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRegistrationInitialData(selectedCustomer);
                          setSelectorTargetField('client');
                          setIsRegistrationFullScreenOpen(true);
                        }}
                        className="px-3 py-1.5 bg-[#FF5E00] hover:bg-[#E05300] active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-lg shadow-xs transition-all cursor-pointer"
                      >
                        Completar
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* LISTA CHEIA EM GRID RESPONSIVO (APROVEITA A TELA INTEIRA) */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
                
                {/* 1. CLIENTES CADASTRADOS NO SISTEMA (PRIMEIRO NO TOPO, NA COR VERDINHA) */}
                {filteredCustomers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-emerald-700" />
                        <span>Cadastros do Sistema ({filteredCustomers.length})</span>
                      </span>
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300">
                        ✓ Cadastrados no Topo
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {filteredCustomers.map(cust => {
                        const isSelected = selectedCustomer?.id === cust.id;
                        const extraAddrCount = cust.additionalAddresses?.length || 0;
                        const city = extractCityFromAddress(cust.address);

                        const completeness = checkUserCompleteness({
                          name: cust.fullName,
                          phone: cust.phone,
                          cpf: cust.cpf
                        });
                        const orderCount = customerOrderStatsService.getOrderCount(cust);

                        return (
                          <div
                            key={cust.id}
                            onClick={() => handleSelectClientFromList(cust)}
                            title={`${cust.fullName} • Clique para avançar para a próxima etapa`}
                            className={`px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-2.5 shadow-2xs group cursor-pointer ${
                              isSelected 
                                ? 'bg-emerald-100/90 border-emerald-600 ring-2 ring-emerald-500/25 shadow-xs' 
                                : completeness.isComplete
                                  ? 'border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100/90 active:bg-emerald-200/90'
                                  : 'border-amber-300 bg-amber-50/80 hover:bg-amber-100/90 active:bg-amber-200/90'
                            }`}
                          >
                            {/* Lado Esquerdo: Avatar com 'v' no topo + Nome e Embaixo Cidade e Telefone */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`relative w-9 h-9 rounded-lg text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs ${
                                completeness.isComplete ? 'bg-emerald-600' : 'bg-amber-600'
                              }`}>
                                {cust.fullName.charAt(0).toUpperCase()}
                                <span className={`absolute -top-1.5 -right-1.5 w-4.5 h-4.5 text-white rounded-full flex items-center justify-center text-xs font-black border-2 border-white shadow-2xs ${
                                  completeness.isComplete ? 'bg-emerald-700' : 'bg-amber-700'
                                }`} title={completeness.isComplete ? 'Cadastro Completo' : 'Cadastro Incompleto'}>
                                  {completeness.isComplete ? '✓' : '!'}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className={`font-extrabold text-sm sm:text-base truncate tracking-tight ${
                                    completeness.isComplete ? 'text-slate-900 group-hover:text-emerald-950' : 'text-slate-900 group-hover:text-amber-950'
                                  }`}>
                                    {cust.fullName}
                                  </span>
                                  {completeness.isComplete ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded-md flex items-center gap-0.5 shrink-0">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                      Completo
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded-md flex items-center gap-0.5 shrink-0">
                                      <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                      Falta: {completeness.missingFields.join(', ')}
                                    </span>
                                  )}
                                  {extraAddrCount > 0 && (
                                    <span className="text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 px-1.5 py-0.5 rounded shrink-0">
                                      +{extraAddrCount} locais
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs sm:text-[13px] font-semibold flex items-center gap-2 flex-wrap truncate mt-0.5 text-slate-600">
                                  <span className="text-slate-900 font-bold">{city}</span>
                                  <span className="text-slate-400 font-bold">•</span>
                                  <span className="text-slate-700 font-bold">{cust.phone || 'Sem telefone'}</span>
                                  {cust.cpf && (
                                    <>
                                      <span className="text-slate-400 font-bold">•</span>
                                      {(() => {
                                        const doc = formatTaxId(cust.cpf);
                                        return (
                                          <span className="text-emerald-800 font-bold font-mono">
                                            {doc.type}: {doc.formatted}
                                          </span>
                                        );
                                      })()}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Lado Direito: Botãozinho de histórico com quantidade de pedidos */}
                            <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPastOrdersCustomer(cust);
                                  setIsPastOrdersModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                title={orderCount > 0 ? `Histórico: ${orderCount} ${orderCount === 1 ? 'pedido' : 'pedidos'}` : "Histórico de encomendas deste cliente"}
                              >
                                <History className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span>Histórico</span>
                                {orderCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 font-black text-[10px] border border-emerald-200">
                                    {orderCount}
                                  </span>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. CLIENTES DO BANCO DE DADOS (BUSCA DINÂMICA E OTIMIZADA NO BANCO) */}
                {dbCustomers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5 px-1 mt-2.5">
                      <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-amber-700" />
                        <span>Banco de Dados Central ({dbCustomers.length})</span>
                      </span>
                      <span className="text-xs font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-300">
                        🏢 Banco
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {dbCustomers.map(cust => {
                        const isSelected = selectedCustomer?.id === cust.id || (selectedCustomer?.phone && cust.phone && selectedCustomer.phone.replace(/\D/g, '') === cust.phone.replace(/\D/g, ''));
                        const city = extractCityFromAddress(cust.address);
                        const completeness = checkUserCompleteness({
                          name: cust.fullName,
                          phone: cust.phone,
                          cpf: cust.cpf
                        });
                        const orderCount = customerOrderStatsService.getOrderCount(cust);

                        return (
                          <div
                            key={cust.id}
                            onClick={() => {
                              handleSelectClientFromList(cust);
                            }}
                            title={`${cust.fullName} • Clique para selecionar este cliente do banco de dados`}
                            className={`px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-2.5 shadow-2xs group cursor-pointer ${
                              isSelected 
                                ? 'bg-amber-100/90 border-amber-600 ring-2 ring-amber-500/25 shadow-xs' 
                                : completeness.isComplete
                                  ? 'border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100/90 active:bg-emerald-200/90'
                                  : 'border-amber-300 bg-amber-50/80 hover:bg-amber-100/90 active:bg-amber-200/90'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`relative w-9 h-9 rounded-lg text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs ${
                                completeness.isComplete ? 'bg-emerald-600' : 'bg-amber-600'
                              }`}>
                                {cust.fullName.charAt(0).toUpperCase()}
                                <span className={`absolute -top-1.5 -right-1.5 w-4.5 h-4.5 text-white rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-2xs ${
                                  completeness.isComplete ? 'bg-emerald-700' : 'bg-amber-700'
                                }`} title={completeness.isComplete ? 'Cadastro Completo' : 'Cadastro Incompleto'}>
                                  {completeness.isComplete ? '✓' : '!'}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className={`font-extrabold text-sm sm:text-base truncate tracking-tight ${
                                    completeness.isComplete ? 'text-slate-900 group-hover:text-emerald-950' : 'text-slate-900 group-hover:text-amber-950'
                                  }`}>
                                    {cust.fullName}
                                  </span>
                                  {completeness.isComplete ? (
                                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded-md flex items-center gap-0.5 shrink-0">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                      Completo
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded-md flex items-center gap-0.5 shrink-0">
                                      <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                      Falta: {completeness.missingFields.join(', ')}
                                    </span>
                                  )}
                                  {cust.cpf && (
                                    <span className="text-[11px] font-bold bg-amber-200/80 text-amber-950 px-1.5 py-0.2 rounded border border-amber-300 shrink-0 font-mono">
                                      {formatTaxId(cust.cpf).displayLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs sm:text-[13px] font-semibold flex items-center gap-2 flex-wrap truncate mt-0.5 text-slate-600">
                                  <span className="text-slate-900 font-bold">{city}</span>
                                  {cust.phone && (
                                    <>
                                      <span className="text-slate-400 font-bold">•</span>
                                      <span className="text-slate-700 font-bold">{cust.phone}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPastOrdersCustomer(cust);
                                  setIsPastOrdersModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                title={orderCount > 0 ? `Histórico: ${orderCount} ${orderCount === 1 ? 'pedido' : 'pedidos'}` : "Histórico de encomendas deste cliente"}
                              >
                                <History className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>Histórico</span>
                                {orderCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-black text-[10px] border border-amber-200">
                                    {orderCount}
                                  </span>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* INDICADOR DE CARREGAMENTO DO BANCO DE DADOS */}
                {isSearchingDb && (
                  <div className="py-2.5 px-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-center gap-2 text-amber-900 text-xs font-bold">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                    <span>Buscando no banco de dados em tempo real...</span>
                  </div>
                )}

                {filteredCustomers.length === 0 && dbCustomers.length === 0 && !isSearchingDb && !hasMoreDbCustomers && (
                  <div className="py-12 text-center text-slate-400">
                    <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-bold text-sm text-slate-600">Nenhum cliente cadastrado encontrado com esse termo.</p>
                    <p className="text-xs text-slate-400 mt-1">Experimente buscar por outro nome, telefone ou CPF.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneAgendaTarget('coleta');
                        if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.pickContact) {
                          window.AndroidApp.pickContact();
                        } else {
                          setIsPhoneAgendaOpen(true);
                        }
                      }}
                      className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 bg-sky-50 hover:bg-sky-100 active:scale-95 text-sky-800 border border-sky-300 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer shadow-xs"
                    >
                      <BookUser className="w-4 h-4 text-sky-600" />
                      <span>Buscar na Agenda de Contatos</span>
                    </button>
                  </div>
                )}

                {isLoadingMoreDbCustomers && (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-amber-800">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Carregando mais clientes do banco...
                  </div>
                )}
                <div ref={databaseSentinelRef} className={hasMoreDbCustomers ? 'h-3' : 'h-0'} aria-hidden="true" />

              </div>

              {stepErrors.client && (
                <p className="text-xs font-bold text-red-600 flex items-center gap-1 shrink-0">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{stepErrors.client}</span>
                </p>
              )}
            </div>
          )}

          {/* ====================================================
              ETAPA 2: LOCAIS COM O MAPA INTEGRADO DIRETO NA TELA
              ==================================================== */}
          {currentStep === 2 && (
            <EmbeddedLocationMapStep
              selectedCustomer={selectedCustomer}
              operationType={operationType}
              onSelectOperationType={handleSelectOperationType}
              onOpenFullScreenMap={() => setMapPickerTarget(operationType)}

              pickupAddress={pickupAddress}
              pickupCoords={pickupCoords}
              pickupContact={pickupContact}
              pickupPhone={pickupPhone}
              pickupNotes={pickupNotes}
              pickupDate={pickupDate}
              pickupTime={pickupTime}
              pickupTimeMode={pickupTimeMode}
              onUpdatePickup={(data) => {
                if (data.address !== undefined) setPickupAddress(data.address);
                if (data.coords !== undefined) setPickupCoords(data.coords);
                if (data.contact !== undefined) setPickupContact(data.contact);
                if (data.phone !== undefined) setPickupPhone(data.phone);
                if (data.notes !== undefined) setPickupNotes(data.notes);
                if (data.date !== undefined) setPickupDate(data.date);
                if (data.time !== undefined) setPickupTime(data.time);
                if (data.timeMode !== undefined) setPickupTimeMode(data.timeMode);
              }}

              deliveryAddress={deliveryAddress}
              deliveryCoords={deliveryCoords}
              deliveryContact={deliveryContact}
              deliveryPhone={deliveryPhone}
              deliveryNotes={deliveryNotes}
              deliveryDate={deliveryDate}
              deliveryTime={deliveryTime}
              deliveryTimeMode={deliveryTimeMode}
              onUpdateDelivery={(data) => {
                if (data.address !== undefined) setDeliveryAddress(data.address);
                if (data.coords !== undefined) setDeliveryCoords(data.coords);
                if (data.contact !== undefined) setDeliveryContact(data.contact);
                if (data.phone !== undefined) setDeliveryPhone(data.phone);
                if (data.notes !== undefined) setDeliveryNotes(data.notes);
                if (data.date !== undefined) setDeliveryDate(data.date);
                if (data.time !== undefined) setDeliveryTime(data.time);
                if (data.timeMode !== undefined) setDeliveryTimeMode(data.timeMode);
              }}

              exchangeAddress={exchangeAddress}
              exchangeCoords={exchangeCoords}
              exchangeContact={exchangeContact}
              exchangePhone={exchangePhone}
              exchangeNotes={exchangeNotes}
              exchangeDate={exchangeDate}
              exchangeTime={exchangeTime}
              exchangeTimeMode={exchangeTimeMode}
              onUpdateExchange={(data) => {
                if (data.address !== undefined) setExchangeAddress(data.address);
                if (data.coords !== undefined) setExchangeCoords(data.coords);
                if (data.contact !== undefined) setExchangeContact(data.contact);
                if (data.phone !== undefined) setExchangePhone(data.phone);
                if (data.notes !== undefined) setExchangeNotes(data.notes);
                if (data.date !== undefined) setExchangeDate(data.date);
                if (data.time !== undefined) setExchangeTime(data.time);
                if (data.timeMode !== undefined) setExchangeTimeMode(data.timeMode);
              }}

              stepErrors={stepErrors}
              onClearError={(field) => {
                setStepErrors(prev => {
                  const updated = { ...prev };
                  delete updated[field];
                  return updated;
                });
              }}
              onOpenPhoneAgenda={(target) => {
                setPhoneAgendaTarget(target);
                if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.pickContact) {
                  window.AndroidApp.pickContact();
                } else {
                  setIsPhoneAgendaOpen(true);
                }
              }}
              onChangeCustomer={() => setCurrentStep(1)}
              onUpdateCustomerLocation={async (address, coords) => {
                if (selectedCustomer) {
                  let city = resolveCustomerCity({ address });
                  if (!city) {
                    try {
                      city = resolveCustomerCity(await reverseGeocode(coords));
                    } catch {}
                  }
                  city = city || normalizeCityName(selectedCustomer.city || selectedCustomer.cidade);
                  const updatedCust: Customer = {
                    ...selectedCustomer,
                    address,
                    coordinates: coords,
                    ...(city ? { city, cidade: city } : {})
                  };
                  const saved = await updateCustomer(selectedCustomer.id, updatedCust);
                  if (!saved) {
                    window.alert('Não foi possível salvar o endereço do cliente. Verifique a conexão e tente novamente.');
                    return;
                  }
                  setSelectedCustomer(updatedCust);
                }
              }}
            />
          )}

          {/* ====================================================
              ETAPA 3: TRANSPORTE, CARGA, VOLUMES E DETALHES (COM ACORDIONS)
              ==================================================== */}
          {currentStep === 3 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              
              {/* ========================================================
                  1. TAMANHO DA CARGA & PORTE EM GRANDE EVIDÊNCIA (PRINCIPAL)
                  ======================================================== */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border-2 border-slate-300 shadow-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#0B5187] text-white flex items-center justify-center font-black shadow-2xs">
                      <Truck className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <span>1. Tamanho da Carga & Porte do Veículo</span>
                        <span className="text-red-500">*</span>
                      </h2>
                      <p className="text-[11px] text-slate-500 font-semibold">
                        Selecione o tamanho para definir o veículo e capacidades recomendadas
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-black uppercase tracking-wider bg-blue-50 text-[#0B5187] px-2.5 py-1 rounded-full border border-blue-200">
                    Porte Ativo: {CARGO_SIZE_PRESETS[packageSize].label} ({CARGO_SIZE_PRESETS[packageSize].vehicle})
                  </span>
                </div>

                {/* BOTÕES DE TAMANHO EM GRANDE EVIDÊNCIA */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      ...CARGO_SIZE_PRESETS.pequeno,
                      icon: Bike,
                      activeClass: 'border-amber-500 bg-linear-to-b from-amber-50/90 to-amber-100/50 text-amber-950 ring-3 ring-amber-400/50 shadow-md scale-[1.01]',
                      inactiveClass: 'bg-slate-50/70 border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 text-slate-700',
                      badgeActive: 'bg-amber-500 text-white shadow-2xs',
                      badgeInactive: 'bg-amber-100 text-amber-900 border border-amber-200',
                      iconBg: 'bg-amber-500 text-white'
                    },
                    {
                      ...CARGO_SIZE_PRESETS.medio,
                      icon: Car,
                      activeClass: 'border-emerald-500 bg-linear-to-b from-emerald-50/90 to-emerald-100/50 text-emerald-950 ring-3 ring-emerald-400/50 shadow-md scale-[1.01]',
                      inactiveClass: 'bg-slate-50/70 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 text-slate-700',
                      badgeActive: 'bg-emerald-600 text-white shadow-2xs',
                      badgeInactive: 'bg-emerald-100 text-emerald-900 border border-emerald-200',
                      iconBg: 'bg-emerald-600 text-white'
                    },
                    {
                      ...CARGO_SIZE_PRESETS.grande,
                      icon: Truck,
                      activeClass: 'border-indigo-500 bg-linear-to-b from-indigo-50/90 to-indigo-100/50 text-indigo-950 ring-3 ring-indigo-400/50 shadow-md scale-[1.01]',
                      inactiveClass: 'bg-slate-50/70 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-700',
                      badgeActive: 'bg-indigo-600 text-white shadow-2xs',
                      badgeInactive: 'bg-indigo-100 text-indigo-900 border border-indigo-200',
                      iconBg: 'bg-indigo-600 text-white'
                    }
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = packageSize === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectPackageSize(item.id)}
                        className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-2 select-none relative ${
                          isSelected ? item.activeClass : item.inactiveClass
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform ${
                              isSelected ? `${item.iconBg} shadow-xs scale-105` : 'bg-white border border-slate-200 text-slate-600'
                            }`}>
                              <Icon className="w-4 h-4 stroke-[2.5]" />
                            </div>
                            <div>
                              <span className="text-sm font-black block leading-tight">{item.label}</span>
                              <span className="text-[10px] text-slate-500 font-semibold">{item.sublabel}</span>
                            </div>
                          </div>

                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-current text-white flex items-center justify-center text-xs shrink-0 font-black shadow-2xs">
                              ✓
                            </span>
                          )}
                        </div>

                        {/* Veículo e Peso Máximo */}
                        <div className="flex items-center justify-between gap-1 w-full pt-1 border-t border-slate-200/60">
                          <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg truncate ${
                            isSelected ? item.badgeActive : item.badgeInactive
                          }`}>
                            {item.vehicle}
                          </span>
                          <span className="text-[11px] font-black text-[#0B5187] truncate">
                            {item.maxWeightText}
                          </span>
                        </div>

                        {/* Dimensões padrão */}
                        <div className="text-[10px] text-slate-500 font-semibold truncate">
                          Dimensões: <strong className="text-slate-800 font-bold">{item.dimensionsText}</strong>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ========================================================
                  2. DEMAIS CONFIGURAÇÕES EM ACORDIONS FECHADOS POR PADRÃO
                  ======================================================== */}
              <div className="space-y-2.5">
                
                {/* ACORDION 1: TIPO DE ENCOMENDA & EMBALAGEM */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => toggleCargoAccordion('types')}
                    className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0B5187] border border-blue-200 flex items-center justify-center shrink-0 shadow-2xs">
                        <Package className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900">
                            Tipo de Encomenda & Embalagem
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          Defina a embalagem (Envelope, Caixa, Cilindro, etc.)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-blue-50 text-[#0B5187] border border-blue-200 max-w-[140px] sm:max-w-[220px] truncate">
                        {selectedPackageType || 'Envelope'}
                      </span>
                      <div className={`w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 transition-transform duration-200 ${
                        openCargoAccordions.types ? 'rotate-180 bg-blue-50 text-[#0B5187]' : ''
                      }`}>
                        <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    </div>
                  </button>

                  {openCargoAccordions.types && (
                    <div className="p-3.5 sm:p-4 border-t border-slate-100 space-y-2.5 animate-in fade-in duration-150 bg-slate-50/40">
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <span className="text-xs font-bold text-slate-600">
                          Escolha os tipos de itens para o transporte:
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsMultiTypeMode(!isMultiTypeMode)}
                            className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                              isMultiTypeMode 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                            title="Permite selecionar mais de um tipo de carga no mesmo pedido"
                          >
                            <Layers className="w-3 h-3 stroke-[2.5]" />
                            <span>{isMultiTypeMode ? '✓ Múltiplos tipos ativos' : '+ Selecionar mais de 1 tipo'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsAddingNewPackageType(true)}
                            className="inline-flex items-center gap-1 text-[11px] font-black text-[#0B5187] bg-white hover:bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3 stroke-[3]" />
                            <span>+ Novo Tipo</span>
                          </button>
                        </div>
                      </div>

                      {/* Input inline para adicionar novo tipo */}
                      {isAddingNewPackageType && (
                        <div className="p-2.5 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center gap-2 flex-wrap animate-in fade-in duration-150">
                          <input
                            type="text"
                            autoFocus
                            value={newPackageTypeInput}
                            onChange={(e) => setNewPackageTypeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveNewPackageType();
                              if (e.key === 'Escape') setIsAddingNewPackageType(false);
                            }}
                            placeholder="Nome do tipo (ex: Bolo, Vidro, Flores, Pneu)..."
                            className="flex-1 min-w-[140px] px-3 py-1.5 bg-white border border-slate-300 focus:border-[#0B5187] rounded-lg text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSaveNewPackageType}
                            disabled={!newPackageTypeInput.trim()}
                            className="px-3 py-1.5 bg-[#0B5187] hover:bg-blue-900 disabled:opacity-50 text-white font-black text-xs rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingNewPackageType(false);
                              setNewPackageTypeInput('');
                            }}
                            className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* Chips compactos e organizados */}
                      <div className="flex items-center gap-1.5 flex-wrap max-h-[160px] overflow-y-auto pr-0.5 custom-scrollbar">
                        {packageTypeList.map((type) => {
                          const isSelected = selectedPackageTypes.includes(type);
                          const isFrg = type.toLowerCase().includes('frágil') || type.toLowerCase().includes('fragil');
                          const isCil = type.toLowerCase().includes('cilindro');
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                if (isMultiTypeMode) {
                                  handleTogglePackageType(type);
                                } else {
                                  handleSelectPackageType(type);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs ${
                                isSelected
                                  ? isCil
                                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-400'
                                    : isFrg
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-400'
                                    : 'bg-[#0B5187] text-white border-[#0B5187] shadow-xs ring-2 ring-blue-300'
                                  : isCil
                                  ? 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
                                  : isFrg
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                              }`}
                            >
                              {isCil ? <span>🛢️</span> : isFrg ? <AlertTriangle className="w-3.5 h-3.5 text-current shrink-0" /> : null}
                              <span>{type}</span>
                              {isSelected && <span className="font-black">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ACORDION 2: QUANTIDADE DE VOLUMES & CARGA FRÁGIL */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => toggleCargoAccordion('volumes')}
                    className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shrink-0 shadow-2xs">
                        <Layers className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900">
                            Quantidade de Volumes & Cuidado Especial
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          Total de volumes e sinalização de frágil
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 border border-purple-200">
                        {selectedPackageTypes.some(t => t.toLowerCase().includes('cilindro')) && selectedPackageTypes.length === 1
                          ? `${volumeQuantity} ${volumeQuantity === 1 ? 'cilindro' : 'cilindros'}`
                          : volumesCount}
                      </span>
                      {isFragile && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
                          ⚠️ Frágil
                        </span>
                      )}
                      <div className={`w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 transition-transform duration-200 ${
                        openCargoAccordions.volumes ? 'rotate-180 bg-purple-50 text-purple-700' : ''
                      }`}>
                        <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    </div>
                  </button>

                  {openCargoAccordions.volumes && (
                    <div className="p-3.5 sm:p-4 border-t border-slate-100 space-y-3.5 animate-in fade-in duration-150 bg-slate-50/40">
                      
                      {/* CONTROLE DE VOLUME */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Total de Volumes:
                          </label>
                          <span className="text-xs font-black text-[#0B5187]">
                            {volumesCount}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateVolumeQuantity(volumeQuantity - 1)}
                            disabled={volumeQuantity <= 1}
                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white hover:bg-slate-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-slate-300 text-slate-800 flex items-center justify-center font-black transition-all cursor-pointer shadow-2xs shrink-0"
                            title="Diminuir volume (-1)"
                          >
                            <Minus className="w-5 h-5 stroke-[3]" />
                          </button>

                          <div className="relative flex-1">
                            <input
                              type="number"
                              min={1}
                              max={999}
                              value={volumeQuantityInput}
                              onChange={(e) => handleVolumeInputChange(e.target.value)}
                              onBlur={handleVolumeInputBlur}
                              className="w-full text-center py-2.5 px-3 bg-white border-2 border-slate-300 focus:border-[#0B5187] rounded-xl text-base sm:text-lg font-black text-slate-900 focus:outline-none transition-all shadow-inner"
                              placeholder="1"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none hidden sm:inline">
                              {selectedPackageTypes.some(t => t.toLowerCase().includes('cilindro')) && selectedPackageTypes.length === 1
                                ? (volumeQuantity === 1 ? 'cil' : 'cils')
                                : (volumeQuantity === 1 ? 'vol' : 'vols')}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUpdateVolumeQuantity(volumeQuantity + 1)}
                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#0B5187] hover:bg-blue-900 active:scale-95 text-white flex items-center justify-center font-black transition-all cursor-pointer shadow-xs shrink-0"
                            title="Aumentar volume (+1)"
                          >
                            <Plus className="w-5 h-5 stroke-[3]" />
                          </button>
                        </div>

                        {/* Botões rápidos de volumes */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Atalhos:</span>
                          {[1, 2, 3, 4, 5, 8, 10, 20].map((num) => {
                            const isSelected = volumeQuantity === num;
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => handleUpdateVolumeQuantity(num)}
                                className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                                  isSelected
                                    ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-2xs ring-1 ring-blue-300'
                                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {num} {num === 1 ? 'vol' : 'vols'}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Alerta de Cilindro */}
                      {selectedPackageTypes.some(t => t.toLowerCase().includes('cilindro')) && (
                        <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 flex items-start gap-2 shadow-2xs">
                          <span className="text-base shrink-0">🛢️</span>
                          <div className="space-y-0.5">
                            <span className="font-black text-indigo-900">Cilindro com múltiplos volumes: {volumeQuantity} un.</span>
                            <p className="text-[11px] text-indigo-800 leading-snug">
                              Adequado para transporte seguro de cilindros sob pressão.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Toggle Carga Frágil */}
                      <div
                        onClick={() => setIsFragile(!isFragile)}
                        className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                          isFragile
                            ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400/40 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isFragile ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-900 block">
                              ⚠️ Carga Frágil / Mercadoria Delicada
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium block">
                              Avisa o entregador para ter cuidado redobrado no trajeto
                            </span>
                          </div>
                        </div>

                        <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                          isFragile ? 'bg-amber-500 border-amber-600 text-white' : 'bg-white border-slate-300'
                        }`}>
                          {isFragile && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                      </div>

                    </div>
                  )}
                </div>

                {/* ACORDION 3: DIMENSÕES E PESO PERSONALIZADOS */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => toggleCargoAccordion('dimensions')}
                    className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0 shadow-2xs">
                        <Scale className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900">
                            Dimensões e Peso da Carga
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          Personalize o peso em kg e medidas em centímetros
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-amber-50 text-amber-950 border border-amber-200">
                        {weightKg ? `${weightKg} kg` : 'Padrão'} • {lengthCm || '-'}×{widthCm || '-'}×{heightCm || '-'} cm
                      </span>
                      <div className={`w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 transition-transform duration-200 ${
                        openCargoAccordions.dimensions ? 'rotate-180 bg-amber-50 text-amber-700' : ''
                      }`}>
                        <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    </div>
                  </button>

                  {openCargoAccordions.dimensions && (
                    <div className="p-3.5 sm:p-4 border-t border-slate-100 space-y-3 animate-in fade-in duration-150 bg-slate-50/40">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          Limites do porte selecionado ({CARGO_SIZE_PRESETS[packageSize].label}):
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleResetMeasurementsToDefault}
                            className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-blue-50 text-[#0B5187] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                            title="Restaurar padrão e peso máximo do porte"
                          >
                            Restaurar Padrão
                          </button>
                          <button
                            type="button"
                            onClick={handleClearMeasurements}
                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white text-slate-500 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Deixar sem medidas/peso"
                          >
                            Limpar
                          </button>
                        </div>
                      </div>

                      {/* Banner informativo de padrão e peso máximo atual */}
                      <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-1 text-[11px] shadow-2xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                          <span className="text-[#0B5187] font-black">Porte {CARGO_SIZE_PRESETS[packageSize].label}:</span>
                          <span>Capacidade: <strong className="text-slate-900">{CARGO_SIZE_PRESETS[packageSize].maxWeightText}</strong></span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-500">
                          Espaço útil: <strong className="text-slate-700">{CARGO_SIZE_PRESETS[packageSize].dimensionsText}</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                        {/* Peso Máximo */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-black text-slate-700 block truncate">
                            Peso (kg) <span className="text-[#0B5187] font-bold">• Máx</span>
                          </span>
                          <input
                            type="text"
                            value={weightKg}
                            onChange={(e) => setWeightKg(e.target.value)}
                            placeholder={CARGO_SIZE_PRESETS[packageSize].defaultWeight}
                            className="w-full px-2.5 py-1.5 bg-white border-2 border-[#0B5187] rounded-xl text-xs font-black text-slate-900 focus:outline-none"
                          />
                          <span className="text-[10px] font-bold text-[#0B5187] block truncate">
                            Máx: {CARGO_SIZE_PRESETS[packageSize].maxWeightKg} kg
                          </span>
                        </div>

                        {/* Comp */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-slate-600 block truncate">Comprimento (cm)</span>
                          <input
                            type="text"
                            value={lengthCm}
                            onChange={(e) => setLengthCm(e.target.value)}
                            placeholder={CARGO_SIZE_PRESETS[packageSize].defaultLength}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 focus:border-[#0B5187] rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 block truncate">
                            Padrão: {CARGO_SIZE_PRESETS[packageSize].defaultLength} cm
                          </span>
                        </div>

                        {/* Larg */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-slate-600 block truncate">Largura (cm)</span>
                          <input
                            type="text"
                            value={widthCm}
                            onChange={(e) => setWidthCm(e.target.value)}
                            placeholder={CARGO_SIZE_PRESETS[packageSize].defaultWidth}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 focus:border-[#0B5187] rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 block truncate">
                            Padrão: {CARGO_SIZE_PRESETS[packageSize].defaultWidth} cm
                          </span>
                        </div>

                        {/* Alt */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-slate-600 block truncate">Altura (cm)</span>
                          <input
                            type="text"
                            value={heightCm}
                            onChange={(e) => setHeightCm(e.target.value)}
                            placeholder={CARGO_SIZE_PRESETS[packageSize].defaultHeight}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 focus:border-[#0B5187] rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 block truncate">
                            Padrão: {CARGO_SIZE_PRESETS[packageSize].defaultHeight} cm
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ACORDION 4: INSTRUÇÕES & OBSERVAÇÕES DA CARGA */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => toggleCargoAccordion('notes')}
                    className="w-full p-3 sm:p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                        <FileText className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900">
                            Instruções & Observações da Carga
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          Orientações específicas de transporte para o entregador
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg border ${
                        observations ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {observations ? 'Preenchido' : 'Opcional'}
                      </span>
                      <div className={`w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 transition-transform duration-200 ${
                        openCargoAccordions.notes ? 'rotate-180 bg-slate-200 text-slate-800' : ''
                      }`}>
                        <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    </div>
                  </button>

                  {openCargoAccordions.notes && (
                    <div className="p-3.5 sm:p-4 border-t border-slate-100 space-y-2.5 animate-in fade-in duration-150 bg-slate-50/40">
                      <textarea
                        rows={2}
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        placeholder="Instruções para o entregador, cuidados no manuseio, etc..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 focus:border-[#0B5187] rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none transition-all shadow-2xs resize-none"
                      />

                      {/* Chips rápidos de texto para observações */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[10px] font-bold text-slate-500">Sugestões:</span>
                        {[
                          'Cuidado no manuseio',
                          'Manter na vertical',
                          'Não molhar',
                          'Conferir lacre',
                          'Entregar em mãos'
                        ].map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              const current = observations.trim();
                              const next = current ? `${current}, ${item}` : item;
                              setObservations(next);
                            }}
                            className="px-2 py-0.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-[#0B5187] border border-slate-200 hover:border-blue-300 rounded-lg text-[11px] font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
                          >
                            + {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* ====================================================
              ETAPA 4: DASHBOARD FINAL (MAPA À ESQUERDA, PREÇO À DIREITA)
              ==================================================== */}
          {currentStep === 4 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 animate-in fade-in duration-150">
              
              {/* LADO ESQUERDO: MINI-MAPA + ROTA + ENDEREÇOS (7 COLUNAS) */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Route className="w-4 h-4 text-[#0B5187]" />
                    <span>Traçado da Rota em Tempo Real</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#0B5187] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                      ⚡ {distanceKm} km
                    </span>
                    <span className="text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      ⏱️ ~{durationMin} min
                    </span>
                  </div>
                </div>

                {/* MAPA INTERATIVO REAL DA ROTA LEAFLET */}
                <div className="relative w-full h-60 sm:h-72 md:h-80 rounded-2xl overflow-hidden border-2 border-slate-300 shadow-md bg-slate-100">
                  <div 
                    ref={miniMapContainerRef} 
                    className="w-full h-full pointer-events-auto"
                  />

                  {/* Indicador de cálculo de rota em tempo real */}
                  {isCalculatingRoute && (
                    <div className="absolute top-3 left-3 z-[400] bg-slate-900/90 text-white backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 pointer-events-none">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      <span>Traçando rota nas ruas...</span>
                    </div>
                  )}

                  {/* Botão flutuante para enquadrar a rota inteira */}
                  <button
                    type="button"
                    onClick={() => {
                      const map = miniMapInstanceRef.current;
                      if (!map) return;
                      if (calculatedRoute && calculatedRoute.coordinates && calculatedRoute.coordinates.length > 0) {
                        const poly = L.polyline(calculatedRoute.coordinates.map(c => [c.lat, c.lng] as [number, number]));
                        map.fitBounds(poly.getBounds(), { padding: [55, 55], animate: true });
                      } else {
                        const pts: L.LatLngExpression[] = [];
                        if (pickupCoords?.lat) pts.push([pickupCoords.lat, pickupCoords.lng]);
                        if (operationType === 'troca' && exchangeCoords?.lat) pts.push([exchangeCoords.lat, exchangeCoords.lng]);
                        if (deliveryCoords?.lat) pts.push([deliveryCoords.lat, deliveryCoords.lng]);
                        if (pts.length >= 2) {
                          map.fitBounds(L.latLngBounds(pts), { padding: [55, 55], animate: true });
                        }
                      }
                    }}
                    className="absolute bottom-3 right-3 z-[400] bg-white/95 backdrop-blur-xs hover:bg-white text-[#0B5187] font-black text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    title="Ajustar visualização para enquadrar a rota inteira"
                  >
                    <Compass className="w-3.5 h-3.5 text-[#0B5187]" />
                    <span>Enquadrar Rota</span>
                  </button>
                </div>

                <section className="space-y-2.5" aria-label="Configurações das paradas da rota">
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-700">Detalhes por ponto da rota</h3>
                    <p className="text-[10px] text-slate-500">Comentários, vendedor e visibilidade são definidos separadamente em cada parada.</p>
                  </div>
                  <div className="space-y-2">
                    {routeStops.map((stop, index) => {
                      const config = routePointConfigs[stop.key];
                      const pointDriver = drivers.find(item => item.id === config.driverId);
                      return (
                        <article key={stop.key} className={`rounded-xl border p-3 shadow-2xs ${stop.border}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: stop.color }}>
                                {index + 1} • {stop.label}
                              </span>
                              <p className="mt-0.5 text-xs font-extrabold text-slate-900">{stop.address || `Endereço de ${stop.label.toLowerCase()}`}</p>
                              <p className="mt-0.5 text-[10px] font-bold text-slate-500">📍 {extractCityFromAddress(stop.address)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSellerEditPoint(stop.key)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-orange-800 hover:bg-orange-50"
                              aria-label={`Definir vendedor de ${stop.label}`}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              {config.sellerName ? config.sellerName : 'Vendedor'}
                            </button>
                          </div>
                          <label className="mt-2 block text-[10px] font-black text-slate-700">
                            Comentários / observações deste ponto
                            <textarea
                              rows={2}
                              value={stop.notes}
                              onChange={event => stop.setNotes(event.target.value)}
                              placeholder={`Instruções para ${stop.label.toLowerCase()}...`}
                              className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#0B5187]"
                            />
                          </label>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-black text-slate-700">Visibilidade desta parada</span>
                            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                              {(['publico', 'privado'] as const).map(visibility => (
                                <button
                                  key={visibility}
                                  type="button"
                                  aria-pressed={config.visibility === visibility}
                                  onClick={() => updateRoutePointConfig(stop.key, {
                                    visibility,
                                    ...(visibility === 'publico' ? { driverId: '' } : {})
                                  })}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black ${
                                    config.visibility === visibility
                                      ? visibility === 'publico' ? 'bg-emerald-600 text-white' : 'bg-[#0B5187] text-white'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  {visibility === 'publico' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                  {visibility === 'publico' ? 'Público' : 'Privado'}
                                </button>
                              ))}
                            </div>
                          </div>
                          {config.visibility === 'privado' && (
                            <label className="mt-2 block text-[10px] font-black text-slate-700">
                              Motorista autorizado para esta parada
                              <select
                                value={config.driverId}
                                onChange={event => updateRoutePointConfig(stop.key, { driverId: event.target.value })}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-800"
                              >
                                <option value="">Aguardando direcionamento</option>
                                {drivers.map(item => (
                                  <option key={item.id} value={item.id}>{item.name} ({item.vehicleModel})</option>
                                ))}
                              </select>
                              <span className="mt-1 block font-medium text-slate-500">
                                {pointDriver ? `Somente ${pointDriver.name} verá esta parada.` : 'Sem motorista atribuído, a parada fica aguardando direcionamento.'}
                              </span>
                            </label>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* LADO DIREITO: FINANCEIRO, DESCONTO E MOTORISTA (5 COLUNAS) */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                
                {/* Resumo do Cliente e Veículo */}
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Cliente / Encomenda</span>
                  <p className="text-sm font-black text-slate-900 truncate">{selectedCustomer?.fullName}</p>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Porte: <strong className="uppercase">{packageSize} ({vehicleType})</strong> • Carga: <strong>{selectedPackageType}</strong>{isFragile ? ' • ⚠️ FRÁGIL' : ''}{weightKg ? ` • ${weightKg}kg` : ''}{(lengthCm && widthCm && heightCm) ? ` • ${lengthCm}×${widthCm}×${heightCm}cm` : ''}
                  </p>
                  {/* Agendamento de Data e Hora: Coleta, Entrega e Troca */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-slate-700 pt-0.5">
                    {/* Coleta */}
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-[#0B5187] px-2 py-0.5 rounded-md border border-blue-200">
                      <span className="font-black">Coleta:</span>
                      <span>
                        {(() => {
                          if (!pickupDate) return 'Hoje';
                          const p = pickupDate.split('-');
                          return p.length === 3 ? `${p[2]}/${p[1]}` : pickupDate;
                        })()}
                      </span>
                      {pickupTime ? (
                        <strong className="text-blue-900">({pickupTimeMode === 'ate' ? 'pegar até' : 'pegar após'} {pickupTime})</strong>
                      ) : null}
                    </span>

                    {/* Entrega */}
                    <span className="inline-flex items-center gap-1 bg-orange-50 text-[#FF5E00] px-2 py-0.5 rounded-md border border-orange-200">
                      <span className="font-black">Entrega:</span>
                      <span>
                        {(() => {
                          if (!deliveryDate) return 'Hoje';
                          const p = deliveryDate.split('-');
                          return p.length === 3 ? `${p[2]}/${p[1]}` : deliveryDate;
                        })()}
                      </span>
                      {deliveryTime ? (
                        <strong className="text-orange-900">({deliveryTimeMode === 'ate' ? 'entregar até' : 'entregar após'} {deliveryTime})</strong>
                      ) : null}
                    </span>

                    {/* Troca (se for modalidade troca) */}
                    {operationType === 'troca' && (
                      <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200">
                        <span className="font-black">Troca:</span>
                        <span>
                          {(() => {
                            if (!exchangeDate) return 'Hoje';
                            const p = exchangeDate.split('-');
                            return p.length === 3 ? `${p[2]}/${p[1]}` : exchangeDate;
                          })()}
                        </span>
                        {exchangeTime ? (
                          <strong className="text-purple-950">({exchangeTimeMode === 'ate' ? 'trocar até' : 'trocar após'} {exchangeTime})</strong>
                        ) : null}
                      </span>
                    )}
                  </div>
                </div>

                {/* PAINEL FINANCEIRO DISCRIMINADO & EDITÁVEL */}
                <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  
                  {/* Cabeçalho da Seção de Preços */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span>{pricingSettings.pricingModel === 'frete_unico' ? 'Preço do Frete' : 'Preços Discriminados'}</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">Valores editáveis</span>
                  </div>

                  {/* 1. Lista de Itens de Preço (Coleta, Transporte, Entrega ou Frete Único) */}
                  <div className="space-y-1.5">
                    {priceItems.map((item) => {
                      const isFrete = item.id === 'frete';
                      const isColeta = item.id === 'coleta';
                      const isTransp = item.id === 'transporte';
                      const isEntrega = item.id === 'entrega';
                      const isTroca = item.id === 'troca';

                      return (
                        <div 
                          key={item.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/60 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {item.isRemovable ? (
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdatePriceItem(item.id, { name: e.target.value })}
                                placeholder="Nome da taxa ou item..."
                                className="w-full text-xs font-bold text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200 focus:border-[#0B5187] focus:outline-none"
                              />
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isFrete ? 'bg-emerald-600' : isColeta ? 'bg-[#0B5187]' : isTransp ? 'bg-indigo-600' : isEntrega ? 'bg-[#FF5E00]' : isTroca ? 'bg-purple-600' : 'bg-emerald-600'}`} />
                                <span className="text-xs font-bold text-slate-800 truncate">
                                  {item.name}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="flex items-center bg-white border border-slate-300 focus-within:border-[#0B5187] focus-within:ring-2 focus-within:ring-[#0B5187]/15 rounded-lg px-2 py-1 w-24 sm:w-28">
                              <CurrencyCentsInput
                                value={item.value}
                                onChange={(val) => handleUpdatePriceItem(item.id, { value: val })}
                                prefix="R$"
                                placeholder="0,00"
                                className="w-full text-right text-xs font-black text-slate-900"
                              />
                            </div>

                            {item.isRemovable && (
                              <button
                                type="button"
                                onClick={() => handleRemovePriceItem(item.id)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                title="Remover item de preço"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Botão com Menu de Opções para Adicionar Mais Taxas/Preços */}
                    <PricingItemAddMenu 
                      type="fee" 
                      onSelect={handleAddPriceItem} 
                    />
                  </div>

                  {/* 2. Seção de Descontos (Podendo adicionar mais) */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Descontos {totalDiscounts > 0 ? `(- R$ ${totalDiscounts.toFixed(2)})` : ''}</span>
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {discountItems.map((item) => (
                        <div 
                          key={item.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-50/50 border border-emerald-200/80"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {item.isRemovable ? (
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => handleUpdateDiscountItem(item.id, { name: e.target.value })}
                                placeholder="Nome do desconto..."
                                className="w-full text-xs font-bold text-emerald-950 bg-white px-2 py-1 rounded-lg border border-emerald-300 focus:border-emerald-600 focus:outline-none"
                              />
                            ) : (
                              <span className="text-xs font-bold text-emerald-950 truncate">
                                {item.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="flex items-center bg-white border border-emerald-300 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/15 rounded-lg px-2 py-1 w-24 sm:w-28">
                              <CurrencyCentsInput
                                value={item.value}
                                onChange={(val) => handleUpdateDiscountItem(item.id, { value: val })}
                                prefix="- R$"
                                placeholder="0,00"
                                className="w-full text-right text-xs font-black text-emerald-800"
                              />
                            </div>

                            {item.isRemovable && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDiscountItem(item.id)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                title="Remover desconto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Botões Rápidos de Desconto no Desconto Principal */}
                      <div className="grid grid-cols-4 gap-1 pt-0.5">
                        {[0, 2, 5, 10].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              if (discountItems.length > 0) {
                                handleUpdateDiscountItem(discountItems[0].id, { value: val });
                              }
                            }}
                            className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                              discountItems[0]?.value === val 
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {val === 0 ? 'Sem desc.' : `- R$ ${val}`}
                          </button>
                        ))}
                      </div>

                      {/* Botão com Menu de Opções para Adicionar Outro Desconto */}
                      <PricingItemAddMenu 
                        type="discount" 
                        onSelect={handleAddDiscountItem} 
                      />
                    </div>
                  </div>

                  {/* 3. Preço Final em Grande Destaque */}
                  <div className="pt-2.5 border-t-2 border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-500 block">Total a Pagar</span>
                      <span className="text-xs text-slate-500 font-bold">
                        {totalPrices > 0 ? `Subtotal: R$ ${totalPrices.toFixed(2)}` : ''}
                        {totalDiscounts > 0 ? ` • Desc: -R$ ${totalDiscounts.toFixed(2)}` : ''}
                      </span>
                    </div>
                    <span className="text-2xl sm:text-3xl font-black text-[#FF5E00]">
                      R$ {finalPrice.toFixed(2)}
                    </span>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>

        {/* ========================================================
            RODAPÉ COMPACTO COM BOTÕES DE AÇÃO
            ======================================================== */}
        <footer className="px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 shadow-md">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 font-extrabold text-xs sm:text-sm hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsNewOrderModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 font-extrabold text-xs sm:text-sm hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          )}

          {currentStep === 1 && (
            <button
              type="button"
              onClick={handleProceedToStep2}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B5187] hover:bg-[#083D66] active:scale-[0.98] text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span>Avançar para Locais</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {currentStep === 2 && (
            <button
              type="button"
              onClick={handleProceedToStep3}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B5187] hover:bg-[#083D66] active:scale-[0.98] text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span>Avançar para Carga</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {currentStep === 3 && (
            <button
              type="button"
              onClick={handleProceedToStep4}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B5187] hover:bg-[#083D66] active:scale-[0.98] text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span>Calcular Rota & Preço</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {currentStep === 4 && (
            <button
              type="button"
              onClick={handleFinalizeOrder}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#FF5E00] hover:bg-[#E05300] active:scale-[0.98] text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Check className="w-4.5 h-4.5 stroke-[3]" />
              <span>Revisar e salvar pedido</span>
            </button>
          )}
        </footer>

      </div>

      {/* ========================================================
          TELA CHEIA DE HISTÓRICO DE ENCOMENDAS (PADRONIZADA COM A TELA DE CLIENTE)
          ======================================================== */}
      <CustomerOrderHistoryFullScreen
        isOpen={isPastOrdersModalOpen && !!pastOrdersCustomer}
        onClose={() => setIsPastOrdersModalOpen(false)}
        customer={pastOrdersCustomer}
        orders={customerPastOrdersList}
        onRepeatOrder={handleRepeatPastOrder}
      />

      {/* GAVETA DE BUSCA NA AGENDA / CLIENTES PARA RESPONSÁVEL */}
      <CustomerSelectorDrawer
        isOpen={isCustomerSelectorOpen}
        onClose={() => setIsCustomerSelectorOpen(false)}
        targetField="responsible"
        onSelectCustomer={(cust) => {
          setResponsibleName(cust.fullName);
          setResponsiblePhone(cust.phone);
          setIsCustomerSelectorOpen(false);
        }}
        onOpenRegistration={(initial) => {
          setIsCustomerSelectorOpen(false);
          setRegistrationInitialData(initial || null);
          setSelectorTargetField('responsible');
          setIsRegistrationFullScreenOpen(true);
        }}
      />

      {/* TELA CHEIA DE CADASTRO DE CLIENTE SE NÃO TIVER CPF/LOCAL */}
      <CustomerFormFullScreen
        isOpen={isRegistrationFullScreenOpen}
        onClose={() => setIsRegistrationFullScreenOpen(false)}
        onSaveCustomer={handleSaveCustomerFromRegistration}
        initialData={registrationInitialData}
        targetFieldTitle={selectorTargetField === 'client' ? 'Cliente' : 'Vendedor (Responsável)'}
      />

      {/* MODAL DE SELEÇÃO DE LOCAL NO MAPA EM TELA CHEIA COM BUSCA E CONFIRMAÇÃO */}
      {mapPickerTarget && (
        <MapLocationPickerModal
          isOpen={Boolean(mapPickerTarget)}
          onClose={() => setMapPickerTarget(null)}
          targetType={mapPickerTarget}
          initialAddress={
            mapPickerTarget === 'coleta'
              ? pickupAddress
              : mapPickerTarget === 'entrega'
              ? deliveryAddress
              : mapPickerTarget === 'troca'
              ? exchangeAddress
              : selectedCustomer?.address || ''
          }
          initialCoords={
            mapPickerTarget === 'coleta'
              ? pickupCoords
              : mapPickerTarget === 'entrega'
              ? deliveryCoords
              : mapPickerTarget === 'troca'
              ? exchangeCoords
              : selectedCustomer?.coordinates || DEFAULT_PICKUP_COORDS
          }
          onConfirm={async ({ address, coordinates }) => {
            if (mapPickerTarget === 'cliente') {
              if (selectedCustomer) {
                let city = resolveCustomerCity({ address });
                if (!city) {
                  try {
                    city = resolveCustomerCity(await reverseGeocode(coordinates));
                  } catch {}
                }
                city = city || normalizeCityName(selectedCustomer.city || selectedCustomer.cidade);
                const updatedCust: Customer = {
                  ...selectedCustomer,
                  address,
                  coordinates,
                  ...(city ? { city, cidade: city } : {})
                };
                const saved = await updateCustomer(selectedCustomer.id, updatedCust);
                if (!saved) {
                  window.alert('Não foi possível salvar o endereço do cliente. Verifique a conexão e tente novamente.');
                  return;
                }
                setSelectedCustomer(updatedCust);
                if (operationType === 'coleta') {
                  setDeliveryAddress(address);
                  setDeliveryCoords(coordinates);
                  setDeliveryContact(selectedCustomer.fullName);
                  setDeliveryPhone(selectedCustomer.phone);
                } else if (operationType === 'entrega') {
                  setPickupAddress(address);
                  setPickupCoords(coordinates);
                  setPickupContact(selectedCustomer.fullName);
                  setPickupPhone(selectedCustomer.phone);
                } else if (operationType === 'troca') {
                  setPickupAddress(address);
                  setPickupCoords(coordinates);
                  setDeliveryAddress(address);
                  setDeliveryCoords(coordinates);
                  setPickupContact(selectedCustomer.fullName);
                  setDeliveryContact(selectedCustomer.fullName);
                }
              }
            } else if (mapPickerTarget === 'coleta') {
              setPickupAddress(address);
              setPickupCoords(coordinates);
              setStepErrors(prev => {
                const next = { ...prev };
                delete next.pickupAddress;
                return next;
              });
            } else if (mapPickerTarget === 'entrega') {
              setDeliveryAddress(address);
              setDeliveryCoords(coordinates);
              setStepErrors(prev => {
                const next = { ...prev };
                delete next.deliveryAddress;
                return next;
              });
            } else if (mapPickerTarget === 'troca') {
              setExchangeAddress(address);
              setExchangeCoords(coordinates);
              setStepErrors(prev => {
                const next = { ...prev };
                delete next.exchangeAddress;
                return next;
              });
            }
            setMapPickerTarget(null);
          }}
        />
      )}

      {/* AGENDA DE CONTATOS DO TELEFONE / SIMULADOR PARA APK */}
      <PhoneAgendaModal
        isOpen={isPhoneAgendaOpen}
        onClose={() => setIsPhoneAgendaOpen(false)}
        targetType={phoneAgendaTarget}
        targetRoleLabel={
          phoneAgendaTarget === 'coleta'
            ? 'Coleta'
            : phoneAgendaTarget === 'troca'
            ? 'Troca'
            : 'Entrega'
        }
        onSelectContact={handleSelectPhoneAgendaContact}
      />
      <SellerResponsibleModal
        isOpen={sellerEditPoint !== null}
        onClose={() => setSellerEditPoint(null)}
        initialName={sellerEditPoint ? routePointConfigs[sellerEditPoint].sellerName : ''}
        initialPhone={sellerEditPoint ? routePointConfigs[sellerEditPoint].sellerPhone : ''}
        clientName={selectedCustomer?.fullName}
        clientPhone={selectedCustomer?.phone}
        onSave={data => {
          if (sellerEditPoint) {
            updateRoutePointConfig(sellerEditPoint, {
              sellerName: data.name,
              sellerPhone: data.phone
            });
          }
        }}
      />
    </div>
  );
};
