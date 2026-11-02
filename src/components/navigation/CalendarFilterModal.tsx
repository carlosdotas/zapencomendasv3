import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  X, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  RotateCcw,
  Sparkles,
  Clock,
  Filter
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { DateRangeFilter, DateFilterPreset, Place } from '../../types/map';
import { 
  toLocalISODate, 
  formatISODateToBR, 
  getPresetDateRange, 
  getPlaceCalendarDate,
  isDateInInterval
} from '../../utils/dateFilterUtils';
import { useBackButton } from '../../hooks/useBackButton';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface CalendarFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Modo independente: usa este intervalo e devolve o resultado em onApply, sem alterar o filtro global do mapa. */
  value?: DateRangeFilter;
  onApply?: (filter: DateRangeFilter) => void;
  /** Lista usada na contagem por dia (padrão: marcadores do mapa). */
  places?: Place[];
  title?: string;
  zIndexClass?: string;
}

export const CalendarFilterModal: React.FC<CalendarFilterModalProps> = ({
  isOpen,
  onClose,
  value,
  onApply,
  places,
  title = 'Filtrar Markers por Data',
  zIndexClass = 'z-50'
}) => {
  useBackButton('calendar-filter-modal', isOpen, onClose, 92);

  const store = useMapStore();
  const isStandalone = Boolean(onApply);
  const dateRangeFilter: DateRangeFilter = value ?? store.dateRangeFilter;
  const setDateRangeFilter = (filter: DateRangeFilter) => (onApply ? onApply(filter) : store.setDateRangeFilter(filter));
  const clearDateRangeFilter = () => (onApply ? onApply({ startDate: null, endDate: null, preset: null }) : store.clearDateRangeFilter());
  const allPlaces = places ?? store.allPlaces;
  const savedPlaces = isStandalone ? [] : store.savedPlaces;

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalISODate(today), [today]);

  // Mês e ano atualmente visualizados no calendário
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (dateRangeFilter.startDate) {
      const [y, m] = dateRangeFilter.startDate.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Estado local do range antes de aplicar
  const [rangeStart, setRangeStart] = useState<string | null>(dateRangeFilter.startDate);
  const [rangeEnd, setRangeEnd] = useState<string | null>(dateRangeFilter.endDate);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<DateFilterPreset>(dateRangeFilter.preset || null);

  // Sincroniza com o estado global somente ao abrir (não sobrescreve a seleção em andamento)
  const dateRangeFilterRef = useRef(dateRangeFilter);
  dateRangeFilterRef.current = dateRangeFilter;
  useEffect(() => {
    const dateRangeFilter = dateRangeFilterRef.current;
    if (isOpen) {
      setRangeStart(dateRangeFilter.startDate);
      setRangeEnd(dateRangeFilter.endDate);
      setActivePreset(dateRangeFilter.preset || null);
      if (dateRangeFilter.startDate) {
        const [y, m] = dateRangeFilter.startDate.split('-').map(Number);
        setViewDate(new Date(y, m - 1, 1));
      } else {
        setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
      }
    }
  }, [isOpen, today]);

  // Mapa de contagem de markers por dia para exibir no calendário
  const markersPerDay = useMemo(() => {
    const counts = new Map<string, number>();
    const all = [...(allPlaces || []), ...(savedPlaces || [])];
    all.forEach(p => {
      if (!isStandalone && (p.orderStage === 'concluido' || (p.operationType as any) === 'concluido')) return;
      const day = getPlaceCalendarDate(p);
      counts.set(day, (counts.get(day) || 0) + 1);
    });
    return counts;
  }, [allPlaces, savedPlaces, isStandalone]);

  // Contagem de markers no range selecionado atualmente
  const filteredMarkersCount = useMemo(() => {
    if (!rangeStart && !rangeEnd) {
      return (allPlaces || []).length;
    }
    const all = [...(allPlaces || []), ...(savedPlaces || [])];
    return all.filter(p => {
      if (!isStandalone && (p.orderStage === 'concluido' || (p.operationType as any) === 'concluido')) return false;
      const day = getPlaceCalendarDate(p);
      return isDateInInterval(day, rangeStart, rangeEnd);
    }).length;
  }, [allPlaces, savedPlaces, rangeStart, rangeEnd, isStandalone]);

  // Geração dos dias do mês atual para a grade
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Domingo
    const totalDays = lastDayOfMonth.getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Dias do mês anterior para preencher a primeira semana
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const str = toLocalISODate(d);
      days.push({
        dateStr: str,
        dayNumber: prevMonthLastDay - i,
        isCurrentMonth: false,
        isToday: str === todayStr
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i);
      const str = toLocalISODate(d);
      days.push({
        dateStr: str,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: str === todayStr
      });
    }

    // Dias do próximo mês para completar 35 ou 42 células (múltiplo de 7)
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        const d = new Date(year, month + 1, i);
        const str = toLocalISODate(d);
        days.push({
          dateStr: str,
          dayNumber: i,
          isCurrentMonth: false,
          isToday: str === todayStr
        });
      }
    }

    return days;
  }, [viewDate, todayStr]);

  if (!isOpen) return null;

  // Navegação de mês
  const handlePrevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Clique no dia do calendário (Seleção dia início e dia final)
  const handleDayClick = (dateStr: string) => {
    setActivePreset('custom');

    // Se não há início, ou se já há início e fim selecionados: reinicia selecionando novo início
    if (!rangeStart || (rangeStart && rangeEnd && rangeStart !== rangeEnd)) {
      setRangeStart(dateStr);
      setRangeEnd(dateStr);
      return;
    }

    // Se já havia um início e rangeEnd era igual a rangeStart (1 dia apenas):
    if (rangeStart && rangeEnd && rangeStart === rangeEnd) {
      if (dateStr >= rangeStart) {
        setRangeEnd(dateStr);
      } else {
        setRangeEnd(rangeStart);
        setRangeStart(dateStr);
      }
    }
  };

  // Aplicação de opções rápidas (presets)
  const handleApplyPreset = (preset: DateFilterPreset) => {
    if (!preset) {
      handleClear();
      return;
    }
    const { startDate, endDate } = getPresetDateRange(preset);
    setRangeStart(startDate);
    setRangeEnd(endDate);
    setActivePreset(preset);

    // Ajusta o visualizador para o mês do início
    const [y, m] = startDate.split('-').map(Number);
    setViewDate(new Date(y, m - 1, 1));
  };

  // Confirmar e aplicar filtro no mapa
  const handleApply = () => {
    if (rangeStart && rangeEnd) {
      setDateRangeFilter({
        startDate: rangeStart <= rangeEnd ? rangeStart : rangeEnd,
        endDate: rangeStart <= rangeEnd ? rangeEnd : rangeStart,
        preset: activePreset
      });
    } else if (rangeStart) {
      setDateRangeFilter({
        startDate: rangeStart,
        endDate: rangeStart,
        preset: activePreset
      });
    } else {
      clearDateRangeFilter();
    }
    onClose();
  };

  // Limpar filtro e mostrar todas as markers
  const handleClear = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setActivePreset(null);
    clearDateRangeFilter();
    onClose();
  };

  // Determina se o dia está selecionado ou no intervalo
  const effectiveEnd = rangeEnd || (hoverDate && rangeStart && hoverDate >= rangeStart ? hoverDate : rangeStart);

  const isDaySelected = (dateStr: string) => {
    return dateStr === rangeStart || dateStr === rangeEnd;
  };

  const isDayInRange = (dateStr: string) => {
    if (!rangeStart || !effectiveEnd) return false;
    const [s, e] = rangeStart <= effectiveEnd ? [rangeStart, effectiveEnd] : [effectiveEnd, rangeStart];
    return dateStr >= s && dateStr <= e;
  };

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200`}>
      
      {/* Backdrop */}
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />

      {/* CARD DO CALENDÁRIO INTERATIVO */}
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in slide-in-from-bottom duration-250 flex flex-col max-h-[92vh]">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0B5187] text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-5 h-5 stroke-[2.4]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                {title}
              </h2>
              <p className="text-[11px] text-slate-500 font-semibold">
                Clique no dia início e dia final para definir o período
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CORPO DO CALENDÁRIO */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* NAVEGADOR DE MÊS / ANO */}
          <div className="flex items-center justify-between bg-slate-50 p-2 rounded-2xl border border-slate-200/80">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white text-slate-700 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Mês anterior"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            <div className="text-center">
              <span className="text-sm font-black text-slate-900 block leading-tight">
                {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="text-[10.5px] font-bold text-[#0B5187] hover:underline cursor-pointer"
              >
                Voltar para o mês atual
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 hover:bg-white text-slate-700 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Próximo mês"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* GRADE DO CALENDÁRIO */}
          <div>
            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {WEEKDAY_NAMES.map((name, i) => (
                <span 
                  key={name} 
                  className={`text-[10px] font-black uppercase tracking-wider py-1 ${
                    i === 0 || i === 6 ? 'text-amber-600' : 'text-slate-400'
                  }`}
                >
                  {name}
                </span>
              ))}
            </div>

            {/* Dias do mês */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((item) => {
                const count = markersPerDay.get(item.dateStr) || 0;
                const selected = isDaySelected(item.dateStr);
                const inRange = isDayInRange(item.dateStr);
                const isStart = item.dateStr === rangeStart;
                const isEnd = item.dateStr === rangeEnd;

                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => handleDayClick(item.dateStr)}
                    onMouseEnter={() => {
                      if (rangeStart && !rangeEnd) {
                        setHoverDate(item.dateStr);
                      }
                    }}
                    className={`relative h-10 sm:h-11 rounded-xl flex flex-col items-center justify-center text-xs font-black transition-all cursor-pointer ${
                      !item.isCurrentMonth ? 'opacity-30' : ''
                    } ${
                      selected
                        ? 'bg-[#0B5187] text-white shadow-md shadow-blue-900/30 scale-102 z-10'
                        : inRange
                        ? 'bg-blue-100/90 text-[#0B5187] font-black rounded-lg'
                        : 'hover:bg-slate-100 text-slate-800'
                    } ${
                      item.isToday && !selected ? 'border-2 border-[#FF5E00] text-[#FF5E00]' : ''
                    }`}
                  >
                    <span className="leading-none">{item.dayNumber}</span>
                    
                    {/* Indicador de encomendas naquele dia */}
                    {count > 0 && (
                      <span className={`text-[8.5px] font-bold mt-0.5 leading-none px-1 rounded-full ${
                        selected 
                          ? 'bg-white text-[#0B5187]' 
                          : inRange 
                          ? 'bg-[#0B5187] text-white' 
                          : 'bg-orange-100 text-[#FF5E00]'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ========================================================
              OPÇÕES RÁPIDAS EMBAIXO:
              amanha, ontem, essa semana, esse mês, mês passado, hoje
              ======================================================== */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
              Atalhos de Período Rápido:
            </span>

            <div className="grid grid-cols-3 sm:grid-cols-3 gap-1.5">
              {[
                { id: 'hoje', label: 'Hoje' },
                { id: 'amanha', label: 'Amanhã' },
                { id: 'ontem', label: 'Ontem' },
                { id: 'essa_semana', label: 'Essa semana' },
                { id: 'este_mes', label: 'Esse mês' },
                { id: 'mes_passado', label: 'Mês passado' }
              ].map(opt => {
                const isActive = activePreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleApplyPreset(opt.id as DateFilterPreset)}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-extrabold transition-all border cursor-pointer active:scale-95 text-center truncate ${
                      isActive
                        ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RESUMO DO PERÍODO SELECIONADO */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
                Período Selecionado:
              </span>
              <p className="text-xs font-black text-slate-900 mt-0.5">
                {rangeStart && rangeEnd ? (
                  rangeStart === rangeEnd 
                    ? formatISODateToBR(rangeStart)
                    : `${formatISODateToBR(rangeStart, true)} até ${formatISODateToBR(rangeEnd)}`
                ) : rangeStart ? (
                  `A partir de ${formatISODateToBR(rangeStart)}`
                ) : (
                  'Todas as datas (sem filtro)'
                )}
              </p>
            </div>

            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-white border border-blue-200 text-[#0B5187] shrink-0 shadow-2xs">
              {filteredMarkersCount} {filteredMarkersCount === 1 ? 'maker' : 'makers'}
            </span>
          </div>

        </div>

        {/* RODAPÉ: BOTÕES DE LIMPAR E APLICAR */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClear}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-white text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar Filtro</span>
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#0B5187] hover:bg-[#083D66] active:scale-95 text-white text-xs font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Aplicar Filtro ({filteredMarkersCount})</span>
          </button>
        </div>

      </div>
    </div>
  );
};
