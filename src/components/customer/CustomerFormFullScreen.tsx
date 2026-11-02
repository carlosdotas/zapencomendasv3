import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Check, 
  User, 
  Phone, 
  FileText, 
  MapPin, 
  Mail, 
  Navigation, 
  AlertCircle, 
  CheckCircle2, 
  ArrowLeft,
  Sparkles,
  BookOpen,
  BookUser,
  Plus,
  Trash2,
  Crosshair
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { Customer, AgendaContact, CustomerAddress } from '../../types/customer';
import { Place } from '../../types/map';
import { reverseGeocode, searchAddress } from '../../services/geocodingService';
import { normalizeCityName, resolveCustomerCity } from '../../utils/addressUtils';
import { useBackButton } from '../../hooks/useBackButton';

interface CustomerFormFullScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCustomer: (customer: Customer) => void;
  initialData?: Partial<Customer> | AgendaContact | null;
  selectedPlace?: Place | null;
  targetFieldTitle: string;
}

export const CustomerFormFullScreen: React.FC<CustomerFormFullScreenProps> = ({
  isOpen,
  onClose,
  onSaveCustomer,
  initialData,
  selectedPlace,
  targetFieldTitle
}) => {
  useBackButton('customer-form-fullscreen', isOpen, onClose, 100);

  const { openCustomerLocationModal } = useMapStore();

  const [contactName, setContactName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | undefined>();
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Múltiplas Localizações do Usuário
  const [additionalAddresses, setAdditionalAddresses] = useState<CustomerAddress[]>([]);
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState('Trabalho');
  const [newAddrText, setNewAddrText] = useState('');

  // Estados de validação e busca de endereço
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<Place[]>([]);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const addressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const addressSeqRef = useRef<number>(0);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  // Foco automático ao abrir o componente de cadastro / localização
  useEffect(() => {
    if (isOpen) {
      const initialName = (initialData && 'fullName' in initialData ? initialData.fullName : initialData && 'name' in initialData ? initialData.name : '') || '';
      const initialAddr = initialData?.address || '';
      const timer = setTimeout(() => {
        if (initialName && !initialAddr) {
          addressInputRef.current?.focus();
        } else if (!initialName) {
          nameInputRef.current?.focus();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialData]);

  // selectedPlace é lido por ref: atualizações em segundo plano não devem apagar o que o usuário digitou
  const selectedPlaceRef = useRef(selectedPlace);
  selectedPlaceRef.current = selectedPlace;

  // Preenche dados iniciais ao abrir
  useEffect(() => {
    const selectedPlace = selectedPlaceRef.current;
    if (isOpen) {
      setErrors({});
      setAddressSuggestions([]);
      setIsAddingNewAddress(false);
      setNewAddrText('');

      if (initialData) {
        // Se veio de um contato da agenda ou dados parciais
        const isAgenda = 'source' in initialData && initialData.source === 'agenda';
        const nameVal = 'fullName' in initialData ? initialData.fullName : 'name' in initialData ? initialData.name : '';
        const contactVal = isAgenda
          ? ('name' in initialData ? initialData.name : '')
          : ('contactName' in initialData ? initialData.contactName : '') || nameVal;
        setContactName(contactVal || '');
        setFullName(isAgenda ? '' : nameVal || '');
        setPhone(initialData.phone || '');
        setEmail(initialData.email || '');
        setNotes(initialData.notes || '');
        setCity(resolveCustomerCity(initialData) || '');

        if ('additionalAddresses' in initialData && Array.isArray(initialData.additionalAddresses)) {
          setAdditionalAddresses(initialData.additionalAddresses);
        } else {
          setAdditionalAddresses([]);
        }

        if ('address' in initialData && initialData.address) {
          setAddress(initialData.address);
          if ('coordinates' in initialData && initialData.coordinates) {
            setCoordinates(initialData.coordinates);
          } else {
            setCoordinates(undefined);
          }
        } else if (selectedPlace?.address) {
          setAddress(selectedPlace.address);
          setCoordinates(selectedPlace.coordinates);
          setCity(resolveCustomerCity(selectedPlace) || '');
        } else {
          setAddress('');
          setCoordinates(undefined);
          setCity('');
        }

        if ('cpf' in initialData && initialData.cpf) {
          setCpf(initialData.cpf);
        } else {
          setCpf('');
        }
      } else {
        setContactName('');
        setFullName('');
        setPhone('');
        setCpf('');
        setEmail('');
        setNotes('');
        setCity('');
        setAdditionalAddresses([]);
        if (selectedPlace?.address) {
          setAddress(selectedPlace.address);
          setCoordinates(selectedPlace.coordinates);
          setCity(resolveCustomerCity(selectedPlace) || '');
        } else {
          setAddress('');
          setCoordinates(undefined);
        }
      }
    }
  }, [isOpen, initialData]);

  // Escuta seleção de contato vinda da Agenda Nativa do Android
  useEffect(() => {
    const handleContactSelected = (e: Event) => {
      const customEvent = e as CustomEvent<{ name?: string; phone?: string }>;
      if (customEvent.detail) {
        const { name, phone: pickedPhone } = customEvent.detail;
        if (name) {
          setContactName(name);
          setErrors(prev => ({ ...prev, contactName: '' }));
        }
        if (pickedPhone) {
          setPhone(formatPhoneMask(pickedPhone));
          setErrors(prev => ({ ...prev, phone: '' }));
        }
      }
    };

    window.addEventListener('contactSelected', handleContactSelected);
    return () => {
      window.removeEventListener('contactSelected', handleContactSelected);
    };
  }, []);

  // Formatação de Telefone: (XX) XXXXX-XXXX
  const formatPhoneMask = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  // Formatação de CPF: 000.000.000-00
  const formatCpfMask = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  };

  // Validação simples de CPF
  const isValidCpf = (rawCpf: string) => {
    const clean = rawCpf.replace(/\D/g, '');
    if (clean.length !== 11) return false;
    // Evita sequências como 111.111.111-11
    if (/^(\d)\1{10}$/.test(clean)) return false;
    return true;
  };

  // Usar localização do ponto selecionado no mapa
  const handleUseCurrentPlaceLocation = () => {
    if (selectedPlace) {
      setAddress(selectedPlace.address);
      setCoordinates(selectedPlace.coordinates);
      setCity(resolveCustomerCity(selectedPlace) || resolveCustomerCity({ address: selectedPlace.address }) || '');
      setErrors(prev => ({ ...prev, address: '' }));
    }
  };

  // Usar GPS atual do dispositivo
  const handleUseDeviceGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada neste dispositivo.');
      return;
    }
    setIsGettingGps(true);

    const applyPos = async (pos: GeolocationPosition) => {
      setIsGettingGps(false);
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoordinates(coords);
      try {
        const res = await searchAddress(`${coords.lat}, ${coords.lng}`);
        if (res && res.length > 0) {
          const resultAddress = res[0].address || res[0].name;
          setAddress(resultAddress);
          setCity(resolveCustomerCity(res[0]) || resolveCustomerCity({ address: resultAddress }) || '');
        } else {
          const reverseResult = await reverseGeocode(coords);
          setAddress(reverseResult.address || `Coordenadas GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
          setCity(resolveCustomerCity(reverseResult) || '');
        }
      } catch {
        setAddress(`Coordenadas GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
      }
      setErrors(prev => ({ ...prev, address: '' }));
    };

    // 1. Tenta fix rápido (cache / antenas)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPos(pos);
        // Refina logo em seguida
        navigator.geolocation.getCurrentPosition(
          (highPos) => applyPos(highPos),
          () => {},
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );
      },
      () => {
        // Fallback com timeout maior
        navigator.geolocation.getCurrentPosition(
          (pos) => applyPos(pos),
          () => {
            setIsGettingGps(false);
            alert('Não foi possível obter a localização do GPS. Verifique as permissões de localização.');
          },
          { enableHighAccuracy: true, timeout: 20000 }
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  // Busca de endereço enquanto digita com delay (500ms) para não buscar a cada tecla
  const handleAddressChange = (val: string) => {
    setAddress(val);
    const detectedCity = resolveCustomerCity({ address: val });
    if (detectedCity) setCity(detectedCity);
    if (addressTimeoutRef.current) {
      clearTimeout(addressTimeoutRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length < 3) {
      setAddressSuggestions([]);
      setIsSearchingAddress(false);
      return;
    }

    const currentSeq = ++addressSeqRef.current;
    addressTimeoutRef.current = setTimeout(async () => {
      setIsSearchingAddress(true);
      try {
        const results = await searchAddress(trimmed);
        if (currentSeq === addressSeqRef.current) {
          setAddressSuggestions(results.slice(0, 4));
        }
      } catch {
        if (currentSeq === addressSeqRef.current) {
          setAddressSuggestions([]);
        }
      } finally {
        if (currentSeq === addressSeqRef.current) {
          setIsSearchingAddress(false);
        }
      }
    }, 500);
  };

  const handleSelectSuggestion = async (place: Place) => {
    const selectedAddress = place.address || place.name;
    let selectedCity = resolveCustomerCity(place) || resolveCustomerCity({ address: selectedAddress });
    if (!selectedCity && place.coordinates) {
      try {
        selectedCity = resolveCustomerCity(await reverseGeocode(place.coordinates));
      } catch {}
    }

    setAddress(selectedAddress);
    setCoordinates(place.coordinates);
    setCity(selectedCity || '');
    setAddressSuggestions([]);
    setErrors(prev => ({ ...prev, address: '' }));
  };

  // Submissão do formulário com validações obrigatórias
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    const isExistingCustomer = Boolean(initialData && 'id' in initialData && initialData.id && !initialData.id.startsWith('agenda-'));

    if (!contactName.trim()) {
      newErrors.contactName = 'O nome de contato é obrigatório';
    }
    if (!fullName.trim()) {
      newErrors.fullName = 'O nome completo é obrigatório';
    } else if (fullName.trim().split(/\s+/).length < 2 && !isExistingCustomer) {
      // Cadastros antigos só têm um nome no banco; não bloqueia a edição deles
      newErrors.fullName = 'Informe nome e sobrenome';
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      newErrors.phone = 'O telefone de contato é obrigatório';
    } else if (cleanPhone.length < 10) {
      newErrors.phone = 'Informe o DDD e telefone válido (mínimo 10 dígitos)';
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    if (!cleanCpf) {
      newErrors.cpf = 'O CPF é obrigatório';
    } else if (!isValidCpf(cpf)) {
      newErrors.cpf = 'CPF inválido. Verifique os 11 dígitos';
    }

    if (!address.trim()) {
      newErrors.address = 'A localização / endereço é obrigatória';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Rola para o primeiro campo com erro
      const firstKey = Object.keys(newErrors)[0];
      const element = document.getElementById(`field-${firstKey}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    let resolvedCity = resolveCustomerCity({ address: address.trim() }) || normalizeCityName(city) ||
      resolveCustomerCity(selectedPlace || {});
    if (!resolvedCity && coordinates) {
      try {
        resolvedCity = resolveCustomerCity(await reverseGeocode(coordinates));
      } catch {}
    }

    const newCustomer: Customer = {
      id: (initialData && 'id' in initialData && initialData.id && !initialData.id.startsWith('agenda-'))
        ? initialData.id
        : `cust-${Date.now()}`,
      fullName: fullName.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      cpf: cpf.trim(),
      address: address.trim(),
      city: resolvedCity,
      cidade: resolvedCity,
      coordinates: coordinates || selectedPlace?.coordinates,
      additionalAddresses: additionalAddresses.filter(a => a.address.trim().length > 0),
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: (initialData && 'createdAt' in initialData && initialData.createdAt) 
        ? initialData.createdAt 
        : Date.now()
    };

    if (window.AndroidApp && window.AndroidApp.saveContact) {
      window.AndroidApp.saveContact(contactName.trim(), phone.trim());
    }

    onSaveCustomer(newCustomer);
  };

  if (!isOpen) return null;

  const isFromAgenda = initialData && 'source' in initialData && initialData.source === 'agenda';

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* HEADER EM TELA CHEIA */}
      <header className="shrink-0 bg-[#0B5187] text-white px-4 sm:px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight leading-tight flex items-center gap-2">
              <span>Cadastro de Cliente</span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-full">
                Tela Cheia
              </span>
            </h1>
            <p className="text-xs text-white/80 font-medium">
              Vinculando como <strong className="text-white underline">{targetFieldTitle}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* AVISO QUANDO IMPORTADO DA AGENDA TELEFÔNICA */}
      {isFromAgenda && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2.5 flex items-center gap-2.5 text-xs text-emerald-900 font-semibold">
          <BookOpen className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Nome e telefone pré-preenchidos a partir da <strong>Agenda Telefônica</strong>. Complete os campos obrigatórios abaixo para salvar.
          </span>
        </div>
      )}

      {/* FORMULÁRIO COM SCROLL */}
      <form 
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-2xl mx-auto w-full flex flex-col gap-5"
      >
        {/* CAMPO 1: NOME DO CONTATO (OBRIGATÓRIO) */}
        <div id="field-contactName" className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
              Nome de Contato (agenda) <span className="text-red-500 font-black">*</span>
            </label>
            {typeof window !== 'undefined' && Boolean(window.AndroidApp?.pickContact) && (
              <button
                type="button"
                onClick={() => {
                  if (window.AndroidApp && window.AndroidApp.pickContact) {
                    window.AndroidApp.pickContact();
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-[#0B5187] bg-[#F0F6FB] hover:bg-[#E1EDF7] rounded-md border border-[#0B5187]/20 transition-all cursor-pointer active:scale-95"
                title="Buscar contato na agenda do aparelho"
              >
                <BookUser className="w-3.5 h-3.5 text-[#0B5187]" />
                <span>Agenda</span>
              </button>
            )}
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              ref={nameInputRef}
              type="text"
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value);
                if (errors.contactName) setErrors(prev => ({ ...prev, contactName: '' }));
              }}
              placeholder="Ex: Carlos Padaria"
              className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none transition-all ${
                errors.contactName 
                  ? 'border-red-400 ring-2 ring-red-100' 
                  : 'border-slate-300 focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20'
              }`}
            />
          </div>
          {errors.contactName && (
            <p className="text-xs font-bold text-red-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errors.contactName}</span>
            </p>
          )}
        </div>

        {/* CAMPO 1.1: NOME COMPLETO (OBRIGATÓRIO) */}
        <div id="field-fullName" className="space-y-1.5">
          <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
            Nome Completo <span className="text-red-500 font-black">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors(prev => ({ ...prev, fullName: '' }));
              }}
              placeholder="Ex: Carlos Eduardo de Oliveira"
              className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none transition-all ${
                errors.fullName 
                  ? 'border-red-400 ring-2 ring-red-100' 
                  : 'border-slate-300 focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20'
              }`}
            />
          </div>
          {errors.fullName && (
            <p className="text-xs font-bold text-red-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errors.fullName}</span>
            </p>
          )}
        </div>

        {/* CAMPO 2: TELEFONE / CONTATO (OBRIGATÓRIO) */}
        <div id="field-phone" className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
              Telefone / WhatsApp <span className="text-red-500 font-black">*</span>
            </label>
            {typeof window !== 'undefined' && Boolean(window.AndroidApp?.pickContact) && (
              <button
                type="button"
                onClick={() => {
                  if (window.AndroidApp && window.AndroidApp.pickContact) {
                    window.AndroidApp.pickContact();
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-[#0B5187] bg-[#F0F6FB] hover:bg-[#E1EDF7] rounded-md border border-[#0B5187]/20 transition-all cursor-pointer active:scale-95"
                title="Buscar contato na agenda do aparelho"
              >
                <BookUser className="w-3.5 h-3.5 text-[#0B5187]" />
                <span>Agenda</span>
              </button>
            )}
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Phone className="w-4 h-4" />
            </div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(formatPhoneMask(e.target.value));
                if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
              }}
              placeholder="(62) 99999-9999"
              className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none transition-all ${
                errors.phone 
                  ? 'border-red-400 ring-2 ring-red-100' 
                  : 'border-slate-300 focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20'
              }`}
            />
          </div>
          {errors.phone && (
            <p className="text-xs font-bold text-red-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errors.phone}</span>
            </p>
          )}
        </div>

        {/* CAMPO 3: CPF (OBRIGATÓRIO) */}
        <div id="field-cpf" className="space-y-1.5">
          <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
            CPF <span className="text-red-500 font-black">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <FileText className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={cpf}
              onChange={(e) => {
                setCpf(formatCpfMask(e.target.value));
                if (errors.cpf) setErrors(prev => ({ ...prev, cpf: '' }));
              }}
              placeholder="000.000.000-00"
              maxLength={14}
              className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none transition-all ${
                errors.cpf 
                  ? 'border-red-400 ring-2 ring-red-100' 
                  : 'border-slate-300 focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20'
              }`}
            />
          </div>
          {errors.cpf && (
            <p className="text-xs font-bold text-red-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errors.cpf}</span>
            </p>
          )}
        </div>

        {/* CAMPO 4: LOCALIZAÇÃO / ENDEREÇO (OBRIGATÓRIO) */}
        <div id="field-address" className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
              Localização / Endereço <span className="text-red-500 font-black">*</span>
            </label>
            <span className="text-[10px] font-bold text-slate-400">
              {coordinates ? '📍 Coordenadas vinculadas' : 'Sem coordenadas'}
            </span>
          </div>

          {/* ATALHOS RÁPIDOS DE LOCALIZAÇÃO */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedPlace && (
              <button
                type="button"
                onClick={handleUseCurrentPlaceLocation}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 active:scale-95 text-[#0B5187] rounded-lg text-xs font-bold border border-blue-200 transition-all cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#0B5187]" />
                <span>Usar local deste ponto ({selectedPlace.name.slice(0, 18)}...)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleUseDeviceGps}
              disabled={isGettingGps}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 transition-all cursor-pointer"
            >
              <Navigation className={`w-3.5 h-3.5 text-emerald-600 ${isGettingGps ? 'animate-spin' : ''}`} />
              <span>{isGettingGps ? 'Obtendo GPS...' : 'Usar meu GPS atual'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                openCustomerLocationModal({
                  customerId: (initialData && 'id' in initialData) ? initialData.id : undefined,
                  customerName: fullName || 'Novo Cliente',
                  customerPhone: phone,
                  place: (coordinates && address) ? {
                    id: 'temp-customer-pos',
                    name: fullName || 'Novo Cliente',
                    address,
                    coordinates
                  } as Place : undefined,
                  onLocationSelected: (newAddr, newCoords, newCity) => {
                    setAddress(newAddr);
                    setCoordinates(newCoords);
                    setCity(normalizeCityName(newCity) || resolveCustomerCity({ address: newAddr }) || '');
                    setErrors(prev => ({ ...prev, address: '' }));
                  }
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-900 rounded-lg text-xs font-bold border border-amber-300 transition-all cursor-pointer"
              title="Abrir mapa em tela cheia para buscar endereço e ajustar posição"
            >
              <Crosshair className="w-3.5 h-3.5 text-amber-700" />
              <span>Ajustar no Mapa</span>
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <MapPin className="w-4 h-4" />
            </div>
            <input
              ref={addressInputRef}
              type="text"
              value={address}
              onChange={(e) => handleAddressChange(e.target.value)}
              placeholder="Digite o endereço completo, rua, número, setor, cidade..."
              className={`w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none transition-all ${
                errors.address 
                  ? 'border-red-400 ring-2 ring-red-100' 
                  : 'border-slate-300 focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20'
              }`}
            />
          </div>

          {/* SUGESTÕES DE AUTO-COMPLETAR ENDEREÇO */}
          {addressSuggestions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden divide-y divide-slate-100">
              {addressSuggestions.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-start gap-2 text-xs transition-colors cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#0B5187] mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 block">{item.name}</span>
                    <span className="text-[11px] text-slate-500 font-medium block">{item.address}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {errors.address && (
            <p className="text-xs font-bold text-red-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errors.address}</span>
            </p>
          )}

          <p className="text-[11px] font-medium text-slate-500">
            Cidade detectada: <span className="font-bold text-slate-700">{city || 'selecione uma localização'}</span>
          </p>

          {/* MÚLTIPLAS LOCALIZAÇÕES / OUTROS ENDEREÇOS DO CLIENTE */}
          <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                  Outras Localizações do Usuário
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Aceita várias localizações (Trabalho, Filial, Depósito, Casa, etc.)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNewAddress(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0B5187] hover:bg-[#083D66] active:scale-95 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Local</span>
              </button>
            </div>

            {/* Lista de Endereços Adicionais Cadastrados */}
            {additionalAddresses.length > 0 && (
              <div className="space-y-1.5">
                {additionalAddresses.map((item, idx) => (
                  <div 
                    key={item.id || idx}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-blue-100 text-[#0B5187] px-2 py-0.5 rounded-md shrink-0 mt-0.5">
                        {item.label || 'Outro'}
                      </span>
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {item.address}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAdditionalAddresses(prev => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-600 p-1 transition-colors cursor-pointer shrink-0"
                      title="Remover localização"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulário Inline para Adicionar Outro Endereço */}
            {isAddingNewAddress && (
              <div className="p-3 bg-blue-50/70 border-2 border-dashed border-[#0B5187]/40 rounded-xl space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#0B5187]">Nova Localização:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNewAddress(false);
                      setNewAddrText('');
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                {/* Seletores rápidos de Tipo de Local */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['Trabalho', 'Casa', 'Filial', 'Depósito', 'Escritório', 'Outro'].map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setNewAddrLabel(lbl)}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                        newAddrLabel === lbl
                          ? 'bg-[#0B5187] text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newAddrText}
                    onChange={(e) => setNewAddrText(e.target.value)}
                    placeholder="Endereço desta localização..."
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-[#0B5187]"
                  />
                  <button
                    type="button"
                    disabled={!newAddrText.trim()}
                    onClick={() => {
                      if (!newAddrText.trim()) return;
                      setAdditionalAddresses(prev => [
                        ...prev,
                        {
                          id: `addr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                          label: newAddrLabel,
                          address: newAddrText.trim()
                        }
                      ]);
                      setNewAddrText('');
                      setIsAddingNewAddress(false);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer shrink-0"
                  >
                    Salvar Local
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CAMPO 5: EMAIL (OPCIONAL) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
            E-mail <span className="text-slate-400 font-normal">(Opcional)</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20 transition-all"
            />
          </div>
        </div>

        {/* CAMPO 6: OBSERVAÇÕES (OPCIONAL) */}
        <div className="space-y-1.5">
          <label className="block text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
            Observações <span className="text-slate-400 font-normal normal-case">(Opcional)</span>
          </label>
          
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anotações gerais sobre o cliente..."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-base font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20 transition-all"
          />
        </div>

        <div className="h-4" />
      </form>

      {/* FOOTER FIXO COM BOTÕES DE AÇÃO */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-4 shadow-lg flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 max-w-sm inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#FF5E00] hover:bg-[#E05300] active:scale-[0.98] text-white font-black text-sm rounded-xl shadow-md transition-all cursor-pointer"
        >
          <Check className="w-5 h-5 stroke-[2.8]" />
          <span>Salvar e Vincular ao Ponto</span>
        </button>
      </footer>
    </div>
  );
};
