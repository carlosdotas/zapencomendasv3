import React, { useMemo, useState } from 'react';
import { Route, X } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { DriverSelectorModal, DriverOption } from './DriverSelectorModal';
import { Place } from '../../types/map';

// Barra e seletor do "Passar rota": envia todos os locais marcados para um motorista
export const RouteDispatchManager: React.FC = () => {
  const {
    currentRole,
    routeSelectMode,
    routeSelectedIds,
    cancelRouteSelection,
    isRoutePickerOpen,
    setIsRoutePickerOpen,
    allPlaces,
    savedPlaces,
    drivers,
    assignPlaceToDriver
  } = useMapStore();
  const [toast, setToast] = useState<string | null>(null);

  const placeholder = useMemo(
    () => ({
      id: 'route-dispatch',
      name: `${routeSelectedIds.length} ${routeSelectedIds.length === 1 ? 'local' : 'locais'} no mapa`,
      address: 'Todos os marcadores selecionados irão para o motorista escolhido',
      coordinates: { lat: 0, lng: 0 },
      operationType: 'coleta'
    }) as unknown as Place,
    [routeSelectedIds.length]
  );

  if (currentRole !== 'admin_geral' && currentRole !== 'atendente') return null;

  const handleSelectDriver = async (driver: DriverOption) => {
    const known = new Set([...(allPlaces || []), ...(savedPlaces || [])].map(p => p.id));
    const ids = routeSelectedIds.filter(id => known.has(id));
    const results = await Promise.all(ids.map(id => assignPlaceToDriver(id, driver.id, driver.phone, driver.name)));
    const sent = results.filter(Boolean).length;
    cancelRouteSelection();
    setToast(`${sent} de ${ids.length} locais enviados para ${driver.name}.`);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <>
      {routeSelectMode && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[68px] sm:top-[72px] z-30 flex items-center gap-2.5 pl-3.5 pr-2 py-1.5 bg-[#FF5E00] text-white rounded-full shadow-xl text-[11px] font-black">
          <Route className="w-3.5 h-3.5" />
          <span>
            {routeSelectedIds.length === 0
              ? 'Toque nos marcadores para selecionar'
              : `${routeSelectedIds.length} ${routeSelectedIds.length === 1 ? 'selecionado' : 'selecionados'} • toque no botão para escolher o motorista`}
          </span>
          <button
            type="button"
            onClick={cancelRouteSelection}
            className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer"
            title="Cancelar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[68px] z-30 px-4 py-2 bg-emerald-600 text-white rounded-full shadow-xl text-[11px] font-black">
          {toast}
        </div>
      )}

      <DriverSelectorModal
        isOpen={isRoutePickerOpen && routeSelectedIds.length > 0}
        onClose={() => setIsRoutePickerOpen(false)}
        place={placeholder}
        multiCount={routeSelectedIds.length}
        onSelectDriver={handleSelectDriver}
        activeTelemetryDrivers={drivers}
      />
    </>
  );
};
