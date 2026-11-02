import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Clock, Route as RouteIcon } from 'lucide-react';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';
import { placeService } from '../../services/placeService';
import { fetchMultiStopRoute } from '../../services/routingService';
import { calculateDistanceMeters } from '../../utils/placeUtils';
import { LocationCoordinates, Place } from '../../types/map';

interface ClaimRouteMapProps {
  order: Place;
  driverLocation?: LocationCoordinates | null;
}

interface HubInfo {
  name: string;
  coordinates: LocationCoordinates;
}

const pin = (color: string, label: string, text: string) => L.divIcon({
  className: 'claim-route-pin',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div title="${label}" style="width:30px;height:30px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;">${text}</div>`
});

const driverPin = () => L.divIcon({
  className: 'claim-route-pin',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<div title="Você" style="position:relative;width:44px;height:44px;">
    <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(37,99,235,.22);"></div>
    <div style="position:absolute;inset:0;border-radius:50%;background:linear-gradient(160deg,#3B82F6,#1D4ED8);border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5.5" cy="17" r="2.8"/><circle cx="18.5" cy="17" r="2.8"/>
        <path d="M5.5 17h4l3-6h3.5l2.5 6"/><path d="M13 7h3l1.5 3"/><path d="M9 11.5 7.5 9H5.5"/>
      </svg>
    </div></div>`
});

const packagePin = () => L.divIcon({
  className: 'claim-route-pin',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `<div title="Pedido" style="width:40px;height:40px;filter:drop-shadow(0 3px 4px rgba(127,29,29,.55));">
    <svg width="40" height="40" viewBox="0 0 64 62">
      <path d="M32 3 L59 16 V44 L32 58 L5 44 V16 Z" fill="#DC2626" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
      <path d="M5 16 L32 29 L59 16" fill="#EF4444" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
      <path d="M32 29 V58" stroke="#fff" stroke-width="2"/>
      <path d="M18.5 9.5 L45.5 22.5" stroke="#FECACA" stroke-width="3.5" stroke-linecap="round"/>
    </svg></div>`
});

const isValid = (c?: LocationCoordinates | null): c is LocationCoordinates =>
  Boolean(c) && Number.isFinite(c!.lat) && Number.isFinite(c!.lng) && !(c!.lat === 0 && c!.lng === 0);

export const ClaimRouteMap: React.FC<ClaimRouteMapProps> = ({ order, driverLocation }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hub, setHub] = useState<HubInfo | null>(null);
  const [summary, setSummary] = useState<{ km: number; min: number } | null>(null);

  const orderCoords = order.coordinates;

  // Central da cidade do pedido; se a cidade não tiver central, usa a mais próxima do pedido
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list: any[] = [];
        const city = order.originCity || order.destinationCity;
        if (city) {
          const byCity = await placeService.getCentraisByCidade(city);
          if (byCity.success && Array.isArray(byCity.data)) list = byCity.data;
        }
        if (list.length === 0) {
          const all = await placeService.getLocais({ central_coletas: true, limit: 1000 });
          if (all.success && Array.isArray(all.data)) list = all.data;
        }
        const candidates = list
          .map((l: any) => ({ name: String(l.name || 'Central de Coletas'), coordinates: { lat: Number(l.lat), lng: Number(l.lng) } }))
          .filter(c => isValid(c.coordinates));
        if (candidates.length === 0) { if (!cancelled) setHub(null); return; }
        candidates.sort((a, b) => calculateDistanceMeters(orderCoords, a.coordinates) - calculateDistanceMeters(orderCoords, b.coordinates));
        if (!cancelled) setHub(candidates[0]);
      } catch {
        if (!cancelled) setHub(null);
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.originCity, order.destinationCity, orderCoords?.lat, orderCoords?.lng]);

  useEffect(() => {
    if (!containerRef.current || !isValid(orderCoords)) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false });
    new CachedTileLayer(PRIMARY_TILE_CONFIG.url, {
      maxZoom: PRIMARY_TILE_CONFIG.maxZoom,
      subdomains: PRIMARY_TILE_CONFIG.subdomains,
      attribution: PRIMARY_TILE_CONFIG.attribution
    }).addTo(map);

    const points: LocationCoordinates[] = [];
    if (isValid(driverLocation)) {
      points.push(driverLocation);
      L.marker([driverLocation.lat, driverLocation.lng], { icon: driverPin(), zIndexOffset: 500 }).addTo(map);
    }
    points.push(orderCoords);
    L.marker([orderCoords.lat, orderCoords.lng], { icon: packagePin(), zIndexOffset: 400 }).addTo(map);
    if (hub) {
      points.push(hub.coordinates);
      L.marker([hub.coordinates.lat, hub.coordinates.lng], { icon: pin('#0F766E', hub.name, '🏭') }).addTo(map);
    }

    map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])), { padding: [34, 34], maxZoom: 16 });

    const straight = L.polyline(points.map(p => [p.lat, p.lng] as [number, number]), {
      color: '#2563EB', weight: 4, opacity: 0.5, dashArray: '6 8'
    }).addTo(map);

    let cancelled = false;
    if (points.length >= 2) {
      fetchMultiStopRoute(points).then(route => {
        if (cancelled || !route) return;
        map.removeLayer(straight);
        L.polyline(route.coordinates.map(c => [c.lat, c.lng] as [number, number]), {
          color: '#2563EB', weight: 5, opacity: 0.9
        }).addTo(map);
        setSummary({ km: route.distanceKm, min: route.durationMin });
      }).catch(() => undefined);
    }

    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      map.remove();
    };
  }, [orderCoords?.lat, orderCoords?.lng, driverLocation?.lat, driverLocation?.lng, hub]);

  if (!isValid(orderCoords)) return null;

  const legend = [
    isValid(driverLocation) ? { color: 'bg-blue-600', text: 'Você' } : null,
    { color: 'bg-red-600', text: 'Pedido' },
    hub ? { color: 'bg-teal-700', text: hub.name } : null
  ].filter(Boolean) as Array<{ color: string; text: string }>;

  return (
    <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-slate-200">
      <div ref={containerRef} className="h-60 w-full bg-slate-100 sm:h-64" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-50 px-3 py-2">
        {legend.map(item => (
          <span key={item.text} className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-slate-700">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`} />
            <span className="truncate">{item.text}</span>
          </span>
        ))}
        {summary && (
          <span className="ml-auto inline-flex items-center gap-2 text-[11px] font-black text-slate-800">
            <span className="inline-flex items-center gap-1"><RouteIcon className="h-3 w-3" />{summary.km.toFixed(1).replace('.', ',')} km</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{summary.min} min</span>
          </span>
        )}
      </div>
    </div>
  );
};
