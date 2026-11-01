import React, { useMemo, useRef } from 'react';
import { 
  X, 
  ArrowLeft,
  Calendar, 
  Clock, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  RotateCcw, 
  Check, 
  Sparkles,
  ChevronRight,
  CalendarDays
} from 'lucide-react';
import { OperationType } from '../../types/map';

interface OrderScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  operationType: OperationType;
  
  // Coleta
  pickupDate: string;
  pickupTime: string;
  pickupTimeMode: 'ate' | 'apos';
  onChangePickup: (data: { date?: string; time?: string; timeMode?: 'ate' | 'apos' }) => void;

  // Entrega
  deliveryDate: string;
  deliveryTime: string;
  deliveryTimeMode: 'ate' | 'apos';
  onChangeDelivery: (data: { date?: string; time?: string; timeMode?: 'ate' | 'apos' }) => void;

  // Troca (se houver)
  exchangeDate?: string;
  exchangeTime?: string;
  exchangeTimeMode?: 'ate' | 'apos';
  onChangeExchange?: (data: { date?: string; time?: string; timeMode?: 'ate' | 'apos' }) => void;
}

export const OrderScheduleModal: React.FC<OrderScheduleModalProps> = ({
  isOpen,
  onClose,
  operationType,
  pickupDate,
  pickupTime,
  pickupTimeMode,
  onChangePickup,
  deliveryDate,
  deliveryTime,
  deliveryTimeMode,
  onChangeDelivery,
  exchangeDate,
  exchangeTime,
  exchangeTimeMode,
  onChangeExchange
}) => {
  if (!isOpen) return null;

  const isTroca = operationType === 'troca';

  const topCalendarRef = useRef<HTMLInputElement>(null);
  const pickupCalendarRef = useRef<HTMLInputElement>(null);
  const deliveryCalendarRef = useRef<HTMLInputElement>(null);
  const exchangeCalendarRef = useRef<HTMLInputElement>(null);

  // Gerador de informações de data relativa (Hoje, Amanhã, Depois de amanhã, etc.)
  const getRelativeDateInfo = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoStr = `${year}-${month}-${day}`;
    
    const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const weekDaysShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekDay = weekDays[d.getDay()];
    const weekDayShort = weekDaysShort[d.getDay()];

    let title = '';
    let badgeText = '';
    if (offsetDays === 0) {
      title = 'Hoje';
      badgeText = 'Hoje';
    } else if (offsetDays === 1) {
      title = 'Amanhã';
      badgeText = '+1 dia';
    } else if (offsetDays === 2) {
      title = 'Depois de amanhã';
      badgeText = '+2 dias';
    } else if (offsetDays === 3) {
      title = 'Daqui a 3 dias';
      badgeText = '+3 dias';
    } else if (offsetDays === 4) {
      title = 'Daqui a 4 dias';
      badgeText = '+4 dias';
    } else if (offsetDays === 5) {
      title = 'Daqui a 5 dias';
      badgeText = '+5 dias';
    } else if (offsetDays === 7) {
      title = 'Daqui a 1 semana';
      badgeText = '+7 dias';
    } else {
      title = `Em ${offsetDays} dias`;
      badgeText = `+${offsetDays}d`;
    }

    return {
      offsetDays,
      isoStr,
      title,
      badgeText,
      formattedDate: `${day}/${month}`,
      weekDay,
      weekDayShort
    };
  };

  // Lista rica de opções rápidas solicitadas pelo usuário:
  // "hoje, amanhã, depois de amanhã, daqui a três dias..."
  const quickDateOptions = useMemo(() => [
    getRelativeDateInfo(0), // Hoje
    getRelativeDateInfo(1), // Amanhã
    getRelativeDateInfo(2), // Depois de amanhã
    getRelativeDateInfo(3), // Daqui a 3 dias
    getRelativeDateInfo(4), // Daqui a 4 dias
    getRelativeDateInfo(5), // Daqui a 5 dias
    getRelativeDateInfo(7), // Daqui a 1 semana
  ], []);

  const todayStr = quickDateOptions[0].isoStr;

  // Ação ao clicar em uma das opções rápidas no topo
  const handleSelectQuickDate = (isoStr: string) => {
    onChangePickup({ date: isoStr });
    onChangeDelivery({ date: isoStr });
    if (onChangeExchange) {
      onChangeExchange({ date: isoStr });
    }
  };

  // Ação de restaurar tudo para o padrão inicial: Data de hoje e horários em branco
  const handleResetToDefault = () => {
    onChangePickup({ date: todayStr, time: '', timeMode: 'ate' });
    onChangeDelivery({ date: todayStr, time: '', timeMode: 'ate' });
    if (onChangeExchange) {
      onChangeExchange({ date: todayStr, time: '', timeMode: 'ate' });
    }
  };

  // Formatação amigável de data
  const formatIsoToBr = (isoStr?: string) => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoStr;
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      
      {/* ========================================================
          1. HEADER PADRONIZADO EM TELA CHEIA (ESTILO DO SISTEMA)
          ======================================================== */}
      <header className="shrink-0 bg-[#0B5187] text-white px-4 sm:px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight leading-tight flex items-center gap-2">
              <span>Agendamento de Encomenda</span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-full">
                Tela Cheia
              </span>
            </h1>
            <p className="text-xs text-white/80 font-medium">
              Defina as datas e horários de coleta e entrega {isTroca ? 'e troca' : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* ========================================================
          2. FAIXA SUPERIOR: SELETOR RÁPIDO DE DATAS (HOJE, AMANHÃ, DEPOIS DE AMANHÃ, ETC.)
          ======================================================== */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0 shadow-2xs space-y-2">
        <div className="max-w-3xl mx-auto space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-[#0B5187]" />
              <span>Opções Rápidas de Agendamento:</span>
            </span>
            <span className="text-[11px] text-slate-400 font-semibold hidden sm:inline">
              1 toque aplica para Coleta e Entrega
            </span>
          </div>

          {/* 3 Opções Rápidas: Hoje, Amanhã e Botão para Abrir Calendário */}
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            {/* 1. Hoje */}
            <button
              type="button"
              onClick={() => handleSelectQuickDate(todayStr)}
              className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all cursor-pointer select-none active:scale-95 ${
                pickupDate === todayStr && deliveryDate === todayStr
                  ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-sm'
                  : 'bg-slate-50 hover:bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black whitespace-nowrap">Hoje</span>
                {pickupDate === todayStr && deliveryDate === todayStr && (
                  <Check className="w-3.5 h-3.5 stroke-[3] text-emerald-300 shrink-0" />
                )}
              </div>
              <div className={`text-[10px] font-bold truncate mt-0.5 ${
                pickupDate === todayStr && deliveryDate === todayStr ? 'text-white/80' : 'text-slate-500'
              }`}>
                {quickDateOptions[0].formattedDate} • {quickDateOptions[0].weekDayShort}
              </div>
            </button>

            {/* 2. Amanhã */}
            <button
              type="button"
              onClick={() => handleSelectQuickDate(quickDateOptions[1].isoStr)}
              className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all cursor-pointer select-none active:scale-95 ${
                pickupDate === quickDateOptions[1].isoStr && deliveryDate === quickDateOptions[1].isoStr
                  ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-sm'
                  : 'bg-slate-50 hover:bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black whitespace-nowrap">Amanhã</span>
                {pickupDate === quickDateOptions[1].isoStr && deliveryDate === quickDateOptions[1].isoStr && (
                  <Check className="w-3.5 h-3.5 stroke-[3] text-emerald-300 shrink-0" />
                )}
              </div>
              <div className={`text-[10px] font-bold truncate mt-0.5 ${
                pickupDate === quickDateOptions[1].isoStr && deliveryDate === quickDateOptions[1].isoStr ? 'text-white/80' : 'text-slate-500'
              }`}>
                {quickDateOptions[1].formattedDate} • {quickDateOptions[1].weekDayShort}
              </div>
            </button>

            {/* 3. Botão para Abrir Calendário para Escolher um Dia */}
            <button
              type="button"
              onClick={() => {
                if (topCalendarRef.current) {
                  try {
                    if ('showPicker' in HTMLInputElement.prototype) {
                      topCalendarRef.current.showPicker();
                    } else {
                      topCalendarRef.current.click();
                    }
                  } catch {
                    topCalendarRef.current.click();
                  }
                }
              }}
              className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all cursor-pointer select-none active:scale-95 ${
                pickupDate !== todayStr && pickupDate !== quickDateOptions[1].isoStr
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-slate-50 hover:bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-black whitespace-nowrap truncate">
                  {pickupDate !== todayStr && pickupDate !== quickDateOptions[1].isoStr ? formatIsoToBr(pickupDate) : 'Calendário'}
                </span>
              </div>
              <div className={`text-[10px] font-bold truncate mt-0.5 ${
                pickupDate !== todayStr && pickupDate !== quickDateOptions[1].isoStr ? 'text-white/80' : 'text-slate-500'
              }`}>
                {pickupDate !== todayStr && pickupDate !== quickDateOptions[1].isoStr ? 'Data escolhida' : 'Escolher dia'}
              </div>
            </button>
          </div>

          {/* Input oculto para abrir o calendário */}
          <input
            ref={topCalendarRef}
            type="date"
            className="sr-only opacity-0 absolute pointer-events-none"
            tabIndex={-1}
            aria-label="Escolher data rápida no calendário"
            onChange={(e) => {
              if (e.target.value) {
                handleSelectQuickDate(e.target.value);
              }
            }}
          />
        </div>
      </div>

      {/* ========================================================
          3. CORPO COM SCROLL: FORMULÁRIOS COMPLETOS DE COLETA, ENTREGA E TROCA
          ======================================================== */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-4">
          
          {/* AVISO DO PADRÃO DO SISTEMA */}
          <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-[#0B5187]">
            <Sparkles className="w-4 h-4 shrink-0 text-[#0B5187] mt-0.5" />
            <div className="font-semibold leading-relaxed">
              <span className="font-black">Padrão do Sistema:</span> As datas de coleta e entrega já vêm fixadas para o dia de hoje. Caso precise agendar horários, preencha o campo de hora e selecione se é para <strong>"Pegar/Entregar até tal hora"</strong> ou <strong>"Pegar/Entregar após tal hora"</strong>.
            </div>
          </div>

          {/* ========================================================
              BLOCO 1: COLETA DA ENCOMENDA
              ======================================================== */}
          <div className="bg-white border-2 border-blue-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#0B5187] flex items-center justify-center font-black text-xs shrink-0">
                  <ArrowDownToLine className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    <span>1. Coleta da Encomenda (Ponto A)</span>
                    <span className="text-[10px] font-extrabold text-[#0B5187] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Retirada
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Data e horário em que o entregador deve retirar a carga
                  </p>
                </div>
              </div>

              {pickupTime && (
                <button
                  type="button"
                  onClick={() => onChangePickup({ time: '' })}
                  className="text-xs font-bold text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  ✕ Limpar hora
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              {/* Data da Coleta: Hoje, Amanhã ou Calendário */}
              <div className="sm:col-span-5 space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#0B5187]" />
                    <span>Data da Coleta <span className="text-red-500">*</span></span>
                  </span>
                  <span className="text-[11px] font-bold text-[#0B5187]">
                    {pickupDate === todayStr ? 'Hoje' : pickupDate === quickDateOptions[1].isoStr ? 'Amanhã' : formatIsoToBr(pickupDate)}
                  </span>
                </label>
                
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangePickup({ date: todayStr })}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      pickupDate === todayStr
                        ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangePickup({ date: quickDateOptions[1].isoStr })}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      pickupDate === quickDateOptions[1].isoStr
                        ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Amanhã
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pickupCalendarRef.current) {
                        try {
                          if ('showPicker' in HTMLInputElement.prototype) {
                            pickupCalendarRef.current.showPicker();
                          } else {
                            pickupCalendarRef.current.click();
                          }
                        } catch {
                          pickupCalendarRef.current.click();
                        }
                      }
                    }}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      pickupDate !== todayStr && pickupDate !== quickDateOptions[1].isoStr
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="Abrir calendário para escolher data da coleta"
                  >
                    <Calendar className="w-3 h-3" />
                    <span className="truncate">
                      {pickupDate !== todayStr && pickupDate !== quickDateOptions[1].isoStr ? formatIsoToBr(pickupDate).slice(0, 5) : 'Calendário'}
                    </span>
                  </button>
                </div>

                <input
                  ref={pickupCalendarRef}
                  type="date"
                  className="sr-only opacity-0 absolute pointer-events-none"
                  tabIndex={-1}
                  aria-label="Escolher data da coleta"
                  value={pickupDate || todayStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      onChangePickup({ date: e.target.value });
                    }
                  }}
                />
              </div>

              {/* Horário da Coleta + Modo (Pegar até / Pegar após) */}
              <div className="sm:col-span-7 space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Hora da Coleta</span>
                    <span className="text-slate-400 font-normal lowercase">(opcional)</span>
                  </span>
                  {pickupTime && (
                    <span className="text-[10px] font-black text-[#0B5187] bg-blue-50 px-1.5 py-0.2 rounded">
                      {pickupTimeMode === 'ate' ? 'Até' : 'Após'} {pickupTime}
                    </span>
                  )}
                </label>
                
                <div className="flex items-center gap-1.5">
                  {/* Seletor Pegar até / Pegar após */}
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => onChangePickup({ timeMode: 'ate' })}
                      className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        pickupTimeMode === 'ate'
                          ? 'bg-[#0B5187] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pegar até
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangePickup({ timeMode: 'apos' })}
                      className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        pickupTimeMode === 'apos'
                          ? 'bg-[#0B5187] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pegar após
                    </button>
                  </div>

                  {/* Campo de Hora */}
                  <input
                    type="time"
                    value={pickupTime}
                    onChange={(e) => onChangePickup({ time: e.target.value })}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================
              BLOCO 2: ENTREGA DA ENCOMENDA
              ======================================================== */}
          <div className="bg-white border-2 border-orange-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#FF5E00] flex items-center justify-center font-black text-xs shrink-0">
                  <ArrowUpFromLine className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    <span>2. Entrega da Encomenda (Ponto B)</span>
                    <span className="text-[10px] font-extrabold text-[#FF5E00] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                      Destino
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Data e horário em que o cliente deve receber no destino
                  </p>
                </div>
              </div>

              {deliveryTime && (
                <button
                  type="button"
                  onClick={() => onChangeDelivery({ time: '' })}
                  className="text-xs font-bold text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  ✕ Limpar hora
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              {/* Data da Entrega: Hoje, Amanhã ou Calendário */}
              <div className="sm:col-span-5 space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#FF5E00]" />
                    <span>Data da Entrega <span className="text-red-500">*</span></span>
                  </span>
                  <span className="text-[11px] font-bold text-[#FF5E00]">
                    {deliveryDate === todayStr ? 'Hoje' : deliveryDate === quickDateOptions[1].isoStr ? 'Amanhã' : formatIsoToBr(deliveryDate)}
                  </span>
                </label>
                
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeDelivery({ date: todayStr })}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      deliveryDate === todayStr
                        ? 'bg-[#FF5E00] text-white border-[#FF5E00] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeDelivery({ date: quickDateOptions[1].isoStr })}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      deliveryDate === quickDateOptions[1].isoStr
                        ? 'bg-[#FF5E00] text-white border-[#FF5E00] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Amanhã
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (deliveryCalendarRef.current) {
                        try {
                          if ('showPicker' in HTMLInputElement.prototype) {
                            deliveryCalendarRef.current.showPicker();
                          } else {
                            deliveryCalendarRef.current.click();
                          }
                        } catch {
                          deliveryCalendarRef.current.click();
                        }
                      }
                    }}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      deliveryDate !== todayStr && deliveryDate !== quickDateOptions[1].isoStr
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="Abrir calendário para escolher data da entrega"
                  >
                    <Calendar className="w-3 h-3" />
                    <span className="truncate">
                      {deliveryDate !== todayStr && deliveryDate !== quickDateOptions[1].isoStr ? formatIsoToBr(deliveryDate).slice(0, 5) : 'Calendário'}
                    </span>
                  </button>
                </div>

                <input
                  ref={deliveryCalendarRef}
                  type="date"
                  className="sr-only opacity-0 absolute pointer-events-none"
                  tabIndex={-1}
                  aria-label="Escolher data da entrega"
                  value={deliveryDate || todayStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      onChangeDelivery({ date: e.target.value });
                    }
                  }}
                />
              </div>

              {/* Horário da Entrega + Modo (Entregar até / Entregar após) */}
              <div className="sm:col-span-7 space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Hora da Entrega</span>
                    <span className="text-slate-400 font-normal lowercase">(opcional)</span>
                  </span>
                  {deliveryTime && (
                    <span className="text-[10px] font-black text-[#FF5E00] bg-orange-50 px-1.5 py-0.2 rounded">
                      {deliveryTimeMode === 'ate' ? 'Até' : 'Após'} {deliveryTime}
                    </span>
                  )}
                </label>
                
                <div className="flex items-center gap-1.5">
                  {/* Seletor Entregar até / Entregar após */}
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => onChangeDelivery({ timeMode: 'ate' })}
                      className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        deliveryTimeMode === 'ate'
                          ? 'bg-[#FF5E00] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Entregar até
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeDelivery({ timeMode: 'apos' })}
                      className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        deliveryTimeMode === 'apos'
                          ? 'bg-[#FF5E00] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Entregar após
                    </button>
                  </div>

                  {/* Campo de Hora */}
                  <input
                    type="time"
                    value={deliveryTime}
                    onChange={(e) => onChangeDelivery({ time: e.target.value })}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-[#FF5E00] focus:ring-2 focus:ring-[#FF5E00]/20 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================
              BLOCO 3: PONTO DE TROCA (SE A MODALIDADE FOR TROCA)
              ======================================================== */}
          {isTroca && onChangeExchange && (
            <div className="bg-white border-2 border-purple-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs shrink-0">
                    <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-purple-950 uppercase tracking-tight flex items-center gap-2">
                      <span>3. Ponto de Troca (Intermediário)</span>
                      <span className="text-[10px] font-extrabold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        Troca
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Data e horário para efetuar a troca na loja ou fornecedor
                    </p>
                  </div>
                </div>

                {exchangeTime && (
                  <button
                    type="button"
                    onClick={() => onChangeExchange({ time: '' })}
                    className="text-xs font-bold text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    ✕ Limpar hora
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                {/* Data da Troca: Hoje, Amanhã ou Calendário */}
                <div className="sm:col-span-5 space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-purple-700" />
                      <span>Data da Troca <span className="text-red-500">*</span></span>
                    </span>
                    <span className="text-[11px] font-bold text-purple-700">
                      {exchangeDate === todayStr ? 'Hoje' : exchangeDate === quickDateOptions[1].isoStr ? 'Amanhã' : formatIsoToBr(exchangeDate)}
                    </span>
                  </label>
                  
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onChangeExchange({ date: todayStr })}
                      className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                        exchangeDate === todayStr
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeExchange({ date: quickDateOptions[1].isoStr })}
                      className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                        exchangeDate === quickDateOptions[1].isoStr
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Amanhã
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (exchangeCalendarRef.current) {
                          try {
                            if ('showPicker' in HTMLInputElement.prototype) {
                              exchangeCalendarRef.current.showPicker();
                            } else {
                              exchangeCalendarRef.current.click();
                            }
                          } catch {
                            exchangeCalendarRef.current.click();
                          }
                        }
                      }}
                      className={`py-2 px-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        exchangeDate !== todayStr && exchangeDate !== quickDateOptions[1].isoStr
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                      title="Abrir calendário para escolher data da troca"
                    >
                      <Calendar className="w-3 h-3" />
                      <span className="truncate">
                        {exchangeDate !== todayStr && exchangeDate !== quickDateOptions[1].isoStr ? formatIsoToBr(exchangeDate).slice(0, 5) : 'Calendário'}
                      </span>
                    </button>
                  </div>

                  <input
                    ref={exchangeCalendarRef}
                    type="date"
                    className="sr-only opacity-0 absolute pointer-events-none"
                    tabIndex={-1}
                    aria-label="Escolher data da troca"
                    value={exchangeDate || todayStr}
                    onChange={(e) => {
                      if (e.target.value) {
                        onChangeExchange({ date: e.target.value });
                      }
                    }}
                  />
                </div>

                {/* Horário da Troca + Modo (Trocar até / Trocar após) */}
                <div className="sm:col-span-7 space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Hora da Troca</span>
                      <span className="text-slate-400 font-normal lowercase">(opcional)</span>
                    </span>
                    {exchangeTime && (
                      <span className="text-[10px] font-black text-purple-800 bg-purple-50 px-1.5 py-0.2 rounded">
                        {exchangeTimeMode === 'ate' ? 'Até' : 'Após'} {exchangeTime}
                      </span>
                    )}
                  </label>
                  
                  <div className="flex items-center gap-1.5">
                    {/* Seletor Trocar até / Trocar após */}
                    <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                      <button
                        type="button"
                        onClick={() => onChangeExchange({ timeMode: 'ate' })}
                        className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          exchangeTimeMode === 'ate'
                            ? 'bg-purple-700 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Trocar até
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeExchange({ timeMode: 'apos' })}
                        className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          exchangeTimeMode === 'apos'
                            ? 'bg-purple-700 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Trocar após
                      </button>
                    </div>

                    {/* Campo de Hora */}
                    <input
                      type="time"
                      value={exchangeTime}
                      onChange={(e) => onChangeExchange({ time: e.target.value })}
                      className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CARD RESUMO DO AGENDAMENTO SELECIONADO */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 text-xs space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Resumo do Agendamento Definido:
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-blue-100 text-[#0B5187] flex items-center justify-center font-black text-[10px]">A</span>
                <span className="font-bold text-slate-800">
                  Coleta: <strong>{formatIsoToBr(pickupDate)}</strong>
                  {pickupTime ? <span className="text-[#0B5187]"> ({pickupTimeMode === 'ate' ? 'pegar até' : 'pegar após'} {pickupTime})</span> : ' (sem horário fixo)'}
                </span>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-400 hidden sm:block" />

              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-orange-100 text-[#FF5E00] flex items-center justify-center font-black text-[10px]">B</span>
                <span className="font-bold text-slate-800">
                  Entrega: <strong>{formatIsoToBr(deliveryDate)}</strong>
                  {deliveryTime ? <span className="text-[#FF5E00]"> ({deliveryTimeMode === 'ate' ? 'entregar até' : 'entregar após'} {deliveryTime})</span> : ' (sem horário fixo)'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ========================================================
          4. RODAPÉ PADRONIZADO COM BOTÕES DE AÇÃO
          ======================================================== */}
      <footer className="bg-white border-t border-slate-200 px-4 sm:px-6 py-3.5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={handleResetToDefault}
          className="text-xs font-bold text-slate-600 hover:text-slate-900 py-2 px-3 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-left sm:text-center"
        >
          Restaurar Padrão (Hoje / Sem Horário)
        </button>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-[#0B5187] hover:bg-[#083D66] active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Confirmar Agendamento</span>
          </button>
        </div>
      </footer>

    </div>
  );
};
