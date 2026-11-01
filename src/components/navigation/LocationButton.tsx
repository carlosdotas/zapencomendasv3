import React, { useMemo } from 'react';
import { 
  Locate, 
  LocateFixed, 
  Loader2, 
  Users,
  Package,
  Maximize2,
  Calendar
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { Place } from '../../types/map';
import { getDateFilterDisplayLabel, getPlaceCalendarDate, isDateInInterval } from '../../utils/dateFilterUtils';
import { CalendarFilterModal } from './CalendarFilterModal';

export const LocationButton: React.FC = () => {
  const { 
    isTrackingUser, 
    toggleUserTracking, 
    isLocating, 
    savedPlaces,
    allPlaces,
    currentRole,
    openCustomerList,
    openOrdersModal,
    viewAllMarkers,
    selectedPlace,
    dateRangeFilter,
    isCalendarModalOpen,
    openCalendarModal,
    closeCalendarModal
  } = useMapStore();

  const isDateFilterActive = Boolean(dateRangeFilter.startDate || dateRangeFilter.endDate);
  const dateFilterLabel = getDateFilterDisplayLabel(dateRangeFilter);

  // Na tela do motorista (vistoria/operação):
  if (currentRole === 'motorista') {
    return null;
  }

  // Contagem de marcadores/encomendas com coordenadas válidas no mapa (respeitando o filtro de datas)
  const validMarkersCount = useMemo(() => {
    const placesMap = new Map<string, Place>();
    (allPlaces || []).forEach(p => placesMap.set(p.id, p));
    (savedPlaces || []).forEach(p => placesMap.set(p.id, p));
    return Array.from(placesMap.values()).filter(p => {
      if (!p.coordinates || isNaN(p.coordinates.lat) || isNaN(p.coordinates.lng) || p.coordinates.lat === 0 || p.coordinates.lng === 0) {
        return false;
      }
      if (dateRangeFilter.startDate || dateRangeFilter.endDate) {
        const placeDate = getPlaceCalendarDate(p);
        if (!isDateInInterval(placeDate, dateRangeFilter.startDate, dateRangeFilter.endDate)) {
          return false;
        }
      }
      return true;
    }).length;
  }, [allPlaces, savedPlaces, dateRangeFilter]);

  return (
    <>
      <div className={`absolute bottom-20 sm:bottom-24 right-3.5 sm:right-6 z-30 pointer-events-auto flex flex-col items-end gap-2.5 transition-all duration-200 ${
        selectedPlace ? 'hidden sm:flex' : 'flex'
      }`}>
        
        {/* 0. BOTÃO FLUTUANTE DE CLIENTES (ABRE A LISTA DE CLIENTES - APENAS ÍCONE) */}
        <button
          type="button"
          onClick={() => openCustomerList()}
          aria-label="Clientes"
          title="Clientes (Ver lista de clientes)"
          className="group relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#FF5E00] hover:bg-[#E05300] active:scale-95 text-white shadow-xl hover:shadow-2xl border border-orange-400/40 transition-all duration-200 flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5E00] shrink-0"
        >
          <Users className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.4] group-hover:scale-110 transition-transform duration-200" />
          
          {/* Tooltip flutuante indicativo ao passar o mouse */}
          <span className="absolute right-full mr-2.5 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-black rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block">
            Clientes
          </span>
        </button>

        {/* 0.05. BOTÃO FLUTUANTE DE PEDIDOS (ABAIXO DO BOTÃO DE CLIENTES) */}
        <button
          type="button"
          onClick={() => openOrdersModal()}
          aria-label="Pedidos"
          title="Pedidos (Ver lista e filtros de pedidos)"
          className="group relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#0B5187] hover:bg-[#083e68] active:scale-95 text-white shadow-xl hover:shadow-2xl border border-blue-400/40 transition-all duration-200 flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5187] shrink-0"
        >
          <Package className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.4] group-hover:scale-110 transition-transform duration-200" />

          {/* Badge com a quantidade de pedidos */}
          {allPlaces.length > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-4.5 h-4.5 px-1 bg-[#FF5E00] text-white text-[10px] font-black rounded-full border-2 border-white shadow-xs">
              {allPlaces.length}
            </span>
          )}

          {/* Tooltip flutuante indicativo ao passar o mouse */}
          <span className="absolute right-full mr-2.5 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-black rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block">
            Pedidos ({allPlaces.length})
          </span>
        </button>

        {/* 0.1 BOTÃO DE CALENDÁRIO ABAIXO DO BOTÃO DE CLIENTES (SEM TEXTO - APENAS ÍCONE) */}
        <button
          type="button"
          onClick={() => openCalendarModal()}
          aria-label="Filtrar por data"
          title={dateFilterLabel}
          className={`group relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl shadow-xl hover:shadow-2xl border transition-all duration-200 flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5187] shrink-0 active:scale-95 ${
            isDateFilterActive 
              ? 'bg-[#0B5187] text-white border-blue-400/60 shadow-blue-900/30 ring-2 ring-[#0B5187]/40' 
              : 'bg-white hover:bg-slate-50 text-[#0B5187] border-slate-200/90 shadow-slate-900/10'
          }`}
        >
          <Calendar className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.3] group-hover:scale-110 transition-transform duration-200" />
          
          {/* Ponto indicador ativo se houver filtro por data selecionado */}
          {isDateFilterActive && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5E00] opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#FF5E00] border-2 border-white shadow-xs" />
            </span>
          )}

          {/* Tooltip flutuante indicativo ao passar o mouse */}
          <span className="absolute right-full mr-2.5 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-black rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block">
            {dateFilterLabel}
          </span>
        </button>

        {/* 1. BOTÃO PARA VER TODAS AS MAKERS DO MAPA */}
        <button
          type="button"
          onClick={viewAllMarkers}
          aria-label="Ver todas as makers do mapa"
          title="Ver todas as makers no mapa (enquadrar todas)"
          className="group relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl shadow-lg border transition-all duration-200 flex items-center justify-center active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5187] bg-white border-[#0B5187]/25 text-[#0B5187] hover:bg-[#F0F6FB] hover:border-[#0B5187] shadow-slate-900/10 shrink-0"
        >
          <Maximize2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.3] transition-transform duration-200 group-hover:scale-110" />

          {/* Badge com a quantidade de makers no mapa */}
          {validMarkersCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] px-1 rounded-full bg-[#0B5187] text-white text-[9.5px] font-black items-center justify-center border-2 border-white shadow-xs">
              {validMarkersCount}
            </span>
          )}

          {/* Tooltip flutuante indicativo ao passar o mouse */}
          <span className="absolute right-full mr-2.5 px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-black rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block">
            Ver Todas as Makers ({validMarkersCount})
          </span>
        </button>

        {/* 2. BOTÃO DE RASTREAMENTO GPS / CENTRALIZAR MINHA LOCALIZAÇÃO */}
      <button
        type="button"
        onClick={toggleUserTracking}
        aria-label={
          isTrackingUser
            ? 'Parar de seguir localização'
            : 'Centralizar e seguir minha localização'
        }
        title={
          isTrackingUser
            ? 'Seguindo localização em tempo real (clique para parar)'
            : 'Centralizar e seguir minha localização'
        }
        className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl shadow-lg border transition-all duration-200 flex items-center justify-center active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5187] shrink-0 ${
          isTrackingUser
            ? 'bg-[#0B5187] border-[#0B5187] text-white shadow-md shadow-[#0B5187]/35 ring-2 ring-[#0B5187]/25'
            : 'bg-white border-[#0B5187]/25 text-[#0B5187] hover:bg-[#F0F6FB] hover:border-[#0B5187] shadow-slate-900/10'
        }`}
      >
        {/* Indicador pulsante diretamente no botão quando estiver ativo */}
        {isTrackingUser && !isLocating && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 pointer-events-none">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#007AFF] opacity-80" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#007AFF] border-2 border-white shadow-xs" />
          </span>
        )}

        {isLocating ? (
          <Loader2 className={`w-5 h-5 sm:w-6 sm:h-6 animate-spin ${isTrackingUser ? 'text-white' : 'text-[#0B5187]'}`} />
        ) : isTrackingUser ? (
          <LocateFixed className="w-5 h-5 sm:w-6 sm:h-6 text-sky-300 stroke-[2.4] transition-transform duration-200" />
        ) : (
          <Locate className="w-5 h-5 sm:w-6 sm:h-6 text-[#0B5187] stroke-[2.3] transition-colors" />
        )}
      </button>

      </div>

      {/* MODAL DO CALENDÁRIO COM FILTRO DE DATAS E ATALHOS */}
      <CalendarFilterModal
        isOpen={isCalendarModalOpen}
        onClose={closeCalendarModal}
      />
    </>
  );
};
