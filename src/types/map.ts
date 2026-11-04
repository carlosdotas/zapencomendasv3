export interface LocationCoordinates {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
}

export type OperationType = 'coleta' | 'entrega' | 'troca';
export type OrderDateBadgeType = 'hoje' | 'amanha' | 'ontem' | '2_dias_atras' | '3_dias_atras' | 'custom' | string;
export type VehicleCollectionType = 'moto' | 'carro' | 'utilitario';
export type PackageItemType = 'caixa' | 'sacola' | 'envelope' | 'cilindro' | 'outro' | string;
export type PaymentConditionType = 
  | 'antes_entrega' 
  | 'depois_entrega' 
  | 'semanal' 
  | 'quinzenal' 
  | 'mensal';

export type OrderVisibilityType = 'publico' | 'privado';

export interface Place {
  id: string;
  name: string;
  category?: string;
  isUnnamed?: boolean;
  isResolvingAddress?: boolean;
  address: string;
  coordinates: LocationCoordinates;
  rating?: number;
  reviewsCount?: number;
  openNow?: boolean;
  closingTime?: string;
  openingTime?: string;
  phone?: string;
  website?: string;
  description?: string;
  imageUrl?: string;
  photos?: string[];
  pickupPhotos?: string[];
  deliveryPhotos?: string[];
  collectionRestricted?: boolean;
  collectionOwnerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  customerAddress?: string;
  defaultLocationName?: string;
  customerCoordinates?: LocationCoordinates;
  sellerName?: string;
  sellerPhone?: string;
  pickupVisibility?: OrderVisibilityType;
  pickupAssignedDriverId?: string;
  pickupAssignedDriverPhone?: string;
  pickupAssignedDriverName?: string;
  pickupSellerName?: string;
  pickupSellerPhone?: string;
  exchangeVisibility?: OrderVisibilityType;
  exchangeAssignedDriverId?: string;
  exchangeAssignedDriverPhone?: string;
  exchangeAssignedDriverName?: string;
  exchangeSellerName?: string;
  exchangeSellerPhone?: string;
  deliveryVisibility?: OrderVisibilityType;
  deliveryAssignedDriverId?: string;
  deliveryAssignedDriverPhone?: string;
  deliveryAssignedDriverName?: string;
  deliverySellerName?: string;
  deliverySellerPhone?: string;
  managerName?: string;
  managerPhone?: string;
  responsibleName?: string;
  responsiblePhone?: string;
  originCity?: string;
  destinationCity?: string;
  driverNotes?: string;
  observations?: string;
  fromDatabase?: boolean;
  orderCode?: string;
  orderId?: string;
  pedido_id?: string | number;
  operationType?: OperationType;
  orderDateBadge?: OrderDateBadgeType;
  vehicleType?: VehicleCollectionType;
  packageType?: PackageItemType;
  assignedDriverId?: string;
  assignedDriverPhone?: string;
  driverEnRoute?: boolean;
  acceptedByDriver?: boolean;
  assignedDriverName?: string;
  companyId?: string;
  companyName?: string;
  pickupName?: string;
  pickupAddress?: string;
  pickupCoordinates?: LocationCoordinates;
  pickupContact?: string;
  pickupPhone?: string;
  pickupNotes?: string;
  exchangeName?: string;
  exchangeAddress?: string;
  exchangeCoordinates?: LocationCoordinates;
  exchangeContact?: string;
  exchangePhone?: string;
  exchangeNotes?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  deliveryCoordinates?: LocationCoordinates;
  deliveryContact?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
  isExchangeOrder?: boolean;
  orderStage?: 'coleta' | 'troca' | 'entrega' | 'retorno' | 'concluido';
  price?: number;
  paymentStatus?: 'pago' | 'pendente';
  isPaid?: boolean;
  priceItems?: Array<{
    id: string;
    name: string;
    value: number;
    category?: 'coleta' | 'transporte' | 'entrega' | 'extra';
    isRemovable?: boolean;
  }>;
  discountItems?: Array<{
    id: string;
    name: string;
    value: number;
    isRemovable?: boolean;
  }>;
  totalDiscounts?: number;
  scheduledDate?: string;
  data?: string;
  orderDate?: string;
  scheduledTime?: string;
  scheduledTimeMode?: 'ate' | 'partir';
  packageSize?: string;
  volumesCount?: number;
  weightKg?: string;
  dimensions?: string;
  isFragile?: boolean;
  paymentCondition?: PaymentConditionType;
  paymentAdjustmentType?: 'desconto' | 'acrescimo' | 'nenhum';
  paymentAdjustmentValue?: number;
  paymentAdjustmentMode?: 'percent' | 'fixed';
  orderVisibility?: OrderVisibilityType;
}

export interface CompletedWaypointMark {
  id: string;
  orderId: string;
  orderCode?: string;
  operationType: OperationType; // 'coleta' | 'troca' | 'entrega'
  completedAt: number;
  timeStr: string;
  placeName: string;
  address: string;
  customerName?: string;
  coordinates: LocationCoordinates;
  completedDate: string; // Formato YYYY-MM-DD para visualização do dia atual
  receiverName?: string;
  details?: string;
  status?: 'success' | 'failed';
  isFinal?: boolean;
  driverName?: string;
  driverId?: string;
  driverPhone?: string;
  driverPhoto?: string;
  photos?: string[];
  imageUrl?: string;
}

export type DateFilterPreset = 
  | 'hoje' 
  | 'amanha' 
  | 'ontem' 
  | 'essa_semana' 
  | 'este_mes' 
  | 'mes_passado' 
  | 'custom' 
  | null;

export interface DateRangeFilter {
  startDate: string | null; // Formato YYYY-MM-DD
  endDate: string | null;   // Formato YYYY-MM-DD
  preset?: DateFilterPreset;
}

export interface RouteInfo {
  coordinates: LocationCoordinates[];
  distanceKm: number;
  durationMin: number;
}

export type DefaultNavigationApp = 'google_maps' | 'waze' | null;

export type MapColorTheme = 
  | 'blue-corporate' 
  | 'blue-vibrant' 
  | 'blue-dark' 
  | 'blue-clean' 
  | 'natural'
  | 'blue-zap'
  | 'orange-blue-zap';

export type MapLayerType = 'default' | 'osm' | 'terrain' | 'dark' | 'satellite';

export interface UserRequiredFieldsConfig {
  name: boolean;
  phone: boolean;
  email: boolean;
  document: boolean;
  avatarUrl: boolean;
  role: boolean;
  city: boolean;
  company: boolean;
  address: boolean;
  vehicleType: boolean;
  vehiclePlate: boolean;
  vehicleModel: boolean;
  pixKey: boolean;
  cnh: boolean;
  emergencyContact: boolean;
  blockIfIncomplete: boolean;
}

export const DEFAULT_USER_REQUIRED_FIELDS: UserRequiredFieldsConfig = {
  name: true,
  phone: true,
  email: true,
  document: true,
  avatarUrl: false,
  role: true,
  city: true,
  company: false,
  address: false,
  vehicleType: false,
  vehiclePlate: false,
  vehicleModel: false,
  pixKey: false,
  cnh: false,
  emergencyContact: false,
  blockIfIncomplete: true
};

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  savedPlacesCount: number;
  contributionsCount: number;
  phone?: string;
  role?: string;
  userRole?: 'admin_geral' | 'atendente' | 'terminal' | 'motorista';
  document?: string;
  company?: string;
  city?: string;
  rating?: number;
  totalDeliveries?: number;
  vehicle?: string;
  vehicleType?: 'moto' | 'carro' | 'utilitario' | string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  placeName?: string;
  coordinates?: LocationCoordinates;
  timestamp: number;
}

export type VehicleFilterType = 'todos' | 'carro' | 'moto' | 'utilitario' | 'nenhum';
export type OperationFilterType = 'todas' | 'coleta' | 'entrega' | 'troca';

export interface OperationsFilterState {
  coleta: boolean;
  entrega: boolean;
  troca: boolean;
}

export interface Driver {
  id: string;
  name: string;
  nickname?: string;
  vehicleType: VehicleCollectionType;
  vehicleModel: string;
  vehiclePlate: string;
  color: string;
  coordinates: LocationCoordinates;
  heading?: number;
  status: 'em_rota' | 'disponivel' | 'em_pausa' | 'offline';
  phone: string;
  avatarUrl?: string;
  city?: string;
  currentCity?: string;
  speedKmH?: number;
  batteryLevel?: number;
  currentOrderCode?: string;
  destinationName?: string;
  deliveriesCompleted?: number;
  rating?: number;
  lastSeenTimestamp?: number;
  lastUpdatedStr?: string;
  isOnline?: boolean;
  signalStrength?: 'excelente' | 'bom' | 'instavel' | 'offline';
}
