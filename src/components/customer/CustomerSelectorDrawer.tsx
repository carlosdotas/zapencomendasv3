import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Search, 
  User, 
  UserCheck, 
  Phone, 
  MapPin, 
  Plus, 
  BookOpen, 
  Check, 
  ArrowRight,
  Database,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
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
import { INITIAL_AGENDA_CONTACTS } from '../../data/mockCustomers';
import { searchDatabaseCustomers } from '../../services/customerSearchService';
import { checkUserCompleteness, formatTaxId } from '../../utils/userCompleteness';
import { api } from '../../services/api';
import { useBackButton } from '../../hooks/useBackButton';
import { PhoneAgendaModal } from './PhoneAgendaModal';
import { useMapStore } from '../../context/MapContext';
import { hasCustomerLocation } from '../../utils/customerLocationUtils';
import { CustomerOrderHistoryFullScreen } from '../order/CustomerOrderHistoryFullScreen';
import { firebaseCompanyService } from '../../services/firebaseCompanyService';
import { PastOrderRecord } from '../order/NewOrderModal';
import { customerOrderStatsService } from '../../services/customerOrderStatsService';

interface CustomerSelectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetField: TargetFieldType;
  onSelectCustomer: (customer: Customer) => void;
  onOpenRegistration: (initialData?: Partial<Customer> | AgendaContact) => void;
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

export const CustomerSelectorDrawer: React.FC<CustomerSelectorDrawerProps> = ({
  isOpen,
  onClose,
  targetField,
  onSelectCustomer,
  onOpenRegistration
}) => {
  useBackButton('customer-selector-drawer', isOpen, onClose, 95);

  const { 
    customers, 
    user,
    currentRole,
    openCustomerLocationModal, 
    selectedPlace,
    allPlaces,
    addNewOrder,
    setSelectedPlace,
    mapInstance
  } = useMapStore();

  const isDriverRole = currentRole === 'motorista' || user?.userRole === 'motorista';

  const [searchTerm, setSearchTerm] = useState('');
  const [agendaContacts, setAgendaContacts] = useState<AgendaContact[]>(INITIAL_AGENDA_CONTACTS);
  const [dbCustomers, setDbCustomers] = useState<Customer[]>([]);
  const [initialDbUsers, setInitialDbUsers] = useState<Customer[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);
  const [isPhoneAgendaModalOpen, setIsPhoneAgendaModalOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Lista de pedidos históricos do cliente ordenada pelos locais mais frequentes
  const customerPastOrdersList = useMemo(() => {
    if (!historyCustomer) return [];
    const list: PastOrderRecord[] = [];
    const custNameNorm = (historyCustomer.fullName || '').toLowerCase().trim();
    const custPhoneDigits = (historyCustomer.phone || '').replace(/\D/g, '');

    // 1. Busca encomendas reais salvas deste cliente no app
    const matches = (allPlaces || []).filter(p => {
      const pName = (p.customerName || '').toLowerCase().trim();
      const pPhone = (p.customerPhone || '').replace(/\D/g, '');
      const pId = p.customerId || '';
      if (historyCustomer.id && pId && pId === historyCustomer.id) return true;
      if (custNameNorm && pName && (pName.includes(custNameNorm) || custNameNorm.includes(pName))) return true;
      if (custPhoneDigits && custPhoneDigits.length >= 8 && pPhone && (pPhone.includes(custPhoneDigits) || custPhoneDigits.includes(pPhone))) return true;
      return false;
    });

    matches.forEach((p, idx) => {
      list.push({
        id: `real-${p.id}`,
        orderCode: p.orderCode || `ZAP-${1000 + idx}`,
        dateStr: p.scheduledDate ? `Agendado: ${p.scheduledDate}` : 'No sistema',
        operationType: p.operationType || 'entrega',
        pickupAddress: p.pickupAddress || p.address || 'Goiânia - GO',
        pickupCoords: p.pickupCoordinates || p.coordinates || { lat: -16.6869, lng: -49.2648 },
        exchangeAddress: p.exchangeAddress,
        exchangeCoords: p.exchangeCoordinates,
        deliveryAddress: p.deliveryAddress || p.address || 'Goiânia - GO',
        deliveryCoords: p.deliveryCoordinates || p.coordinates || { lat: -16.7020, lng: -49.2610 },
        vehicleType: p.vehicleType || 'moto',
        packageType: p.packageType || 'caixa',
        volumesCount: '1 volume',
        responsibleName: p.sellerName || p.responsibleName || 'Central EncomendasZap',
        responsiblePhone: p.sellerPhone || p.responsiblePhone || '(62) 3999-8800',
        observations: p.observations || '',
        price: p.price || 20.0,
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
  }, [historyCustomer, allPlaces]);

  // Ação de repetir pedido do histórico: GERA NOVO PEDIDO NA DATA ATUAL
  const handleRepeatOrderFromHistory = (pastOrder: PastOrderRecord) => {
    if (isDriverRole) return;
    if (!historyCustomer) return;
    const today = new Date().toISOString().split('T')[0];
    const todayFormatted = new Date().toLocaleDateString('pt-BR');

    const newPlace: Place = {
      id: `pedido-${Date.now()}-coleta`,
      orderCode: `ZAP-${Math.floor(1000 + Math.random() * 9000)}`,
      name: `Coleta: ${pastOrder.pickupAddress.split(',')[0]}`,
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
      responsibleName: pastOrder.responsibleName,
      responsiblePhone: pastOrder.responsiblePhone,
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
    if (isOpen) {
      setSearchTerm('');
      setIsSearchingDb(false);

      // Carrega primeiros usuários do banco oficial para já estarem visíveis
      api.listUsers({ limit: 30 })
        .then(res => {
          if (res.success && Array.isArray(res.data)) {
            const mapped: Customer[] = res.data.map(u => ({
              id: `db-user-${u.id}`,
              fullName: (u.name_completo && u.name_completo.trim()) || u.name || 'Usuário Sem Nome',
              phone: (u.phone || '').trim(),
              cpf: (u.cpf || '').trim(),
              address: u.cidade ? `${u.cidade} - GO` : 'Goiânia - GO',
              notes: u.access_level ? `Banco de Dados (${u.access_level})` : 'Banco de Dados',
              orderCount: Number((u as any).orderCount ?? (u as any).pedidos_count ?? (u as any).order_count ?? 0),
              createdAt: Date.now()
            }));
            setInitialDbUsers(customerOrderStatsService.sortCustomersByOrderCount(mapped));
          }
        })
        .catch(err => console.warn('Erro ao carregar usuários iniciais do banco:', err));

      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Normalização para busca insensível a acentos (ex: "joao" acha "João", "conceicao" acha "Conceição")
  const normalize = (text: string = '') =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const cleanSearch = searchTerm.trim().toLowerCase();
  const normSearch = normalize(searchTerm);
  const searchDigits = searchTerm.replace(/\D/g, '');

  const matchesItem = (c: { fullName?: string; name?: string; phone?: string; cpf?: string; address?: string; notes?: string; city?: string; cidade?: string }) => {
    if (!normSearch) return true;
    const nameStr = c.fullName || c.name || '';
    if (normalize(nameStr).includes(normSearch)) return true;

    if (searchDigits.length >= 2) {
      const pDigits = (c.phone || '').replace(/\D/g, '');
      if (pDigits.includes(searchDigits)) return true;
      const cpfDigits = (c.cpf || '').replace(/\D/g, '');
      if (cpfDigits.includes(searchDigits)) return true;
    }

    if (c.cpf && normalize(c.cpf).includes(normSearch)) return true;
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
    if (!cleanSearch) {
      setDbCustomers([]);
      setIsSearchingDb(false);
      return;
    }

    setIsSearchingDb(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchDatabaseCustomers(cleanSearch);
        setDbCustomers(results);
      } catch (err) {
        console.warn('Erro na busca de usuários no banco:', err);
      } finally {
        setIsSearchingDb(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [cleanSearch]);

  // Lista de usuários do Banco de Dados a exibir:
  // Mescla os usuários do banco oficial com clientes já cadastrados/atualizados no app
  const displayedDbUsers = useMemo(() => {
    const baseList = cleanSearch ? dbCustomers : initialDbUsers;
    const localFiltered = normSearch
      ? customers.filter(matchesItem)
      : customers;
    const baseFiltered = normSearch
      ? baseList.filter(matchesItem)
      : baseList;

    const map = new Map<string, Customer>();
    // Clientes do app têm prioridade máxima (pois têm coordenadas e atualizações recentes)
    localFiltered.forEach(c => {
      const key = (c.phone ? c.phone.replace(/\D/g, '') : '') || c.id;
      if (key) map.set(key, c);
    });
    baseFiltered.forEach(u => {
      const key = (u.phone ? u.phone.replace(/\D/g, '') : '') || u.id;
      if (key && !map.has(key)) {
        map.set(key, u);
      }
    });
    const accessible = Array.from(map.values()).filter(c => 
      firebaseCompanyService.canUserAccessCustomer(c, user?.phone)
    );
    // Organiza por ordem de quem tem mais pedidos (decrescente)
    return customerOrderStatsService.sortCustomersByOrderCount(accessible);
  }, [cleanSearch, normSearch, searchDigits, dbCustomers, initialDbUsers, customers, user?.phone]);

  // Resolve se o cliente possui localização cadastrada (diretamente ou salvo na lista de clientes do app)
  const resolveCustomerLocationRecord = (item: { id?: string; phone?: string; coordinates?: any; address?: string }): Customer | null => {
    if (hasCustomerLocation(item as Customer)) return item as Customer;
    const cleanPhone = (item.phone || '').replace(/\D/g, '');
    const match = customers.find(c => {
      if (item.id && c.id === item.id) return true;
      if (cleanPhone && cleanPhone.length >= 8) {
        const cPhone = (c.phone || '').replace(/\D/g, '');
        return cPhone === cleanPhone || cPhone.endsWith(cleanPhone) || cleanPhone.endsWith(cPhone);
      }
      return false;
    });
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop para fechar */}
      <div className="flex-1 cursor-pointer" onClick={onClose} />

      {/* PAINEL INFERIOR: BANCO DE DADOS & AGENDA TELEFÔNICA */}
      <div className="bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 max-h-[88vh] sm:max-h-[82vh] flex flex-col w-full max-w-xl mx-auto overflow-hidden animate-in slide-in-from-bottom duration-250">
        
        {/* TOPO: PUXADOR + CABEÇALHO */}
        <div className="pt-2 pb-1 flex flex-col items-center justify-center shrink-0">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

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
        <div className="flex-1 overflow-y-auto p-2 sm:p-2.5 space-y-2.5 min-h-[160px]">
          
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
                  const city = locRecord?.city || locRecord?.cidade || (userItem as any).city || (userItem as any).cidade || extractCityFromAddress(locRecord?.address || userItem.address);
                  const completeness = checkUserCompleteness({
                    fullName: userItem.fullName,
                    phone: userItem.phone,
                    cpf: userItem.cpf,
                    cnpj: (userItem as any).cnpj
                  });
                  const orderCount = typeof userItem.orderCount === 'number' ? userItem.orderCount : customerOrderStatsService.getOrderCount(userItem);
                  const hasLocation = Boolean(locRecord && hasCustomerLocation(locRecord));
                  const finalCust: Customer = locRecord 
                    ? { ...userItem, address: locRecord.address || userItem.address, coordinates: locRecord.coordinates, city: city || locRecord.city, cidade: city || locRecord.cidade, orderCount } 
                    : { ...userItem, city: city || (userItem as any).city, cidade: city || (userItem as any).cidade, orderCount };

                  return (
                    <div
                      key={userItem.id}
                      onClick={() => onSelectCustomer(finalCust)}
                      title={`${userItem.fullName} • Status: ${completeness.statusLabel} • ${orderCount} pedidos`}
                      className={`w-full text-left px-2.5 py-1.5 sm:py-2 rounded-xl transition-all flex items-center justify-between gap-2 group cursor-pointer shadow-2xs border ${
                        completeness.isComplete
                          ? 'bg-white hover:bg-emerald-50/50 border-slate-200/90 hover:border-emerald-300'
                          : 'bg-white hover:bg-amber-50/50 border-slate-200/90 hover:border-amber-300'
                      }`}
                    >
                      {/* Lado Esquerdo: Avatar Compacto + Informações */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-black text-xs flex items-center justify-center shrink-0 shadow-2xs text-white ${
                          completeness.isComplete ? 'bg-emerald-600' : 'bg-amber-600'
                        }`}>
                          {userItem.fullName.charAt(0).toUpperCase()}
                          
                          {/* Ponto indicador de status */}
                          <span 
                            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                              completeness.isComplete ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                            title={completeness.isComplete ? 'Cadastro Completo' : 'Cadastro Incompleto (Falta CPF)'}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Linha 1: Nome + Badge + Cidade */}
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="font-extrabold text-xs sm:text-[13px] text-slate-900 group-hover:text-[#0B5187] truncate leading-tight">
                              {userItem.fullName}
                            </span>

                            {completeness.isComplete ? (
                              <span className="inline-flex items-center gap-0.5 text-[8.5px] font-black px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Completo</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[8.5px] font-black px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 shrink-0">
                                <AlertCircle className="w-2.5 h-2.5" />
                                <span>Falta CPF</span>
                              </span>
                            )}

                            {city && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200/80 shrink-0" title={`Cidade: ${city}`}>
                                📍 {city}
                              </span>
                            )}
                          </div>

                          {/* Linha 2: Telefone, CPF e Localização */}
                          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-600 mt-0.5 truncate">
                            {userItem.phone ? (
                              <span className="font-bold text-slate-800 shrink-0">{userItem.phone}</span>
                            ) : (
                              <span className="text-rose-600 font-black text-[9.5px] bg-rose-50 px-1 rounded shrink-0">
                                Sem Tel
                              </span>
                            )}

                            {(() => {
                              const docInfo = formatTaxId(userItem.cpf || (userItem as any).cnpj);
                              if (!docInfo.clean) return null;
                              return (
                                <span className="font-mono text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                                  {docInfo.type}: {docInfo.formatted}
                                </span>
                              );
                            })()}

                            <span className="text-slate-300">•</span>

                            {/* Localização Compacta */}
                            {!hasLocation ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCustomerLocationModal({
                                    customerId: userItem.id,
                                    customerName: userItem.fullName,
                                    customerPhone: userItem.phone,
                                    place: selectedPlace || undefined,
                                    placeId: selectedPlace?.id || undefined
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-100 hover:bg-amber-200 active:scale-95 border border-amber-300 text-amber-900 text-[9px] font-black shadow-2xs transition-all cursor-pointer shrink-0"
                                title="Cliente sem localização! Clique para setar o local rápido."
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                <span>Sem Local • Setar</span>
                              </button>
                            ) : (
                              <span 
                                className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded truncate max-w-[150px] sm:max-w-[200px]"
                                title={locRecord?.address || userItem.address || 'Local Definido'}
                              >
                                <MapPin className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                <span className="truncate">
                                  {locRecord?.address || userItem.address || 'Local Definido'}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Botões Histórico + Editar + Selecionar */}
                      <div className="shrink-0 flex items-center gap-1 sm:gap-1.5">
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

                        {/* Botão EDITAR (Apenas ícone) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRegistration(userItem);
                          }}
                          className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-900 border border-amber-300 flex items-center justify-center shadow-2xs transition-all cursor-pointer"
                          title="Editar cadastro deste cliente"
                          aria-label="Editar cadastro do cliente"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                        </button>

                        {/* Ícone de Seleção Rápida */}
                        <button
                          type="button"
                          onClick={() => onSelectCustomer(finalCust)}
                          className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-[#0B5187] text-slate-500 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs cursor-pointer ml-0.5"
                          title="Selecionar este cliente"
                        >
                          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
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
            <div className="py-2 px-3 bg-[#E8F2FA] border border-[#0B5187]/20 rounded-xl flex items-center justify-center gap-2 text-[#0B5187] text-xs font-bold animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0B5187]" />
              <span>Consultando banco de dados oficial...</span>
            </div>
          )}

          {/* CASO NADA SEJA ENCONTRADO NA BUSCA */}
          {displayedDbUsers.length === 0 && !isSearchingDb && (
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
