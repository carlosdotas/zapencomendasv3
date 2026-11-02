import React, { useEffect, useRef } from 'react';
import { Navigation, X } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { getDistanceMeters } from '../../utils/geoUtils';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import {
  getNavSession,
  setNavSession,
  useNavSession,
  getPresenceMap,
  removePresence,
  pingPresence
} from '../../services/presenceService';

const ARRIVE_RADIUS_M = 75;
const LEAVE_RADIUS_M = 150;
const PING_INTERVAL_MS = 15000;

const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);

/**
 * Faixa inferior "Navegando para o local" (com cancelar) e controle de presença:
 * ao chegar fecha a faixa, abre os detalhes e passa a contar o tempo de espera.
 */
export const NavigationStatus: React.FC = () => {
  const { currentRole, userLocation, hasRealGpsFix, allPlaces, selectedPlace, setSelectedPlace, clearActiveRoute } = useMapStore();
  const session = useNavSession();
  const selectedRef = useRef(selectedPlace);
  selectedRef.current = selectedPlace;
  const pingState = useRef<Map<string, { near: boolean; at: number }>>(new Map());
  const isDriver = currentRole === 'motorista';

  useEffect(() => {
    if (!isDriver || !userLocation || !hasRealGpsFix) return;
    const here = { lat: userLocation.lat, lng: userLocation.lng };
    const nav = getNavSession();
    const presenceMap = getPresenceMap();

    const ids = new Set<string>(Object.keys(presenceMap));
    if (nav) ids.add(nav.placeId);
    if (selectedPlace) ids.add(selectedPlace.id);

    ids.forEach(id => {
      const place = allPlaces.find(p => p.id === id) || (selectedPlace?.id === id ? selectedPlace : null);
      if (!place) return;
      if (place.orderStage === 'concluido' || (place.operationType as any) === 'concluido') {
        removePresence(id);
        if (nav?.placeId === id) setNavSession(null);
        return;
      }
      const dist = getDistanceMeters(here, place.coordinates);
      const state = pingState.current.get(id);
      const radius = state?.near ? LEAVE_RADIUS_M : ARRIVE_RADIUS_M;
      const near = dist <= radius;
      const now = Date.now();

      if (nav && nav.placeId === id && dist <= ARRIVE_RADIUS_M) {
        // Chegou: fecha a faixa e abre os detalhes
        setNavSession(null);
        clearActiveRoute();
        setTimeout(() => {
          if (!selectedRef.current) setSelectedPlace(place);
        }, 800);
      }

      const hasEntry = Boolean(presenceMap[id]);
      if (near) {
        if (!state?.near || now - state.at > PING_INTERVAL_MS) {
          pingState.current.set(id, { near: true, at: now });
          void pingPresence(place, true).catch(() => {});
        }
      } else if (state?.near || (hasEntry && !state)) {
        pingState.current.set(id, { near: false, at: now });
        if (hasEntry) void pingPresence(place, false).catch(() => {});
      }
    });

    // Remove registros de locais que não existem mais (baixa concluída)
    if (allPlaces.length > 0) {
      Object.keys(presenceMap).forEach(id => {
        if (!allPlaces.some(p => p.id === id) && selectedPlace?.id !== id) removePresence(id);
      });
      if (nav && !allPlaces.some(p => p.id === nav.placeId)) setNavSession(null);
    }
  }, [isDriver, userLocation, hasRealGpsFix, allPlaces, selectedPlace, setSelectedPlace, clearActiveRoute]);

  if (!isDriver || !session || selectedPlace) return null;

  const distance = userLocation && hasRealGpsFix
    ? getDistanceMeters({ lat: userLocation.lat, lng: userLocation.lng }, { lat: session.lat, lng: session.lng })
    : null;

  const handleCancel = () => {
    const place = allPlaces.find(p => p.id === session.placeId);
    setNavSession(null);
    clearActiveRoute();
    if (place) void realtimeAssignmentService.markEnRoute(place.id, place.operationType, false).catch(() => {});
  };

  return (
    <div className="fixed left-3 right-3 bottom-3 z-[110] pointer-events-none flex justify-center">
      <div className="pointer-events-auto w-full max-w-md bg-[#0B5187] text-white rounded-2xl shadow-2xl border border-white/20 px-3 py-2.5 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200">
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Navigation className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-white/70">Navegando para o local</div>
          <div className="text-sm font-black truncate">{session.name}</div>
          {distance !== null && <div className="text-[11px] font-semibold text-white/80">a {fmtDistance(distance)}</div>}
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="shrink-0 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 text-xs font-black flex items-center gap-1 cursor-pointer"
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>
      </div>
    </div>
  );
};
