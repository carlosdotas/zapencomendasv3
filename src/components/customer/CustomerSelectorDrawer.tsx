import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Search, 
  User, 
  UserCheck, 
  MessageCircle,
  MapPin, 
  Plus, 
  BookOpen, 
  Check, 
  MoreVertical,
  Database,
  Loader2,
  Trash2,
  Smartphone,
  ShieldCheck,
  CreditCard,
  Clock,
  Edit3,
  RotateCcw,
  Package
} from 'lucide-react';
import { Customer, AgendaContact, TargetFieldType } from '../../types/customer';
import { Place } from '../../types/map';
import { subscribeDatabaseCustomersPage } from '../../services/customerSearchService';
import { checkUserCompleteness, isValidTaxId } from '../../utils/userCompleteness';
import { api } from '../../services/api';
import { useBackButton } from '../../hooks/useBackButton';
import { PhoneAgendaModal } from './PhoneAgendaModal';
import { useMapStore } from '../../context/MapContext';
import { hasCustomerLocation } from '../../utils/customerLocationUtils';
import { CustomerOrderHistoryFullScreen } from '../order/CustomerOrderHistoryFullScreen';
import { companyService } from '../../services/companyService';
import { PastOrderRecord } from '../order/NewOrderModal';
import { customerOrderStatsService } from '../../services/customerOrderStatsService';
import { backendUserToCustomer } from '../../services/apiAdapters';
import { customersRepresentSamePerson, mergeCustomerLists, normalizeCustomerId, normalizeCustomerPhone } from '../../utils/customerIdentity';

interface CustomerSelectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetField: TargetFieldType;
  onSelectCustomer: (customer: Customer) => void;
  onOpenRegistration: (initialData?: Partial<Customer> | AgendaContact) => void;
  canDeleteCustomer?: boolean;
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

const hasDetailedAddress = (address?: string, city?: string): boolean => {
  if (!address?.trim()) return false;
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*[,;-]\s*[a-z]{2}\s*$/, '')
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedAddress = normalize(address);
  const normalizedCity = city ? normalize(city) : '';
  if (normalizedCity && normalizedAddress === normalizedCity) return false;
  return /\d/.test(address) || address.includes(',') || /\b(rua|r\.|avenida|av\.|alameda|rodovia|estrada|travessa|praca|praça|setor|quadra|lote|km)\b/i.test(address);
};

export const CustomerSelectorDrawer: React.FC<CustomerSelectorDrawerProps> = ({
  isOpen,
  onClose,
  targetField,
  onSelectCustomer,
  onOpenRegistration,
  canDeleteCustomer = false
}) => {
  useBackButton('customer-selector-drawer', isOpen, onClose, 95);

  const { 
    customers, 
    user,
    currentRole,
    deleteCustomer,
    openCustomerLocationModal, 
    selectedPlace,
    allPlaces,
    savedPlaces,
    completedOrders,
    addNewOrder,
    setSelectedPlace,
    mapInstance
  } = useMapStore();

  const isDriverRole = currentRole === 'motorista' || user?.userRole === 'motorista';

  const [searchTerm, setSearchTerm] = useState('');
  const [agendaContacts, setAgendaContacts] = useState<AgendaContact[]>([]);
  const [dbCustomers, setDbCustomers] = useState<Customer[]>([]);
  const [initialDbUsers, setInitialDbUsers] = useState<Customer[]>([]);
  const [initialDbLoaded, setInitialDbLoaded] = useState(false);
  const [isSearchingDb, setIsSearchingDb] = useState(false);
  const [isLoadingMoreDbUsers, setIsLoadingMoreDbUsers] = useState(false);
  const [initialDbCursor, setInitialDbCursor] = useState<string | undefined>();
  const [searchDbCursor, setSearchDbCursor] = useState<string | undefined>();
  const [hasMoreInitialDbUsers, setHasMoreInitialDbUsers] = useState(false);
  const [hasMoreSearchDbUsers, setHasMoreSearchDbUsers] = useState(false);
  const [isPhoneAgendaModalOpen, setIsPhoneAgendaModalOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [openCustomerMenuId, setOpenCustomerMenuId] = useState<string | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const resultsSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreDbRef = useRef(false);
  const pageSubscriptionsRef = useRef(new Map<string, () => void>());
  const initialPagesRef = useRef(new Map<string, Customer[]>());
  const searchPagesRef = useRef(new Map<string, Customer[]>());

  // Lista de pedidos históricos do cliente ordenada pelos locais mais frequentes
  const customerPastOrdersList = useMemo(() => {
    if (!historyCustomer) return [];
    const list: PastOrderRecord[] = [];
    const custNameNorm = (historyCustomer.fullName || '').toLowerCase().trim();
    const custPhoneDigits = (historyCustomer.phone || '').replace(/\D/g, '');

    // 1. Busca encomendas reais salvas deste cliente no app
    const candidates = new Map<string, Place>();
    [...(allPlaces || []), ...(savedPlaces || []), ...(completedOrders || [])].forEach(p => {
      if (p && p.id && !candidates.has(p.id)) {
        candidates.set(p.id, p);
      }
    });

    const matches = Array.from(candidates.values()).filter(p => {
      const pName = (p.customerName || '').toLowerCase().trim();
      const pPhone = (p.customerPhone || '').replace(/\D/g, '');
      const pId = p.customerId || '';
      if (historyCustomer.id && pId && pId === historyCustomer.id) return true;
      if (custNameNorm && pName && (pName.includes(custNameNorm) || custNameNorm.includes(pName))) return true;
      if (custPhoneDigits && custPhoneDigits.length >= 8 && pPhone && (pPhone.includes(custPhoneDigits) || custPhoneDigits.includes(pPhone))) return true;
      return false;
    });

    matches.forEach((p, idx) => {
      const locName = p.name || (p.operationType === 'coleta' ? (p.pickupName || p.name) : (p.deliveryName || p.name)) || p.address || 'Local';
      list.push({
        id: `real-${p.id}`,
        orderCode: p.orderCode || `ZAP-${1000 + idx}`,
        dateStr: p.scheduledDate ? `Agendado: ${p.scheduledDate}` : 'No sistema',
        placeName: locName,
        operationType: p.operationType || 'entrega',
        pickupAddress: p.pickupAddress || p.address || 'Goiânia - GO',
        pickupCoords: p.pickupCoordinates || p.coordinates || { lat: -16.6869, lng: -49.2648 },
        exchangeAddress: p.exchangeAddress,
        exchangeCoords: p.exchangeCoordinates,
        deliveryAddress: p.deliveryAddress || p.address || 'Goiânia - GO',
        deliveryCoords: p.deliveryCoordinates || p.coordinates || { lat: -16.7020, lng: -49.2610 },
        vehicleType: p.vehicleType || 'moto',
        packageType: p.packageType || 'caixa',
        volumesCount: p.volumesCount ? `${p.volumesCount} vol` : '1 volume',
        sellerName: p.sellerName || p.responsibleName || '',
        sellerPhone: p.sellerPhone || p.responsiblePhone || '',
        responsibleName: p.sellerName || p.responsibleName || 'Central EncomendasZap',
        responsiblePhone: p.sellerPhone || p.responsiblePhone || '(62) 3999-8800',
        observations: p.driverNotes || p.observations || '',
        price: Number(p.price) || Number((p as any).total) || 20.0,
        isFragile: p.isFragile,
        weightKg: p.weightKg,
        dimensions: p.dimensions,
        executionCount: 1
      });
    });

    // 2. Históricos habituais realistas para o cliente
    const defaultCustAddr = historyCustomer.address || 'Rua 9, 142 - Setor Marista, Goiânia - GO';
    const defaultCustCoords = historyCustomer.coordinates || { lat: -16.7020, lng: -49.2610 };

    const mockLocations = [
      {
        addr: 'Av. T-63, 145 - Setor Bueno, Goiânia - GO',
        coords: { lat: -16.6990, lng: -49.2650 },
        count: 6,
        op: 'entrega' as const,
        pack: 'Envelope',
        veh: 'moto' as const,
        price: 18.5
      },
      {
        addr: 'Shopping Flamboyant - Piso 1, Goiânia - GO',
        coords: { lat: -16.7118, lng: -49.2346 },
        count: 4,
        op: 'troca' as const,
        pack: 'Caixa',
        veh: 'carro' as const,
        price: 32.0
      },
      {
        addr: 'Av. 85, 2300 - Setor Marista, Goiânia - GO',
        coords: { lat: -16.6900, lng: -49.2620 },
        count: 2,
        op: 'coleta' as const,
        pack: 'Sacola',
        veh: 'moto' as const,
        price: 16.0
      }
    ];

    mockLocations.forEach((ml, idx) => {
      list.push({
        id: `hist-${historyCustomer.id}-${idx}`,
        orderCode: `ZAP-${8000 + idx * 123}`,
        dateStr: `${idx + 1} dias atrás`,
        operationType: ml.op,
        pickupAddress: ml.op === 'coleta' ? defaultCustAddr : ml.addr,
        pickupCoords: ml.op === 'coleta' ? defaultCustCoords : ml.coords,
        exchangeAddress: ml.op === 'troca' ? ml.addr : undefined,
        exchangeCoords: ml.op === 'troca' ? ml.coords : undefined,
        deliveryAddress: ml.op === 'coleta' ? ml.addr : defaultCustAddr,
        deliveryCoords: ml.op === 'coleta' ? ml.coords : defaultCustCoords,
        vehicleType: ml.veh,
        packageType: ml.pack,
        volumesCount: '1 volume',
        responsibleName: 'Central EncomendasZap',
        responsiblePhone: '(62) 3999-8800',
        observations: `Pedido frequente do cliente (${ml.count} execuções neste local)`,
        price: ml.price,
        executionCount: ml.count
      });
    });

    // 3. Frequência dos locais para ordenar pelos locais mais feitos
    const locFrequency: Record<string, number> = {};
    list.forEach(item => {
      const key = (item.deliveryAddress || item.pickupAddress || '').trim().toLowerCase();
      if (key) {
        locFrequency[key] = (locFrequency[key] || 0) + (item.executionCount || 1);
      }
    });

    return list.sort((a, b) => {
      const keyA = (a.deliveryAddress || a.pickupAddress || '').trim().toLowerCase();
      const keyB = (b.deliveryAddress || b.pickupAddress || '').trim().toLowerCase();
      const freqA = locFrequency[keyA] || 0;
      const freqB = locFrequency[keyB] || 0;
      if (freqB !== freqA) return freqB - freqA;
      return (b.executionCount || 0) - (a.executionCount || 0);
    });
  }, [historyCustomer, allPlaces, savedPlaces, completedOrders]);

  // Ação de repetir pedido do histórico: GERA NOVO PEDIDO NA DATA ATUAL
  const handleRepeatOrderFromHistory = (pastOrder: PastOrderRecord) => {
    if (isDriverRole) return;
    if (!historyCustomer) return;
    const today = new Date().toISOString().split('T')[0];
    const todayFormatted = new Date().toLocaleDateString('pt-BR');

    const newPlace: Place = {
      id: `pedido-${Date.now()}-coleta`,
      orderCode: `ZAP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: pastOrder.placeName || (pastOrder.operationType === 'coleta' ? `Coleta: ${pastOrder.pickupAddress.split(',')[0]}` : `Entrega: ${pastOrder.deliveryAddress.split(',')[0]}`),
      category: pastOrder.operationType === 'troca' ? 'Troca de Mercadoria' : 'Coleta Expressa',
      address: pastOrder.pickupAddress,
      coordinates: pastOrder.pickupCoords,
      operationType: pastOrder.operationType,
      orderStage: 'coleta',
      vehicleType: pastOrder.vehicleType,
      packageType: pastOrder.packageType || 'caixa',
      customerName: historyCustomer.fullName,
      customerPhone: historyCustomer.phone,
      customerId: historyCustomer.id,
      orderDateBadge: 'hoje',
      scheduledDate: today,
      pickupAddress: pastOrder.pickupAddress,
      pickupCoordinates: pastOrder.pickupCoords,
      pickupContact: pastOrder.responsibleName,
      pickupPhone: pastOrder.responsiblePhone,
      deliveryAddress: pastOrder.deliveryAddress,
      deliveryCoordinates: pastOrder.deliveryCoords,
      deliveryContact: historyCustomer.fullName,
      deliveryPhone: historyCustomer.phone,
      exchangeAddress: pastOrder.exchangeAddress,
      exchangeCoordinates: pastOrder.exchangeCoords,
      sellerName: pastOrder.sellerName,
      sellerPhone: pastOrder.sellerPhone,
      responsibleName: pastOrder.responsibleName,
      responsiblePhone: pastOrder.responsiblePhone,
      isFragile: pastOrder.isFragile,
      weightKg: pastOrder.weightKg,
      dimensions: pastOrder.dimensions,
      observations: pastOrder.observations || `Pedido repetido do histórico para hoje (${todayFormatted})`,
      price: pastOrder.price,
      priceItems: [{ id: 'item-base', name: 'Taxa de Entrega', value: pastOrder.price || 20, isRemovable: false }]
    };

    addNewOrder(newPlace);
    setSelectedPlace(newPlace);
    if (mapInstance && newPlace.coordinates) {
      mapInstance.flyTo([newPlace.coordinates.lat, newPlace.coordinates.lng], 16, { animate: true, duration: 1 });
    }

    setHistoryCustomer(null);
    onClose();

    if (typeof window !== 'undefined' && window.AndroidApp) {
      window.AndroidApp.showNotification?.("EncomendasZap", `Pedido #${newPlace.orderCode} gerado com sucesso para hoje!`);
    }
  };

  // Carrega lista inicial de usuários do banco ao abrir o drawer
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const pageKey = 'initial:first';
    let firstPageReceived = false;
    setSearchTerm('');
    setIsSearchingDb(false);
    setInitialDbUsers([]);
    setInitialDbLoaded(false);
    setInitialDbCursor(undefined);
    setHasMoreInitialDbUsers(false);
    initialPagesRef.current.clear();
    setIsLoadingMoreDbUsers(true);

    const unsubscribe = subscribeDatabaseCustomersPage('', undefined, 30, page => {
      if (!active) return;
      initialPagesRef.current.set(pageKey, page.customers);
      const mergedPage = mergeCustomerLists(...Array.from(initialPagesRef.current.values()));
      setInitialDbUsers(customerOrderStatsService.sortCustomersByOrderCount(mergedPage));
      // Atualizações periódicas não podem reiniciar o cursor das páginas já carregadas
      if (!firstPageReceived) {
        firstPageReceived = true;
        setInitialDbCursor(page.cursor);
        setHasMoreInitialDbUsers(page.hasMore);
      }
      setInitialDbLoaded(true);
      setIsLoadingMoreDbUsers(false);
    }, error => {
      if (!active) return;
      console.warn('Erro ao carregar usuários iniciais:', error);
      setHasMoreInitialDbUsers(false);
      setIsLoadingMoreDbUsers(false);
    });
    pageSubscriptionsRef.current.set(pageKey, unsubscribe);

    const timer = setTimeout(() => {
      if (active) searchInputRef.current?.focus();
    }, 100);
    return () => {
      active = false;
      clearTimeout(timer);
      for (const [key, stop] of pageSubscriptionsRef.current) {
        if (key.startsWith('initial:')) {
          stop();
          pageSubscriptionsRef.current.delete(key);
        }
      }
      initialPagesRef.current.clear();
    };
  }, [isOpen]);

  // Normalização para busca insensível a acentos (ex: "joao" acha "João", "conceicao" acha "Conceição")
  const normalize = (text: string = '') =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const cleanSearch = searchTerm.trim().toLowerCase();
  const normSearch = normalize(searchTerm);
  const searchDigits = normalizeCustomerPhone(searchTerm);

  const matchesItem = (c: { fullName?: string; name?: string; phone?: string; cpf?: string; cnpj?: string; address?: string; notes?: string; city?: string; cidade?: string }) => {
    if (!normSearch) return true;
    const nameStr = c.fullName || c.name || '';
    if (normalize(nameStr).includes(normSearch)) return true;

    if (searchDigits.length >= 2) {
      const pDigits = normalizeCustomerPhone(c.phone);
      if (pDigits.includes(searchDigits)) return true;
      const cpfDigits = (c.cpf || '').replace(/\D/g, '');
      const cnpjDigits = (c.cnpj || '').replace(/\D/g, '');
      if (cpfDigits.includes(searchDigits) || cnpjDigits.includes(searchDigits)) return true;
    }

    if (c.cpf && normalize(c.cpf).includes(normSearch)) return true;
    if (c.cnpj && normalize(c.cnpj).includes(normSearch)) return true;
    if (c.city && normalize(c.city).includes(normSearch)) return true;
    if (c.cidade && normalize(c.cidade).includes(normSearch)) return true;
    if (c.address && normalize(c.address).includes(normSearch)) return true;
    const extractedCity = extractCityFromAddress(c.address);
    if (extractedCity && normalize(extractedCity).includes(normSearch)) return true;
    if (c.notes && normalize(c.notes).includes(normSearch)) return true;
    return false;
  };

  // Busca em tempo real no banco de dados com debounce rápido
  useEffect(() => {
    let active = true;
    for (const [key, stop] of pageSubscriptionsRef.current) {
      if (key.startsWith('search:')) {
        stop();
        pageSubscriptionsRef.current.delete(key);
      }
    }
    searchPagesRef.current.clear();

    if (!isOpen || !cleanSearch) {
      setDbCustomers([]);
      setSearchDbCursor(undefined);
      setHasMoreSearchDbUsers(false);
      setIsSearchingDb(false);
      return () => { active = false; };
    }

    setIsSearchingDb(true);
    setDbCustomers([]);
    setSearchDbCursor(undefined);
    setHasMoreSearchDbUsers(false);
    setIsSearchingDb(true);
    const timer = setTimeout(() => {
      const pageKey = `search:${cleanSearch}:first`;
      let firstSearchResponse = true;
      const unsubscribe = subscribeDatabaseCustomersPage(cleanSearch, undefined, 30, page => {
        if (!active) return;
        searchPagesRef.current.set(pageKey, page.customers);
        const mergedPage = mergeCustomerLists(...Array.from(searchPagesRef.current.values()));
        setDbCustomers(customerOrderStatsService.sortCustomersByOrderCount(mergedPage));
        if (firstSearchResponse) {
          firstSearchResponse = false;
          setSearchDbCursor(page.cursor);
          setHasMoreSearchDbUsers(page.hasMore);
        }
        setIsSearchingDb(false);
      }, error => {
        if (!active) return;
        console.warn('Erro na busca de usuários:', error);
        setHasMoreSearchDbUsers(false);
        setIsSearchingDb(false);
      });
      pageSubscriptionsRef.current.set(pageKey, unsubscribe);
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
      for (const [key, stop] of pageSubscriptionsRef.current) {
        if (key.startsWith(`search:${cleanSearch}:`)) {
          stop();
          pageSubscriptionsRef.current.delete(key);
        }
      }
      searchPagesRef.current.clear();
    };
  }, [cleanSearch, isOpen]);

  const loadMoreDbUsers = useCallback(async () => {
    if (loadingMoreDbRef.current || isSearchingDb) return;
    const isSearching = Boolean(cleanSearch);
    const hasMore = isSearching ? hasMoreSearchDbUsers : hasMoreInitialDbUsers;
    const cursor = isSearching ? searchDbCursor : initialDbCursor;
    if (!hasMore || !cursor) return;

    const pageKey = `${isSearching ? `search:${cleanSearch}` : 'initial'}:${cursor}`;
    if (pageSubscriptionsRef.current.has(pageKey)) return;

    loadingMoreDbRef.current = true;
    setIsLoadingMoreDbUsers(true);
    try {
      let firstResponse = true;
      const unsubscribe = subscribeDatabaseCustomersPage(isSearching ? cleanSearch : '', cursor, 30, page => {
        const pages = isSearching ? searchPagesRef.current : initialPagesRef.current;
        pages.set(pageKey, page.customers);
        const mergedPages = mergeCustomerLists(...Array.from(pages.values()));
        // Só a primeira resposta avança o cursor; o polling não deve fazê-lo retroceder
        const advance = firstResponse;
        firstResponse = false;
        if (isSearching) {
          setDbCustomers(customerOrderStatsService.sortCustomersByOrderCount(mergedPages));
          if (advance) {
            setSearchDbCursor(page.cursor);
            setHasMoreSearchDbUsers(page.hasMore);
          }
        } else {
          setInitialDbUsers(customerOrderStatsService.sortCustomersByOrderCount(mergedPages));
          if (advance) {
            setInitialDbCursor(page.cursor);
            setHasMoreInitialDbUsers(page.hasMore);
          }
        }
        loadingMoreDbRef.current = false;
        setIsLoadingMoreDbUsers(false);
      }, error => {
        console.warn('Erro ao acompanhar página de usuários:', error);
        if (isSearching) setHasMoreSearchDbUsers(false);
        else setHasMoreInitialDbUsers(false);
        loadingMoreDbRef.current = false;
        setIsLoadingMoreDbUsers(false);
      });
      pageSubscriptionsRef.current.set(pageKey, unsubscribe);
    } catch (error) {
      console.warn('Erro ao carregar mais usuários:', error);
      if (cleanSearch) setHasMoreSearchDbUsers(false);
      else setHasMoreInitialDbUsers(false);
      loadingMoreDbRef.current = false;
      setIsLoadingMoreDbUsers(false);
    }
  }, [cleanSearch, hasMoreInitialDbUsers, hasMoreSearchDbUsers, initialDbCursor, isSearchingDb, searchDbCursor]);

  const hasMoreDbUsers = cleanSearch ? hasMoreSearchDbUsers : hasMoreInitialDbUsers;

  useEffect(() => {
    if (!isOpen || !hasMoreDbUsers || isSearchingDb || isLoadingMoreDbUsers) return;
    const root = resultsScrollRef.current;
    const sentinel = resultsSentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMoreDbUsers();
    }, { root, rootMargin: '160px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreDbUsers, isLoadingMoreDbUsers, isOpen, isSearchingDb, loadMoreDbUsers]);

  // Lista de usuários do Banco de Dados a exibir:
  // Mescla os usuários do banco oficial com clientes já cadastrados/atualizados no app
  const displayedDbUsers = useMemo(() => {
    const baseList = cleanSearch ? dbCustomers : initialDbUsers;
    // Sem busca, só mistura a lista local depois que o banco respondeu (evita dados que aparecem e somem)
    const localFiltered = normSearch
      ? customers.filter(matchesItem)
      : initialDbLoaded ? customers : [];
    const baseFiltered = normSearch
      ? baseList.filter(matchesItem)
      : baseList;

    const merged = mergeCustomerLists(baseFiltered, localFiltered);
    const accessible = merged.filter(c =>
      companyService.canUserAccessCustomer(c, user?.phone)
    );
    // Organiza por ordem de quem tem mais pedidos (decrescente)
    return customerOrderStatsService.sortCustomersByOrderCount(accessible);
  }, [cleanSearch, normSearch, searchDigits, dbCustomers, initialDbUsers, initialDbLoaded, customers, user?.phone]);

  // Resolve se o cliente possui localização cadastrada (diretamente ou salvo na lista de clientes do app)
  const resolveCustomerLocationRecord = (item: { id?: string; phone?: string; coordinates?: any; address?: string }): Customer | null => {
    if (hasCustomerLocation(item as Customer)) return item as Customer;
    const cleanPhone = (item.phone || '').replace(/\D/g, '');
    const match = customers.find(customer => customersRepresentSamePerson(customer, item as Customer));
    if (match && hasCustomerLocation(match)) return match;
    return null;
  };

  // Filtra exclusivamente na Agenda Telefônica com suporte a acentos e dígitos
  const filteredAgenda = useMemo(() => {
    if (!normSearch) return agendaContacts;
    return agendaContacts.filter(a =>
      matchesItem({
        name: a.name,
        phone: a.phone,
        cpf: a.cpf,
        address: a.address,
        notes: a.notes
      })
    );
  }, [agendaContacts, normSearch, searchDigits]);

  // Suporte a importar contatos reais da agenda do celular (APK Android ou Web Contacts API)
  useEffect(() => {
    const handleContactSelected = (e: Event) => {
      const customEvent = e as CustomEvent<{ name?: string; phone?: string }>;
      if (customEvent.detail) {
        const { name, phone } = customEvent.detail;
        if (name || phone) {
          const newContact: AgendaContact = {
            id: `agenda-apk-${Date.now()}`,
            name: name || 'Contato da Agenda',
            phone: phone || '',
            address: 'Goiânia - GO',
            source: 'agenda'
          };
          setAgendaContacts(prev => [newContact, ...prev.filter(c => c.phone.replace(/\D/g, '') !== (phone || '').replace(/\D/g, ''))]);
          handleSelectAgendaContact(newContact);
        }
      }
    };
    window.addEventListener('contactSelected', handleContactSelected);
    return () => {
      window.removeEventListener('contactSelected', handleContactSelected);
    };
  }, []);

  const handleImportNativeContacts = async () => {
    if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.pickContact) {
      window.AndroidApp.pickContact();
      return;
    }
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel', 'email', 'address'];
        const opts = { multiple: true };
        const contacts = await (navigator as any).contacts.select(props, opts);
        if (contacts && contacts.length > 0) {
          const imported: AgendaContact[] = contacts.map((c: any, idx: number) => ({
            id: `agenda-native-${Date.now()}-${idx}`,
            name: c.name?.[0] || 'Contato sem nome',
            phone: c.tel?.[0] || '',
            email: c.email?.[0] || undefined,
            address: c.address?.[0]?.addressLine?.[0] || undefined,
            source: 'agenda'
          }));
          setAgendaContacts(prev => [...imported, ...prev]);
        }
      } catch (err) {
        console.warn('Importação de contatos cancelada ou não permitida:', err);
      }
    }
  };

  const handleOpenPhoneAgenda = async () => {
    if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.pickContact) {
      window.AndroidApp.pickContact();
      return;
    }
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        await handleImportNativeContacts();
        return;
      } catch (err) {
        console.warn('Importação nativa não concluída, abrindo modal da agenda:', err);
      }
    }
    setIsPhoneAgendaModalOpen(true);
  };

  const openCustomerWhatsApp = (rawPhone?: string) => {
    const digits = (rawPhone || '').replace(/\D/g, '');
    if (!digits) return;
    const phone = !digits.startsWith('55') && (digits.length === 10 || digits.length === 11)
      ? `55${digits}`
      : digits;
    if (window.AndroidApp?.openWhatsApp) {
      window.AndroidApp.openWhatsApp(phone, '');
    } else {
      window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer');
    }
  };

  const hasNativeContactsApi = (typeof window !== 'undefined' && Boolean(window.AndroidApp?.pickContact)) || 
    (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window);

  if (!isOpen) return null;

  const isResponsible = targetField === 'responsible';
  const title = isResponsible ? 'Vendedor (Responsável)' : 'Clientes';
  const subtitle = isResponsible ? 'Quem atende ou recebe no local' : 'Banco de Dados & Agenda Telefônica';

  // Converte contato da agenda para Customer ao selecionar
  const handleSelectAgendaContact = (contact: AgendaContact) => {
    const completeness = checkUserCompleteness({
      fullName: contact.name,
      phone: contact.phone,
      cpf: contact.cpf
    });

    // Se o contato da agenda estiver incompleto (falta CPF, etc.), abre o formulário de cadastro preenchido
    if (!completeness.isComplete) {
      onOpenRegistration(contact);
      return;
    }

    const loc = resolveCustomerLocationRecord(contact);
    onSelectCustomer({
      id: contact.id.startsWith('agenda-') ? contact.id : `agenda-${contact.id}`,
      fullName: contact.name,
      phone: contact.phone,
      cpf: contact.cpf || '',
      address: loc?.address || contact.address || 'Goiânia - GO',
      coordinates: loc?.coordinates,
      notes: contact.notes ? `Agenda: ${contact.notes}` : 'Contato da Agenda Telefônica',
      createdAt: Date.now()
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-white animate-in fade-in duration-150">
      {/* JANELA DE TELA INTEIRA: BANCO DE DADOS & AGENDA TELEFÔNICA */}
      <div className="flex h-full w-full flex-col overflow-hidden bg-white">
        <div className="px-3.5 py-2 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-white shadow-xs ${
              isResponsible ? 'bg-[#FF5E00]' : 'bg-[#0B5187]'
            }`}>
              {isResponsible ? <UserCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 leading-tight">
                {title}
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenPhoneAgenda}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-800 active:scale-95 font-black text-xs rounded-xl transition-all cursor-pointer shadow-xs"
              title="Buscar na Agenda Telefônica"
            >
              <Smartphone className="w-3.5 h-3.5 text-sky-600" />
              <span>Buscar na Agenda</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenRegistration({ fullName: searchTerm })}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FF5E00] hover:bg-[#E05300] active:scale-95 text-white font-black text-[11px] rounded-lg transition-all cursor-pointer shadow-2xs"
              title="Cadastrar Novo Cliente"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
              <span>Novo</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-90 cursor-pointer ml-0.5"
              title="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            CENTRO: RESULTADOS COMPACTOS (DOBRA A VISIBILIDADE NA TELA)
            ======================================================== */}
        <div
          ref={resultsScrollRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
              void loadMoreDbUsers();
            }
          }}
          className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-2.5"
        >
          
          {/* FONTE 1: BANCO DE DADOS CENTRAL (OFICIAL) */}
          {displayedDbUsers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-[#0B5187] flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-[#0B5187]" />
                  <span>Banco de Dados ({displayedDbUsers.length})</span>
                </span>
                <span className="text-[9.5px] font-bold text-slate-500">
                  {displayedDbUsers.length} {displayedDbUsers.length === 1 ? 'cliente' : 'clientes'}
                </span>
              </div>

              <div className="space-y-1">
                {displayedDbUsers.map((userItem) => {
                  const locRecord = resolveCustomerLocationRecord(userItem);
                  const cityValue = locRecord?.city || locRecord?.cidade || (userItem as any).city || (userItem as any).cidade;
                  const addressValue = locRecord?.address || userItem.address;
                  const city = cityValue || (addressValue ? extractCityFromAddress(addressValue) : '');
                  const orderCount = typeof userItem.orderCount === 'number' ? userItem.orderCount : customerOrderStatsService.getOrderCount(userItem);
                  const hasLocation = Boolean(locRecord && hasCustomerLocation(locRecord));
                  const additionalAddress = locRecord?.additionalAddresses?.find(address =>
                    address.coordinates && hasDetailedAddress(address.address, address.city || city)
                  );
                  const completeAddress = hasDetailedAddress(addressValue, city) ? addressValue : additionalAddress?.address;
                  const localTitle = (locRecord as any)?.local_name
                    || (userItem as any).local_name
                    || additionalAddress?.label
                    || '';
                  const locationName = [...new Set([localTitle, completeAddress].filter(Boolean))].join(' · ');
                  const hasCompleteLocation = hasLocation && hasDetailedAddress(locationName, city);
                  const completeness = checkUserCompleteness({
                    fullName: userItem.fullName,
                    phone: userItem.phone,
                    cpf: userItem.cpf,
                    cnpj: userItem.cnpj
                  });
                  const statusClasses = completeness.isComplete && hasCompleteLocation
                    ? 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-300 hover:border-emerald-400'
                    : !completeness.hasCpf
                      ? 'bg-orange-50 hover:bg-orange-100/70 border-orange-300 hover:border-orange-400'
                      : !hasCompleteLocation
                        ? 'bg-sky-50 hover:bg-sky-100/70 border-sky-300 hover:border-sky-400'
                        : 'bg-orange-50 hover:bg-orange-100/70 border-orange-300 hover:border-orange-400';
                  const avatarColorClass = completeness.isComplete && hasCompleteLocation
                    ? 'bg-emerald-600'
                    : !completeness.hasCpf
                      ? 'bg-orange-500'
                      : !hasCompleteLocation
                        ? 'bg-sky-600'
                        : 'bg-orange-500';
                  const finalCust: Customer = locRecord 
                    ? { ...userItem, address: locRecord.address || userItem.address, coordinates: locRecord.coordinates, city: city || locRecord.city, cidade: city || locRecord.cidade, orderCount } 
                    : { ...userItem, city: city || (userItem as any).city, cidade: city || (userItem as any).cidade, orderCount };

                  return (
                    <div
                      key={userItem.id}
                      onClick={() => {
                        if (openCustomerMenuId) {
                          setOpenCustomerMenuId(null);
                          return;
                        }
                        onSelectCustomer(finalCust);
                      }}
                      title={`${userItem.fullName} • ${orderCount} pedidos`}
                      className={`w-full text-left px-2.5 py-1.5 sm:py-2 rounded-xl transition-all flex items-center justify-between gap-2 group cursor-pointer shadow-2xs border ${statusClasses}`}
                    >
                      {/* Avatar compacto e informações essenciais */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${avatarColorClass} font-black text-xs flex items-center justify-center shrink-0 shadow-2xs text-white`}>
                          {userItem.fullName.charAt(0).toUpperCase()}
                          {(isValidTaxId(userItem.cpf) || isValidTaxId(userItem.cnpj)) && (
                            <span
                              className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white"
                              title="CPF/CNPJ verificado"
                              aria-label="CPF/CNPJ verificado"
                            >
                              <Check className="h-2.5 w-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Nome do contato e selo de CPF */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-extrabold text-xs sm:text-[13px] text-slate-900 group-hover:text-[#0B5187] truncate leading-tight min-w-0 flex-1">
                              {userItem.fullName}
                            </span>
                          </div>

                          {/* Local completo em destaque ou cidade quando ainda falta endereço */}
                          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] font-semibold">
                            {hasCompleteLocation && locationName ? (
                              <span className="inline-flex min-w-0 items-center gap-1 truncate text-emerald-700" title={locationName}>
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{locationName}</span>
                              </span>
                            ) : city ? (
                              <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold text-slate-500" title={`Cidade: ${city}`}>
                                <MapPin className="w-3 h-3 shrink-0 text-[#FF5E00]" />
                                <span className="truncate">{city}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Local, histórico, edição e seleção */}
                      <div className="shrink-0 flex items-center gap-1 sm:gap-1.5">
                        {!hasCompleteLocation && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCustomerLocationModal({
                                customerId: userItem.id,
                                customerName: userItem.fullName,
                                customerPhone: userItem.phone,
                                place: selectedPlace || undefined,
                                placeId: selectedPlace?.id || undefined,
                                autoFocusSearch: true
                              });
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100"
                            title={hasLocation ? 'Completar endereço do cliente' : 'Adicionar localização do cliente'}
                            aria-label={hasLocation ? 'Completar endereço do cliente' : 'Adicionar localização do cliente'}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Botão HISTÓRICO (Com quantidade de pedidos) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryCustomer(finalCust);
                          }}
                          className={`h-7 ${orderCount > 0 ? 'px-2 gap-1' : 'w-7 px-0'} rounded-lg bg-sky-50 hover:bg-sky-100 active:scale-95 text-sky-800 border border-sky-200 flex items-center justify-center shadow-2xs transition-all cursor-pointer`}
                          title={orderCount > 0 ? `Ver histórico: ${orderCount} ${orderCount === 1 ? 'pedido' : 'pedidos'}` : "Ver histórico de pedidos feitos por este cliente"}
                          aria-label="Ver histórico de pedidos"
                        >
                          <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          {orderCount > 0 && (
                            <span className="text-[10px] font-black text-sky-900 leading-none">
                              {orderCount}
                            </span>
                          )}
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenCustomerMenuId(current => current === String(userItem.id) ? null : String(userItem.id));
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs transition-colors hover:bg-slate-100"
                            title="Ações do cliente"
                            aria-label="Ações do cliente"
                            aria-expanded={openCustomerMenuId === String(userItem.id)}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openCustomerMenuId === String(userItem.id) && (
                            <div
                              className="absolute right-0 top-full z-50 mt-1 min-w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {hasCompleteLocation && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenCustomerMenuId(null);
                                    openCustomerLocationModal({
                                      customerId: userItem.id,
                                      customerName: userItem.fullName,
                                      customerPhone: userItem.phone,
                                      place: selectedPlace || undefined,
                                      placeId: selectedPlace?.id || undefined,
                                      autoFocusSearch: true
                                    });
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-sky-800 hover:bg-sky-50"
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                  Alterar local
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenCustomerMenuId(null);
                                  onOpenRegistration(userItem);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              <button
                                type="button"
                                disabled={!userItem.phone}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCustomerWhatsApp(userItem.phone);
                                  setOpenCustomerMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                WhatsApp
                              </button>
                              {canDeleteCustomer && /^\d+$/.test(normalizeCustomerId(userItem.id)) && (
                                <button
                                  type="button"
                                  disabled={deletingCustomerId === String(userItem.id)}
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    const confirmed = window.confirm(
                                      `Excluir o cadastro de ${userItem.fullName}? Os pedidos existentes não serão apagados.`
                                    );
                                    if (!confirmed) return;

                                    setDeletingCustomerId(String(userItem.id));
                                    try {
                                      const deleted = await deleteCustomer(userItem.id);
                                      setOpenCustomerMenuId(null);
                                      if (!deleted) window.alert('Não foi possível excluir o cliente do banco de dados.');
                                    } catch {
                                      window.alert('Não foi possível excluir o cliente do banco de dados.');
                                    } finally {
                                      setDeletingCustomerId(null);
                                    }
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
                                >
                                  {deletingCustomerId === String(userItem.id)
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Trash2 className="h-3.5 w-3.5" />}
                                  Excluir cliente
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* INDICADOR DE CARREGAMENTO DO BANCO DE DADOS */}
          {isSearchingDb && (
            <div className="py-2 px-3 bg-[#E8F2FA] border border-[#0B5187]/20 rounded-xl flex items-center justify-center gap-2 text-[#0B5187] text-xs font-bold animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0B5187]" />
              <span>Consultando banco de dados oficial...</span>
            </div>
          )}

          {/* CASO NADA SEJA ENCONTRADO NA BUSCA */}
          {displayedDbUsers.length === 0 && !isSearchingDb && !isLoadingMoreDbUsers && !hasMoreDbUsers && (
            <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#FF5E00] flex items-center justify-center mx-auto mb-2">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                Nenhum cliente cadastrado encontrado para "{searchTerm}"
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-xs mx-auto">
                Não consta no Banco de Dados. Você pode buscar na agenda de contatos ou cadastrar agora:
              </p>
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleOpenPhoneAgenda}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-50 hover:bg-sky-100 active:scale-95 text-sky-800 border border-sky-300 font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                  <span>Buscar na Agenda</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenRegistration({ fullName: searchTerm })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF5E00] hover:bg-[#E05300] active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Cadastrar "{searchTerm || 'Novo Cliente'}"</span>
                </button>
              </div>
            </div>
          )}

          {isLoadingMoreDbUsers && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0B5187]" />
              Carregando mais clientes...
            </div>
          )}
          <div ref={resultsSentinelRef} className={hasMoreDbUsers ? 'h-2' : 'h-0'} aria-hidden="true" />
        </div>

        {/* ========================================================
            RODAPÉ / PARTE INFERIOR: INPUT DA BUSCA DE CLIENTES + CONTADOR
            ======================================================== */}
        <div className="px-3 pt-2.5 pb-3 bg-white border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] shrink-0 space-y-2">
          {/* Campo de Busca de Clientes Posicionado na Parte Inferior */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#0B5187]">
              <Search className="w-4 h-4 stroke-[2.3]" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, telefone, cidade ou CPF..."
              className="w-full pl-9 pr-8 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20 rounded-xl text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Limpar pesquisa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quantidade de Clientes e Agenda Nativa */}
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-0.5">
            <span className="text-[11px] font-semibold text-slate-600">
              {displayedDbUsers.length} {displayedDbUsers.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}
            </span>
            {hasNativeContactsApi && (
              <button
                type="button"
                onClick={handleImportNativeContacts}
                className="inline-flex items-center gap-1 text-[11px] text-[#0B5187] font-bold hover:underline cursor-pointer"
              >
                <Smartphone className="w-3 h-3 text-[#0B5187]" />
                <span>Contatos do Aparelho</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* MODAL COMPLETO DA AGENDA TELEFÔNICA */}
      {isPhoneAgendaModalOpen && (
        <PhoneAgendaModal
          isOpen={isPhoneAgendaModalOpen}
          onClose={() => setIsPhoneAgendaModalOpen(false)}
          targetRoleLabel={isResponsible ? 'Responsável' : 'Cliente'}
          targetType={isResponsible ? 'entrega' : 'coleta'}
          onSelectContact={(contact) => {
            setIsPhoneAgendaModalOpen(false);
            handleSelectAgendaContact({
              id: `agenda-${Date.now()}`,
              name: contact.name,
              phone: contact.phone,
              address: 'Goiânia - GO',
              source: 'agenda'
            });
          }}
        />
      )}

      {/* MODAL COMPLETO DE HISTÓRICO DE PEDIDOS DO CLIENTE (ORDENADO PELOS LOCAIS MAIS FEITOS) */}
      {historyCustomer && (
        <CustomerOrderHistoryFullScreen
          isOpen={!!historyCustomer}
          onClose={() => setHistoryCustomer(null)}
          customer={historyCustomer}
          orders={customerPastOrdersList}
          isDriver={isDriverRole}
          onRepeatOrder={handleRepeatOrderFromHistory}
        />
      )}
    </div>
  );
};
