import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  X, 
  MapPin, 
  Clock, 
  ArrowRight, 
  Navigation, 
  Loader2, 
  ShoppingBag, 
  UserCheck, 
  CheckCircle2, 
  Check,
  User,
  Plus,
  Database
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { reverseGeocode, searchAddress, isGoogleMapsUrl, resolveGoogleMapsUrl } from '../../services/geocodingService';
import { Place, OperationType } from '../../types/map';
import { Customer, AgendaContact } from '../../types/customer';
import { useBackButton } from '../../hooks/useBackButton';
import { CustomerSelectorDrawer } from '../customer/CustomerSelectorDrawer';
import { CustomerFormFullScreen } from '../customer/CustomerFormFullScreen';
import { isUnnamedOrGenericPlace, getCustomerPlaceName } from '../../utils/customerLocationUtils';
import { recordPlaceUsage } from '../../utils/mostUsedPlaces';
import { normalizeCityName, resolveCustomerCity } from '../../utils/addressUtils';
import { placeService } from '../../services/placeService';

interface FloatingSearchBarProps {
  dropdownDirection?: 'up' | 'down';
  onSelectPlace?: (place: Place) => void;
  onGetLocation?: () => void;
  placeholder?: string;
  isLocating?: boolean;
  autoFocus?: boolean;
}

async function findCityForPlace(place: Place, address: string): Promise<string | undefined> {
  const placeCity = resolveCustomerCity({ ...place, address });
  if (placeCity) return placeCity;

  try {
    return resolveCustomerCity(await reverseGeocode(place.coordinates));
  } catch {
    return undefined;
  }
}

export const FloatingSearchBar: React.FC<FloatingSearchBarProps> = ({ 
  dropdownDirection = 'up',
  onSelectPlace,
  onGetLocation,
  placeholder = 'Pesquise endereço, local ou cidade...',
  isLocating = false,
  autoFocus = false
}) => {
  const {
    searchQuery: globalSearchQuery,
    setSearchQuery: setGlobalSearchQuery,
    searchHistory,
    addToHistory,
    flyToLocation,
    setSelectedPlace,
    openNewOrderForm,
    customers,
    updateCustomer,
    persistCustomer,
    operationsFilter,
    currentRole
  } = useMapStore();

  const isDriverRole = currentRole === 'motorista';

  const isEmbedded = Boolean(onSelectPlace);
  const [localQuery, setLocalQuery] = useState('');
  const query = isEmbedded ? localQuery : globalSearchQuery;
  const setQuery = isEmbedded ? setLocalQuery : setGlobalSearchQuery;

  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchSeqRef = useRef<number>(0);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Estados para o diálogo de ação ao selecionar localização na busca principal
  const [pendingPlace, setPendingPlace] = useState<Place | null>(null);
  const [isActionPromptOpen, setIsActionPromptOpen] = useState(false);
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [registrationInitialData, setRegistrationInitialData] = useState<Partial<Customer> | AgendaContact | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [updatedCustomerInfo, setUpdatedCustomerInfo] = useState<{ customer: Customer; place: Place } | null>(null);

  useBackButton('floating-search-bar', isOpen || query.length > 0, () => {
    setIsOpen(false);
    setQuery('');
    if (inputRef.current) inputRef.current.blur();
  }, 40);

  useBackButton('search-action-prompt', isActionPromptOpen, () => {
    setIsActionPromptOpen(false);
  }, 45);

  // Click outside listener to close dropdown (suporte a mouse e touch em mobile)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Foco automático quando solicitado
  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const createDraftOrderFromPlace = (place: Place): Place => {
    const tempId = `pedido-${Date.now()}`;
    const orderCode = `EZ-${Math.floor(1000 + Math.random() * 9000)}-GO`;
    const curOps = operationsFilter;
    const initialOp: OperationType = curOps?.coleta ? 'coleta' : curOps?.entrega ? 'entrega' : curOps?.troca ? 'troca' : 'coleta';
    const isGeneric = isUnnamedOrGenericPlace(place);
    const finalName = (isGeneric && place.customerName) ? getCustomerPlaceName(place.customerName) : (place.name || 'Local Selecionado');

    return {
      id: tempId,
      orderCode,
      name: finalName,
      address: place.address || place.name || 'Endereço selecionado',
      coordinates: place.coordinates,
      operationType: initialOp,
      vehicleType: 'moto',
      packageType: 'caixa',
      orderDateBadge: 'hoje',
      customerName: place.customerName || '',
      customerPhone: place.customerPhone || '',
      sellerName: '',
      sellerPhone: '',
      managerName: '',
      managerPhone: '',
      responsibleName: '',
      responsiblePhone: '',
      observations: '',
      driverNotes: '',
      openNow: place.openNow ?? true,
      closingTime: place.closingTime,
      rating: place.rating,
      reviewsCount: place.reviewsCount,
      photos: place.photos || [],
      description: place.description || place.address,
      pickupAddress: initialOp === 'coleta' ? place.address : undefined,
      pickupCoordinates: initialOp === 'coleta' ? place.coordinates : undefined,
      deliveryAddress: initialOp === 'entrega' ? place.address : undefined,
      deliveryCoordinates: initialOp === 'entrega' ? place.coordinates : undefined,
      exchangeAddress: initialOp === 'troca' ? place.address : undefined,
      exchangeCoordinates: initialOp === 'troca' ? place.coordinates : undefined
    };
  };

  const handleSelectPlace = (place: Place) => {
    const isGeneric = isUnnamedOrGenericPlace(place);
    const placeToUse = (isGeneric && place.customerName) 
      ? { ...place, name: getCustomerPlaceName(place.customerName) } 
      : place;

    setQuery(placeToUse.name);
    setIsOpen(false);
    if (inputRef.current) inputRef.current.blur();

    // Salva o local no banco de dados na tabela de locais para futuras buscas
    if (placeToUse.coordinates && typeof placeToUse.coordinates.lat === 'number') {
      void placeService.saveLocal({
        name: placeToUse.name,
        endereco: placeToUse.address || placeToUse.name,
        lat: placeToUse.coordinates.lat,
        lng: placeToUse.coordinates.lng,
        cidade: placeToUse.destinationCity || placeToUse.originCity || 'Goiânia',
        link: `https://www.google.com/maps/search/?api=1&query=${placeToUse.coordinates.lat},${placeToUse.coordinates.lng}`
      }).catch(() => null);
    }

    if (onSelectPlace) {
      // Quando estiver embutido em outro modal/etapa de pedido, apenas repassa
      recordPlaceUsage(placeToUse);
      onSelectPlace(placeToUse);
    } else {
      // BUSCA PRINCIPAL: Ao clicar num local das sugestões do Google Maps, abre diretamente o form de detalhes para add
      recordPlaceUsage(placeToUse);
      const draftOrderPlace = createDraftOrderFromPlace(placeToUse);

      addToHistory({
        query: placeToUse.name,
        placeName: placeToUse.address,
        coordinates: placeToUse.coordinates
      });

      flyToLocation(placeToUse.coordinates, 16);
      setSelectedPlace(draftOrderPlace);
    }
  };

  // Execução de busca com cancelamento de respostas antigas
  const executeSearch = useCallback(async (searchQueryStr: string) => {
    const trimmed = searchQueryStr.trim();
    if (!trimmed) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    // Se for link do Google Maps, resolve imediatamente!
    if (isGoogleMapsUrl(trimmed)) {
      setIsLoading(true);
      try {
        const resolved = await resolveGoogleMapsUrl(trimmed);
        if (resolved) {
          handleSelectPlace(resolved);
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (trimmed.length < 3) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const currentSeq = ++searchSeqRef.current;
    setIsLoading(true);

    try {
      const searchRes = await searchAddress(trimmed);
      if (currentSeq === searchSeqRef.current) {
        setResults(searchRes || []);
      }
    } catch (err) {
      if (currentSeq === searchSeqRef.current) {
        setResults([]);
      }
    } finally {
      if (currentSeq === searchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Busca com delay (debounce de 500ms) para aguardar o término da digitação e não disparar requisição a cada letra
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    // Links do Google Maps são resolvidos imediatamente sem delay de digitação
    if (isGoogleMapsUrl(trimmed)) {
      executeSearch(trimmed);
      return;
    }

    // Pequeno delay de 500ms para o usuário terminar de digitar
    searchTimerRef.current = setTimeout(() => {
      executeSearch(trimmed);
    }, 500);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [query, executeSearch]);

  const handleSetPlaceForCustomer = (place: Place) => {
    setQuery(place.name);
    setIsOpen(false);
    if (inputRef.current) inputRef.current.blur();
    setPendingPlace(place);
    setIsCustomerSelectorOpen(true);
  };

  const handleConfirmOpenOrder = () => {
    if (!pendingPlace) return;
    setIsActionPromptOpen(false);
    handleSelectPlace(pendingPlace);
  };

  const handleConfirmSetToCustomer = () => {
    setIsActionPromptOpen(false);
    setIsCustomerSelectorOpen(true);
  };

  const handleSelectCustomerForLocation = async (customer: Customer) => {
    if (!pendingPlace) return;
    const isUnnamed = isUnnamedOrGenericPlace(pendingPlace);
    const finalPlaceName = isUnnamed ? getCustomerPlaceName(customer.fullName) : pendingPlace.name;
    const addressToSet = pendingPlace.address || finalPlaceName;
    const city = await findCityForPlace(pendingPlace, addressToSet) || normalizeCityName(customer.city || customer.cidade);

    const saved = await updateCustomer(customer.id, {
      address: addressToSet,
      coordinates: pendingPlace.coordinates,
      ...(city ? { city, cidade: city } : {})
    });
    if (!saved) {
      window.alert('Não foi possível salvar o endereço do cliente no banco de dados. Verifique a conexão e tente novamente.');
      return;
    }

    const updatedPlace: Place = {
      ...pendingPlace,
      name: finalPlaceName,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      customerId: customer.id,
      customerAddress: addressToSet,
      customerCoordinates: pendingPlace.coordinates,
      destinationCity: city || pendingPlace.destinationCity
    };

    setUpdatedCustomerInfo({ customer, place: updatedPlace });
    setIsCustomerSelectorOpen(false);
    setSuccessToast(`Endereço "${addressToSet}" definido para ${customer.fullName}!`);
    setTimeout(() => {
      setSuccessToast(null);
      setUpdatedCustomerInfo(null);
    }, 6000);
  };

  const handleOpenRegistration = (initialData?: Partial<Customer> | AgendaContact) => {
    setRegistrationInitialData({
      ...initialData,
      address: pendingPlace?.address || pendingPlace?.name || initialData?.address,
      coordinates: pendingPlace?.coordinates
    });
    setIsRegistrationOpen(true);
  };

  const handleSaveNewCustomer = async (newCustomer: Customer) => {
    const isUnnamed = isUnnamedOrGenericPlace(pendingPlace);
    const finalPlaceName = isUnnamed ? getCustomerPlaceName(newCustomer.fullName) : (pendingPlace?.name || newCustomer.address);
    const addressToSet = pendingPlace?.address || pendingPlace?.name || newCustomer.address;
    const city = pendingPlace
      ? await findCityForPlace(pendingPlace, addressToSet)
      : resolveCustomerCity({ ...newCustomer, address: addressToSet });
    const finalCity = city || normalizeCityName(newCustomer.city || newCustomer.cidade);

    const customerToSave: Customer = {
      ...newCustomer,
      fullName: newCustomer.fullName,
      phone: newCustomer.phone,
      cpf: newCustomer.cpf,
      address: addressToSet,
      coordinates: pendingPlace?.coordinates || newCustomer.coordinates,
      ...(finalCity ? { city: finalCity, cidade: finalCity } : {}),
    };
    const savedCustomer = await persistCustomer(customerToSave);
    if (!savedCustomer) {
      window.alert('Não foi possível salvar o cliente no banco de dados. Verifique a conexão e tente novamente.');
      return;
    }

    const placeForInfo: Place = pendingPlace 
      ? {
          ...pendingPlace,
          name: finalPlaceName,
          customerName: savedCustomer.fullName,
          customerPhone: savedCustomer.phone,
          customerId: savedCustomer.id,
          destinationCity: finalCity,
          customerAddress: addressToSet,
          customerCoordinates: pendingPlace.coordinates
        }
      : { 
          id: `temp-${Date.now()}`, 
          name: finalPlaceName, 
          address: newCustomer.address, 
          coordinates: newCustomer.coordinates || { lat: -16.6869, lng: -49.2648 },
          customerName: savedCustomer.fullName,
          customerPhone: savedCustomer.phone,
          customerId: savedCustomer.id
        };

    setUpdatedCustomerInfo({ 
      customer: savedCustomer,
      place: placeForInfo 
    });
    setIsRegistrationOpen(false);
    setIsCustomerSelectorOpen(false);
    setSuccessToast(`Cliente ${savedCustomer.fullName} cadastrado com esta localização!`);
    setTimeout(() => {
      setSuccessToast(null);
      setUpdatedCustomerInfo(null);
    }, 6000);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (isGoogleMapsUrl(pasted)) {
      e.preventDefault();
      setQuery(pasted);
      setIsLoading(true);
      try {
        const resolved = await resolveGoogleMapsUrl(pasted);
        if (resolved) {
          handleSelectPlace(resolved);
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSelectHistory = (historyQuery: string) => {
    setQuery(historyQuery);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchSeqRef.current++;
    setQuery('');
    setResults([]);
    setIsLoading(false);
    inputRef.current?.focus();
  };

  const isOpeningUp = dropdownDirection === 'up';
  const hasDropdownContent = results.length > 0 || (query && !isLoading && results.length === 0) || (searchHistory.length > 0 && !query) || (isLoading && query);

  return (
    <div
      ref={searchContainerRef}
      className="relative w-full max-w-md sm:max-w-xl transition-all duration-200"
    >
      {/* Toast informativo de sucesso */}
      {successToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md bg-emerald-600 text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <CheckCircle2 className="w-5 h-5 stroke-[2.5] text-emerald-200 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-black leading-tight truncate">
                Localização Vinculada!
              </p>
              <p className="text-[11px] text-emerald-100 font-medium truncate mt-0.5">
                {successToast}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {updatedCustomerInfo && !isDriverRole && (
              <button
                type="button"
                onClick={() => {
                  const placeWithCustomer: Place = {
                    ...updatedCustomerInfo.place,
                    customerName: updatedCustomerInfo.customer.fullName,
                    customerPhone: updatedCustomerInfo.customer.phone
                  };
                  setSelectedPlace(placeWithCustomer);
                  openNewOrderForm(placeWithCustomer);
                  setSuccessToast(null);
                  setUpdatedCustomerInfo(null);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white text-emerald-800 text-[11px] font-black shadow-xs hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                Abrir Pedido
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSuccessToast(null);
                setUpdatedCustomerInfo(null);
              }}
              className="p-1 rounded-lg hover:bg-emerald-700 text-emerald-100 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Brand Search Box */}
      <div
        className={`flex items-center w-full h-12 sm:h-14 bg-white text-[#0B5187] rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 border border-[#0B5187]/25 px-2.5 sm:px-4 z-20 ${
          isOpen ? 'ring-2 ring-[#0B5187]/30 border-[#0B5187] shadow-2xl' : ''
        }`}
      >
        {/* Search Icon */}
        <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 text-[#0B5187] shrink-0">
          <Search className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-[#0B5187] stroke-[2.3]" />
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (results.length > 0) {
                handleSelectPlace(results[0]);
              } else if (query.trim().length >= 3) {
                // Cancela o delay pendente e dispara a busca imediatamente ao pressionar Enter
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                executeSearch(query.trim());
              }
            }
          }}
          onPaste={handlePaste}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent px-2 text-xs sm:text-base text-[#0B5187] font-bold placeholder:text-slate-400 focus:outline-none"
        />

        {/* Loader or Clear Button */}
        {isLoading || isLocating ? (
          <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 shrink-0">
            <Loader2 className="w-4 h-4 text-[#0B5187] animate-spin" />
          </div>
        ) : query ? (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-slate-400 hover:text-[#0B5187] hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="Limpar pesquisa"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}

        {/* Action Button: Meu GPS ou Rotas */}
        <button
          type="button"
          onClick={() => {
            if (onGetLocation) {
              onGetLocation();
            } else {
              inputRef.current?.focus();
            }
          }}
          className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 ml-1 rounded-xl bg-[#0B5187] text-white hover:bg-[#083D66] active:scale-95 transition-all shadow-md shrink-0 cursor-pointer"
          title={onGetLocation ? "Usar minha localização GPS atual" : "Pesquisar endereço no mapa"}
        >
          <Navigation className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Floating Dropdown Results */}
      {isOpen && hasDropdownContent && (
        <div
          className={`absolute left-0 right-0 z-30 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-150 ${
            isOpeningUp 
              ? 'bottom-full mb-2 max-h-[42vh] flex flex-col-reverse' 
              : 'top-full mt-2 max-h-[42vh] flex flex-col'
          }`}
        >
          <div className="overflow-y-auto divide-y divide-slate-100 overscroll-contain">
            {/* Loading Indicator */}
            {isLoading && (
              <div className="p-4 flex items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 text-[#0B5187] animate-spin" />
                <span className="text-sm font-semibold">Buscando endereço...</span>
              </div>
            )}

            {/* Results List */}
            {results.length > 0 && (
              <div className="py-1">
                {results.map((place) => {
                  const isDatabasePlace = /local cadastrado/i.test(place.category || '');
                  return (
                    <div
                      key={place.id}
                      onClick={() => handleSelectPlace(place)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#F0F6FB] transition-colors group cursor-pointer border-b border-slate-100 last:border-none"
                    >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="relative w-8 h-8 rounded-md bg-[#0B5187] text-white flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-all shadow-xs">
                        <MapPin className="w-4 h-4 text-sky-300" />
                        {isDatabasePlace && (
                          <span
                            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white"
                            title="Local salvo no banco"
                            aria-label="Local salvo no banco"
                          >
                            <Database className="h-2 w-2" />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="min-w-0 flex-1 truncate text-sm font-black text-[#0B5187] sm:text-base">
                            {place.name}
                          </p>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 truncate mt-0.5 font-semibold">
                          {place.address}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetPlaceForCustomer(place);
                        }}
                        className="px-2 py-1 bg-blue-50 hover:bg-blue-100 active:scale-95 text-[#0B5187] border border-blue-200/90 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        title="Vincular endereço diretamente a um cliente"
                      >
                        <User className="w-3 h-3 text-[#0B5187]" />
                        <span className="hidden sm:inline">Setar Cliente</span>
                      </button>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-[#FF5E00] bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200/80 group-hover:bg-[#FF5E00] group-hover:text-white transition-all shadow-2xs">
                        <span>+ Add</span>
                        <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* No Results Fallback */}
            {query && !isLoading && results.length === 0 && (
              <div className="p-6 text-center text-slate-500">
                <p className="text-sm font-semibold text-[#0B5187]">Nenhum endereço encontrado</p>
                <p className="text-xs text-slate-400 mt-1">
                  Tente digitar o nome de uma rua, bairro, cidade ou cole o link do Google Maps.
                </p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL DE DECISÃO: ABRIR PEDIDO OU SETAR PARA UM CLIENTE */}
      {isActionPromptOpen && pendingPlace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 pointer-events-auto">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
            
            {/* Cabeçalho */}
            <div className="bg-[#0B5187] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#FF5E00] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <MapPin className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black tracking-tight leading-tight">
                    Localização Selecionada
                  </h3>
                  <p className="text-[11px] text-blue-100 font-medium truncate">
                    Escolha a ação para este endereço
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsActionPromptOpen(false);
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Fechar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Prévia do Endereço Selecionado */}
            <div className="p-4 sm:p-5 space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-left">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#0B5187] flex items-center justify-center shrink-0 mt-0.5">
                    <Navigation className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 leading-tight">
                      {pendingPlace.name}
                    </p>
                    <p className="text-xs text-slate-600 font-medium mt-1 leading-snug">
                      {pendingPlace.address}
                    </p>
                    {pendingPlace.coordinates && (
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 font-mono">
                        <MapPin className="w-3 h-3 text-[#FF5E00]" />
                        <span>{pendingPlace.coordinates.lat.toFixed(5)}, {pendingPlace.coordinates.lng.toFixed(5)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 text-left">
                  O que você deseja fazer?
                </p>

                {/* Opção 1: Abrir Pedido (Apenas não-motorista) */}
                {!isDriverRole && (
                  <button
                    type="button"
                    onClick={handleConfirmOpenOrder}
                    className="w-full p-3.5 rounded-2xl border-2 border-orange-200 hover:border-[#FF5E00] bg-gradient-to-r from-orange-50/70 to-amber-50/50 hover:from-orange-50 hover:to-amber-50 text-slate-800 flex items-center justify-between gap-3.5 transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-[0.99] text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-xl bg-[#FF5E00] group-hover:bg-[#E05300] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
                        <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-slate-900 leading-tight">
                            Abrir Pedido
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-wider bg-[#FF5E00] text-white px-1.5 py-0.2 rounded-md">
                            Encomenda
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-0.5">
                          Criar nova coleta ou entrega neste endereço
                        </p>
                      </div>
                    </div>

                    <ArrowRight className="w-5 h-5 text-[#FF5E00] group-hover:translate-x-1 transition-transform shrink-0" />
                  </button>
                )}

                {/* Opção 2: Setar para um Cliente */}
                <button
                  type="button"
                  onClick={handleConfirmSetToCustomer}
                  className="w-full p-3.5 rounded-2xl border-2 border-blue-200 hover:border-[#0B5187] bg-gradient-to-r from-blue-50/70 to-indigo-50/50 hover:from-blue-50 hover:to-indigo-50 text-slate-800 flex items-center justify-between gap-3.5 transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-[0.99] text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-xl bg-[#0B5187] group-hover:bg-[#083D66] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
                      <UserCheck className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-slate-900 leading-tight">
                          Setar para um Cliente
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-[#0B5187] text-white px-1.5 py-0.2 rounded-md">
                          Cadastro
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium mt-0.5">
                        Definir localização no cadastro de um cliente
                      </p>
                    </div>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[#0B5187] group-hover:translate-x-1 transition-transform shrink-0" />
                </button>
              </div>

              {/* Botão sutil: Apenas ver no mapa */}
              <button
                type="button"
                onClick={() => setIsActionPromptOpen(false)}
                className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Apenas visualizar no mapa
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Drawer de seleção de cliente para vincular à localização */}
      {isCustomerSelectorOpen && (
        <CustomerSelectorDrawer
          isOpen={isCustomerSelectorOpen}
          onClose={() => setIsCustomerSelectorOpen(false)}
          targetField="customer"
          onSelectCustomer={handleSelectCustomerForLocation}
          onOpenRegistration={handleOpenRegistration}
        />
      )}

      {/* Formulário de cadastro de cliente caso deseje cadastrar novo */}
      {isRegistrationOpen && (
        <CustomerFormFullScreen
          isOpen={isRegistrationOpen}
          onClose={() => setIsRegistrationOpen(false)}
          onSaveCustomer={handleSaveNewCustomer}
          initialData={registrationInitialData}
          selectedPlace={pendingPlace}
          targetFieldTitle="Cliente"
        />
      )}
    </div>
  );
};
