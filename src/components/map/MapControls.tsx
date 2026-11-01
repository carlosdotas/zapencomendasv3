import React, { useState } from 'react';
import { Plus, Minus, Crosshair, Layers, Compass, Loader2 } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { MapLayerType } from '../../types/map';

export const MapControls: React.FC = () => {
  const { 
    mapInstance, 
    locateUser, 
    isLocating, 
    mapLayer, 
    setMapLayer 
  } = useMapStore();

  const [showLayerMenu, setShowLayerMenu] = useState(false);

  const handleZoomIn = () => {
    if (mapInstance) {
      mapInstance.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstance) {
      mapInstance.zoomOut();
    }
  };

  const handleResetNorth = () => {
    // Reset map view
    if (mapInstance) {
      const center = mapInstance.getCenter();
      mapInstance.setView(center, mapInstance.getZoom());
    }
  };

  const layers: { id: MapLayerType; label: string }[] = [
    { id: 'default', label: 'Ruas (HOT)' },
    { id: 'osm', label: 'OpenStreetMap' },
    { id: 'terrain', label: 'Relevo' },
    { id: 'dark', label: 'Modo Noturno' }
  ];

  return (
    <div className="absolute bottom-20 sm:bottom-24 right-3 sm:right-6 z-20 flex flex-col items-end gap-2 pointer-events-none">
      {/* Layer selector popover */}
      {showLayerMenu && (
        <div className="pointer-events-auto bg-white rounded-lg shadow-xl border border-slate-200/80 p-2 mb-1 flex flex-col gap-1 min-w-[130px] animate-in fade-in slide-from-bottom-2 duration-150">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
            Tipo de Mapa
          </p>
          {layers.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setMapLayer(l.id);
                setShowLayerMenu(false);
              }}
              className={`text-xs px-2.5 py-1.5 rounded-md text-left font-medium transition-colors ${
                mapLayer === l.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Control Buttons Group */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        {/* Layer Switcher */}
        <button
          onClick={() => setShowLayerMenu(!showLayerMenu)}
          aria-label="Trocar camadas do mapa"
          title="Camadas do mapa"
          className="w-10 h-10 sm:w-11 sm:h-11 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-md border border-slate-200/80 flex items-center justify-center transition-all active:scale-95"
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Locate Me */}
        <button
          onClick={locateUser}
          disabled={isLocating}
          aria-label="Minha localização atual"
          title="Sua localização"
          className="w-10 h-10 sm:w-11 sm:h-11 bg-white hover:bg-slate-50 text-blue-600 rounded-lg shadow-md border border-slate-200/80 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          ) : (
            <Crosshair className="w-5 h-5" />
          )}
        </button>

        {/* Zoom Controls */}
        <div className="flex flex-col bg-white rounded-lg shadow-md border border-slate-200/80 overflow-hidden">
          <button
            onClick={handleZoomIn}
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-100"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomOut}
            aria-label="Diminuir zoom"
            title="Diminuir zoom"
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>

        {/* Compass / Orientation */}
        <button
          onClick={handleResetNorth}
          aria-label="Centralizar Norte"
          title="Apontar para o Norte"
          className="w-10 h-10 sm:w-11 sm:h-11 bg-white hover:bg-slate-50 text-slate-600 rounded-lg shadow-md border border-slate-200/80 flex items-center justify-center transition-all active:scale-95"
        >
          <Compass className="w-5 h-5 text-rose-500" />
        </button>
      </div>
    </div>
  );
};
