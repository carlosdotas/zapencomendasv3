import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  X, 
  MessageCircle, 
  User, 
  UserCheck, 
  Clock, 
  Calendar,
  ExternalLink,
  Copy,
  Check,
  ArrowDownToLine,
  Package,
  Repeat,
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Zap,
  ZapOff,
  Sun,
  RotateCcw,
  Share2,
  FileText,
  Minus,
  Plus,
  Layers,
  Navigation,
  ChevronDown,
  Bike,
  Car,
  Truck,
  ShoppingBag,
  Mail,
  Download,
  Maximize2,
  Ban,
  AlertTriangle,
  Edit3,
  DollarSign,
  ChevronRight,
  UserPlus,
  Phone,
  Globe,
  Lock,
  Route,
  MapPin,
  MoreVertical,
  Menu
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { OrderFinalDetailsModal } from '../order/OrderFinalDetailsModal';
import { isStreetOrAddress, resolveCommercialClosingTime, resolveCommercialOpeningTime } from '../../utils/placeUtils';
import { androidBridge } from '../../services/androidBridge';
import type { BaixaProximity } from '../../services/apiTypes';

// Acima dessa distância até o local, a baixa exibe aviso e fica registrada no pedido
const LIMITE_BAIXA_DISTANTE_M = 1000;
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { setNavSession, usePresenceMap, useWaitSeconds, formatDuration } from '../../services/presenceService';

import { GoogleMapsIcon, WazeIcon, openExternalNavigation } from '../map/NavAppIcons';
import { Place, OperationType, PackageItemType, VehicleCollectionType } from '../../types/map';
import { CustomerSelectorDrawer } from '../customer/CustomerSelectorDrawer';
import { CustomerFormFullScreen } from '../customer/CustomerFormFullScreen';
import { SellerResponsibleModal } from './SellerResponsibleModal';
import { Customer, AgendaContact, TargetFieldType } from '../../types/customer';
import { DriverSelectorModal } from '../driver/DriverSelectorModal';
import { getPlaceDateBadgeInfo } from '../map/FullscreenMap';
import { 
  isCustomerMissingLocation, 
  getOrderLocationsForOperation, 
  getCustomerLocation,
  OrderResolvedLocations,
  isUnnamedOrGenericPlace,
  getCustomerPlaceName
} from '../../utils/customerLocationUtils';
import { extractNumericId } from '../../utils/orderSequence';
import { api } from '../../services/api';
import { formatPhotoUrl, extractPhotoUrls, extractDriverAssignmentFromPedido } from '../../services/apiAdapters';

// Formata número de telefone para exibição amigável
export const formatPhoneDisplay = (raw?: string): string => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  } else if (digits.length > 11 && digits.startsWith('55')) {
    const sub = digits.slice(2);
    if (sub.length === 11) return `(${sub.slice(0, 2)}) ${sub.slice(2, 7)}-${sub.slice(7)}`;
    if (sub.length === 10) return `(${sub.slice(0, 2)}) ${sub.slice(2, 6)}-${sub.slice(6)}`;
  }
  return raw;
};

// Calcula o horário de fechamento no formato clássico do Google Maps
export const getClosingTime = (place: Place, now: Date = new Date()): string => {
  return resolveCommercialClosingTime(place, now);
};

// Calcula o horário de abertura no formato clássico do Google Maps
export const getOpeningTime = (place: Place): string => {
  return resolveCommercialOpeningTime(place);
};

export interface TimeUntilClosing {
  text: string;
  isUrgent: boolean;
  isClosingSoon: boolean;
  diffMinutes: number;
}

// Calcula em quanto tempo o estabelecimento vai fechar
export const getTimeUntilClosing = (
  closingTimeStr: string,
  now: Date = new Date()
): TimeUntilClosing | null => {
  if (!closingTimeStr) return null;
  const match = closingTimeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const closeH = parseInt(match[1], 10);
  const closeM = parseInt(match[2], 10);
  if (isNaN(closeH) || isNaN(closeM) || closeH < 0 || closeH > 24 || closeM < 0 || closeM > 59) {
    return null;
  }

  const currentH = now.getHours();
  const currentM = now.getMinutes();

  let diffMinutes = (closeH * 60 + closeM) - (currentH * 60 + currentM);

  // Se o fechamento for na madrugada do dia seguinte (ex: fecha às 01:00 ou 02:00 e agora é tarde da noite)
  if (diffMinutes < 0 && closeH <= 5 && currentH >= 12) {
    diffMinutes += 24 * 60;
  }

  if (diffMinutes < 0) {
    if (diffMinutes >= -15) {
      return {
        text: 'fechando agora',
        isUrgent: true,
        isClosingSoon: true,
        diffMinutes
      };
    }
    return {
      text: 'fechado',
      isUrgent: true,
      isClosingSoon: true,
      diffMinutes
    };
  }

  if (diffMinutes === 0) {
    return {
      text: 'fechando agora',
      isUrgent: true,
      isClosingSoon: true,
      diffMinutes: 0
    };
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  let text = '';
  if (hours > 0 && minutes > 0) {
    text = `em ${hours}h ${minutes}min`;
  } else if (hours > 0) {
    text = `em ${hours}h`;
  } else {
    text = `em ${minutes} min`;
  }

  return {
    text,
    isUrgent: diffMinutes <= 30,
    isClosingSoon: diffMinutes <= 60,
    diffMinutes
  };
};

// Calcula a distância direta em km entre dois pontos geográficos
const calculateDistanceKm = (
  c1: { lat: number; lng: number },
  c2: { lat: number; lng: number }
): number => {
  const R = 6371; // Raio da Terra em km
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLon = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Formata distância com precisão em metros ou quilômetros
const formatDistance = (km: number): string => {
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m`;
  }
  return `${km.toFixed(1).replace('.', ',')} km`;
};

const ArrivalInfo: React.FC<{ placeId: string }> = ({ placeId }) => {
  const entry = usePresenceMap()[placeId];
  const waitS = useWaitSeconds(entry);
  if (!entry || !entry.chegadaEm) return null;
  const arrivedAt = new Date(entry.chegadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const counting = entry.since !== null;
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] font-black">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
        Chegou às {arrivedAt}
      </span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border ${counting ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
        Espera: {formatDuration(waitS)}{counting ? '' : ' (pausado)'}
      </span>
    </div>
  );
};

export const PlaceDetailCard: React.FC = () => {
  const { 
    selectedPlace, 
    setSelectedPlace, 
    flyToLocation,
    calculateRouteToPlace,
    calculateOrderRoute,
    clearActiveRoute,
    defaultNavApp,
    setDefaultNavApp,
    userLocation,
    currentCoords,
    activeRoute,
    currentRole,
    assignPlaceToDriver,
    drivers,
    updatePlaceDetails,
    addNewOrder,
    persistCustomer,
    viewingPhotoUrl,
    setViewingPhotoUrl,
    openPhotoViewer,
    savedPlaces,
    allPlaces,
    completePlaceWaypoint,
    dismissPlaceProximity,
    user,
    customers,
    openCustomerLocationModal,
    operationsFilter,
    claimPublicOrder
  } = useMapStore();

  const canManageDriverAssignment = currentRole === 'admin_geral' || currentRole === 'atendente' || (currentRole as string) === 'admin';
  const isDriverRole = currentRole === 'motorista';

  // Estados para recusa/cancelamento por parte do motorista
  const [showRefusalModal, setShowRefusalModal] = useState(false);
  const [refusalReason, setRefusalReason] = useState<string>('');
  const [refusalNotes, setRefusalNotes] = useState<string>('');
  const [isSubmittingRefusal, setIsSubmittingRefusal] = useState(false);
  const [isClaimingOrder, setIsClaimingOrder] = useState(false);

  const handleClaimThisOrder = async () => {
    if (!selectedPlace) return;
    setIsClaimingOrder(true);
    try {
      const won = await claimPublicOrder(selectedPlace.id);
      if (!won) {
        setSaveSuccessToast('Este pedido já foi aceito por outro motorista.');
        setSelectedPlace(null);
        return;
      }
      setSaveSuccessToast('🎉 Pedido aceito com sucesso! Você é o responsável.');
      setSelectedPlace({
        ...selectedPlace,
        assignedDriverId: user.id || 'usr-mot-04',
        assignedDriverName: user.name || 'Motorista Parceiro',
        assignedDriverPhone: user.phone,
        orderVisibility: 'privado'
      });
      if (typeof window !== 'undefined' && (window as any).AndroidApp) {
        (window as any).AndroidApp.showNotification?.("EncomendasZap", "Pedido assumido com sucesso!");
        (window as any).AndroidApp.vibrate?.(250);
      }
    } catch (err) {
      console.warn('Erro ao assumir pedido:', err);
    } finally {
      setIsClaimingOrder(false);
    }
  };

  // Outras encomendas no mesmo local
  const siblingPlaces = useMemo(() => {
    if (!selectedPlace || !allPlaces) return [];
    return allPlaces.filter(p => 
      p.id !== selectedPlace.id && (
        (p.name && selectedPlace.name && p.name.trim().toLowerCase() === selectedPlace.name.trim().toLowerCase()) ||
        (Math.abs(p.coordinates.lat - selectedPlace.coordinates.lat) < 0.0003 && Math.abs(p.coordinates.lng - selectedPlace.coordinates.lng) < 0.0003)
      )
    );
  }, [selectedPlace, allPlaces]);

  // Verifica se o cliente está sem localização cadastrada
  const customerMissingLocation = useMemo(() => {
    return isCustomerMissingLocation(selectedPlace, customers);
  }, [selectedPlace, customers]);

  // Resolução exata de locais de acordo com o tipo de operação (coleta, entrega, troca)
  const orderResolvedLocations = useMemo(() => {
    if (!selectedPlace) return null;
    const op = selectedPlace.operationType || 'coleta';
    return getOrderLocationsForOperation(selectedPlace, op, customers);
  }, [selectedPlace, customers]);

  // Se cliente não tiver local, limpa a rota ativa
  useEffect(() => {
    if (customerMissingLocation) {
      clearActiveRoute();
    }
  }, [customerMissingLocation, clearActiveRoute]);

  const [isTracingRoute, setIsTracingRoute] = useState(false);
  const handleTraceOrderRoute = async () => {
    if (!selectedPlace) return;
    if (customerMissingLocation || !orderResolvedLocations?.canTraceRoute) {
      clearActiveRoute();
      return;
    }
    setIsTracingRoute(true);
    await calculateOrderRoute(selectedPlace);
    setIsTracingRoute(false);
  };

  // Verifica se a encomenda já está salva/adicionada no mapa
  const isAlreadySaved = useMemo(() => {
    if (!selectedPlace) return false;
    if (selectedPlace.id && (selectedPlace.id.startsWith('draft-') || selectedPlace.id.startsWith('new-'))) return false;

    // Está salva se já estiver presente na lista de locais ativos/salvos do mapa
    if (allPlaces?.some(p => p.id === selectedPlace.id)) return true;
    if (savedPlaces?.some(p => p.id === selectedPlace.id)) return true;

    const selNum = extractNumericId(selectedPlace.id) || extractNumericId(selectedPlace.orderCode);
    if (selNum) {
      if (allPlaces?.some(p => {
        const pNum = extractNumericId(p.id) || extractNumericId(p.orderCode);
        return pNum && pNum === selNum;
      })) return true;
      if (savedPlaces?.some(p => {
        const pNum = extractNumericId(p.id) || extractNumericId(p.orderCode);
        return pNum && pNum === selNum;
      })) return true;
    }

    return false;
  }, [selectedPlace, allPlaces, savedPlaces]);

  // Modo de edição manual: quando a marker for adicionada/salva, só aceita editar se clicar no botão "Editar"
  // Regra de segurança: Motoristas NÃO possuem permissão para adicionar nem editar pedidos
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const isEditing = !isDriverRole && isEditingOrder;
  const canEdit = !isDriverRole && (!isAlreadySaved || isEditingOrder);

  const handleLockedEditAttempt = useCallback(() => {
    if (isDriverRole) {
      setSaveSuccessToast('🔒 Motoristas não possuem permissão para adicionar ou editar pedidos.');
    } else {
      setSaveSuccessToast('🔒 Clique no botão "Editar" para fazer alterações neste pedido.');
    }
  }, [isDriverRole]);

  // Reseta modo de edição e menus quando o pedido mudar
  useEffect(() => {
    setIsEditingOrder(false);
    setIsActionsMenuOpen(false);
    setShowNavChooser(false);
  }, [selectedPlace?.id]);

  // Estados para seleção e cadastro de clientes e responsáveis
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [selectorTargetField, setSelectorTargetField] = useState<TargetFieldType>('customer');
  const [isCustomerRegistrationOpen, setIsCustomerRegistrationOpen] = useState(false);
  const [registrationInitialData, setRegistrationInitialData] = useState<Partial<Customer> | AgendaContact | null>(null);

  // Estado para o formulário direto de Vendedor (Responsável) com Nome, Telefone e Agenda
  const [isSellerModalOpen, setIsSellerModalOpen] = useState(false);

  const handleSaveSellerResponsible = (data: { name: string; phone: string }) => {
    if (!selectedPlace) return;
    updatePlaceDetails(selectedPlace.id, {
      responsibleName: data.name,
      responsiblePhone: data.phone,
      sellerName: data.name,
      sellerPhone: data.phone,
      managerName: data.name,
      managerPhone: data.phone
    });
  };

  // Estados para direcionamento de motorista
  const [isDriverSelectorOpen, setIsDriverSelectorOpen] = useState(false);
  const [driverToast, setDriverToast] = useState<string | null>(null);

  // Informações do motorista direcionado
  const assignedDriverObj = useMemo(() => {
    if (!selectedPlace) return null;
    return drivers.find(d => 
      (selectedPlace.assignedDriverId && (d.id === selectedPlace.assignedDriverId || d.id.replace(/\D/g, '') === selectedPlace.assignedDriverId.replace(/\D/g, ''))) ||
      (selectedPlace.assignedDriverPhone && d.phone && d.phone.replace(/\D/g, '') === selectedPlace.assignedDriverPhone.replace(/\D/g, ''))
    ) || null;
  }, [selectedPlace, drivers]);

  const handleSelectDriverForPlace = useCallback((driverOption: any) => {
    if (!selectedPlace) return;
    assignPlaceToDriver(selectedPlace.id, driverOption.id, driverOption.phone, driverOption.name);
    updatePlaceDetails(selectedPlace.id, {
      orderVisibility: 'privado',
      assignedDriverId: driverOption.id,
      assignedDriverPhone: driverOption.phone,
      assignedDriverName: driverOption.name
    });
    setDriverToast(`Encomenda privada direcionada para ${driverOption.name}!`);
    setTimeout(() => setDriverToast(null), 3500);
  }, [selectedPlace, assignPlaceToDriver, updatePlaceDetails]);

  const handleRemoveDriverFromPlace = useCallback(() => {
    if (!selectedPlace) return;
    assignPlaceToDriver(selectedPlace.id, null, undefined, undefined);
    updatePlaceDetails(selectedPlace.id, {
      assignedDriverId: undefined,
      assignedDriverPhone: undefined,
      assignedDriverName: undefined
    });
    setDriverToast('Motorista desvinculado. Encomenda mantida como Privada.');
    setTimeout(() => setDriverToast(null), 3500);
  }, [selectedPlace, assignPlaceToDriver, updatePlaceDetails]);

  const handleSetVisibilityPublic = useCallback(() => {
    if (!selectedPlace) return;
    assignPlaceToDriver(selectedPlace.id, null, undefined, undefined);
    updatePlaceDetails(selectedPlace.id, {
      orderVisibility: 'publico',
      assignedDriverId: undefined,
      assignedDriverPhone: undefined,
      assignedDriverName: undefined
    });
    setDriverToast('Visibilidade definida como Público (aparece para todos os motoristas).');
    setTimeout(() => setDriverToast(null), 3500);
  }, [selectedPlace, assignPlaceToDriver, updatePlaceDetails]);

  const handleSetVisibilityPrivate = useCallback(() => {
    if (!selectedPlace) return;
    updatePlaceDetails(selectedPlace.id, {
      orderVisibility: 'privado'
    });
    setDriverToast('Visibilidade definida como Privado. Selecione um motorista se desejar.');
    setTimeout(() => setDriverToast(null), 3500);
  }, [selectedPlace, updatePlaceDetails]);

  const [copied, setCopied] = useState(false);
  const [sharedToast, setSharedToast] = useState(false);
  const [saveSuccessToast, setSaveSuccessToast] = useState<string | null>(null);
  const [showNavChooser, setShowNavChooser] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [saveAsDefaultNav, setSaveAsDefaultNav] = useState<boolean>(true);

  // Estados dos seletores interativos do cabeçalho superior (Tipo, Agenda, Veículo, Carga)
  const [showOperationPicker, setShowOperationPicker] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [showPackagePicker, setShowPackagePicker] = useState(false);

  // Estados para Tipo Personalizado de Encomenda e Medidas/Volumes
  const [newCustomPackageInput, setNewCustomPackageInput] = useState('');
  const [showCustomCargoDetails, setShowCustomCargoDetails] = useState(false);
  const [dimLength, setDimLength] = useState('');
  const [dimWidth, setDimWidth] = useState('');
  const [dimHeight, setDimHeight] = useState('');

  // Lista dinâmica e persistida de tipos de encomendas
  const [customPackageTypes, setCustomPackageTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('encomendaszap_custom_package_types');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const BASE_PACKAGE_TYPES = useMemo(() => [
    { key: 'caixa_pequena', label: 'Caixa Pequena', emoji: '📦' },
    { key: 'caixa_media', label: 'Caixa Média', emoji: '📦' },
    { key: 'caixa_grande', label: 'Caixa Grande', emoji: '📦' },
    { key: 'sacola', label: 'Sacola', emoji: '🛍️' },
    { key: 'envelope', label: 'Envelope', emoji: '✉️' },
    { key: 'documento', label: 'Documento / Papel', emoji: '📄' },
    { key: 'alimentos', label: 'Alimentos / Refeição', emoji: '🍔' },
    { key: 'farmacia', label: 'Farmácia / Remédio', emoji: '💊' },
    { key: 'eletronicos', label: 'Eletrônicos', emoji: '📱' },
    { key: 'roupas', label: 'Roupas / Confecção', emoji: '👗' },
    { key: 'flores', label: 'Flores / Presente', emoji: '💐' },
    { key: 'autopecas', label: 'Peças / Autopeças', emoji: '⚙️' },
    { key: 'ferramentas', label: 'Ferramentas', emoji: '🛠️' },
    { key: 'fragil', label: 'Frágil / Vidro', emoji: '🧪' },
    { key: 'cilindro', label: 'Cilindro / Tubo', emoji: '🛢️' },
    { key: 'outro', label: 'Outro', emoji: '📦' }
  ], []);

  const allAvailablePackageTypes = useMemo(() => {
    const list = [...BASE_PACKAGE_TYPES];
    customPackageTypes.forEach(customName => {
      if (!list.some(item => item.label.toLowerCase() === customName.toLowerCase() || item.key.toLowerCase() === customName.toLowerCase())) {
        list.push({
          key: customName.toLowerCase().replace(/\s+/g, '_'),
          label: customName,
          emoji: '✨'
        });
      }
    });
    return list;
  }, [BASE_PACKAGE_TYPES, customPackageTypes]);

  const handleAddCustomPackageType = useCallback(() => {
    const trimmed = newCustomPackageInput.trim();
    if (!trimmed || !selectedPlace) return;
    if (!customPackageTypes.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      const next = [...customPackageTypes, trimmed];
      setCustomPackageTypes(next);
      try {
        localStorage.setItem('encomendaszap_custom_package_types', JSON.stringify(next));
      } catch {}
    }
    updatePlaceDetails(selectedPlace.id, { packageType: trimmed as any });
    setNewCustomPackageInput('');
  }, [newCustomPackageInput, selectedPlace, customPackageTypes, updatePlaceDetails]);

  // Estado para editar observações
  const [isEditingObservations, setIsEditingObservations] = useState(false);
  const [editedObservations, setEditedObservations] = useState('');

  // Modal da Etapa Final com Detalhes, Rota, Preços e Compartilhar no Zap
  const [isFinalDetailsOpen, setIsFinalDetailsOpen] = useState(false);

  // Lista de Fotos personalizadas da encomenda/ponto (múltiplas fotos)
  const [customPhotos, setCustomPhotos] = useState<string[]>([]);

  // Distância calculada até o local
  const originCoords = userLocation || currentCoords;
  const directDistanceKm = (originCoords && selectedPlace)
    ? calculateDistanceKm(originCoords, selectedPlace.coordinates)
    : null;

  const effectiveDistanceKm = activeRoute?.distanceKm ?? directDistanceKm;
  const distanceFormatted = effectiveDistanceKm != null ? formatDistance(effectiveDistanceKm) : null;

  // ==========================================
  // SISTEMA DE CÂMERA PRÓPRIO CHEIA NA TELA
  // ==========================================
  const [isFullScreenCameraOpen, setIsFullScreenCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('auto');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Foto temporária capturada para visualização/confirmação
  const [previewCapturedPhoto, setPreviewCapturedPhoto] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const scheduleCalendarInputRef = useRef<HTMLInputElement>(null);

  // Estados do Diálogo de Coleta / Entrega / Troca
  const [showOperationModal, setShowOperationModal] = useState(false);
  const [farWarning, setFarWarning] = useState<{ proximity: BaixaProximity; proceed: () => void } | null>(null);
  const [operationStatus, setOperationStatus] = useState<'success' | 'failed'>('success');
  const [receiverName, setReceiverName] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<PackageItemType>('caixa');
  const [volumesCount, setVolumesCount] = useState('1 volume');
  const [volumeQuantity, setVolumeQuantity] = useState<number>(1);
  const [volumeQuantityInput, setVolumeQuantityInput] = useState<string>('1');

  const handleUpdateVolumeQuantity = (num: number) => {
    const valid = Math.max(1, Math.min(999, num));
    setVolumeQuantity(valid);
    setVolumeQuantityInput(String(valid));
    setVolumesCount(`${valid} ${valid === 1 ? 'volume' : 'volumes'}`);
  };

  const handleVolumeInputChange = (val: string) => {
    setVolumeQuantityInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const valid = Math.min(999, parsed);
      setVolumeQuantity(valid);
      setVolumesCount(`${valid} ${valid === 1 ? 'volume' : 'volumes'}`);
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
  const [notes, setNotes] = useState('');
  const [photoErrorMsg, setPhotoErrorMsg] = useState('');
  const [showObservationSheet, setShowObservationSheet] = useState(false);
  const [failReason, setFailReason] = useState('Local Fechado');
  const [showFailReasonPicker, setShowFailReasonPicker] = useState(false);
  const [registeredOutcome, setRegisteredOutcome] = useState<{
    status: 'success' | 'failed';
    time: string;
    details?: string;
  } | null>(null);

  // Animação de subida e gesto de fechar arrastando para baixo
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Relógio sincronizado a cada 30 segundos para atualizar em quanto tempo vai fechar
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const startYRef = useRef(0);
  const currentDragYRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const lastCalculatedPlaceIdRef = useRef<string | null>(null);
  const currentActivePlaceIdRef = useRef<string | null>(null);
  const calculateRouteRef = useRef(calculateRouteToPlace);
  calculateRouteRef.current = calculateRouteToPlace;

  // Reset ao selecionar novo local
  useEffect(() => {
    if (selectedPlace) {
      // Se for o mesmo local já aberto, NÃO resetar e NUNCA fechar a câmera
      if (currentActivePlaceIdRef.current === selectedPlace.id) {
        return;
      }
      currentActivePlaceIdRef.current = selectedPlace.id;

      setIsClosing(false);
      setDragY(0);
      currentDragYRef.current = 0;
      
      // Carrega fotos salvas do local ou a foto padrão da encomenda normalizadas
      // REGRA: Na entrega NÃO pode mostrar foto do local da coleta
      let initialPhotos: string[] = [];
      const isColetaCard = selectedPlace.operationType === 'coleta' || selectedPlace.orderStage === 'coleta';
      if (isColetaCard) {
        if (selectedPlace.photos && selectedPlace.photos.length > 0) {
          initialPhotos = extractPhotoUrls(selectedPlace.photos, 'md');
        } else if (selectedPlace.imageUrl) {
          const formatted = formatPhotoUrl(selectedPlace.imageUrl, 'md');
          if (formatted) initialPhotos = [formatted];
        }
      }
      try {
        const saved = localStorage.getItem(`encomendaszap_photos_${selectedPlace.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validSaved = parsed
              .filter((p: any) => typeof p === 'string' && !p.includes('images.unsplash.com'))
              .map((p: string) => formatPhotoUrl(p, 'md') || p)
              .filter(Boolean);
            if (validSaved.length > 0) {
              initialPhotos = Array.from(new Set([...initialPhotos, ...validSaved]));
            }
          }
        }
      } catch {}
      setCustomPhotos(initialPhotos);

      setRegisteredOutcome(null);
      setReceiverName(selectedPlace.customerName || selectedPlace.sellerName || '');
      setSelectedPackage(selectedPlace.packageType || 'caixa');
      setNotes('');
      setShowOperationPicker(false);
      setShowSchedulePicker(false);
      setShowVehiclePicker(false);
      setShowPackagePicker(false);
      setIsEditingObservations(false);
      setEditedObservations(selectedPlace.observations || '');
      setNewCustomPackageInput('');

      // Inicializa dimensões a partir de selectedPlace.dimensions (ex: 30x20x15 cm)
      if (selectedPlace.dimensions) {
        const parts = selectedPlace.dimensions.replace(/cm/gi, '').trim().split(/[xX*]/);
        if (parts.length >= 3) {
          setDimLength(parts[0].trim());
          setDimWidth(parts[1].trim());
          setDimHeight(parts[2].trim());
        } else {
          setDimLength(selectedPlace.dimensions);
          setDimWidth('');
          setDimHeight('');
        }
      } else {
        setDimLength('');
        setDimWidth('');
        setDimHeight('');
      }

      closeFullScreenCamera();

      // A rota só deve ser traçada quando o usuário clicar no GPS para navegar
      lastCalculatedPlaceIdRef.current = selectedPlace.id;

      // Sincroniza em background com os dados mais recentes do pedido no banco de dados (/pedidos/get)
      const numericOrderId = selectedPlace.id.match(/pedido-(\d+)/)?.[1] || selectedPlace.id.match(/\d+/)?.[0];
      if (numericOrderId) {
        api.getPedido(numericOrderId).then(res => {
          if (res.success && res.data) {
            const assignment = extractDriverAssignmentFromPedido(res.data, selectedPlace.operationType);
            if (assignment.driverId && (!selectedPlace.assignedDriverId || selectedPlace.assignedDriverId !== assignment.driverId)) {
              updatePlaceDetails(selectedPlace.id, {
                assignedDriverId: assignment.driverId,
                assignedDriverName: assignment.driverName,
                assignedDriverPhone: assignment.driverPhone
              });
            }
          }
        }).catch(() => {});
      }

      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 20);
      return () => clearTimeout(timer);
    } else {
      currentActivePlaceIdRef.current = null;
      lastCalculatedPlaceIdRef.current = null;
      setIsVisible(false);
      closeFullScreenCamera();
    }
  }, [selectedPlace?.id]);

  // Função para fechar suavemente com animação para baixo
  const triggerClose = useCallback(() => {
    setIsClosing(true);
    setIsVisible(false);
    closeFullScreenCamera();
    if (selectedPlace) {
      dismissPlaceProximity(selectedPlace.id);
    }
    setTimeout(() => {
      setSelectedPlace(null);
      // Mantém a rota ativa no mapa conforme solicitado pelo usuário:
      // A rota traçada não é apagada ao fechar o card de detalhes nem ao navegar.
      // Ela só será substituída se clicar em outro ponto e traçar outra rota.
      setIsClosing(false);
      setDragY(0);
      currentDragYRef.current = 0;
    }, 240);
  }, [selectedPlace, setSelectedPlace, dismissPlaceProximity]);

  // Cancelamento do pedido pelo motorista (desiste da rota; justificativa obrigatória gravada no banco)
  const handleConfirmRefusal = useCallback(async () => {
    const justification = refusalNotes.trim();
    if (!selectedPlace || !refusalReason) return;
    if (justification.length < 5) return;
    setIsSubmittingRefusal(true);

    try {
      const fullReasonText = justification ? `${refusalReason} - ${justification}` : refusalReason;
      const driverUserId = parseInt(String(user?.id ?? '').replace(/\D/g, ''), 10);

      // 1. Desvincula o motorista e devolve o pedido ao público para a central reatribuir
      assignPlaceToDriver(selectedPlace.id, null, undefined, undefined);
      updatePlaceDetails(selectedPlace.id, {
        orderVisibility: 'publico',
        assignedDriverId: undefined,
        assignedDriverPhone: undefined,
        assignedDriverName: undefined
      });

      // 2. Grava a justificativa nos campos próprios do pedido (/pedidos/save)
      const numericPedidoId = selectedPlace.id.match(/pedido-(\d+)/)?.[1] || selectedPlace.id.match(/\d+/)?.[0];
      if (numericPedidoId && Number(numericPedidoId) <= 2147483647) {
        await api.savePedido({
          id: numericPedidoId,
          motorista_cancel_motivo: fullReasonText,
          motorista_cancel_em: new Date().toISOString(),
          motorista_cancel_user_id: Number.isFinite(driverUserId) ? driverUserId : null
        } as any).catch(() => {});
      }

      setDriverToast('Pedido cancelado. A central foi notificada.');
      setTimeout(() => setDriverToast(null), 4000);
      setShowRefusalModal(false);
      setRefusalReason('');
      setRefusalNotes('');

      // Fecha suavemente o card de detalhes
      triggerClose();
    } catch (e) {
      console.warn('Erro ao recusar rota:', e);
    } finally {
      setIsSubmittingRefusal(false);
    }
  }, [selectedPlace, refusalReason, refusalNotes, user, assignPlaceToDriver, updatePlaceDetails, triggerClose]);

  // Gestos de toque (Touch) para arrastar para baixo e fechar
  const handleTouchStart = (e: React.TouchEvent) => {
    if (contentScrollRef.current && contentScrollRef.current.scrollTop > 5) {
      return;
    }
    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - startYRef.current;

    if (deltaY > 0) {
      const pull = Math.min(deltaY, 260);
      currentDragYRef.current = pull;
      setDragY(pull);
    } else {
      currentDragYRef.current = 0;
      setDragY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (currentDragYRef.current > 80) {
      triggerClose();
    } else {
      setDragY(0);
      currentDragYRef.current = 0;
    }
  };

  // Gestos com mouse no puxador / topo
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    startYRef.current = e.clientY;
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startYRef.current;
      if (deltaY > 0) {
        const pull = Math.min(deltaY, 260);
        currentDragYRef.current = pull;
        setDragY(pull);
      } else {
        currentDragYRef.current = 0;
        setDragY(0);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setIsDragging(false);

      if (currentDragYRef.current > 80) {
        triggerClose();
      } else {
        setDragY(0);
        currentDragYRef.current = 0;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // ==========================================
  // FUNÇÕES DA CÂMERA PRÓPRIA CHEIA NA TELA
  // ==========================================
  const openFullScreenCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    setPreviewCapturedPhoto(null);
    setCameraError(null);
    setIsFullScreenCameraOpen(true);
    setFocusPoint(null);
    setZoomLevel(1.0);
    setPhotoErrorMsg('');
    setShowObservationSheet(false);

    // Encerra stream anterior se houver
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Câmera não suportada neste dispositivo.');
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
      } catch {
        // Fallback para constraints simples caso a alta resolução falhe ou seja recusada
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      streamRef.current = stream;

      const bindVideo = () => {
        if (videoRef.current) {
          if (videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
          }
          videoRef.current.play().catch(e => {
            console.warn('Play do vídeo:', e);
          });
        }
      };

      bindVideo();
      setTimeout(bindVideo, 100);
      setTimeout(bindVideo, 350);
      requestAnimationFrame(bindVideo);
    } catch (err: any) {
      console.warn('Erro ao abrir câmera:', err);
      setCameraError('Câmera indisponível ou permissão negada. Você pode escolher fotos da galeria.');
    }
  };

  const closeFullScreenCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsFullScreenCameraOpen(false);
    setPreviewCapturedPhoto(null);
    setCameraError(null);
    setShowObservationSheet(false);
    setShowFailReasonPicker(false);
  };

  const openFullScreenCameraForFailure = () => {
    setOperationStatus('failed');
    setPhotoErrorMsg('');
    setShowFailReasonPicker(false);
    openFullScreenCamera();
  };

  const handleFlipCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    openFullScreenCamera(nextFacing);
  };

  // Toque na tela para focar estilo smartphone
  const handleViewfinderTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });

    setTimeout(() => {
      setFocusPoint(prev => (prev?.x === x && prev?.y === y ? null : prev));
    }, 2000);
  };

  // Disparador de foto estilo Samsung Camera (as fotos saem embaixo e a câmera continua aberta!)
  const handleTakeShutterPhoto = () => {
    // Se o stream WebRTC não estiver ativo ou houver restrição no navegador,
    // aciona diretamente a câmera física do aparelho (Samsung / iPhone):
    if (!videoRef.current || cameraError || !streamRef.current || videoRef.current.videoWidth === 0) {
      nativeCameraInputRef.current?.click();
      return;
    }

    // Feedback visual imediato ao bater foto (flash rápido da tela)
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), flashMode === 'on' ? 200 : 90);

    try {
      if (navigator.vibrate) {
        navigator.vibrate(35);
      }
    } catch {}

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      if (zoomLevel > 1.0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(zoomLevel, zoomLevel);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      
      // Adiciona imediatamente à lista (aparece no carrossel inferior sem fechar a câmera!)
      setCustomPhotos((prev) => {
        const next = [...prev, dataUrl];
        if (selectedPlace) {
          try {
            localStorage.setItem(`encomendaszap_photos_${selectedPlace.id}`, JSON.stringify(next));
          } catch {}
          updatePlaceDetails(selectedPlace.id, { imageUrl: next[0], photos: next });
        }
        return next;
      });

      setPhotoErrorMsg('');

      // Sincroniza em segundo plano com a API do servidor Express
      if (selectedPlace) {
        const tipo = selectedPlace.operationType === 'entrega' ? 'entrega' : 'coleta';
        const numericPedidoId = selectedPlace.id.match(/\d+/)?.[0] || '';
        const campo = selectedPlace.operationType === 'entrega' ? 'entrega_foto' : 'coleta_foto';

        api.uploadFoto(dataUrl, tipo).then(uploadRes => {
          const uploadedPath = uploadRes?.path || (uploadRes?.data as any)?.path;
          if (uploadedPath && numericPedidoId) {
            api.appendFoto(numericPedidoId, uploadedPath, campo).catch(() => {});
          }
        }).catch(() => {});
      }
    }
  };

  // Escolher fotos da galeria sem fechar a câmera
  const handleGalleryFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const dataUrl = event.target.result as string;
            setCustomPhotos((prev) => {
              const next = [...prev, dataUrl];
              if (selectedPlace) {
                try {
                  localStorage.setItem(`encomendaszap_photos_${selectedPlace.id}`, JSON.stringify(next));
                } catch {}
                updatePlaceDetails(selectedPlace.id, { imageUrl: next[0], photos: next });
              }
              return next;
            });

            setPhotoErrorMsg('');

            if (selectedPlace) {
              const tipo = selectedPlace.operationType === 'entrega' ? 'entrega' : 'coleta';
              const numericPedidoId = selectedPlace.id.match(/\d+/)?.[0] || '';
              const campo = selectedPlace.operationType === 'entrega' ? 'entrega_foto' : 'coleta_foto';

              api.uploadFoto(dataUrl, tipo).then(uploadRes => {
                const uploadedPath = uploadRes?.path || (uploadRes?.data as any)?.path;
                if (uploadedPath && numericPedidoId) {
                  api.appendFoto(numericPedidoId, uploadedPath, campo).catch(() => {});
                }
              }).catch(() => {});
            }
          }
        };
        reader.readAsDataURL(file);
      });
    }
    e.target.value = '';
  };

  // Distância entre o motorista (GPS ao vivo) e o local; null se a posição real é desconhecida
  const getBaixaProximity = (): BaixaProximity | null => {
    const pos = androidBridge.getNativeCoordinates() || userLocation;
    if (!pos || !selectedPlace) return null;
    const distanceM = calculateDistanceKm(pos, selectedPlace.coordinates) * 1000;
    if (!Number.isFinite(distanceM) || distanceM <= LIMITE_BAIXA_DISTANTE_M) return null;
    return { distanceM: Math.round(distanceM), lat: pos.lat, lng: pos.lng };
  };

  // Finalizar Registro da Operação direto da Câmera
  const handleFinalizeRegistration = (confirmedFar?: BaixaProximity) => {
    setPhotoErrorMsg('');

    // Validação de foto obrigatória na Coleta em caso de sucesso
    const isColetaOp = selectedPlace?.orderStage === 'coleta' || selectedPlace?.operationType === 'coleta';
    if (isColetaOp && operationStatus === 'success' && customPhotos.length === 0) {
      setPhotoErrorMsg('Foto obrigatória: aponte a câmera e tire a foto da mercadoria para finalizar a coleta.');
      return;
    }

    const far = confirmedFar || getBaixaProximity();
    if (far && !confirmedFar) {
      setFarWarning({ proximity: far, proceed: () => handleFinalizeRegistration(far) });
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    setRegisteredOutcome({
      status: operationStatus,
      time: timeStr,
      details: operationStatus === 'success' 
        ? `${receiverName ? `Por: ${receiverName} • ` : ''}${volumeQuantity} vol` 
        : failReason
    });

    if (operationStatus === 'success' && selectedPlace) {
      completePlaceWaypoint(selectedPlace.id, receiverName, notes, confirmedFar);
    } else if (operationStatus === 'failed' && selectedPlace) {
      const failureNote = `Tentativa sem sucesso: ${failReason}${notes ? ` - ${notes}` : ''}`;
      completePlaceWaypoint(selectedPlace.id, `Insucesso: ${failReason}`, failureNote, confirmedFar);
    }

    closeFullScreenCamera();
    setShowOperationModal(false);
  };

  // Excluir uma foto da lista
  const handleDeletePhoto = (indexToDelete: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCustomPhotos((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToDelete);
      if (selectedPlace) {
        try {
          localStorage.setItem(`encomendaszap_photos_${selectedPlace.id}`, JSON.stringify(next));
        } catch {}
        updatePlaceDetails(selectedPlace.id, { imageUrl: next[0] || undefined });
      }
      return next;
    });
  };

  // Descartar foto do preview e voltar para o visor
  const handleRetakePhoto = () => {
    setPreviewCapturedPhoto(null);
    if (!streamRef.current) {
      openFullScreenCamera(cameraFacing);
    }
  };

  // Finalizar Registro da Operação
  const handleSaveOperation = (confirmedFar?: BaixaProximity) => {
    setPhotoErrorMsg('');
    const far = confirmedFar || getBaixaProximity();
    if (far && !confirmedFar) {
      setFarWarning({ proximity: far, proceed: () => handleSaveOperation(far) });
      return;
    }
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    setRegisteredOutcome({
      status: operationStatus,
      time: timeStr,
      details: operationStatus === 'success' 
        ? `${receiverName ? `Por: ${receiverName} • ` : ''}${volumesCount}` 
        : failReason
    });

    if (operationStatus === 'success' && selectedPlace) {
      completePlaceWaypoint(selectedPlace.id, receiverName, notes, confirmedFar);
    } else if (operationStatus === 'failed' && selectedPlace) {
      const failureNote = `Tentativa sem sucesso: ${failReason}${notes ? ` - ${notes}` : ''}`;
      completePlaceWaypoint(selectedPlace.id, `Insucesso: ${failReason}`, failureNote, confirmedFar);
    }

    setShowOperationModal(false);
  };

  if (!selectedPlace) return null;

  const { lat, lng } = selectedPlace.coordinates;
  const operationType: OperationType = selectedPlace.operationType || 'entrega';
  const isExchange = Boolean(selectedPlace.isExchangeOrder);
  const orderStage = selectedPlace.orderStage || (selectedPlace.operationType === 'troca' ? 'troca' : selectedPlace.operationType === 'entrega' ? 'entrega' : 'coleta');
  
  const hasCustomer = Boolean(selectedPlace.customerName && selectedPlace.customerName.trim());
  const customerName = selectedPlace.customerName || '';
  const customerPhone = selectedPlace.customerPhone || '';
  const placeDateBadge = getPlaceDateBadgeInfo(selectedPlace);
  
  const hasResponsible = Boolean(
    (selectedPlace.responsibleName && selectedPlace.responsibleName.trim()) ||
    (selectedPlace.sellerName && selectedPlace.sellerName.trim()) || 
    (selectedPlace.managerName && selectedPlace.managerName.trim())
  );
  const responsibleName = selectedPlace.responsibleName || selectedPlace.sellerName || selectedPlace.managerName || '';
  const responsiblePhone = selectedPlace.responsiblePhone || selectedPlace.sellerPhone || selectedPlace.managerPhone || customerPhone;

  // Primeira foto do local/encomenda para identificação visual imediata
  // REGRA: Na entrega NÃO pode mostrar foto do local, apenas na coleta
  const isColetaCard = selectedPlace.operationType === 'coleta' || selectedPlace.orderStage === 'coleta';
  const rawFirstPhoto = isColetaCard 
    ? (customPhotos[0] || selectedPlace.imageUrl || null)
    : (customPhotos[0] || null);
  const firstPhoto = rawFirstPhoto ? (formatPhotoUrl(rawFirstPhoto, 'md') || rawFirstPhoto) : null;

  // Handlers para seleção e cadastro de clientes / responsáveis
  const handleOpenCustomerSelector = (field: TargetFieldType) => {
    setSelectorTargetField(field);
    setIsCustomerSelectorOpen(true);
  };

  const handleSelectCustomer = (customer: Customer) => {
    if (!selectedPlace) return;

    if (selectorTargetField === 'customer') {
      const op = selectedPlace.operationType || 'coleta';
      const isGeneric = isUnnamedOrGenericPlace(selectedPlace);
      const placeName = (isGeneric && customer.fullName) ? getCustomerPlaceName(customer.fullName) : selectedPlace.name;

      const tempPlace: Place = {
        ...selectedPlace,
        name: placeName,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        customerId: customer.id,
        customerAddress: customer.address || undefined,
        customerCoordinates: customer.coordinates || undefined
      };
      const resolved = getOrderLocationsForOperation(tempPlace, op, [customer, ...customers]);

      const updated: Partial<Place> = {
        name: placeName,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        customerId: customer.id,
        customerAddress: customer.address || undefined,
        customerCoordinates: customer.coordinates || undefined
      };

      if (resolved.canTraceRoute) {
        if (op === 'coleta') {
          // Coleta: o local de entrega é do cliente
          updated.pickupAddress = selectedPlace.address;
          updated.pickupCoordinates = selectedPlace.coordinates;
          updated.deliveryAddress = resolved.deliveryAddress;
          updated.deliveryCoordinates = resolved.deliveryCoordinates;
          updated.deliveryContact = customer.fullName;
          updated.deliveryPhone = customer.phone;
        } else if (op === 'entrega') {
          // Entrega: o local de coleta é do cliente
          updated.pickupAddress = resolved.pickupAddress;
          updated.pickupCoordinates = resolved.pickupCoordinates;
          updated.pickupContact = customer.fullName;
          updated.pickupPhone = customer.phone;
          updated.deliveryAddress = selectedPlace.address;
          updated.deliveryCoordinates = selectedPlace.coordinates;
        } else if (op === 'troca') {
          // Troca: coleta no cliente, troca no local de troca, entrega no cliente
          updated.pickupAddress = resolved.pickupAddress;
          updated.pickupCoordinates = resolved.pickupCoordinates;
          updated.pickupContact = customer.fullName;
          updated.pickupPhone = customer.phone;
          updated.exchangeAddress = selectedPlace.address;
          updated.exchangeCoordinates = selectedPlace.coordinates;
          updated.deliveryAddress = resolved.deliveryAddress;
          updated.deliveryCoordinates = resolved.deliveryCoordinates;
          updated.deliveryContact = customer.fullName;
          updated.deliveryPhone = customer.phone;
        }
      }

      updatePlaceDetails(selectedPlace.id, updated);
      setSelectedPlace({
        ...selectedPlace,
        ...updated
      });

      if (resolved.canTraceRoute) {
        calculateOrderRoute({ ...selectedPlace, ...updated }, customer);
      } else {
        clearActiveRoute();
      }
    } else {
      const updated = {
        managerName: customer.fullName,
        managerPhone: customer.phone,
        sellerName: customer.fullName,
        sellerPhone: customer.phone
      };
      updatePlaceDetails(selectedPlace.id, updated);
      setSelectedPlace({
        ...selectedPlace,
        ...updated
      });
    }

    setIsCustomerSelectorOpen(false);
  };

  const handleOpenRegistrationFromDrawer = (initialData?: Partial<Customer> | AgendaContact) => {
    setIsCustomerSelectorOpen(false);
    setRegistrationInitialData(initialData || null);
    setIsCustomerRegistrationOpen(true);
  };

  const handleSaveCustomerFromRegistration = async (newCustomer: Customer) => {
    const saved = await persistCustomer(newCustomer);
    if (!saved) {
      window.alert('Não foi possível salvar o endereço do cliente no banco de dados.');
      return;
    }

    // Vincula o cliente salvo ao pedido selecionado no mapa.
    if (selectedPlace) {
      if (selectorTargetField === 'customer') {
        const op = selectedPlace.operationType || 'coleta';
        const isGeneric = isUnnamedOrGenericPlace(selectedPlace);
        const placeName = (isGeneric && newCustomer.fullName) ? getCustomerPlaceName(newCustomer.fullName) : selectedPlace.name;

        const tempPlace: Place = {
          ...selectedPlace,
          name: placeName,
          customerName: newCustomer.fullName,
          customerPhone: newCustomer.phone,
          customerId: newCustomer.id,
          customerAddress: newCustomer.address || undefined,
          customerCoordinates: newCustomer.coordinates || undefined
        };
        const resolved = getOrderLocationsForOperation(tempPlace, op, [newCustomer, ...customers]);
        const updated: Partial<Place> = {
          name: placeName,
          customerName: newCustomer.fullName,
          customerPhone: newCustomer.phone,
          customerId: newCustomer.id,
          customerAddress: newCustomer.address || undefined,
          customerCoordinates: newCustomer.coordinates || undefined
        };

        if (resolved.canTraceRoute) {
          if (op === 'coleta') {
            updated.pickupAddress = selectedPlace.address;
            updated.pickupCoordinates = selectedPlace.coordinates;
            updated.deliveryAddress = resolved.deliveryAddress;
            updated.deliveryCoordinates = resolved.deliveryCoordinates;
            updated.deliveryContact = newCustomer.fullName;
            updated.deliveryPhone = newCustomer.phone;
          } else if (op === 'entrega') {
            updated.pickupAddress = resolved.pickupAddress;
            updated.pickupCoordinates = resolved.pickupCoordinates;
            updated.pickupContact = newCustomer.fullName;
            updated.pickupPhone = newCustomer.phone;
            updated.deliveryAddress = selectedPlace.address;
            updated.deliveryCoordinates = selectedPlace.coordinates;
          } else if (op === 'troca') {
            updated.pickupAddress = resolved.pickupAddress;
            updated.pickupCoordinates = resolved.pickupCoordinates;
            updated.pickupContact = newCustomer.fullName;
            updated.pickupPhone = newCustomer.phone;
            updated.exchangeAddress = selectedPlace.address;
            updated.exchangeCoordinates = selectedPlace.coordinates;
            updated.deliveryAddress = resolved.deliveryAddress;
            updated.deliveryCoordinates = resolved.deliveryCoordinates;
            updated.deliveryContact = newCustomer.fullName;
            updated.deliveryPhone = newCustomer.phone;
          }
        }

        updatePlaceDetails(selectedPlace.id, updated);
        setSelectedPlace({
          ...selectedPlace,
          ...updated
        });

        if (resolved.canTraceRoute) {
          calculateOrderRoute({ ...selectedPlace, ...updated }, newCustomer);
        } else {
          clearActiveRoute();
        }
      } else {
        const updated = {
          managerName: newCustomer.fullName,
          managerPhone: newCustomer.phone,
          sellerName: newCustomer.fullName,
          sellerPhone: newCustomer.phone
        };
        updatePlaceDetails(selectedPlace.id, updated);
        setSelectedPlace({
          ...selectedPlace,
          ...updated
        });
      }
    }

    setIsCustomerRegistrationOpen(false);
    setRegistrationInitialData(null);
  };

  // Informações do motorista direcionado (calculadas para exibição no card)
  const assignedDriverDisplayName = 
    selectedPlace?.assignedDriverName || 
    assignedDriverObj?.name || 
    (selectedPlace?.assignedDriverPhone ? `Motorista (${selectedPlace.assignedDriverPhone})` : 'Motorista Atribuído');

  const assignedVehicleEmoji = 
    assignedDriverObj?.vehicleType === 'moto' ? '🏍️' 
    : assignedDriverObj?.vehicleType === 'utilitario' ? '🚚' 
    : '🚗';

  const assignedDriverSubtitle = 
    assignedDriverObj?.vehicleModel 
      ? `${assignedDriverObj.vehicleModel}${assignedDriverObj.vehiclePlate ? ` • ${assignedDriverObj.vehiclePlate}` : ''}`
      : (selectedPlace?.assignedDriverPhone || 'Motorista em trânsito');

  // Observações do local (apenas se preenchido)
  const observations = (selectedPlace.observations || selectedPlace.driverNotes || selectedPlace.description || '').trim();

  const closingTime = getClosingTime(selectedPlace, currentTime);
  const openingTime = getOpeningTime(selectedPlace);
  const timeUntilClose = getTimeUntilClosing(closingTime, currentTime);
  let isOpen = true;
  if (selectedPlace.openNow === false) {
    isOpen = false;
  } else if (timeUntilClose && timeUntilClose.text === 'fechado') {
    isOpen = false;
  } else if (openingTime && closingTime) {
    const currentM = currentTime.getHours() * 60 + currentTime.getMinutes();
    const openMatch = openingTime.match(/(\d{1,2}):(\d{2})/);
    const closeMatch = closingTime.match(/(\d{1,2}):(\d{2})/);
    if (openMatch && closeMatch) {
      const openM = parseInt(openMatch[1], 10) * 60 + parseInt(openMatch[2], 10);
      const closeM = parseInt(closeMatch[1], 10) * 60 + parseInt(closeMatch[2], 10);
      if (closeM > openM) {
        if (currentM < openM || currentM >= closeM) isOpen = false;
      } else {
        // Fecha na madrugada
        if (currentM < openM && currentM >= closeM) isOpen = false;
      }
    }
  }

  const isTrocaOp = operationType === 'troca' || orderStage === 'troca' || isExchange;
  const isColetaOp = !isTrocaOp && (operationType === 'coleta' || orderStage === 'coleta');

  const operationConfig = isTrocaOp
    ? {
        title: 'Registrar Troca',
        label: 'Troca',
        btnBg: 'bg-[#7C3AED] hover:bg-[#6D28D9] shadow-md shadow-purple-600/25',
        icon: Repeat,
        badgeBg: 'bg-[#7C3AED]',
        hint: 'Item coletado na origem. Entregar o novo e recolher o item a ser trocado com o cliente.'
      }
    : isColetaOp
    ? {
        title: 'Registrar Coleta',
        label: 'Coleta',
        btnBg: 'bg-[#0B5187] hover:bg-[#083D66] shadow-md shadow-blue-900/25',
        icon: ArrowDownToLine,
        badgeBg: 'bg-[#0B5187]',
        hint: 'Local de coleta aprovado. Após a coleta, o sistema mostrará o local de entrega.'
      }
    : {
        title: 'Registrar Entrega',
        label: 'Entrega',
        btnBg: 'bg-[#FF5E00] hover:bg-[#E05300] shadow-md shadow-orange-500/25',
        icon: Package,
        badgeBg: 'bg-[#FF5E00]',
        hint: 'Mercadoria coletada na origem. Realizar a entrega final no destinatário.'
      };

  const OperationIcon = operationConfig.icon;

  // Configuração do Tipo de Veículo com Cores Vivas e Diferenciadas
  const vehicleType: VehicleCollectionType = selectedPlace.vehicleType || 'moto';
  const vehicleConfig = {
    moto: {
      label: 'Moto',
      icon: Bike,
      bg: 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300 shadow-2xs'
    },
    carro: {
      label: 'Carro',
      icon: Car,
      bg: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-300 shadow-2xs'
    },
    utilitario: {
      label: 'Utilitário',
      icon: Truck,
      bg: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-950 border-indigo-300 shadow-2xs'
    }
  }[vehicleType] || {
    label: 'Moto',
    icon: Bike,
    bg: 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300 shadow-2xs'
  };
  const VehicleIcon = vehicleConfig.icon;

  // Configuração do Tipo de Encomenda / Embalagem com Suporte Dinâmico a Novos Tipos
  const packageTypeStr = (selectedPlace.packageType || 'caixa').toString();
  const packageConfig = (() => {
    const lower = packageTypeStr.toLowerCase();
    if (lower === 'caixa') {
      return { label: 'Caixa', icon: Package, bg: 'bg-blue-100 hover:bg-blue-200 text-blue-950 border-blue-300 shadow-2xs' };
    }
    if (lower === 'sacola') {
      return { label: 'Sacola', icon: ShoppingBag, bg: 'bg-rose-100 hover:bg-rose-200 text-rose-950 border-rose-300 shadow-2xs' };
    }
    if (lower === 'envelope') {
      return { label: 'Envelope', icon: Mail, bg: 'bg-purple-100 hover:bg-purple-200 text-purple-950 border-purple-300 shadow-2xs' };
    }
    if (lower === 'documento') {
      return { label: 'Documento', icon: FileText, bg: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-950 border-indigo-300 shadow-2xs' };
    }
    if (lower === 'cilindro') {
      return { label: 'Cilindro', icon: Layers, bg: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-950 border-cyan-300 shadow-2xs' };
    }
    return {
      label: packageTypeStr.charAt(0).toUpperCase() + packageTypeStr.slice(1),
      icon: Package,
      bg: 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300 shadow-2xs'
    };
  })();
  const PackageIcon = packageConfig.icon;

  // Compartilha a localização com o texto completo de informações do local e telefone
  const handleShareLocation = async () => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    const opLabel = operationConfig.label.toUpperCase();
    
    // Formata o telefone para exibição clara
    const formatPhone = (phone?: string) => {
      if (!phone) return '';
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 13 && digits.startsWith('55')) {
        return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
      }
      if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
      }
      return phone;
    };

    const clientPhoneFormatted = formatPhone(customerPhone);
    const respPhoneFormatted = formatPhone(responsiblePhone);
    const isStreet = isStreetOrAddress(selectedPlace);
    const horarioText = isStreet
      ? '📍 Tipo: Via pública / Endereço (Acesso livre 24h)'
      : isOpen
      ? `🕒 Horário: Aberto ⋅ Fecha às ${closingTime}${timeUntilClose && timeUntilClose.text !== 'fechado' ? ` (${timeUntilClose.text})` : ''}`
      : `🕒 Horário: Fechado ⋅ Abre às ${openingTime || '08:00'}`;

    const shareText = `📍 *${selectedPlace.name}*
🏷️ Operação: ${opLabel}
${horarioText}
👤 Cliente: ${customerName || 'Não informado'}
📞 Tel. Cliente: ${clientPhoneFormatted || 'Não informado'}
📋 Responsável: ${responsibleName || 'Não informado'}
📱 Tel. Responsável: ${respPhoneFormatted || 'Não informado'}
🏠 Endereço: ${selectedPlace.address}${observations ? `\n📝 Observações: ${observations}` : ''}
🗺️ Localização no Mapa: ${mapsUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: selectedPlace.name,
          text: shareText,
          url: mapsUrl
        });
        return;
      } catch (err) {
        // Usuário cancelou ou navegador não suportou janela de compartilhamento
      }
    }

    // Fallback garantido e seguro: copia para a área de transferência
    try {
      if (navigator.clipboard && document.hasFocus && document.hasFocus()) {
        await navigator.clipboard.writeText(shareText);
      } else {
        throw new Error('Clipboard writeText unavailable or unfocused');
      }
    } catch {
      // Fallback usando textarea temporária caso o iframe não tenha foco
      try {
        const textarea = document.createElement('textarea');
        textarea.value = shareText;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // Fallback silencioso sem quebrar
      }
    }
    setSharedToast(true);
    setTimeout(() => setSharedToast(false), 2500);
  };

  const executeDirectNavigation = (targetApp: 'google_maps' | 'waze', saveAsDefaultChoice = false) => {
    if (!selectedPlace) return;
    const { lat, lng } = selectedPlace.coordinates;

    if (saveAsDefaultChoice) {
      setDefaultNavApp(targetApp);
    }

    // 1. Traça a rota animada no mapa interno estilo Uber somente quando clica para ir no GPS
    calculateRouteToPlace(selectedPlace);

    // Avisa a central (admin/atendente/terminal) que o motorista está a caminho
    if (isDriverRole) {
      void realtimeAssignmentService.markEnRoute(selectedPlace.id, selectedPlace.operationType, true).catch(() => {});
      setNavSession({
        placeId: selectedPlace.id,
        operationType: selectedPlace.operationType || 'coleta',
        name: selectedPlace.name || 'Local',
        lat,
        lng,
        startedAt: Date.now()
      });
    }
    // 2. Fecha o card de detalhes suavemente mantendo a rota visível na tela
    triggerClose();
    setShowNavChooser(false);

    // 3. Abre direto na navegação
    if (targetApp === 'google_maps' || targetApp === 'waze') {
      openExternalNavigation(targetApp, lat, lng);
      return;
    }
  };

  const handleStartNavigation = (targetApp?: 'google_maps' | 'waze') => {
    if (targetApp) {
      executeDirectNavigation(targetApp, saveAsDefaultNav);
      return;
    }

    // Se já tiver aplicativo padrão configurado (Google Maps ou Waze), navega direto!
    if (defaultNavApp === 'google_maps' || defaultNavApp === 'waze') {
      executeDirectNavigation(defaultNavApp, false);
      return;
    }

    // Se não tem padrão ainda, abre o seletor no aplicativo
    setShowNavChooser(true);
  };

  // Alternância do tipo de operação com a regra:
  // - Coleta: o local de entrega é do cliente (Origem: Local do mapa -> Destino: Cliente)
  // - Entrega: o local de coleta é do cliente (Origem: Cliente -> Destino: Local do mapa)
  // - Troca: Coleta no cliente -> Troca no local de troca -> Entrega no cliente
  const handleApplyOperationType = (newOp: OperationType) => {
    if (!selectedPlace) return;
    const tempPlace: Place = {
      ...selectedPlace,
      operationType: newOp,
      orderStage: newOp,
      isExchangeOrder: newOp === 'troca'
    };
    const resolved = getOrderLocationsForOperation(tempPlace, newOp, customers);

    const updated: Partial<Place> = {
      operationType: newOp,
      orderStage: newOp,
      isExchangeOrder: newOp === 'troca'
    };

    if (resolved.canTraceRoute) {
      if (newOp === 'coleta') {
        updated.pickupAddress = selectedPlace.address;
        updated.pickupCoordinates = selectedPlace.coordinates;
        updated.deliveryAddress = resolved.deliveryAddress;
        updated.deliveryCoordinates = resolved.deliveryCoordinates;
      } else if (newOp === 'entrega') {
        updated.pickupAddress = resolved.pickupAddress;
        updated.pickupCoordinates = resolved.pickupCoordinates;
        updated.deliveryAddress = selectedPlace.address;
        updated.deliveryCoordinates = selectedPlace.coordinates;
      } else if (newOp === 'troca') {
        updated.pickupAddress = resolved.pickupAddress;
        updated.pickupCoordinates = resolved.pickupCoordinates;
        updated.exchangeAddress = selectedPlace.address;
        updated.exchangeCoordinates = selectedPlace.coordinates;
        updated.deliveryAddress = resolved.deliveryAddress;
        updated.deliveryCoordinates = resolved.deliveryCoordinates;
      }
    }

    updatePlaceDetails(selectedPlace.id, updated);
    setShowOperationPicker(false);

    if (resolved.canTraceRoute) {
      calculateOrderRoute({ ...selectedPlace, ...updated });
    } else {
      clearActiveRoute();
    }
  };

  // Cria um novo pedido/rascunho a partir do local/POI atualmente visualizado
  const handleAddNewOrderAtCurrentPlace = () => {
    if (!selectedPlace || isDriverRole) return;
    const tempId = `pedido-${Date.now()}`;
    const orderCode = `EZ-${Math.floor(1000 + Math.random() * 9000)}-GO`;
    const curOps = operationsFilter;
    const initialOp: OperationType = curOps?.coleta ? 'coleta' : curOps?.entrega ? 'entrega' : curOps?.troca ? 'troca' : 'coleta';

    const newDraft: Place = {
      ...selectedPlace,
      id: tempId,
      orderCode,
      operationType: initialOp,
      orderStage: initialOp,
      customerName: '',
      customerPhone: '',
      customerId: undefined,
      customerAddress: undefined,
      customerCoordinates: undefined,
      observations: '',
      driverNotes: `Novo pedido no local ${selectedPlace.name}.`,
      pickupAddress: initialOp === 'coleta' ? selectedPlace.address : undefined,
      pickupCoordinates: initialOp === 'coleta' ? selectedPlace.coordinates : undefined,
      deliveryAddress: initialOp === 'entrega' ? selectedPlace.address : undefined,
      deliveryCoordinates: initialOp === 'entrega' ? selectedPlace.coordinates : undefined,
      exchangeAddress: initialOp === 'troca' ? selectedPlace.address : undefined,
      exchangeCoordinates: initialOp === 'troca' ? selectedPlace.coordinates : undefined
    };

    setSelectedPlace(newDraft);
    setIsEditingOrder(true);
  };

  // Salva a encomenda/pedido no banco de dados e mapa conforme as regras de Coleta, Entrega e Troca
  const handleSavePlaceOrder = () => {
    if (!selectedPlace || isDriverRole) return;
    const finalObs = isEditingObservations ? editedObservations : (selectedPlace.observations || '');
    const op = selectedPlace.operationType || 'coleta';
    const resolved = getOrderLocationsForOperation(selectedPlace, op, customers);

    let updated: Place = {
      ...selectedPlace,
      observations: finalObs
    };

    if (resolved.canTraceRoute) {
      if (op === 'coleta') {
        // Coleta: o local de entrega é do cliente
        updated.pickupAddress = selectedPlace.address;
        updated.pickupCoordinates = selectedPlace.coordinates;
        updated.deliveryAddress = resolved.deliveryAddress;
        updated.deliveryCoordinates = resolved.deliveryCoordinates;
        if (resolved.summaryDestName && !updated.deliveryContact) {
          updated.deliveryContact = resolved.summaryDestName;
        }
      } else if (op === 'entrega') {
        // Entrega: o local de coleta é do cliente
        updated.pickupAddress = resolved.pickupAddress;
        updated.pickupCoordinates = resolved.pickupCoordinates;
        updated.deliveryAddress = selectedPlace.address;
        updated.deliveryCoordinates = selectedPlace.coordinates;
        if (resolved.summaryOriginName && !updated.pickupContact) {
          updated.pickupContact = resolved.summaryOriginName;
        }
      } else if (op === 'troca') {
        // Troca: coleta no cliente, troca no local de troca, entrega no cliente
        updated.pickupAddress = resolved.pickupAddress;
        updated.pickupCoordinates = resolved.pickupCoordinates;
        updated.exchangeAddress = selectedPlace.address;
        updated.exchangeCoordinates = selectedPlace.coordinates;
        updated.deliveryAddress = resolved.deliveryAddress;
        updated.deliveryCoordinates = resolved.deliveryCoordinates;
        if (resolved.summaryOriginName && !updated.pickupContact) {
          updated.pickupContact = resolved.summaryOriginName;
        }
        if (resolved.summaryDestName && !updated.deliveryContact) {
          updated.deliveryContact = resolved.summaryDestName;
        }
      }
      calculateOrderRoute(updated);
    } else {
      clearActiveRoute();
      if (op === 'coleta') {
        updated.pickupAddress = selectedPlace.address;
        updated.pickupCoordinates = selectedPlace.coordinates;
      } else if (op === 'entrega') {
        updated.deliveryAddress = selectedPlace.address;
        updated.deliveryCoordinates = selectedPlace.coordinates;
      } else if (op === 'troca') {
        updated.exchangeAddress = selectedPlace.address;
        updated.exchangeCoordinates = selectedPlace.coordinates;
      }
    }

    addNewOrder(updated);
    updatePlaceDetails(selectedPlace.id, updated);
    if (isEditingObservations) {
      setIsEditingObservations(false);
    }
    setIsEditingOrder(false);
    if (resolved.canTraceRoute) {
      setSaveSuccessToast(!isAlreadySaved ? '✅ Encomenda adicionada e rota traçada no mapa!' : '✅ Alterações salvas com rota ativa!');
    } else {
      setSaveSuccessToast(!isAlreadySaved ? '✅ Encomenda adicionada no mapa!' : '✅ Alterações salvas!');
    }
    setTimeout(() => setSaveSuccessToast(null), 3500);

    // Quando clicar em adicionar pedido o dialog deve fechar
    triggerClose();
  };

  const handleOpenGoogleMaps = () => {
    executeDirectNavigation('google_maps', false);
  };

  const handleWhatsApp = (targetPhone: string, _targetName?: string) => {
    let clean = targetPhone.replace(/\D/g, '');
    if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
      clean = `55${clean}`;
    }
    if (typeof window !== 'undefined' && window.AndroidApp?.openWhatsApp) {
      window.AndroidApp.openWhatsApp(clean, '');
    } else {
      window.open(`https://wa.me/${clean}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopy = async () => {
    const textToCopy = `${selectedPlace.name} - ${selectedPlace.address}`;
    try {
      if (navigator.clipboard && document.hasFocus && document.hasFocus()) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        throw new Error('Clipboard writeText unavailable or unfocused');
      }
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // Fallback silencioso
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const transformStyle: React.CSSProperties = {
    transform: !isVisible || isClosing 
      ? 'translateY(105%)' 
      : `translateY(${dragY}px)`,
    opacity: isClosing ? 0.4 : 1,
    transition: isDragging 
      ? 'none' 
      : 'transform 0.28s cubic-bezier(0.18, 0.9, 0.3, 1), opacity 0.22s ease-out'
  };

  return (
    <>
      {/* INPUT INVISÍVEL PARA ESCOLHER FOTO DA GALERIA */}
      <input 
        type="file" 
        ref={galleryInputRef} 
        accept="image/*" 
        onChange={handleGalleryFileSelected} 
        className="hidden" 
      />

      {/* ========================================================
          CARD PRINCIPAL ESTILO GOOGLE MAPS
          ======================================================== */}
      <aside 
        aria-label="Detalhes do local selecionado"
        className="fixed inset-x-0 bottom-0 sm:bottom-4 sm:inset-x-auto sm:right-5 sm:w-[450px] md:w-[470px] z-40 pointer-events-none flex justify-center select-none"
      >
        <div 
          ref={cardRef}
          style={transformStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="pointer-events-auto w-full max-w-lg sm:max-w-none bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] will-change-transform"
        >
          
          {/* PUXADOR GOOGLE MAPS */}
          <div 
            onMouseDown={handleMouseDown}
            className="w-full pt-2 pb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shrink-0 bg-white hover:bg-slate-50 transition-colors"
            title="Arraste para baixo para fechar"
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full transition-all group-hover:bg-slate-400" />
          </div>

          {/* HEADER SUPERIOR: BOTÕES INTERATIVOS PARA ALTERAR (TIPO, AGENDA, VEÍCULO, CARGA) + BOTÃO FECHAR */}
          <div className="px-3.5 pt-1.5 pb-1.5 flex items-center justify-between shrink-0 bg-white border-b border-slate-100 relative">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              
              {/* 1. Botão da Operação (Coleta / Entrega / Troca) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!canEdit) {
                      handleLockedEditAttempt();
                      return;
                    }
                    setShowOperationPicker(prev => !prev);
                    setShowSchedulePicker(false);
                    setShowVehiclePicker(false);
                    setShowPackagePicker(false);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider text-white shadow-2xs shrink-0 transition-all active:scale-95 cursor-pointer hover:brightness-110 ${
                    operationType === 'coleta'
                      ? 'bg-[#0B5187]'
                      : operationType === 'troca'
                      ? 'bg-[#7C3AED]'
                      : 'bg-[#FF5E00]'
                  }`}
                  title={canEdit ? "Alterar Tipo da Encomenda" : "Tipo da Encomenda (Clique em Editar para alterar)"}
                >
                  {operationType === 'coleta' && <ArrowDownToLine className="w-3 h-3 stroke-[2.8]" />}
                  {operationType === 'entrega' && <Package className="w-3 h-3 stroke-[2.8]" />}
                  {operationType === 'troca' && <Repeat className="w-3 h-3 stroke-[2.8]" />}
                  <span>{operationType === 'coleta' ? 'Coleta' : operationType === 'troca' ? 'Troca' : 'Entrega'}</span>
                  {canEdit && <ChevronDown className="w-2.5 h-2.5 stroke-[3]" />}
                </button>

                {showOperationPicker && (
                  <div className="absolute top-8 left-0 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 w-48 space-y-1 animate-in zoom-in-95 duration-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase px-2 py-0.5">
                      Alterar Tipo
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyOperationType('coleta')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${operationType === 'coleta' ? 'bg-blue-50 text-[#0B5187]' : 'hover:bg-slate-50 text-slate-800'}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-[#0B5187]" />
                      <span>Coleta (Azul)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyOperationType('entrega')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${operationType === 'entrega' ? 'bg-orange-50 text-[#FF5E00]' : 'hover:bg-slate-50 text-slate-800'}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FF5E00]" />
                      <span>Entrega (Laranja)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyOperationType('troca')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${operationType === 'troca' ? 'bg-purple-50 text-[#7C3AED]' : 'hover:bg-slate-50 text-slate-800'}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-[#7C3AED]" />
                      <span>Troca (Roxo)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 2. Botão de Data / Agenda da Encomenda */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!canEdit) {
                      handleLockedEditAttempt();
                      return;
                    }
                    setShowSchedulePicker(prev => !prev);
                    setShowOperationPicker(false);
                    setShowVehiclePicker(false);
                    setShowPackagePicker(false);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black text-white shadow-2xs shrink-0 transition-all active:scale-95 cursor-pointer hover:brightness-110 ${
                    placeDateBadge.type === 'hoje'
                      ? 'bg-emerald-600'
                      : placeDateBadge.type === 'amanha'
                      ? 'bg-sky-600'
                      : placeDateBadge.type === 'ontem'
                      ? 'bg-blue-600'
                      : placeDateBadge.type === '2_dias_atras'
                      ? 'bg-amber-600'
                      : 'bg-indigo-600'
                  }`}
                  title={canEdit ? "Alterar Data e Horário da Agenda" : "Data da Agenda (Clique em Editar para alterar)"}
                >
                  <Clock className="w-3 h-3 stroke-[2.8]" />
                  <span>{placeDateBadge.label}</span>
                  {canEdit && <ChevronDown className="w-2.5 h-2.5 stroke-[3]" />}
                </button>

                {showSchedulePicker && (
                  <div className="absolute top-8 left-0 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 w-72 space-y-2.5 animate-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">
                        Agendamento da Encomenda
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSchedulePicker(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    
                    {/* Opções de Data: Hoje, Amanhã e Botão para Abrir Calendário */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {/* 1. Botão HOJE */}
                      <button
                        type="button"
                        onClick={() => {
                          updatePlaceDetails(selectedPlace.id, { 
                            orderDateBadge: 'hoje', 
                            scheduledDate: undefined 
                          });
                          setShowSchedulePicker(false);
                        }}
                        className={`py-2 px-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                          (!selectedPlace.scheduledDate && placeDateBadge.type === 'hoje') || selectedPlace.scheduledDate === new Date().toISOString().slice(0, 10)
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${((!selectedPlace.scheduledDate && placeDateBadge.type === 'hoje') || selectedPlace.scheduledDate === new Date().toISOString().slice(0, 10)) ? 'bg-white' : 'bg-emerald-500'}`} />
                          <span>Hoje</span>
                        </div>
                        <span className={`text-[9.5px] font-bold ${((!selectedPlace.scheduledDate && placeDateBadge.type === 'hoje') || selectedPlace.scheduledDate === new Date().toISOString().slice(0, 10)) ? 'text-white/80' : 'text-slate-400'}`}>
                          {new Date().getDate().toString().padStart(2, '0')}/{(new Date().getMonth() + 1).toString().padStart(2, '0')}
                        </span>
                      </button>

                      {/* 2. Botão AMANHÃ */}
                      <button
                        type="button"
                        onClick={() => {
                          const tom = new Date();
                          tom.setDate(tom.getDate() + 1);
                          const tomStr = tom.toISOString().slice(0, 10);
                          updatePlaceDetails(selectedPlace.id, { 
                            orderDateBadge: 'amanha', 
                            scheduledDate: tomStr 
                          });
                          setShowSchedulePicker(false);
                        }}
                        className={`py-2 px-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                          (() => {
                            const tom = new Date();
                            tom.setDate(tom.getDate() + 1);
                            const tomStr = tom.toISOString().slice(0, 10);
                            return placeDateBadge.type === 'amanha' || selectedPlace.scheduledDate === tomStr;
                          })()
                            ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${(() => {
                            const tom = new Date();
                            tom.setDate(tom.getDate() + 1);
                            const tomStr = tom.toISOString().slice(0, 10);
                            return placeDateBadge.type === 'amanha' || selectedPlace.scheduledDate === tomStr;
                          })() ? 'bg-white' : 'bg-sky-500'}`} />
                          <span>Amanhã</span>
                        </div>
                        <span className={`text-[9.5px] font-bold ${(() => {
                          const tom = new Date();
                          tom.setDate(tom.getDate() + 1);
                          const tomStr = tom.toISOString().slice(0, 10);
                          return placeDateBadge.type === 'amanha' || selectedPlace.scheduledDate === tomStr;
                        })() ? 'text-white/80' : 'text-slate-400'}`}>
                          {(() => {
                            const tom = new Date();
                            tom.setDate(tom.getDate() + 1);
                            return `${tom.getDate().toString().padStart(2, '0')}/${(tom.getMonth() + 1).toString().padStart(2, '0')}`;
                          })()}
                        </span>
                      </button>

                      {/* 3. Botão para Abrir Calendário para Escolher um Dia */}
                      <button
                        type="button"
                        onClick={() => {
                          if (scheduleCalendarInputRef.current) {
                            try {
                              if ('showPicker' in HTMLInputElement.prototype) {
                                scheduleCalendarInputRef.current.showPicker();
                              } else {
                                scheduleCalendarInputRef.current.click();
                              }
                            } catch {
                              scheduleCalendarInputRef.current.click();
                            }
                          }
                        }}
                        className={`py-2 px-1 rounded-xl text-[11px] font-black border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                          Boolean(selectedPlace.scheduledDate && selectedPlace.scheduledDate !== new Date().toISOString().slice(0, 10) && (() => {
                            const tom = new Date();
                            tom.setDate(tom.getDate() + 1);
                            return selectedPlace.scheduledDate !== tom.toISOString().slice(0, 10);
                          })())
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                        title="Abrir calendário para escolher um dia"
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <Calendar className={`w-3 h-3 shrink-0 ${Boolean(selectedPlace.scheduledDate && selectedPlace.scheduledDate !== new Date().toISOString().slice(0, 10)) ? 'text-white' : 'text-indigo-600'}`} />
                          <span className="truncate">
                            {Boolean(selectedPlace.scheduledDate && selectedPlace.scheduledDate !== new Date().toISOString().slice(0, 10) && (() => {
                              const tom = new Date();
                              tom.setDate(tom.getDate() + 1);
                              return selectedPlace.scheduledDate !== tom.toISOString().slice(0, 10);
                            })()) ? (() => {
                              const p = selectedPlace.scheduledDate!.split('-');
                              return p.length === 3 ? `${p[2]}/${p[1]}` : selectedPlace.scheduledDate;
                            })() : 'Calendário'}
                          </span>
                        </div>
                        <span className={`text-[9.5px] font-bold ${Boolean(selectedPlace.scheduledDate && selectedPlace.scheduledDate !== new Date().toISOString().slice(0, 10)) ? 'text-white/80' : 'text-slate-400'}`}>
                          {Boolean(selectedPlace.scheduledDate && selectedPlace.scheduledDate !== new Date().toISOString().slice(0, 10) && (() => {
                            const tom = new Date();
                            tom.setDate(tom.getDate() + 1);
                            return selectedPlace.scheduledDate !== tom.toISOString().slice(0, 10);
                          })()) ? 'Data fixada' : 'Escolher dia'}
                        </span>
                      </button>
                    </div>

                    {/* Input nativo de calendário oculto acionado via showPicker() do botão (sem input visível na tela) */}
                    <input
                      ref={scheduleCalendarInputRef}
                      type="date"
                      aria-label="Escolher data no calendário"
                      value={selectedPlace.scheduledDate || new Date().toISOString().slice(0, 10)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const today = new Date().toISOString().slice(0, 10);
                          const tom = new Date();
                          tom.setDate(tom.getDate() + 1);
                          const tomStr = tom.toISOString().slice(0, 10);

                          if (val === today) {
                            updatePlaceDetails(selectedPlace.id, { 
                              orderDateBadge: 'hoje', 
                              scheduledDate: undefined 
                            });
                          } else if (val === tomStr) {
                            updatePlaceDetails(selectedPlace.id, { 
                              orderDateBadge: 'amanha', 
                              scheduledDate: tomStr 
                            });
                          } else {
                            updatePlaceDetails(selectedPlace.id, { 
                              orderDateBadge: 'custom', 
                              scheduledDate: val 
                            });
                          }
                          setShowSchedulePicker(false);
                        }
                      }}
                      className="sr-only opacity-0 absolute pointer-events-none"
                      tabIndex={-1}
                    />

                    {/* Horário previsto e modo */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Horário Previsto</label>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedPlace.scheduledTimeMode || 'ate'}
                          onChange={(e) => updatePlaceDetails(selectedPlace.id, { scheduledTimeMode: e.target.value as any })}
                          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 font-bold text-slate-800"
                        >
                          <option value="ate">Até às</option>
                          <option value="partir">Após</option>
                        </select>
                        <input
                          type="time"
                          value={selectedPlace.scheduledTime || ''}
                          onChange={(e) => updatePlaceDetails(selectedPlace.id, { scheduledTime: e.target.value })}
                          className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Botão do Tipo de Veículo */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!canEdit) {
                      handleLockedEditAttempt();
                      return;
                    }
                    setShowVehiclePicker(prev => !prev);
                    setShowOperationPicker(false);
                    setShowSchedulePicker(false);
                    setShowPackagePicker(false);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border shadow-2xs shrink-0 transition-all active:scale-95 cursor-pointer hover:brightness-105 ${vehicleConfig.bg}`}
                  title={canEdit ? `Veículo: ${vehicleConfig.label} - Clique para alterar` : `Veículo: ${vehicleConfig.label} (Clique em Editar para alterar)`}
                >
                  <VehicleIcon className="w-3 h-3 stroke-[2.5]" />
                  <span>{vehicleConfig.label}</span>
                  {canEdit && <ChevronDown className="w-2.5 h-2.5 stroke-[3]" />}
                </button>

                {showVehiclePicker && (
                  <div className="absolute top-8 left-0 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 w-44 space-y-1 animate-in zoom-in-95 duration-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase px-2 py-0.5">
                      Alterar Veículo
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updatePlaceDetails(selectedPlace.id, { vehicleType: 'moto' });
                        setShowVehiclePicker(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${vehicleType === 'moto' ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50 text-slate-800'}`}
                    >
                      <Bike className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Moto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updatePlaceDetails(selectedPlace.id, { vehicleType: 'carro' });
                        setShowVehiclePicker(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${vehicleType === 'carro' ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'}`}
                    >
                      <Car className="w-3.5 h-3.5 text-blue-600" />
                      <span>Carro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updatePlaceDetails(selectedPlace.id, { vehicleType: 'utilitario' });
                        setShowVehiclePicker(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${vehicleType === 'utilitario' ? 'bg-amber-50 text-amber-950' : 'hover:bg-slate-50 text-slate-800'}`}
                    >
                      <Truck className="w-3.5 h-3.5 text-amber-600" />
                      <span>Utilitário</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4. Botão do Tipo de Encomenda / Carga & Medidas/Volumes */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!canEdit) {
                      handleLockedEditAttempt();
                      return;
                    }
                    setShowPackagePicker(prev => !prev);
                    setShowOperationPicker(false);
                    setShowSchedulePicker(false);
                    setShowVehiclePicker(false);
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border shadow-2xs shrink-0 transition-all active:scale-95 cursor-pointer hover:brightness-105 ${packageConfig.bg}`}
                  title={canEdit ? `Encomenda: ${packageConfig.label} - Clique para alterar tipo, volumes e medidas` : `Encomenda: ${packageConfig.label} (Clique em Editar para alterar)`}
                >
                  <PackageIcon className="w-3 h-3 stroke-[2.5]" />
                  <span>
                    {packageConfig.label}
                    {selectedPlace.volumesCount && selectedPlace.volumesCount > 1 ? ` (${selectedPlace.volumesCount} vol)` : ''}
                    {selectedPlace.isFragile ? ' ⚠️' : ''}
                  </span>
                  {canEdit && <ChevronDown className="w-2.5 h-2.5 stroke-[3]" />}
                </button>
              </div>

      {/* MODAL CENTRALIZADO E AMPLO: TIPO DE ENCOMENDA & CARGA */}
      {showPackagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 pointer-events-auto">
          <div className="w-full max-w-lg sm:max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in zoom-in-95 duration-150">
            
            {/* Cabeçalho */}
            <div className="bg-[#0B5187] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0 shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                  <Package className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black tracking-tight leading-tight">
                    Tipo de Encomenda & Carga
                  </h3>
                  <p className="text-[11px] text-blue-100 font-medium truncate">
                    Selecione o tipo, adicione novos ou personalize medidas e volumes
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPackagePicker(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Fechar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 divide-y divide-slate-100 overscroll-contain text-left">
              
              {/* 1. LISTA COM VÁRIOS TIPOS DE ENCOMENDA (COM SCROLL SUAVE) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    Tipos Disponíveis ({allAvailablePackageTypes.length})
                  </label>
                  <span className="text-[11px] font-black text-[#0B5187] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    Selecionado: {packageConfig.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 sm:max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                  {allAvailablePackageTypes.map(item => {
                    const isSelected = selectedPlace.packageType?.toLowerCase() === item.key.toLowerCase() ||
                                       selectedPlace.packageType?.toLowerCase() === item.label.toLowerCase();
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          updatePlaceDetails(selectedPlace.id, { packageType: item.label as any });
                        }}
                        className={`p-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center justify-between gap-1.5 text-left active:scale-95 ${
                          isSelected
                            ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-sm font-black ring-2 ring-[#0B5187]/20'
                            : 'bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-800 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{item.emoji}</span>
                          <span className="truncate">{item.label}</span>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 stroke-[3] text-emerald-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. EM BAIXO: O ADD (ADICIONAR NOVO TIPO) */}
              <div className="pt-3 space-y-2">
                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-[#FF5E00]" />
                  <span>Adicionar Novo Tipo de Encomenda</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCustomPackageInput}
                    onChange={(e) => setNewCustomPackageInput(e.target.value)}
                    placeholder="Digite o nome (ex: Bolo, Tortas, Joias, Eletrônicos...)"
                    className="flex-1 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCustomPackageInput.trim()) {
                        e.preventDefault();
                        handleAddCustomPackageType();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomPackageType}
                    disabled={!newCustomPackageInput.trim()}
                    className="px-4 py-2.5 bg-[#FF5E00] hover:bg-[#E05300] disabled:opacity-40 text-white text-xs sm:text-sm font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>Adicionar</span>
                  </button>
                </div>
              </div>

              {/* 3. MAIS EM BAIXO: O BOTÃO PERSONALIZADO QUE ABRE OS OUTROS DETALHES */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setShowCustomCargoDetails(prev => !prev)}
                  className={`w-full p-3 rounded-2xl border flex items-center justify-between text-left transition-all cursor-pointer select-none active:scale-95 ${
                    showCustomCargoDetails || Boolean(
                      (selectedPlace.volumesCount && selectedPlace.volumesCount > 1) ||
                      selectedPlace.dimensions ||
                      selectedPlace.weightKg ||
                      selectedPlace.isFragile
                    )
                      ? 'bg-blue-50/80 border-[#0B5187]/40 text-[#0B5187] shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      showCustomCargoDetails || Boolean(
                        (selectedPlace.volumesCount && selectedPlace.volumesCount > 1) ||
                        selectedPlace.dimensions ||
                        selectedPlace.weightKg ||
                        selectedPlace.isFragile
                      ) ? 'bg-[#0B5187] text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-black block leading-tight">
                        Personalizado (Outros Detalhes de Carga)
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium block truncate mt-0.5">
                        {Boolean(
                          (selectedPlace.volumesCount && selectedPlace.volumesCount > 1) ||
                          selectedPlace.dimensions ||
                          selectedPlace.weightKg ||
                          selectedPlace.isFragile
                        )
                          ? `${selectedPlace.volumesCount ? `${selectedPlace.volumesCount} vol` : ''}${selectedPlace.weightKg ? ` • ${selectedPlace.weightKg}kg` : ''}${selectedPlace.dimensions ? ` • ${selectedPlace.dimensions}` : ''}${selectedPlace.isFragile ? ' • ⚠️ Frágil' : ''}`
                          : 'Toque para abrir medidas, volumes, peso e frágil'
                        }
                      </span>
                    </div>
                  </div>
                  
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${showCustomCargoDetails ? 'rotate-180 text-[#0B5187]' : ''}`} />
                </button>

                {/* CONTEÚDO DOS OUTROS DETALHES (ABERTO PELO BOTÃO PERSONALIZADO) */}
                {showCustomCargoDetails && (
                  <div className="mt-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-3 animate-in fade-in duration-150">
                    {/* Quantidade de Volumes */}
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                      <div>
                        <label className="text-xs sm:text-sm font-bold text-slate-800 block leading-tight">Quantidade de Volumes</label>
                        <span className="text-[11px] text-slate-400">Total de pacotes neste local</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const current = selectedPlace.volumesCount || 1;
                            const next = Math.max(1, current - 1);
                            updatePlaceDetails(selectedPlace.id, { volumesCount: next });
                          }}
                          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-700 font-black text-sm flex items-center justify-center cursor-pointer shadow-2xs"
                        >
                          -
                        </button>
                        <span className="font-mono text-sm sm:text-base font-black text-slate-900 w-10 text-center">
                          {selectedPlace.volumesCount || 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const current = selectedPlace.volumesCount || 1;
                            const next = Math.min(999, current + 1);
                            updatePlaceDetails(selectedPlace.id, { volumesCount: next });
                          }}
                          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-700 font-black text-sm flex items-center justify-center cursor-pointer shadow-2xs"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Dimensões / Medidas (Comprimento x Largura x Altura) */}
                    <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
                      <label className="text-[11px] font-black text-slate-600 uppercase flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        <span>Medidas em Centímetros (Comp x Larg x Alt)</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-0.5">Comprimento</span>
                          <input
                            type="text"
                            placeholder="Ex: 30"
                            value={dimLength}
                            onChange={(e) => {
                              setDimLength(e.target.value);
                              const combined = (e.target.value || dimWidth || dimHeight) ? `${e.target.value || '0'}x${dimWidth || '0'}x${dimHeight || '0'} cm` : '';
                              updatePlaceDetails(selectedPlace.id, { dimensions: combined });
                            }}
                            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-center focus:outline-none focus:bg-white focus:border-[#0B5187]"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-0.5">Largura</span>
                          <input
                            type="text"
                            placeholder="Ex: 20"
                            value={dimWidth}
                            onChange={(e) => {
                              setDimWidth(e.target.value);
                              const combined = (dimLength || e.target.value || dimHeight) ? `${dimLength || '0'}x${e.target.value || '0'}x${dimHeight || '0'} cm` : '';
                              updatePlaceDetails(selectedPlace.id, { dimensions: combined });
                            }}
                            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-center focus:outline-none focus:bg-white focus:border-[#0B5187]"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-0.5">Altura</span>
                          <input
                            type="text"
                            placeholder="Ex: 15"
                            value={dimHeight}
                            onChange={(e) => {
                              setDimHeight(e.target.value);
                              const combined = (dimLength || dimWidth || e.target.value) ? `${dimLength || '0'}x${dimWidth || '0'}x${e.target.value || '0'} cm` : '';
                              updatePlaceDetails(selectedPlace.id, { dimensions: combined });
                            }}
                            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 text-center focus:outline-none focus:bg-white focus:border-[#0B5187]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Peso em KG */}
                    <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                      <label className="text-[11px] font-black text-slate-600 uppercase">
                        Peso Estimado (kg)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 2.5 kg"
                        value={selectedPlace.weightKg || ''}
                        onChange={(e) => updatePlaceDetails(selectedPlace.id, { weightKg: e.target.value })}
                        className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-[#0B5187]"
                      />
                    </div>

                    {/* Checkbox Carga Frágil */}
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/90 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedPlace.isFragile)}
                        onChange={(e) => updatePlaceDetails(selectedPlace.id, { isFragile: e.target.checked })}
                        className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                      />
                      <div className="text-left">
                        <span className="text-xs sm:text-sm font-black text-amber-950 block">⚠️ Carga Frágil</span>
                        <span className="text-[11px] text-amber-800">Manusear com cuidado especial durante o transporte</span>
                      </div>
                    </label>
                  </div>
                )}
              </div>

            </div>

            {/* Rodapé fixo com Botão Concluir */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setShowPackagePicker(false)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Concluir Seleção</span>
              </button>
            </div>

          </div>
        </div>
      )}

            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {isAlreadySaved && !isEditingOrder && !isDriverRole && (
                <button
                  type="button"
                  onClick={() => setIsEditingOrder(true)}
                  className="px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-[#0B5187] border border-blue-200 text-[11px] font-black inline-flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
                  title="Editar dados deste pedido"
                >
                  <Edit3 className="w-3 h-3 stroke-[2.5]" />
                  <span>Editar</span>
                </button>
              )}

              <button
                onClick={triggerClose}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-90 shrink-0 cursor-pointer"
                title="Fechar"
                aria-label="Fechar diálogo"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* BANNER DE MODO DE EDIÇÃO ATIVO */}
          {isEditingOrder && (
            <div className="bg-amber-500 text-white px-3.5 py-1.5 flex items-center justify-between text-xs font-black shadow-xs shrink-0">
              <span className="flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" />
                Modo de Edição Ativo
              </span>
              <button
                type="button"
                onClick={() => setIsEditingOrder(false)}
                className="text-[11px] font-extrabold text-white/90 hover:text-white underline cursor-pointer"
              >
                Cancelar Edição
              </button>
            </div>
          )}

          {/* DADOS DO LOCAL (NOME DO LOCAL, HORÁRIO QUE FECHA, CLIENTE, RESPONSÁVEL) */}
          <div 
            ref={contentScrollRef}
            className="p-3 sm:p-3.5 overflow-y-auto flex-1 flex flex-col gap-2.5"
          >
            {/* Status registrado */}
            {registeredOutcome && (
              <div className={`p-2 rounded-xl border flex items-center justify-between text-xs font-bold animate-in fade-in duration-150 ${
                registeredOutcome.status === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center gap-1.5">
                  {registeredOutcome.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  )}
                  <span>
                    {registeredOutcome.status === 'success' 
                      ? `${operationConfig.label} registrada às ${registeredOutcome.time}!` 
                      : `Insucesso registrado às ${registeredOutcome.time}`}
                  </span>
                </div>
                <button 
                  onClick={() => openFullScreenCamera()}
                  className="underline text-[10px] hover:opacity-80"
                >
                  Alterar
                </button>
              </div>
            )}

            {/* Nome do Local, Endereço, Foto da Encomenda & Distância */}
            <div className="flex items-start gap-3">
              {/* Foto da Encomenda (Proporcional à altura das linhas de título, endereço e status) */}
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  if (firstPhoto) {
                    openPhotoViewer(formatPhotoUrl(firstPhoto, 'lg') || firstPhoto, selectedPlace);
                  } else {
                    openFullScreenCamera();
                  }
                }}
                className={`relative w-[76px] h-[76px] sm:w-[84px] sm:h-[84px] rounded-2xl overflow-hidden border-2 shadow-xs cursor-pointer group shrink-0 transition-all active:scale-95 flex items-center justify-center ${
                  firstPhoto 
                    ? 'border-slate-200 hover:border-[#0B5187] hover:shadow-md bg-slate-900' 
                    : 'border-dashed border-slate-300 hover:border-[#FF5E00] bg-slate-50 hover:bg-orange-50/50'
                }`}
                title={firstPhoto ? "Toque para abrir a foto grande na tela" : "Toque para fotografar ou escolher foto"}
              >
                {firstPhoto ? (
                  <>
                    <img 
                      src={firstPhoto} 
                      alt="Foto da Encomenda" 
                      onError={(e) => { 
                        const mdFallback = formatPhotoUrl(firstPhoto, 'md');
                        if (mdFallback && e.currentTarget.src !== mdFallback) {
                          e.currentTarget.src = mdFallback;
                          return;
                        }
                        e.currentTarget.onerror = null; 
                        e.currentTarget.src = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80'; 
                      }}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Maximize2 className="w-5 h-5 drop-shadow-md" />
                    </div>
                    <span className="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[8px] sm:text-[9px] font-black px-1.5 py-0.2 rounded-full leading-none shadow-xs">
                      Foto 1
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-[#FF5E00] transition-colors p-1 text-center">
                    <Camera className="w-6 h-6 stroke-[2.2]" />
                    <span className="text-[10px] font-black mt-1 leading-none">+ Foto</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
                      {selectedPlace.name}
                    </h2>
                  </div>

                  {distanceFormatted && (
                    <div 
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50/90 border border-blue-200 text-[#0B5187] shadow-2xs"
                      title={`Distância até o local: ${distanceFormatted}`}
                    >
                      <Navigation className="w-3.5 h-3.5 fill-[#0B5187]/20 text-[#0B5187] stroke-[2.4]" />
                      <span className="text-xs sm:text-[13px] font-black">{distanceFormatted}</span>
                    </div>
                  )}
                </div>

                {/* Endereço do local */}
                <p className="text-xs text-slate-500 font-medium truncate mt-0.5" title={selectedPlace.address}>
                  {selectedPlace.address}
                </p>

                {isDriverRole && <ArrivalInfo placeId={selectedPlace.id} />}

              {isStreetOrAddress(selectedPlace) ? (
                <div className="mt-1.5 flex items-center gap-2 text-xs sm:text-sm font-medium flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[#0B5187] bg-blue-50 border border-blue-200/90 px-2 py-0.5 rounded-lg font-bold text-[11px] sm:text-xs shadow-2xs">
                    <MapPin className="w-3.5 h-3.5 text-[#0B5187] stroke-[2.2]" />
                    <span>Via pública / Endereço</span>
                  </span>
                  <span className="text-slate-500 text-[11px] sm:text-xs flex items-center gap-1.5 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Acesso livre 24h
                  </span>
                </div>
              ) : (closingTime || openingTime) ? (
                <div className="mt-1.5 flex items-center gap-2 text-xs sm:text-sm font-semibold flex-wrap">
                  {isOpen ? (
                    <>
                      <span className="text-emerald-700 flex items-center gap-1.5 font-bold shrink-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Aberto
                      </span>
                      {closingTime && (
                        <>
                          <span className="text-slate-400 font-bold">⋅</span>
                          <span className="text-slate-700 flex items-center gap-1.5 font-medium flex-wrap">
                            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="font-bold">Fecha às {closingTime}</span>
                            {timeUntilClose && timeUntilClose.text !== 'fechado' && (
                              <span
                                className={`inline-flex items-center text-[10.5px] sm:text-[11px] font-black px-2 py-0.5 rounded-md leading-none border transition-colors ${
                                  timeUntilClose.isUrgent
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                    : timeUntilClose.isClosingSoon
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                {timeUntilClose.text === 'fechando agora'
                                  ? 'Fechando agora'
                                  : `Fecha ${timeUntilClose.text}`}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-red-600 flex items-center gap-1.5 font-bold shrink-0">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Fechado
                      </span>
                      <span className="text-slate-400 font-bold">⋅</span>
                      <span className="text-slate-600 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Abre às {openingTime || '08:00'}</span>
                      </span>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>


            {/* CLIENTE E VENDEDOR (RESPONSÁVEL) - motorista só vê os cartões preenchidos */}
            {(!isDriverRole || hasCustomer || hasResponsible) && (
            <div className={`w-full grid ${isDriverRole && (hasCustomer !== hasResponsible) ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5 sm:gap-2 shrink-0`}>
              {/* CARD 1: CLIENTE - Tema Azul Corporativo #0B5187 */}
              {hasCustomer ? (
                <div className="relative flex flex-col justify-between p-2 rounded-xl bg-gradient-to-br from-blue-50/90 via-white to-sky-50/60 border border-blue-200/90 shadow-2xs hover:shadow-xs transition-all">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="inline-flex items-center gap-1 text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-[#0B5187] bg-blue-100/90 px-1.5 py-0.5 rounded-md leading-none">
                      <User className="w-2.5 h-2.5" />
                      Cliente
                    </span>
                    <div className="flex items-center gap-0.5">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCustomerSelector('customer');
                          }}
                          className="text-[9px] font-bold text-[#0B5187] hover:text-blue-900 bg-white hover:bg-blue-100/80 border border-blue-200/90 px-1 py-0.2 rounded flex items-center gap-0.5 transition-colors cursor-pointer"
                          title="Trocar cliente"
                        >
                          <Edit3 className="w-2 h-2" />
                          Trocar
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!selectedPlace) return;
                            updatePlaceDetails(selectedPlace.id, { customerName: '', customerPhone: '' });
                          }}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                          title="Remover cliente"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Informações: Avatar + Nome + Telefone */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEdit) {
                        handleLockedEditAttempt();
                        return;
                      }
                      handleOpenCustomerSelector('customer');
                    }}
                    className={`flex items-center gap-1.5 text-left w-full my-0.5 group text-inherit min-w-0 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                    title={canEdit ? "Clique para gerenciar dados do cliente" : (customerName || 'Cliente')}
                  >
                    <div className="w-6 h-6 rounded-lg bg-[#0B5187] text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      {customerName ? customerName.charAt(0).toUpperCase() : <User className="w-3 h-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] sm:text-xs font-black text-slate-900 truncate leading-tight group-hover:text-[#0B5187] transition-colors">
                        {customerName}
                      </p>
                      <p className="text-[9.5px] text-slate-500 font-semibold truncate leading-tight mt-0.5 flex items-center gap-0.5">
                        {customerPhone ? (
                          <>
                            <Phone className="w-2 h-2 text-slate-400 shrink-0" />
                            <span>{formatPhoneDisplay(customerPhone)}</span>
                          </>
                        ) : (
                          <span className="text-slate-400 italic">Sem telefone</span>
                        )}
                      </p>
                    </div>
                  </button>

                  {/* Botão de Ação WhatsApp ou Adicionar Telefone */}
                  {customerPhone ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWhatsApp(customerPhone, customerName);
                      }}
                      className="mt-0.5 w-full py-1 px-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-black text-[10px] flex items-center justify-center gap-1 shadow-2xs transition-all cursor-pointer leading-none"
                      title={`Conversar com ${customerName} no WhatsApp`}
                    >
                      <MessageCircle className="w-2.5 h-2.5 fill-current" />
                      <span>WhatsApp</span>
                    </button>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenCustomerSelector('customer');
                      }}
                      className="mt-0.5 w-full py-1 px-1.5 rounded-lg bg-blue-100/70 hover:bg-blue-100 text-[#0B5187] font-bold text-[9px] flex items-center justify-center gap-0.5 transition-colors cursor-pointer leading-none"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Adicionar Tel</span>
                    </button>
                  ) : null}
                </div>
              ) : isDriverRole ? null : (
                /* Card Cliente Vazio - Compacto e convidativo */
                <button
                  type="button"
                  onClick={() => {
                    if (!canEdit) {
                      handleLockedEditAttempt();
                      return;
                    }
                    handleOpenCustomerSelector('customer');
                  }}
                  className={`relative flex flex-col items-center justify-center p-2 rounded-xl bg-gradient-to-br from-blue-50/50 via-white to-sky-50/30 border-2 border-dashed border-blue-200 hover:border-[#0B5187] hover:bg-blue-50/70 active:scale-[0.99] shadow-2xs transition-all text-center min-h-[74px] ${canEdit ? 'cursor-pointer group' : 'cursor-default opacity-80'}`}
                >
                  <div className="w-6 h-6 rounded-lg bg-blue-100/90 group-hover:bg-[#0B5187] text-[#0B5187] group-hover:text-white flex items-center justify-center mb-1 transition-all shadow-2xs group-hover:scale-105">
                    <UserPlus className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-black text-[#0B5187] block leading-tight">
                    + Cliente
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium block leading-tight mt-0.5">
                    Quem solicita a encomenda
                  </span>
                </button>
              )}

              {/* CARD 2: VENDEDOR (RESPONSÁVEL) - Tema Laranja Vibrante #FF5E00 (Abre form direto com Agenda) */}
              {hasResponsible ? (
                <div className="relative flex flex-col justify-between p-2 rounded-xl bg-gradient-to-br from-orange-50/90 via-white to-amber-50/60 border border-orange-200/90 shadow-2xs hover:shadow-xs transition-all">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="inline-flex items-center gap-1 text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider text-[#FF5E00] bg-orange-100/90 px-1.5 py-0.5 rounded-md leading-none">
                      <UserCheck className="w-2.5 h-2.5" />
                      Vendedor (Responsável)
                    </span>
                    <div className="flex items-center gap-0.5">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSellerModalOpen(true);
                          }}
                          className="text-[9px] font-bold text-[#FF5E00] hover:text-orange-900 bg-white hover:bg-orange-100/80 border border-orange-200/90 px-1 py-0.2 rounded flex items-center gap-0.5 transition-colors cursor-pointer"
                          title="Trocar vendedor / responsável"
                        >
                          <Edit3 className="w-2 h-2" />
                          Trocar
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!selectedPlace) return;
                            updatePlaceDetails(selectedPlace.id, {
                              responsibleName: '',
                              responsiblePhone: '',
                              sellerName: '',
                              sellerPhone: '',
                              managerName: '',
                              managerPhone: ''
                            });
                          }}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                          title="Remover vendedor / responsável"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Informações: Avatar + Nome + Telefone (Clique abre form com Nome, Telefone e Agenda) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEdit) {
                        handleLockedEditAttempt();
                        return;
                      }
                      setIsSellerModalOpen(true);
                    }}
                    className={`flex items-center gap-1.5 text-left w-full my-0.5 group text-inherit min-w-0 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                    title={canEdit ? "Clique para editar vendedor / responsável ou buscar na agenda" : (responsibleName || 'Vendedor')}
                  >
                    <div className="w-6 h-6 rounded-lg bg-[#FF5E00] text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      {responsibleName ? responsibleName.charAt(0).toUpperCase() : <UserCheck className="w-3 h-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] sm:text-xs font-black text-slate-900 truncate leading-tight group-hover:text-[#FF5E00] transition-colors">
                        {responsibleName}
                      </p>
                      <p className="text-[9.5px] text-slate-500 font-semibold truncate leading-tight mt-0.5 flex items-center gap-0.5">
                        {responsiblePhone ? (
                          <>
                            <Phone className="w-2 h-2 text-slate-400 shrink-0" />
                            <span>{formatPhoneDisplay(responsiblePhone)}</span>
                          </>
                        ) : (
                          <span className="text-slate-400 italic">Sem telefone</span>
                        )}
                      </p>
                    </div>
                  </button>

                  {/* Botão de Ação WhatsApp ou Adicionar Telefone */}
                  {responsiblePhone ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWhatsApp(responsiblePhone, responsibleName);
                      }}
                      className="mt-0.5 w-full py-1 px-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-black text-[10px] flex items-center justify-center gap-1 shadow-2xs transition-all cursor-pointer leading-none"
                      title={`Conversar com ${responsibleName} no WhatsApp`}
                    >
                      <MessageCircle className="w-2.5 h-2.5 fill-current" />
                      <span>WhatsApp</span>
                    </button>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSellerModalOpen(true);
                      }}
                      className="mt-0.5 w-full py-1 px-1.5 rounded-lg bg-orange-100/70 hover:bg-orange-100 text-[#FF5E00] font-bold text-[9px] flex items-center justify-center gap-0.5 transition-colors cursor-pointer leading-none"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Editar Dados</span>
                    </button>
                  ) : null}
                </div>
              ) : isDriverRole ? null : (
                /* Card Vendedor Vazio - Abre diretamente formulário com Nome, Telefone e Agenda */
                <div className="relative flex flex-col justify-between p-2 rounded-xl bg-gradient-to-br from-orange-50/50 via-white to-amber-50/30 border-2 border-dashed border-orange-200 hover:border-[#FF5E00] hover:bg-orange-50/60 transition-all min-h-[74px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEdit) {
                        handleLockedEditAttempt();
                        return;
                      }
                      setIsSellerModalOpen(true);
                    }}
                    className={`flex flex-col items-center justify-center text-center w-full flex-1 ${canEdit ? 'cursor-pointer group' : 'cursor-default opacity-80'}`}
                  >
                    <div className="w-6 h-6 rounded-lg bg-orange-100/90 group-hover:bg-[#FF5E00] text-[#FF5E00] group-hover:text-white flex items-center justify-center mb-1 transition-all shadow-2xs group-hover:scale-105">
                      <UserCheck className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-black text-[#FF5E00] block leading-tight">
                      + Vendedor (Responsável)
                    </span>
                    <span className="text-[9px] text-slate-400 font-medium block leading-tight mt-0.5">
                      Quem atende no local
                    </span>
                  </button>

                  {/* Atalho Inteligente: Copiar do Cliente com 1 clique se houver cliente preenchido */}
                  {hasCustomer && canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!selectedPlace) return;
                        updatePlaceDetails(selectedPlace.id, {
                          responsibleName: customerName,
                          responsiblePhone: customerPhone,
                          sellerName: customerName,
                          sellerPhone: customerPhone,
                          managerName: customerName,
                          managerPhone: customerPhone
                        });
                      }}
                      className="mt-1 w-full py-0.5 px-1 rounded-md bg-orange-100 hover:bg-orange-200 active:bg-orange-300 text-[#FF5E00] text-[8.5px] font-black flex items-center justify-center gap-0.5 transition-colors cursor-pointer shadow-2xs leading-tight"
                      title="Copiar dados do cliente para o vendedor / responsável"
                    >
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                      <span>Mesmo do cliente</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            )}

            {/* SEÇÃO DA ROTA DA ENCOMENDA NO DETALHE DO PEDIDO (QUANDO CLIENTE POSSUI LOCALIZAÇÃO) */}
            {!customerMissingLocation && orderResolvedLocations?.canTraceRoute && (
              <div className="w-full rounded-2xl p-3 bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-50 border border-slate-200/90 shadow-2xs space-y-2.5 shrink-0">
                {/* Cabeçalho da Rota com Tipo de Operação */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Route className="w-4 h-4 text-[#0B5187] stroke-[2.5] shrink-0" />
                    <span className="text-xs font-black text-slate-800 truncate">
                      {operationType === 'coleta' && 'Rota de Coleta (Local ➔ Cliente)'}
                      {operationType === 'entrega' && 'Rota de Entrega (Cliente ➔ Local)'}
                      {operationType === 'troca' && 'Rota de Troca (Cliente ➔ Local ➔ Cliente)'}
                    </span>
                  </div>

                  {activeRoute && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0 shadow-2xs">
                      {activeRoute.distanceKm.toFixed(1)} km • ~{activeRoute.durationMin} min
                    </span>
                  )}
                </div>

                {/* Resumo das etapas da rota da encomenda */}
                <div className="text-[11px] space-y-1.5 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  {operationType === 'coleta' && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-100 text-[#0B5187] font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 leading-tight">
                            Coleta no Local: <span className="text-slate-600 font-normal">{orderResolvedLocations.summaryOriginName}</span>
                          </p>
                          <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                            {orderResolvedLocations.summaryOriginAddress}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pt-1.5 border-t border-slate-100">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 leading-tight">
                            Entrega no Cliente: <span className="text-slate-600 font-normal">{orderResolvedLocations.summaryDestName}</span>
                          </p>
                          <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                            {orderResolvedLocations.summaryDestAddress}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {operationType === 'entrega' && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-orange-100 text-[#FF5E00] font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 leading-tight">
                            Coleta no Cliente: <span className="text-slate-600 font-normal">{orderResolvedLocations.summaryOriginName}</span>
                          </p>
                          <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                            {orderResolvedLocations.summaryOriginAddress}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pt-1.5 border-t border-slate-100">
                        <span className="w-4 h-4 rounded-full bg-blue-100 text-[#0B5187] font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 leading-tight">
                            Entrega no Local: <span className="text-slate-600 font-normal">{orderResolvedLocations.summaryDestName}</span>
                          </p>
                          <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                            {orderResolvedLocations.summaryDestAddress}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {operationType === 'troca' && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 leading-tight">
                            1. Coleta no Cliente: <span className="text-slate-600 font-normal">{orderResolvedLocations.summaryOriginName}</span>
                          </p>
                          <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                            {orderResolvedLocations.summaryOriginAddress}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pt-1.5 border-t border-slate-100">
                        <span className="w-4 h-4 rounded-full bg-blue-100 text-[#0B5187] font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 leading-tight">
                            2. Troca no Local: <span className="text-slate-600 font-normal">{orderResolvedLocations.exchangeName}</span>
                          </p>
                          <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                            {orderResolvedLocations.exchangeAddress}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pt-1.5 border-t border-slate-100">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                          3
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 leading-tight">
                            3. Retorno no Cliente: <span className="text-slate-600 font-normal">{orderResolvedLocations.summaryDestName}</span>
                          </p>
                          <p className="text-[9.5px] text-slate-400 truncate mt-0.5">
                            {orderResolvedLocations.summaryDestAddress}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Botões de Ação para Traçar / Atualizar Rota no Mapa */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTraceOrderRoute}
                    disabled={isTracingRoute}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#0B5187] hover:bg-[#083D66] active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-60"
                  >
                    <Navigation className="w-3.5 h-3.5 fill-current" />
                    <span>{isTracingRoute ? 'Calculando Rota...' : activeRoute ? 'Atualizar Rota no Mapa' : 'Traçar Rota no Mapa'}</span>
                  </button>
                  {activeRoute && (
                    <button
                      type="button"
                      onClick={clearActiveRoute}
                      className="py-2 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                      title="Ocultar rota ativa do mapa"
                    >
                      Ocultar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* FEEDBACK TOAST DE ATRIBUIÇÃO */}
            {driverToast && (
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-between gap-2 shadow-md animate-in slide-in-from-top-2 duration-150 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Check className="w-4 h-4 stroke-[3] shrink-0" />
                  <span className="truncate">{driverToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDriverToast(null)}
                  className="p-1 hover:bg-emerald-700 rounded-lg text-white/90 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            )}

            {/* SEÇÃO VISIBILIDADE / DIRECIONAMENTO: PÚBLICO OU PRIVADO */}
            {!isDriverRole && (() => {
              const isPublicMode = selectedPlace.orderVisibility === 'publico' || 
                (!selectedPlace.orderVisibility && !selectedPlace.assignedDriverId && !selectedPlace.assignedDriverPhone);

              return (
                <div className="w-full rounded-2xl p-3 bg-slate-50 border border-slate-200/90 shadow-2xs space-y-2 shrink-0">
                  {/* Cabeçalho da seção com seletor Público / Privado */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Visibilidade da Rota
                    </span>

                    {canManageDriverAssignment ? (
                      <div className="inline-flex p-0.5 rounded-xl bg-slate-200/80 border border-slate-300/80">
                        <button
                          type="button"
                          onClick={() => {
                            if (!canEdit) {
                              handleLockedEditAttempt();
                              return;
                            }
                            handleSetVisibilityPublic();
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                            isPublicMode
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                          }`}
                          title="Público: Aparece para todos os motoristas"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Público</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!canEdit) {
                              handleLockedEditAttempt();
                              return;
                            }
                            handleSetVisibilityPrivate();
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                            !isPublicMode
                              ? 'bg-[#0B5187] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                          }`}
                          title="Privado: Escolha o motorista para aparecer (opcional)"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Privado</span>
                        </button>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        isPublicMode ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-[#0B5187]'
                      }`}>
                        {isPublicMode ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        <span>{isPublicMode ? 'Público' : 'Privado'}</span>
                      </span>
                    )}
                  </div>

                  {/* CONTEÚDO QUANDO PÚBLICO */}
                  {isPublicMode ? (
                    <div className="w-full rounded-xl p-2.5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-300/80 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-emerald-950 truncate leading-tight">
                            Aparece para todos os motoristas
                          </p>
                          <p className="text-[10px] text-emerald-700/90 font-medium truncate">
                            Qualquer motorista pode visualizar e atender no mapa
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-white/80 px-2 py-1 rounded-md shrink-0 border border-emerald-200">
                        Livre
                      </span>
                    </div>
                  ) : (
                    /* CONTEÚDO QUANDO PRIVADO */
                    <div>
                      {selectedPlace.assignedDriverId || selectedPlace.assignedDriverPhone ? (
                        /* Motorista direcionado no modo privado */
                        <div className="w-full rounded-xl p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50/80 border border-blue-200 shadow-2xs flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-[#0B5187] text-white flex items-center justify-center shrink-0 shadow-xs text-base">
                              {assignedVehicleEmoji}
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-black uppercase tracking-wider text-[#0B5187] bg-blue-100 px-1.5 py-0.2 rounded-md">
                                  Privado • Motorista Escolhido
                                </span>
                              </div>
                              <p className="text-xs sm:text-[13px] font-black text-slate-900 truncate leading-tight mt-0.5">
                                {assignedDriverDisplayName}
                              </p>
                              <p className="text-[10px] text-slate-500 font-medium truncate">
                                {assignedDriverSubtitle}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {canManageDriverAssignment ? (
                              canEdit ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setIsDriverSelectorOpen(true)}
                                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-white hover:bg-blue-100 text-[#0B5187] border border-blue-300 shadow-2xs transition-all cursor-pointer"
                                    title="Trocar motorista da encomenda"
                                  >
                                    Alterar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleRemoveDriverFromPlace}
                                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Desvincular motorista (manter privado)"
                                  >
                                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                  </button>
                                </>
                              ) : null
                            ) : (
                              /* Motorista: pode apenas Recusar com justificativa */
                              <button
                                type="button"
                                onClick={() => setShowRefusalModal(true)}
                                className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                                title="Recusar ou cancelar esta rota com justificativa para a central"
                              >
                                <Ban className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Recusar</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : canManageDriverAssignment ? (
                        /* Modo privado sem motorista selecionado ainda (Opcional) */
                        <button
                          type="button"
                          onClick={() => {
                            if (!canEdit) {
                              handleLockedEditAttempt();
                              return;
                            }
                            setIsDriverSelectorOpen(true);
                          }}
                          className={`w-full rounded-xl p-2.5 border-2 border-dashed border-blue-300 hover:border-[#0B5187] bg-blue-50/60 hover:bg-blue-50 text-slate-800 flex items-center justify-between gap-3 transition-all shadow-2xs text-left ${canEdit ? 'cursor-pointer group' : 'cursor-default opacity-80'}`}
                          title={canEdit ? "Escolher motorista para aparecer (opcional)" : "Motorista privado (Clique em Editar para escolher)"}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-[#0B5187] group-hover:bg-[#083c64] text-white flex items-center justify-center shrink-0 shadow-xs transition-transform group-hover:scale-105">
                              <UserCheck className="w-4 h-4 stroke-[2.4]" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-900 truncate leading-tight">
                                Escolher motorista para aparecer
                              </p>
                              <p className="text-[10px] text-slate-500 font-medium truncate">
                                Opcional • Toque para selecionar o motorista
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-blue-200 group-hover:bg-[#0B5187] group-hover:text-white text-[#0B5187] text-[11px] font-black transition-colors shrink-0">
                            <Plus className="w-3 h-3 stroke-[3]" />
                            <span>Selecionar</span>
                          </div>
                        </button>
                      ) : (
                        <div className="w-full rounded-xl p-2.5 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold">
                          Rota privada aguardando atribuição de motorista.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* FEEDBACK TOAST DE SALVAMENTO */}
            {saveSuccessToast && (
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-between gap-2 shadow-md animate-in slide-in-from-top-2 duration-150 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Check className="w-4 h-4 stroke-[3] shrink-0" />
                  <span className="truncate">{saveSuccessToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSaveSuccessToast(null)}
                  className="p-1 hover:bg-emerald-700 rounded-lg text-white/90 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            )}

            {/* AVISO DE MODO EDIÇÃO ATIVO */}
            {isEditingOrder && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-900 text-xs font-bold animate-in fade-in duration-150 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-amber-700 stroke-[2.5]" />
                  <span>Modo de Edição Ativo</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingOrder(false)}
                  className="text-[11px] underline font-bold hover:text-amber-950 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* OBSERVAÇÕES COM BOTÃO DE EDITAR E SUGESTÕES RÁPIDAS (motorista só vê se houver observação) */}
            {(!isDriverRole || observations) && (
            <div className="bg-amber-50/90 rounded-2xl p-3 border border-amber-200/90 shadow-2xs space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-700 stroke-[2.4]" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                    Observações da Encomenda
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!canEdit) {
                      handleLockedEditAttempt();
                      return;
                    }
                    setIsEditingObservations(prev => !prev);
                    setEditedObservations(observations);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-2xs active:scale-95"
                >
                  <Edit3 className="w-3 h-3 stroke-[2.5]" />
                  <span>{isEditingObservations ? 'Cancelar' : 'Editar'}</span>
                </button>
              </div>

              {isEditingObservations ? (
                <div className="space-y-2 pt-1 animate-in fade-in duration-100">
                  <textarea
                    value={editedObservations}
                    onChange={(e) => setEditedObservations(e.target.value)}
                    placeholder="Instruções de portaria, interfone, cuidados ou referências..."
                    rows={3}
                    className="w-full text-xs font-semibold text-slate-800 bg-white border border-amber-300 rounded-xl p-2.5 focus:border-[#0B5187] focus:outline-none focus:ring-1 focus:ring-[#0B5187]"
                  />

                  {/* Chips Rápidos */}
                  <div className="flex flex-wrap gap-1">
                    {[
                      '🏢 Portaria social',
                      '🔔 Tocar interfone',
                      '📞 Ligar antes de chegar',
                      '🚪 Deixar na portaria',
                      '🐕 Cuidado cão bravo',
                      '👥 Deixar com vizinho'
                    ].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setEditedObservations(prev => prev ? `${prev} • ${chip}` : chip);
                        }}
                        className="px-2 py-0.5 bg-white hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-950 transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingObservations(false)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updatePlaceDetails(selectedPlace.id, { observations: editedObservations });
                        setIsEditingObservations(false);
                      }}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Salvar Obs</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-800 leading-snug font-semibold whitespace-pre-line pl-1">
                  {observations ? observations : (
                    <span className="text-slate-400 italic font-normal">Nenhuma observação informada. Toque em Editar para adicionar.</span>
                  )}
                </p>
              )}
            </div>
            )}

          </div>

          {/* BARRA DE AÇÕES INFERIOR: EXATAMENTE OS 3 BOTÕES SOLICITADOS */}
          <div className="relative p-2.5 sm:p-3 bg-slate-50 border-t border-slate-200/80 flex items-center gap-2 shrink-0">
            {/* Modal / Menu Flutuante para escolher Waze ou Google Maps com opção de definir como padrão */}
            {showNavChooser && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowNavChooser(false)} 
                />
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-16 right-2 sm:right-16 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 w-72 sm:w-80 animate-in zoom-in-95 fade-in duration-150"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
                    <div>
                      <span className="text-xs font-black uppercase text-slate-800 tracking-wide block">
                        Escolher Navegação GPS
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Direto na rota sem precisar clicar iniciar
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setShowNavChooser(false)}
                      className="w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2">
                    {/* Opção Google Maps */}
                    <button
                      type="button"
                      onClick={() => {
                        executeDirectNavigation('google_maps', saveAsDefaultNav);
                        setShowNavChooser(false);
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group cursor-pointer ${
                        defaultNavApp === 'google_maps'
                          ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-400'
                          : 'bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-200'
                      }`}
                    >
                      <GoogleMapsIcon className="w-7 h-7 shrink-0 group-hover:scale-105 transition-transform" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-slate-900">Google Maps</p>
                          {defaultNavApp === 'google_maps' && (
                            <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-md">
                              Padrão
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">Navegação direta no mapa</p>
                      </div>
                    </button>

                    {/* Opção Waze */}
                    <button
                      type="button"
                      onClick={() => {
                        executeDirectNavigation('waze', saveAsDefaultNav);
                        setShowNavChooser(false);
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group cursor-pointer ${
                        defaultNavApp === 'waze'
                          ? 'bg-sky-50/80 border-sky-300 ring-1 ring-sky-400'
                          : 'bg-white hover:bg-sky-50 border-slate-200 hover:border-sky-200'
                      }`}
                    >
                      <WazeIcon className="w-7 h-7 shrink-0 group-hover:scale-105 transition-transform" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-slate-900">Waze</p>
                          {defaultNavApp === 'waze' && (
                            <span className="text-[9px] font-black bg-sky-600 text-white px-1.5 py-0.5 rounded-md">
                              Padrão
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight">Trânsito e alertas em tempo real</p>
                      </div>
                    </button>
                  </div>

                  {/* Opção para definir como padrão ou alterar preferência */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={saveAsDefaultNav}
                        onChange={(e) => setSaveAsDefaultNav(e.target.checked)}
                        className="w-4 h-4 text-[#0B5187] rounded border-slate-300 focus:ring-[#0B5187] cursor-pointer"
                      />
                      <span className="text-[11px] font-bold text-slate-700">
                        Definir como padrão (não perguntar mais)
                      </span>
                    </label>

                    {defaultNavApp && (
                      <button
                        type="button"
                        onClick={() => {
                          setDefaultNavApp(null);
                          setSaveAsDefaultNav(false);
                        }}
                        className="text-[10px] font-bold text-slate-500 hover:text-red-600 text-left transition-colors pt-0.5 cursor-pointer"
                      >
                        Remover padrão (perguntar sempre)
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Menu Popover das Outras Ações do Pedido (Editar, Detalhes, Novo Pedido, Compartilhar, GPS) */}
            {isActionsMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsActionsMenuOpen(false)} 
                />
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-16 right-2 sm:right-3 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 w-64 sm:w-72 animate-in zoom-in-95 fade-in duration-150 divide-y divide-slate-100"
                >
                  <div className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                        Mais Opções
                      </span>
                      <span className="text-xs font-bold text-slate-800 truncate block">
                        #{selectedPlace.orderCode || selectedPlace.id?.slice(0, 8) || 'Pedido'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsActionsMenuOpen(false)}
                      className="w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="py-1 space-y-0.5">
                    {/* Registrar Baixa / Ocorrência com Foto */}
                    <button
                      type="button"
                      onClick={() => {
                        setOperationStatus('success');
                        openFullScreenCamera();
                        setIsActionsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-emerald-50/70 text-slate-700 hover:text-emerald-950 flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 text-emerald-800 flex items-center justify-center shrink-0 transition-colors">
                        <Camera className="w-4.5 h-4.5 stroke-[2.3]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-950 truncate">
                          Registrar {operationConfig.title}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          Tirar foto e dar baixa imediata
                        </div>
                      </div>
                    </button>

                    {/* Detalhes do Pedido & Preço (oculto para motoristas) */}
                    {!isDriverRole && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsFinalDetailsOpen(true);
                        setIsActionsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-amber-50/70 text-slate-700 hover:text-amber-950 flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-100 group-hover:bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 transition-colors">
                        <DollarSign className="w-4.5 h-4.5 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 group-hover:text-amber-950 truncate">
                          Detalhes do Pedido & Preço
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {selectedPlace.price ? `R$ ${selectedPlace.price.toFixed(2)} • Ver cálculo` : 'Calcular frete e taxas'}
                        </div>
                      </div>
                    </button>
                    )}

                    {/* Editar Pedido (Desabilitado para motoristas) */}
                    {!isDriverRole && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingOrder(true);
                          setIsActionsMenuOpen(false);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl hover:bg-blue-50/70 text-slate-700 hover:text-[#0B5187] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-100 group-hover:bg-blue-200 text-[#0B5187] flex items-center justify-center shrink-0 transition-colors">
                          <Edit3 className="w-4 h-4 stroke-[2.3]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 group-hover:text-[#0B5187] truncate">
                            Editar Pedido
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            Alterar dados, endereço ou cliente
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Cancelar pedido (motorista, com justificativa) */}
                    {isDriverRole && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          setRefusalReason('');
                          setRefusalNotes('');
                          setShowRefusalModal(true);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl hover:bg-rose-50/70 text-slate-700 hover:text-rose-800 flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-rose-100 group-hover:bg-rose-200 text-rose-700 flex items-center justify-center shrink-0 transition-colors">
                          <Ban className="w-4 h-4 stroke-[2.3]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 group-hover:text-rose-800 truncate">
                            Cancelar pedido
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            Desistir da rota com justificativa
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Compartilhar */}
                    <button
                      type="button"
                      onClick={() => {
                        handleShareLocation();
                        setIsActionsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl hover:bg-teal-50/70 text-slate-700 hover:text-teal-950 flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        sharedToast ? 'bg-emerald-600 text-white' : 'bg-teal-100 group-hover:bg-teal-200 text-teal-900'
                      }`}>
                        {sharedToast ? <Check className="w-4 h-4 stroke-[3]" /> : <Share2 className="w-4 h-4 stroke-[2.3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-800 group-hover:text-teal-950 truncate">
                          {sharedToast ? 'Dados Copiados!' : 'Compartilhar Pedido'}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          Copiar dados e link de rastreio
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}

            {isDriverRole && selectedPlace && realtimeAssignmentService.isPublicOrder(selectedPlace) ? (
              /* BARRA ESPECIAL DO MOTORISTA: PEDIDO PÚBLICO DISPONÍVEL - BOTÃO ACEITAR EM DESTAQUE */
              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  disabled={isClaimingOrder}
                  onClick={handleClaimThisOrder}
                  className="flex-1 h-12 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-orange-500/30 active:scale-95 transition-all cursor-pointer ring-2 ring-amber-300 animate-pulse disabled:opacity-50"
                  title="Confirmar que você será o responsável por esta entrega"
                >
                  <Zap className="w-5 h-5 fill-current shrink-0" />
                  <span>{isClaimingOrder ? 'Confirmando...' : 'ACEITAR E ASSUMIR PEDIDO'}</span>
                </button>
                <button
                  type="button"
                  onClick={triggerClose}
                  className="h-12 px-3.5 rounded-2xl text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold text-xs flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  Fechar
                </button>
              </div>
            ) : !isAlreadySaved ? (
              /* BARRA INFERIOR AO ADICIONAR NOVO PEDIDO: BOTÃO ADICIONAR PEDIDO EM DESTAQUE (APENAS NÃO-MOTORISTA) */
              !isDriverRole ? (
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleSavePlaceOrder}
                    className="w-full h-12 px-4 rounded-2xl active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 shadow-emerald-600/30 ring-2 ring-emerald-400/40"
                    title="Adicionar esta encomenda no mapa"
                  >
                    <Plus className="w-5 h-5 stroke-[3] shrink-0" />
                    <span className="truncate">Adicionar Pedido</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-xs text-slate-500 font-semibold truncate px-2">
                    Visualização de Local no Mapa
                  </span>
                  <button
                    type="button"
                    onClick={triggerClose}
                    className="h-10 px-4 rounded-xl text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold text-xs flex items-center justify-center transition-all cursor-pointer shrink-0"
                  >
                    Fechar
                  </button>
                </div>
              )
            ) : isEditingOrder ? (
              /* BARRA INFERIOR DURANTE EDIÇÃO MANUAL DO PEDIDO */
              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => setIsEditingOrder(false)}
                  className="h-11 sm:h-12 px-4 rounded-2xl text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold text-xs sm:text-sm flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSavePlaceOrder}
                  className="flex-1 h-11 sm:h-12 px-4 rounded-2xl active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30 min-w-0"
                  title="Salvar alterações do pedido"
                >
                  <Check className="w-5 h-5 stroke-[3] shrink-0" />
                  <span className="truncate">Salvar Alterações</span>
                </button>
              </div>
            ) : (
              /* BARRA INFERIOR PADRÃO: 1. REGISTRO + 2. NAVEGAR COM SETA DE SELEÇÃO + 3. MENU APENAS ÍCONE */
              <div className="flex items-center gap-2 w-full">
                {/* 1. BOTÃO DE REGISTRO DIRETO COM FOTO (COLETA / ENTREGA / TROCA) */}
                <button
                  type="button"
                  onClick={() => {
                    setOperationStatus('success');
                    openFullScreenCamera();
                  }}
                  className={`flex-1 h-11 sm:h-12 px-3 sm:px-4 rounded-2xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg transition-all active:scale-95 cursor-pointer min-w-0 ${operationConfig.btnBg}`}
                  title={`${operationConfig.title} com Foto - Toque para registrar`}
                >
                  <Camera className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.6] shrink-0" />
                  <span className="truncate">{operationConfig.title}</span>
                </button>

                {/* 2. BOTÃO NAVEGAR GPS COM SETA PARA BAIXO (SELETOR DE APP GOOGLE MAPS / WAZE) */}
                <div className="flex items-center h-11 sm:h-12 rounded-2xl bg-[#1A73E8] text-white shadow-md shadow-blue-500/25 border border-blue-400/30 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartNavigation()}
                    className="h-full px-3 sm:px-3.5 hover:bg-[#1557b0] active:bg-[#0d47a1] font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    title={
                      defaultNavApp === 'google_maps'
                        ? "Navegar direto pelo Google Maps (traça rota no GPS)"
                        : defaultNavApp === 'waze'
                        ? "Navegar direto pelo Waze (traça rota no GPS)"
                        : "Navegar até o local (escolher app e traçar rota)"
                    }
                  >
                    {defaultNavApp === 'google_maps' ? (
                      <GoogleMapsIcon className="w-4 h-4 shrink-0" />
                    ) : defaultNavApp === 'waze' ? (
                      <WazeIcon className="w-4 h-4 shrink-0" />
                    ) : (
                      <Navigation className="w-4 h-4 fill-current stroke-[2.2] shrink-0" />
                    )}
                    <span>Navegar</span>
                  </button>
                  <div className="w-[1px] h-6 bg-white/30" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNavChooser(prev => !prev);
                    }}
                    className="h-full px-2 hover:bg-[#1557b0] active:bg-[#0d47a1] flex items-center justify-center transition-all cursor-pointer"
                    title="Mudar aplicativo de navegação GPS (Google Maps / Waze)"
                    aria-label="Escolher aplicativo de GPS"
                  >
                    <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                {/* 3. BOTÃO DE MENU (SEM TEXTO) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsActionsMenuOpen(prev => !prev);
                  }}
                  className={`h-11 sm:h-12 w-11 sm:w-12 rounded-2xl flex items-center justify-center shadow-md transition-all active:scale-95 shrink-0 cursor-pointer border ${
                    isActionsMenuOpen
                      ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-[#0B5187]/25'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-slate-200/50'
                  }`}
                  title="Menu de opções do pedido"
                  aria-label="Mais opções do pedido"
                >
                  <Menu className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>

        </div>
      </aside>

      {/* Input oculto para selecionar foto(s) da galeria */}
      <input 
        ref={galleryInputRef} 
        type="file" 
        accept="image/*" 
        multiple 
        onChange={handleGalleryFileSelected} 
        className="hidden" 
      />

      {/* Input oculto nativo do dispositivo para abrir a câmera física (Samsung/iOS) */}
      <input 
        ref={nativeCameraInputRef} 
        type="file" 
        accept="image/*" 
        capture="environment" 
        onChange={handleGalleryFileSelected} 
        className="hidden" 
      />

      {/* ========================================================
          SISTEMA DE CÂMERA PRÓPRIO CHEIA NA TELA (ESTILO SAMSUNG)
          - Câmera cheia na tela inteira (100% viewport)
          - Controles flutuantes sobre a câmera (Volume e Observação)
          - As fotos vão saindo embaixo no carrossel sem fechar a câmera
          - Botão Shutter central estilo Samsung
          - Botão Finalizar Registro direto na tela da câmera
          ======================================================== */}
      {isFullScreenCameraOpen && (
        <div className="fixed inset-0 z-[80] bg-black text-white select-none flex flex-col justify-between overflow-hidden animate-in fade-in duration-200">
          
          {/* Flash visual da tela ao disparar */}
          {isFlashing && <div className="absolute inset-0 bg-white z-40 pointer-events-none" />}

          {/* 1. BARRA SUPERIOR TRANSLÚCIDA SOBRE O VISOR */}
          <div className="absolute top-0 inset-x-0 pt-4 pb-2 px-4 bg-gradient-to-b from-black/85 via-black/45 to-transparent z-30 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              {/* Botão Fechar Câmera */}
              <button 
                type="button"
                onClick={closeFullScreenCamera} 
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/25 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md"
                title="Voltar ao mapa"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>

              {/* Identificação da Operação & Local */}
              <div className="text-center px-2 min-w-0">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full backdrop-blur-md border text-[11px] font-black uppercase tracking-wider mb-0.5 shadow-md ${
                  operationStatus === 'failed'
                    ? 'bg-rose-950/80 border-rose-400/80 text-rose-200'
                    : 'bg-black/60 border-white/20 text-white'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    operationStatus === 'failed'
                      ? 'bg-rose-500 animate-pulse'
                      : selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta' 
                      ? 'bg-[#FF5E00]' 
                      : 'bg-emerald-400'
                  }`} />
                  <span>
                    {operationStatus === 'failed' 
                      ? (selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta' ? 'Tentativa de Coleta' : 'Tentativa de Entrega')
                      : selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta' 
                      ? 'Registro de Coleta' 
                      : 'Registro de Entrega'}
                  </span>
                </div>
                <p className="text-xs font-black text-white drop-shadow-md truncate max-w-[200px] sm:max-w-xs">
                  {selectedPlace.name}
                </p>
              </div>

              {/* Botões do Topo: Flash e Virar Câmera */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setFlashMode(prev => prev === 'auto' ? 'on' : prev === 'on' ? 'off' : 'auto');
                  }}
                  className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/25 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md"
                  title="Modo de Flash"
                >
                  {flashMode === 'auto' && <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />}
                  {flashMode === 'on' && <Zap className="w-4 h-4 fill-amber-400 text-amber-400" />}
                  {flashMode === 'off' && <ZapOff className="w-4 h-4 text-slate-300" />}
                </button>

                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/25 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-md"
                  title="Virar Câmera"
                >
                  <RefreshCw className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* CONTROLES FLUTUANTES SOBRESSALENTES REDISTRIBUÍDOS: NÃO CONSEGUIU ENTREGAR/COLETAR?, VOLUMES E OBSERVAÇÃO */}
            <div className="flex items-center justify-between gap-1.5 max-w-md mx-auto w-full pt-1">
              {/* Botão Discreto: Não conseguiu entregar / Insucesso */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (operationStatus === 'success') {
                      setOperationStatus('failed');
                      setShowFailReasonPicker(true);
                    } else {
                      setShowFailReasonPicker(prev => !prev);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl backdrop-blur-md border text-xs font-black transition-all active:scale-95 cursor-pointer shadow-lg ${
                    operationStatus === 'failed'
                      ? 'bg-rose-600/90 text-white border-rose-300 ring-2 ring-rose-400/40'
                      : 'bg-black/60 text-amber-300 border-amber-400/35 hover:bg-black/80 hover:border-amber-400'
                  }`}
                  title={
                    operationStatus === 'failed' 
                      ? "Motivo do insucesso (toque para alterar)" 
                      : (selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta')
                      ? "Não conseguiu coletar? Toque para registrar ocorrência com foto"
                      : "Não conseguiu entregar? Toque para registrar ocorrência com foto"
                  }
                >
                  <AlertCircle className={`w-3.5 h-3.5 ${operationStatus === 'failed' ? 'text-white' : 'text-amber-400'}`} />
                  <span className="truncate max-w-[130px] sm:max-w-[150px]">
                    {operationStatus === 'failed' 
                      ? failReason 
                      : (selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta')
                      ? 'Não coletou?'
                      : 'Não entregou?'}
                  </span>
                  {operationStatus === 'failed' && (
                    <ChevronDown className="w-3 h-3 text-white/80" />
                  )}
                </button>

                {/* Seletor Flutuante de Motivos de Insucesso */}
                {showFailReasonPicker && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-full left-0 mt-1.5 w-60 z-50 bg-slate-900/95 backdrop-blur-xl border border-rose-400/50 rounded-2xl p-2 shadow-2xl animate-in zoom-in-95 duration-150"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-white/10 mb-1 px-1">
                      <span className="text-[10px] font-black uppercase text-rose-300 tracking-wider">
                        {(selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta') ? 'Motivo da Não Coleta' : 'Motivo da Não Entrega'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowFailReasonPicker(false)}
                        className="text-white/60 hover:text-white text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-1">
                      {[
                        'Local Fechado / Fora de Horário',
                        'Cliente / Responsável Ausente',
                        'Endereço Não Localizado',
                        'Mercadoria Não Disponível',
                        'Recusado pelo Destinatário',
                        'Outro Motivo'
                      ].map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => {
                            setFailReason(reason);
                            setOperationStatus('failed');
                            setShowFailReasonPicker(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                            failReason === reason && operationStatus === 'failed'
                              ? 'bg-rose-600 text-white'
                              : 'text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          <span className="truncate">{reason}</span>
                          {failReason === reason && operationStatus === 'failed' && (
                            <Check className="w-3 h-3 stroke-[3]" />
                          )}
                        </button>
                      ))}

                      <div className="pt-1 mt-1 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => {
                            setOperationStatus('success');
                            setShowFailReasonPicker(false);
                          }}
                          className="w-full text-center px-2 py-1 rounded-xl text-[11px] font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          {(selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta') ? 'Voltar para Coleta Normal' : 'Voltar para Entrega Normal'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Lado Direito: Volumes e Observação */}
              <div className="flex items-center gap-1.5">
                {/* Stepper de Quantidade de Volumes (somente no modo normal de sucesso) */}
                {operationStatus === 'success' && (
                  <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl px-1.5 py-1 shadow-lg">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-300 pl-0.5">
                      Vol:
                    </span>

                    <button
                      type="button"
                      onClick={() => handleUpdateVolumeQuantity(volumeQuantity - 1)}
                      disabled={volumeQuantity <= 1}
                      className="w-6 h-6 rounded-lg bg-white/15 hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center font-black active:scale-90 transition-all cursor-pointer"
                    >
                      <Minus className="w-3 h-3 stroke-[3]" />
                    </button>

                    <span className="px-1 font-mono font-black text-xs text-amber-300 min-w-6 text-center">
                      {volumeQuantity}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleUpdateVolumeQuantity(volumeQuantity + 1)}
                      className="w-6 h-6 rounded-lg bg-[#FF5E00] hover:bg-orange-600 text-white flex items-center justify-center font-black active:scale-90 transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                    </button>
                  </div>
                )}

                {/* Botão Flutuante de Observação & Recebedor */}
                <button
                  type="button"
                  onClick={() => setShowObservationSheet(prev => !prev)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-2xl backdrop-blur-md border text-xs font-black transition-all active:scale-95 cursor-pointer shadow-lg ${
                    notes.trim() || receiverName.trim()
                      ? 'bg-amber-500/90 text-slate-950 border-amber-300'
                      : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
                  }`}
                  title="Adicionar ou editar observações"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[100px]">
                    {operationStatus === 'failed' ? (notes ? 'Obs Insucesso' : 'Obs') : receiverName ? `Por: ${receiverName}` : notes ? 'Anotação' : 'Obs'}
                  </span>
                  {(notes.trim() || receiverName.trim()) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 2. VISOR DA CÂMERA CHEIA NA TELA (FULLSCREEN VIEW) */}
          <div 
            onClick={handleViewfinderTap}
            className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden cursor-crosshair"
          >
            {/* Aviso Flutuante quando no modo Insucesso / Tentativa sem sucesso */}
            {operationStatus === 'failed' && (
              <div className="absolute top-4 inset-x-4 max-w-sm mx-auto z-20 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3.5 py-1.5 rounded-full bg-rose-600/90 backdrop-blur-md text-white text-xs font-black text-center shadow-lg border border-rose-300 flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Tire a foto do local para comprovar a tentativa</span>
                </div>
              </div>
            )}

            {cameraError ? (
              /* Mensagem de Erro com botão para Câmera do Celular e Galeria */
              <div className="p-6 text-center max-w-sm mx-auto flex flex-col items-center gap-3 z-20">
                <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-400/40">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-xs text-slate-300 font-medium">{cameraError}</p>
                <div className="flex flex-col gap-2 w-full mt-1">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="w-full py-3 px-5 rounded-2xl bg-[#FF5E00] hover:bg-[#EA580C] text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-all"
                  >
                    <Camera className="w-5 h-5 stroke-[2.5]" />
                    <span>Tirar Foto com a Câmera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/20 cursor-pointer active:scale-95 transition-all"
                  >
                    <ImageIcon className="w-4 h-4 text-amber-300" />
                    <span>Escolher Foto da Galeria</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleFinalizeRegistration();
                    }}
                    className="w-full py-2.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 transition-all"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Dar Baixa Direta sem Câmera</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Vídeo da Câmera em Tela Cheia */
              <div className="relative w-full h-full">
                <video 
                  ref={videoRef} 
                  playsInline 
                  autoPlay 
                  muted 
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch(() => {});
                  }}
                  style={{
                    transform: `scale(${zoomLevel})`,
                    transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.4, 1)'
                  }}
                  className="w-full h-full object-cover" 
                />

                {/* Anel de foco amarelo estilo smartphone ao tocar no visor */}
                {focusPoint && (
                  <div 
                    style={{ left: focusPoint.x - 30, top: focusPoint.y - 30 }}
                    className="absolute pointer-events-none z-30 flex items-center gap-1.5 animate-in zoom-in-75 duration-150"
                  >
                    <div className="w-16 h-16 rounded-full border-2 border-amber-300 flex items-center justify-center shadow-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                    </div>
                    <Sun className="w-4 h-4 text-amber-300 animate-pulse" />
                  </div>
                )}
              </div>
            )}

            {/* Controles de Zoom (.6, 1x, 2x) sobre o visor estilo Samsung */}
            {!cameraError && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-2 z-20"
              >
                <div className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 flex items-center gap-1 shadow-lg">
                  {[
                    { label: '.6', zoom: 1.0 },
                    { label: '1x', zoom: 1.0 },
                    { label: '2x', zoom: 2.0 }
                  ].map((z, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setZoomLevel(z.zoom)}
                      className={`w-8 h-8 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer ${
                        zoomLevel === z.zoom
                          ? 'bg-amber-400 text-black shadow-md scale-105'
                          : 'text-white/80 hover:bg-white/20'
                      }`}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PAINEL FLUTUANTE DE OBSERVAÇÃO & RECEBEDOR (SOBRESSALENTE) */}
            {showObservationSheet && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-x-3 bottom-8 max-w-md mx-auto z-40 bg-slate-900/95 backdrop-blur-xl border border-white/25 rounded-3xl p-4 text-white shadow-2xl animate-in slide-in-from-bottom-6 duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    Observação & Recebedor
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowObservationSheet(false)}
                    className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center justify-center text-xs font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2.5">
                  {/* Alternador de Status: Sucesso ou Insucesso */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOperationStatus('success')}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                        operationStatus === 'success'
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-xs'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Sucesso</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOperationStatus('failed')}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                        operationStatus === 'failed'
                          ? 'bg-rose-500/25 border-rose-400 text-rose-300 shadow-xs'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Insucesso</span>
                    </button>
                  </div>

                  {operationStatus === 'success' ? (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Nome do Recebedor / Responsável
                        </label>
                        <input
                          type="text"
                          value={receiverName}
                          onChange={(e) => setReceiverName(e.target.value)}
                          placeholder="Ex: Carlos Silva"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Observações adicionais (opcional)
                        </label>
                        <textarea
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Ex: Mercadoria entregue na recepção..."
                          className="w-full px-3 py-2 text-xs rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Motivo do Insucesso
                      </label>
                      <select
                        value={failReason}
                        onChange={(e) => setFailReason(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800 border border-white/20 text-white focus:outline-none focus:border-rose-400 mb-2 cursor-pointer"
                      >
                        {[
                          'Local Fechado / Fora de Horário',
                          'Cliente / Responsável Ausente',
                          'Endereço Não Localizado',
                          'Recusado pelo Destinatário',
                          'Outro Motivo'
                        ].map((r) => (
                          <option key={r} value={r} className="bg-slate-900 text-white">
                            {r}
                          </option>
                        ))}
                      </select>

                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Detalhes da ocorrência
                      </label>
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ex: Tentativa sem sucesso às 14h..."
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white/10 border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:border-rose-400"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowObservationSheet(false)}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    Salvar e Voltar para a Câmera
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. BARRA INFERIOR COM AS FOTOS SAINDO EMBAIXO E O OBTURADOR ESTILO SAMSUNG */}
          <div className="relative inset-x-0 p-4 pb-6 bg-gradient-to-t from-black via-black/85 to-transparent z-30 flex flex-col gap-3">
            
            {/* ALERTA DE ERRO DE FOTO CASO FALTE NA COLETA */}
            {photoErrorMsg && (
              <div className="max-w-md mx-auto w-full p-2.5 rounded-xl bg-rose-500/90 border border-rose-300 text-white text-xs font-black flex items-center gap-2 shadow-lg animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-white" />
                <span>{photoErrorMsg}</span>
              </div>
            )}

            {/* FILEIRA DE MINIATURAS DAS FOTOS SAINDO EMBAIXO */}
            <div className="w-full max-w-md mx-auto">
              {customPhotos.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto px-1 py-1 scrollbar-thin">
                  {customPhotos.map((photo, index) => {
                    const mdPhoto = formatPhotoUrl(photo, 'md') || photo;
                    return (
                      <div 
                        key={index}
                        onClick={() => openPhotoViewer(photo, selectedPlace)}
                        className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 border-white/80 shadow-lg group cursor-pointer bg-black/60 animate-in zoom-in-75 duration-150"
                        title="Toque para ver grande"
                      >
                        <img 
                          src={mdPhoto} 
                          alt={`Foto ${index + 1}`} 
                          className="w-full h-full object-cover" 
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80';
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhoto(index, e);
                          }}
                          title="Excluir foto"
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5 stroke-[3]" />
                        </button>
                        <span className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded bg-black/70 text-[8px] font-black text-white leading-none">
                          #{index + 1}
                        </span>
                      </div>
                    );
                  })}
                  <div className="px-2 text-[11px] font-bold text-white/80 whitespace-nowrap">
                    {customPhotos.length} {customPhotos.length === 1 ? 'foto' : 'fotos'}
                  </div>
                </div>
              ) : (selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta') ? (
                <div className="p-2 rounded-xl bg-orange-500/25 border border-orange-400/40 backdrop-blur-md text-center text-xs font-black text-amber-300 animate-pulse">
                  📸 Foto obrigatória: aponte e tire a foto da mercadoria
                </div>
              ) : null}
            </div>

            {/* LINHA DE DISPARO: GALERIA | OBTURADOR SAMSUNG | FINALIZAR REGISTRO */}
            <div className="w-full flex items-center justify-between max-w-md mx-auto px-2 gap-3">
              {/* Botão Galeria */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="w-[52px] h-[52px] rounded-2xl bg-white/15 hover:bg-white/25 active:scale-90 text-white flex flex-col items-center justify-center border border-white/25 backdrop-blur-md shadow-md transition-all cursor-pointer shrink-0"
                title="Escolher foto da galeria"
              >
                <ImageIcon className="w-5 h-5 text-amber-300" />
                <span className="text-[9px] font-bold text-white/90">Galeria</span>
              </button>

              {/* Botão Shutter Circular Estilo Samsung (76px) */}
              <button
                type="button"
                onClick={handleTakeShutterPhoto}
                title="Tirar Foto"
                className="relative w-19 h-19 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-90 shadow-2xl group focus:outline-none cursor-pointer shrink-0"
              >
                <div className="w-14 h-14 rounded-full bg-white group-active:scale-90 transition-transform shadow-inner" />
              </button>

              {/* Botão Finalizar Registro */}
              <button
                type="button"
                onClick={() => handleFinalizeRegistration()}
                className={`h-[52px] px-4 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer shrink-0 ${
                  operationStatus === 'failed'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/35 border border-rose-400'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/35 border border-emerald-400'
                }`}
                title={
                  operationStatus === 'failed'
                    ? "Finalizar registro de tentativa sem sucesso e dar andamento"
                    : "Finalizar registro e dar baixa"
                }
              >
                {operationStatus === 'failed' ? (
                  <>
                    <AlertCircle className="w-4 h-4 stroke-[2.5]" />
                    <span className="whitespace-nowrap">Finalizar Insucesso</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span className="whitespace-nowrap">Finalizar</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================
          MODAL DO DIÁLOGO DE COLETA / ENTREGA / TROCA
          ======================================================== */}
      {showOperationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3.5 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* Header Colorido da Operação */}
            <div className={`p-4 text-white flex items-center justify-between ${operationConfig.badgeBg}`}>
              <div className="flex items-center gap-2.5">
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (firstPhoto) {
                      openPhotoViewer(firstPhoto, selectedPlace);
                    } else {
                      openFullScreenCamera();
                    }
                  }}
                  className={`w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden border border-white/30 shrink-0 ${
                    firstPhoto ? 'cursor-pointer hover:opacity-90 active:scale-95' : 'cursor-pointer hover:bg-white/30'
                  }`}
                  title={firstPhoto ? "Toque para abrir a foto grande na tela" : "Tirar foto da encomenda"}
                >
                  {firstPhoto ? (
                    <img 
                      src={firstPhoto} 
                      alt="Foto da Encomenda" 
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80';
                      }}
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <OperationIcon className="w-5 h-5 stroke-[2.5]" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black leading-tight">{operationConfig.title}</h3>
                  <p className="text-[11px] text-white/80 truncate max-w-[240px]">{selectedPlace.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowOperationModal(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo do Diálogo */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              
              {/* Status: Sucesso ou Insucesso */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Resultado da Operação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOperationStatus('success')}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border transition-all ${
                      operationStatus === 'success'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Realizada com Sucesso</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOperationStatus('failed')}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border transition-all ${
                      operationStatus === 'failed'
                        ? 'bg-red-50 border-red-500 text-red-700 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span>Insucesso / Falha</span>
                  </button>
                </div>
              </div>

              {/* Campos para Sucesso */}
              {operationStatus === 'success' ? (
                <>
                  {/* SEÇÃO DE FOTO DA BAIXA (OBRIGATÓRIA NA COLETA, USANDO O MESMO COMPONENTE) */}
                  <div className={`p-3 rounded-2xl border-2 transition-all ${
                    photoErrorMsg 
                      ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-200' 
                      : (selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta') && customPhotos.length === 0
                      ? 'bg-orange-50/70 border-orange-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Camera className={`w-4 h-4 ${(selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta') ? 'text-[#FF5E00]' : 'text-slate-700'}`} />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Foto da {selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta' ? 'Coleta' : 'Entrega'}
                        </span>
                        {(selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta') && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300">
                            Obrigatória
                          </span>
                        )}
                        {customPhotos.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                            {customPhotos.length} {customPhotos.length === 1 ? 'anexada' : 'anexadas'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoErrorMsg('');
                            openFullScreenCamera();
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF5E00] hover:text-[#E05300] bg-white hover:bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{customPhotos.length === 0 ? 'Tirar Foto' : 'Mais'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPhotoErrorMsg('');
                            galleryInputRef.current?.click();
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                          title="Escolher foto da galeria"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Galeria</span>
                        </button>
                      </div>
                    </div>

                    {photoErrorMsg && (
                      <div className="p-2 mb-2 rounded-xl bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>{photoErrorMsg}</span>
                      </div>
                    )}

                    {customPhotos.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoErrorMsg('');
                          openFullScreenCamera();
                        }}
                        className={`w-full py-3 px-3 rounded-xl border-2 border-dashed bg-white hover:bg-orange-50/50 transition-all flex flex-col items-center justify-center gap-1 group cursor-pointer ${
                          photoErrorMsg 
                            ? 'border-rose-400 bg-rose-50/40' 
                            : (selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta')
                            ? 'border-[#FF5E00]/60 hover:border-[#FF5E00]' 
                            : 'border-slate-300 hover:border-[#FF5E00]'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#FF5E00] flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                          <Camera className="w-4 h-4 stroke-[2.3]" />
                        </div>
                        <span className="text-xs font-bold text-slate-700 group-hover:text-[#FF5E00] transition-colors">
                          {(selectedPlace.orderStage === 'coleta' || selectedPlace.operationType === 'coleta')
                            ? 'Tirar foto obrigatória da mercadoria'
                            : 'Toque para tirar foto da encomenda ou comprovante'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          Câmera em tela cheia ou galeria
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {customPhotos.map((photo, index) => {
                          const mdPhoto = formatPhotoUrl(photo, 'md') || photo;
                          const lgPhoto = formatPhotoUrl(photo, 'lg') || photo;
                          return (
                            <div 
                              key={index}
                              onClick={(e) => {
                                e.stopPropagation();
                                openPhotoViewer(lgPhoto, selectedPlace);
                              }}
                              className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-lg overflow-hidden shrink-0 border-2 border-[#FF5E00] shadow-2xs group cursor-pointer bg-slate-900"
                            >
                              <img 
                                src={mdPhoto} 
                                alt={`Foto ${index + 1}`} 
                                onError={(e) => {
                                  if (e.currentTarget.src !== mdPhoto) {
                                    e.currentTarget.src = mdPhoto;
                                    return;
                                  }
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300&auto=format&fit=crop&q=80';
                                }}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              />
                              <button
                                type="button"
                                onClick={(e) => handleDeletePhoto(index, e)}
                                title="Excluir foto"
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-red-600 text-white flex items-center justify-center transition-colors active:scale-90 cursor-pointer"
                              >
                                <X className="w-3 h-3 stroke-[3]" />
                              </button>
                              <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/60 text-[9px] font-bold text-white leading-none">
                                #{index + 1}
                              </span>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => {
                            setPhotoErrorMsg('');
                            openFullScreenCamera();
                          }}
                          title="Adicionar mais foto"
                          className="w-16 h-16 sm:w-18 sm:h-18 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#FF5E00] hover:bg-orange-50/50 flex flex-col items-center justify-center gap-1 shrink-0 text-slate-400 hover:text-[#FF5E00] transition-all active:scale-95 cursor-pointer"
                        >
                          <Plus className="w-5 h-5 stroke-[2.5]" />
                          <span className="text-[9px] font-bold">Mais</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Nome do Recebedor / Entregador
                    </label>
                    <input 
                      type="text" 
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      placeholder="Ex: Pedro Henrique da Silva"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B5187] focus:border-[#0B5187]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Tipo de Embalagem / Carga
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'caixa', label: 'Caixa', icon: '📦' },
                        { id: 'sacola', label: 'Sacola', icon: '🛍️' },
                        { id: 'envelope', label: 'Envelope', icon: '✉️' },
                        { id: 'cilindro', label: 'Cilindro', icon: '🛢️' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedPackage(item.id as PackageItemType)}
                          className={`py-2 px-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all ${
                            selectedPackage === item.id
                              ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Quantidade de Volumes
                      </label>
                      <span className="text-[11px] font-bold text-[#0B5187] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        {selectedPackage === 'cilindro'
                          ? `${volumeQuantity} ${volumeQuantity === 1 ? 'cilindro' : 'cilindros'}`
                          : volumesCount}
                      </span>
                    </div>

                    {/* Stepper [+] e [-] com digitação livre */}
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateVolumeQuantity(volumeQuantity - 1)}
                        disabled={volumeQuantity <= 1}
                        className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 text-slate-800 flex items-center justify-center font-black transition-all cursor-pointer shadow-2xs shrink-0"
                        title="Diminuir volume"
                      >
                        <Minus className="w-4 h-4 stroke-[3]" />
                      </button>

                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={volumeQuantityInput}
                          onChange={(e) => handleVolumeInputChange(e.target.value)}
                          onBlur={handleVolumeInputBlur}
                          className="w-full text-center py-1.5 px-3 bg-slate-50 border-2 border-slate-300 focus:bg-white focus:border-[#0B5187] rounded-xl text-sm font-black text-slate-900 focus:outline-none transition-all shadow-inner"
                          placeholder="1"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none hidden sm:inline">
                          {selectedPackage === 'cilindro' ? 'cil' : 'vol'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpdateVolumeQuantity(volumeQuantity + 1)}
                        className="w-9 h-9 rounded-xl bg-[#0B5187] hover:bg-blue-900 active:scale-95 text-white flex items-center justify-center font-black transition-all cursor-pointer shadow-xs shrink-0"
                        title="Aumentar volume"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                      </button>
                    </div>

                    {/* Atalhos rápidos */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[1, 2, 3, 4, 5, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleUpdateVolumeQuantity(num)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-all ${
                            volumeQuantity === num
                              ? 'bg-[#0B5187] text-white border-[#0B5187]'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {num} {num === 1 ? 'vol' : 'vols'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Observações adicionais (opcional)
                    </label>
                    <textarea 
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: Pacote lacrado entregue na recepção."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B5187] focus:border-[#0B5187]"
                    />
                  </div>
                </>
              ) : (
                /* Campos para Insucesso */
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Motivo do Insucesso
                    </label>
                    <div className="space-y-1.5">
                      {[
                        'Local Fechado / Fora de Horário',
                        'Cliente / Responsável Ausente',
                        'Endereço Não Localizado',
                        'Recusado pelo Destinatário',
                        'Outro Motivo'
                      ].map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setFailReason(reason)}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-bold text-left border flex items-center justify-between transition-all ${
                            failReason === reason
                              ? 'bg-red-50 text-red-700 border-red-300 font-black'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span>{reason}</span>
                          {failReason === reason && <Check className="w-3.5 h-3.5 text-red-600 stroke-[3]" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Detalhes da Ocorrência
                    </label>
                    <textarea 
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Descreva o que ocorreu..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                </>
              )}

            </div>

            {/* Footer do Diálogo */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOperationModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handleSaveOperation()}
                className={`px-5 py-2.5 rounded-xl text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all active:scale-95 ${
                  operationStatus === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Confirmar e Salvar</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* AVISO: baixa feita longe do local (mais de 1 km) */}
      {farWarning && (
        <div
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setFarWarning(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-amber-200 space-y-4 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                <AlertTriangle className="w-5 h-5 stroke-[2.4]" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Você está longe do local</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Você está a <strong>{formatDistance(farWarning.proximity.distanceM / 1000)}</strong> do local desta
                  {operationType === 'entrega' ? ' entrega' : operationType === 'troca' ? ' troca' : ' coleta'}.
                  Se finalizar agora, essa distância ficará registrada no pedido.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFarWarning(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  const proceed = farWarning.proceed;
                  setFarWarning(null);
                  proceed();
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-md active:scale-95 transition-all"
              >
                Finalizar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RECUSA / CANCELAMENTO DE ROTA PELO MOTORISTA COM MOTIVO */}
      {showRefusalModal && (
        <div 
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isSubmittingRefusal) setShowRefusalModal(false);
          }}
        >
          <div 
            className="bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                  <Ban className="w-5 h-5 stroke-[2.4]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Cancelar pedido
                  </h3>
                  <p className="text-xs text-slate-500">
                    A central será notificada para reatribuir a outro entregador:
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmittingRefusal}
                onClick={() => setShowRefusalModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Opções pré-definidas */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Selecione o Motivo:
              </span>
              {[
                'Problema mecânico / Pane no veículo',
                'Fora da minha rota / Região distante',
                'Volume ou peso incompatível com veículo',
                'Fim de expediente / Turno encerrado',
                'Local fechado ou inacessível no momento',
                'Outro motivo operacional'
              ].map((reason) => {
                const isSelected = refusalReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setRefusalReason(reason)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-rose-50/80 border-rose-300 text-rose-900 font-bold'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{reason}</span>
                    {isSelected && <Check className="w-4 h-4 text-rose-600 stroke-[3]" />}
                  </button>
                );
              })}
            </div>

            {/* Campo de observações adicionais */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Justificativa (obrigatória):
              </label>
              <textarea
                value={refusalNotes}
                onChange={(e) => setRefusalNotes(e.target.value)}
                placeholder="Ex: Pneu furado na rota, solicito outro entregador..."
                rows={2}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none resize-none"
              />
            </div>

            {/* Ações */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                disabled={isSubmittingRefusal}
                onClick={() => setShowRefusalModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!refusalReason || refusalNotes.trim().length < 5 || isSubmittingRefusal}
                onClick={handleConfirmRefusal}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmittingRefusal ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Confirmar Cancelamento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORMULÁRIO DO VENDEDOR (RESPONSÁVEL) COM NOME, TELEFONE E AGENDA (SEM ABRIR LISTA DE USUÁRIOS) */}
      <SellerResponsibleModal
        isOpen={isSellerModalOpen}
        onClose={() => setIsSellerModalOpen(false)}
        initialName={responsibleName}
        initialPhone={responsiblePhone}
        clientName={customerName}
        clientPhone={customerPhone}
        onSave={handleSaveSellerResponsible}
      />

      {/* GAVETA / BOTTOM SHEET DE SELEÇÃO DE CLIENTE COM BUSCA EMBAIXO E FILTRAGEM */}
      <CustomerSelectorDrawer
        isOpen={isCustomerSelectorOpen}
        onClose={() => setIsCustomerSelectorOpen(false)}
        targetField={selectorTargetField}
        onSelectCustomer={handleSelectCustomer}
        onOpenRegistration={handleOpenRegistrationFromDrawer}
      />

      {/* TELA CHEIA DE CADASTRO DE CLIENTE (COM NOME, TELEFONE, CPF E LOCALIZAÇÃO OBRIGATÓRIOS) */}
      <CustomerFormFullScreen
        isOpen={isCustomerRegistrationOpen}
        onClose={() => setIsCustomerRegistrationOpen(false)}
        onSaveCustomer={handleSaveCustomerFromRegistration}
        initialData={registrationInitialData}
        selectedPlace={selectedPlace}
        targetFieldTitle={selectorTargetField === 'responsible' ? 'Vendedor (Responsável)' : 'Cliente'}
      />

      {/* MODAL / BOTTOM SHEET PARA DIRECIONAR ENCOMENDA PARA MOTORISTA */}
      <DriverSelectorModal
        isOpen={isDriverSelectorOpen}
        onClose={() => setIsDriverSelectorOpen(false)}
        place={selectedPlace}
        onSelectDriver={handleSelectDriverForPlace}
        onRemoveDriver={handleRemoveDriverFromPlace}
        activeTelemetryDrivers={drivers}
      />

      {/* MODAL DA ETAPA FINAL COM TRAÇADO DA ROTA, PREÇOS DISCRIMINADOS E WHATSAPP */}
      {selectedPlace && (
        <OrderFinalDetailsModal
          isOpen={isFinalDetailsOpen}
          onClose={() => setIsFinalDetailsOpen(false)}
          place={selectedPlace}
          readOnly={isDriverRole}
          onUpdatePlace={(updates) => updatePlaceDetails(selectedPlace.id, updates)}
        />
      )}
    </>
  );
};
