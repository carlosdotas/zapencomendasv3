import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  BookUser, 
  FileText, 
  MapPin, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowDownToLine,
  Package,
  Repeat
} from 'lucide-react';
import { OperationType, LocationCoordinates } from '../../types/map';
import { Customer } from '../../types/customer';
import { OrderScheduleModal } from './OrderScheduleModal';
import { extractCityFromAddress } from '../../utils/addressUtils';

interface OrderScheduleResponsibleStepProps {
  operationType: OperationType;
  selectedCustomer: Customer | null;

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
  onBackToLocations: () => void;
  onChangeCustomer: () => void;
}

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatIsoToBr = (isoStr?: string) => {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoStr;
};

// Formatação amigável de telefone brasileiro (XX) XXXXX-XXXX
const formatPhoneNumber = (val: string) => {
  const digits = val.replace(/\D/g, '');
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

export const OrderScheduleResponsibleStep: React.FC<OrderScheduleResponsibleStepProps> = ({
  operationType,
  selectedCustomer,

  pickupAddress,
  pickupContact,
  pickupPhone,
  pickupNotes,
  pickupDate,
  pickupTime,
  pickupTimeMode,
  onUpdatePickup,

  deliveryAddress,
  deliveryContact,
  deliveryPhone,
  deliveryNotes,
  deliveryDate,
  deliveryTime,
  deliveryTimeMode,
  onUpdateDelivery,

  exchangeAddress,
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
  onBackToLocations,
  onChangeCustomer
}) => {
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const todayStr = getTodayDateString();

  const activeConfig = {
    coleta: {
      address: pickupAddress,
      contact: pickupContact,
      phone: pickupPhone,
      notes: pickupNotes,
      date: pickupDate || todayStr,
      time: pickupTime || '',
      timeMode: pickupTimeMode || 'ate',
      timePrefixAte: 'Pegar até',
      timePrefixApos: 'Pegar após',
      contactErrorKey: 'pickupContact',
      dateErrorKey: 'pickupDate',
      label: 'Local de Coleta',
      sublabel: 'Onde retirar a encomenda',
      role: 'Responsável na Coleta',
      themeColor: '#0B5187',
      bgLight: 'bg-blue-50/70',
      borderLight: 'border-blue-200',
      icon: ArrowDownToLine,
      update: onUpdatePickup
    },
    entrega: {
      address: deliveryAddress,
      contact: deliveryContact,
      phone: deliveryPhone,
      notes: deliveryNotes,
      date: deliveryDate || todayStr,
      time: deliveryTime || '',
      timeMode: deliveryTimeMode || 'ate',
      timePrefixAte: 'Entregar até',
      timePrefixApos: 'Entregar após',
      contactErrorKey: 'deliveryContact',
      dateErrorKey: 'deliveryDate',
      label: 'Local de Entrega',
      sublabel: 'Onde entregar a encomenda',
      role: 'Responsável na Entrega',
      themeColor: '#FF5E00',
      bgLight: 'bg-orange-50/70',
      borderLight: 'border-orange-200',
      icon: Package,
      update: onUpdateDelivery
    },
    troca: {
      address: exchangeAddress,
      contact: exchangeContact,
      phone: exchangePhone,
      notes: exchangeNotes,
      date: exchangeDate || todayStr,
      time: exchangeTime || '',
      timeMode: exchangeTimeMode || 'ate',
      timePrefixAte: 'Trocar até',
      timePrefixApos: 'Trocar após',
      contactErrorKey: 'exchangeContact',
      dateErrorKey: 'exchangeDate',
      label: 'Ponto de Troca',
      sublabel: 'Loja ou fornecedor intermediário',
      role: 'Responsável na Troca',
      themeColor: '#7C3AED',
      bgLight: 'bg-purple-50/70',
      borderLight: 'border-purple-200',
      icon: Repeat,
      update: onUpdateExchange
    }
  };

  const activeData = activeConfig[operationType];
  const OpIcon = activeData.icon;

  const hasCustomSchedule = Boolean(
    (pickupDate && pickupDate !== todayStr) ||
    (deliveryDate && deliveryDate !== todayStr) ||
    (exchangeDate && exchangeDate !== todayStr) ||
    pickupTime ||
    deliveryTime ||
    exchangeTime
  );

  const scheduleMainLabel = (pickupDate === todayStr && deliveryDate === todayStr)
    ? `Hoje (${formatIsoToBr(todayStr)})`
    : `Coleta ${formatIsoToBr(pickupDate || todayStr)} • Entrega ${formatIsoToBr(deliveryDate || todayStr)}`;

  const scheduleSubLabel = hasCustomSchedule
    ? `Coleta: ${pickupDate ? formatIsoToBr(pickupDate) : 'Hoje'}${pickupTime ? ` (${pickupTimeMode === 'ate' ? 'pegar até' : 'pegar após'} ${pickupTime})` : ''} • Entrega: ${deliveryDate ? formatIsoToBr(deliveryDate) : 'Hoje'}${deliveryTime ? ` (${deliveryTimeMode === 'ate' ? 'entregar até' : 'entregar após'} ${deliveryTime})` : ''}${operationType === 'troca' && exchangeTime ? ` • Troca (${exchangeTimeMode === 'ate' ? 'trocar até' : 'trocar após'} ${exchangeTime})` : ''}`
    : 'Datas fixadas para o dia de hoje • Clique para definir horários específicos';

  // Sugestões rápidas de observações para clique ágil
  const quickNotesSuggestions = [
    'Portaria social',
    'Falar com a recepção',
    'Tocar interfone',
    'Ligar antes de chegar',
    'Deixar com vizinho',
    'Subir no elevador'
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-150">
      
      {/* ========================================================
          1. RESUMO DO LOCAL ESCOLHIDO NA ETAPA ANTERIOR
          ======================================================== */}
      <div className={`p-3 sm:p-3.5 rounded-2xl border ${activeData.borderLight} ${activeData.bgLight} shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex items-start gap-2.5 min-w-0">
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
            style={{ backgroundColor: activeData.themeColor }}
          >
            <OpIcon className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black text-slate-900">
                {activeData.label}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-white px-2 py-0.5 rounded-md" style={{ backgroundColor: activeData.themeColor }}>
                {operationType.toUpperCase()}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-extrabold text-slate-800 truncate mt-0.5">
              {activeData.address || 'Endereço selecionado no mapa'}
            </p>
            <p className="text-[11px] font-bold text-slate-600 truncate flex items-center gap-1 mt-0.5">
              <span style={{ color: activeData.themeColor }}>📍</span>
              <span>Cidade: <strong>{extractCityFromAddress(activeData.address)}</strong></span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToLocations}
          className="self-end sm:self-center inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-slate-400 text-slate-800 font-extrabold text-xs shadow-2xs hover:bg-slate-50 transition-all cursor-pointer whitespace-nowrap"
          title="Voltar para a etapa do mapa e ajustar local"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Alterar Local</span>
        </button>
      </div>

      {/* ========================================================
          2. SEÇÃO DE AGENDAMENTO (DATA E HORÁRIOS)
          ======================================================== */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[#0B5187]" />
            <span>1. Agendamento da Encomenda <span className="text-red-500">*</span></span>
          </label>
          {hasCustomSchedule ? (
            <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
              Horários Definidos
            </span>
          ) : (
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
              Data Fixa: Hoje
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsScheduleModalOpen(true)}
          className="w-full p-3.5 rounded-2xl border-2 border-slate-300 hover:border-[#0B5187] bg-linear-to-r from-blue-50/60 via-white to-slate-50 hover:to-blue-50/40 text-slate-800 flex items-center justify-between gap-3 transition-all cursor-pointer group shadow-xs text-left"
          title="Clique para abrir a janela de agendamento de data e horário"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#0B5187] text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-slate-900">
                  Agendar para: <span className="text-[#0B5187] underline">{scheduleMainLabel}</span>
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 font-semibold truncate mt-0.5">
                {scheduleSubLabel}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 group-hover:border-[#0B5187] text-[#0B5187] font-black text-xs shadow-2xs transition-colors">
            <Clock className="w-3.5 h-3.5" />
            <span>Configurar</span>
          </div>
        </button>

        {stepErrors[activeData.dateErrorKey] && (
          <p className="text-xs font-bold text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{stepErrors[activeData.dateErrorKey]}</span>
          </p>
        )}
      </div>

      {/* ========================================================
          3. SEÇÃO DO RESPONSÁVEL NO LOCAL & TELEFONE
          ======================================================== */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <User className="w-4 h-4 text-[#0B5187]" />
            <span>2. Responsável no Local & Contato</span>
          </label>
          <button
            type="button"
            onClick={() => onOpenPhoneAgenda(operationType)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-950 text-xs font-black transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Buscar contato salvo na agenda do telefone ou simulador"
          >
            <BookUser className="w-3.5 h-3.5 text-sky-700 stroke-[2.5]" />
            <span>+ Agenda do Aparelho</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Nome do Responsável */}
          <div className="space-y-1">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
              <span>{activeData.role}</span>
              <span className="text-slate-400 font-medium">(Opcional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={activeData.contact}
                onChange={(e) => {
                  const val = e.target.value;
                  activeData.update({ contact: val });
                  onClearError(activeData.contactErrorKey);
                }}
                placeholder="Ex: João da Silva, Maria, Portaria..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-[#0B5187] rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none transition-colors"
              />
            </div>
            {stepErrors[activeData.contactErrorKey] && (
              <p className="text-xs font-bold text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{stepErrors[activeData.contactErrorKey]}</span>
              </p>
            )}
          </div>

          {/* Telefone / WhatsApp */}
          <div className="space-y-1">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>Telefone / WhatsApp</span>
              <span className="text-slate-400 font-medium">(Opcional)</span>
            </label>
            <input
              type="text"
              value={activeData.phone}
              onChange={(e) => {
                const formatted = formatPhoneNumber(e.target.value);
                activeData.update({ phone: formatted });
              }}
              placeholder="(62) 99999-9999"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-[#0B5187] rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* ========================================================
          4. SEÇÃO DE OBSERVAÇÕES OU REFERÊNCIA DO LOCAL
          ======================================================== */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-[#0B5187]" />
            <span>3. Observações ou Referência do Local</span>
          </label>
          <span className="text-[11px] text-slate-500 font-semibold hidden sm:inline">
            Orientações para o entregador
          </span>
        </div>

        <input
          type="text"
          value={activeData.notes}
          onChange={(e) => {
            activeData.update({ notes: e.target.value });
          }}
          placeholder="Ex: Entregar na recepção, portaria social, falar com a dona Ana..."
          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-[#0B5187] rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none transition-colors"
        />

        {/* Chips rápidos de texto para preenchimento com 1 toque */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[11px] font-bold text-slate-500">Sugestões:</span>
          {quickNotesSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                const current = activeData.notes.trim();
                const next = current ? `${current}, ${item}` : item;
                activeData.update({ notes: next });
              }}
              className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0B5187] border border-slate-200 hover:border-blue-300 rounded-lg text-[11px] font-bold transition-all cursor-pointer active:scale-95"
            >
              + {item}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================
          5. LINHA DO CLIENTE VINCULADO NO RODAPÉ
          ======================================================== */}
      {selectedCustomer && (
        <div className="px-3.5 py-2 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs shadow-2xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-slate-500">Cliente da Encomenda:</span>
            <span className="font-extrabold text-slate-900 truncate">{selectedCustomer.fullName}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600 truncate">{selectedCustomer.phone}</span>
          </div>
          <button
            type="button"
            onClick={onChangeCustomer}
            className="font-extrabold text-[#0B5187] hover:underline cursor-pointer shrink-0"
          >
            Trocar
          </button>
        </div>
      )}

      {/* ========================================================
          JANELINHA DEDICADA DE AGENDAMENTO (DATA E HORÁRIOS)
          ======================================================== */}
      <OrderScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        operationType={operationType}
        pickupDate={pickupDate || todayStr}
        pickupTime={pickupTime || ''}
        pickupTimeMode={pickupTimeMode || 'ate'}
        onChangePickup={onUpdatePickup}
        deliveryDate={deliveryDate || todayStr}
        deliveryTime={deliveryTime || ''}
        deliveryTimeMode={deliveryTimeMode || 'ate'}
        onChangeDelivery={onUpdateDelivery}
        exchangeDate={exchangeDate || todayStr}
        exchangeTime={exchangeTime || ''}
        exchangeTimeMode={exchangeTimeMode || 'ate'}
        onChangeExchange={onUpdateExchange}
      />

    </div>
  );
};
