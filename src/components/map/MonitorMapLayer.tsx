import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { filterPlacesBySequence } from '../../utils/orderSequence';
import { isDriverStale } from '../../services/driverTrackingClient';
import { cityService, normalizeCityName, getCityLabel } from '../../services/cityService';
import {
  filterDriversByCities,
  filterPlacesByCities,
  getMonitorCities,
  getMonitorPlaces,
  type MonitorCityOption
} from '../../utils/monitorData';
import { getDriverPermanentColor } from '../../utils/driverColorUtils';

const STORAGE_KEY = 'encomendaszap_monitor_cities';
const AUTO_FOCUS_INTERVAL_MS = 15000;
const MIN_REFIT_INTERVAL_MS = 8000;

const OPERATION_COLORS: Record<string, string> = {
  coleta: '#0B5187',
  troca: '#7C3AED',
  entrega: '#FF5E00'
};

const VEHICLE_EMOJI: Record<string, string> = { moto: '🏍️', carro: '🚗', utilitario: '🚚' };

function loadSelection(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : null;
  } catch {
    return null;
  }
}

// Visualização pura: marcadores sem label e sem interação.
export const MonitorMapLayer: React.FC = () => {
  const { mapInstance, allPlaces, drivers, completedWaypointMarks } = useMapStore();
  const [selectedCities, setSelectedCities] = useState<string[] | null>(loadSelection);
  const [registeredCities, setRegisteredCities] = useState<MonitorCityOption[]>([]);
  const [autoFocus, setAutoFocus] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const lastFitRef = useRef(0);
  const lastSignatureRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    cityService.listCities()
      .then(cities => {
        if (cancelled) return;
        setRegisteredCities(cities.map(city => ({ key: normalizeCityName(city.name), label: getCityLabel(city) })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const monitorPlaces = useMemo(
    () => getMonitorPlaces(filterPlacesBySequence(allPlaces || [], completedWaypointMarks)),
    [allPlaces, completedWaypointMarks]
  );

  const cityOptions = useMemo(() => {
    const options = new Map<string, MonitorCityOption>();
    getMonitorCities(monitorPlaces).forEach(city => options.set(city.key, city));
    registeredCities.forEach(city => {
      if (city.key) options.set(city.key, options.get(city.key) || city);
    });
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [monitorPlaces, registeredCities]);

  const visiblePlaces = useMemo(() => filterPlacesByCities(monitorPlaces, selectedCities), [monitorPlaces, selectedCities]);
  const visibleDrivers = useMemo(
    () => filterDriversByCities(
      (drivers || []).filter(driver => driver.status !== 'offline' && !isDriverStale(driver)),
      monitorPlaces,
      selectedCities
    ),
    [drivers, monitorPlaces, selectedCities]
  );

  const fitToMarkers = (force: boolean) => {
    const bounds = boundsRef.current;
    if (!mapInstance || !bounds || !bounds.isValid()) return;
    const now = Date.now();
    if (!force && now - lastFitRef.current < MIN_REFIT_INTERVAL_MS) return;
    lastFitRef.current = now;
    mapInstance.fitBounds(bounds, { padding: [70, 70], maxZoom: 16, animate: true, duration: 0.8 });
  };
  const fitRef = useRef(fitToMarkers);
  fitRef.current = fitToMarkers;

  useEffect(() => {
    if (!mapInstance) return;
    const layer = L.layerGroup().addTo(mapInstance);
    layerRef.current = layer;
    return () => {
      mapInstance.removeLayer(layer);
      layerRef.current = null;
    };
  }, [mapInstance]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const points: L.LatLngTuple[] = [];

    visiblePlaces.forEach(place => {
      const op = place.operationType || 'entrega';
      const color = OPERATION_COLORS[op] || OPERATION_COLORS.entrega;
      const point: L.LatLngTuple = [place.coordinates.lat, place.coordinates.lng];
      points.push(point);
      L.circleMarker(point, { radius: 7, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.95, interactive: false }).addTo(layer);
    });

    visibleDrivers.forEach(driver => {
      const point: L.LatLngTuple = [driver.coordinates.lat, driver.coordinates.lng];
      points.push(point);
      const emoji = VEHICLE_EMOJI[driver.vehicleType] || '🏍️';
      const driverColor = driver.color || getDriverPermanentColor(driver.id || driver.phone || driver.name);
      const icon = L.divIcon({
        className: 'monitor-driver-marker',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:${driverColor};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1">${emoji}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker(point, { icon, interactive: false, keyboard: false, zIndexOffset: 400 }).addTo(layer);
    });

    boundsRef.current = points.length > 0 ? L.latLngBounds(points) : null;
    const signature = points.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).sort().join('|');
    const changed = signature !== lastSignatureRef.current;
    lastSignatureRef.current = signature;
    if (autoFocus && changed) fitRef.current(false);
  }, [visiblePlaces, visibleDrivers, autoFocus]);

  useEffect(() => {
    if (!autoFocus) return;
    fitRef.current(true);
    const interval = window.setInterval(() => fitRef.current(true), AUTO_FOCUS_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoFocus, mapInstance, selectedCities]);

  const updateSelection = (next: string[] | null) => {
    setSelectedCities(next);
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const toggleCity = (key: string) => {
    const current = selectedCities ?? cityOptions.map(city => city.key);
    const next = current.includes(key) ? current.filter(item => item !== key) : [...current, key];
    updateSelection(next.length === cityOptions.length ? null : next);
  };

  const isChecked = (key: string) => selectedCities === null || selectedCities.includes(key);

  return (
    <div className="fixed bottom-4 left-4 z-[500] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={() => setIsPanelOpen(open => !open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-black text-slate-900">
          <MapPin className="h-4 w-4 text-[#0B5187]" />
          Monitor · {visibleDrivers.length} motoristas · {visiblePlaces.length} pontos
        </span>
        {isPanelOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
      </button>

      {isPanelOpen && (
        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Cidades</span>
            <div className="flex gap-3 text-xs font-bold text-[#0B5187]">
              <button type="button" onClick={() => updateSelection(null)}>Todas</button>
              <button type="button" onClick={() => updateSelection([])}>Nenhuma</button>
            </div>
          </div>

          <div className="max-h-48 space-y-1 overflow-y-auto">
            {cityOptions.length === 0 && <p className="text-xs text-slate-500">Nenhuma cidade encontrada.</p>}
            {cityOptions.map(city => (
              <label key={city.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                <input type="checkbox" checked={isChecked(city.key)} onChange={() => toggleCity(city.key)} className="h-4 w-4 accent-[#0B5187]" />
                <span className="truncate">{city.label}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
              <input type="checkbox" checked={autoFocus} onChange={event => setAutoFocus(event.target.checked)} className="h-4 w-4 accent-[#0B5187]" />
              Foco automático
            </label>
            <button
              type="button"
              onClick={() => fitToMarkers(true)}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Focar agora
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
