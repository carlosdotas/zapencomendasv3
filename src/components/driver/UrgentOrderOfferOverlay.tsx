import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertTriangle, Check, Clock3, MapPin, X } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { driverTrackingClient, UrgentDriverOffer } from '../../services/driverTrackingClient';
import { useBackButton } from '../../hooks/useBackButton';

const UrgentOfferMap: React.FC<{ offer: UrgentDriverOffer }> = ({ offer }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const coordinates = offer.place.coordinates;
    if (!containerRef.current || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false
    }).setView([coordinates.lat, coordinates.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);
    L.marker([coordinates.lat, coordinates.lng], {
      icon: L.divIcon({
        className: 'urgent-offer-map-pin',
        iconSize: [42, 42],
        iconAnchor: [21, 40],
        html: '<div style="width:38px;height:38px;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;box-shadow:0 3px 8px #0006;display:grid;place-items:center"><span style="transform:rotate(45deg);font-size:20px">📦</span></div>'
      })
    }).addTo(map);
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 100);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
    };
  }, [offer.place.coordinates.lat, offer.place.coordinates.lng]);

  return <div ref={containerRef} className="h-52 w-full overflow-hidden rounded-xl border border-slate-200" aria-label="Mapa do local de coleta" />;
};

export const UrgentOrderOfferOverlay: React.FC = () => {
  const { isAuthenticated, currentRole, claimPublicOrder } = useMapStore();
  const [offer, setOffer] = useState<UrgentDriverOffer | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeOfferId = useRef<string | null>(null);

  const decline = useCallback(async () => {
    if (!offer || busy) return;
    setBusy(true);
    setError('');
    try {
      const responded = await driverTrackingClient.respondToUrgentOffer(offer.offerId, false);
      if (!responded) setError('Este convite não está mais ativo.');
      window.AndroidApp?.cancelUrgentOffer?.(offer.offerId);
      activeOfferId.current = null;
      setOffer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível recusar o convite.');
    } finally {
      setBusy(false);
    }
  }, [offer, busy]);

  useBackButton('urgent-order-offer', Boolean(offer), () => {
    void decline();
  }, 100);

  useEffect(() => {
    if (!isAuthenticated || currentRole !== 'motorista') {
      setOffer(null);
      return;
    }
    const unsubscribeOffer = driverTrackingClient.onUrgentOffer(nextOffer => {
      if (nextOffer.expiresAt <= Date.now()) return;
      if (activeOfferId.current && activeOfferId.current !== nextOffer.offerId) {
        window.AndroidApp?.cancelUrgentOffer?.(activeOfferId.current);
      }
      activeOfferId.current = nextOffer.offerId;
      setError('');
      setOffer(nextOffer);
      if (window.AndroidApp?.showUrgentOffer) {
        window.AndroidApp.showUrgentOffer(nextOffer.offerId, nextOffer.place.name, nextOffer.expiresAt);
      } else {
        window.AndroidApp?.showNotification?.('Coleta urgente disponível', `${nextOffer.place.name} - toque para abrir o convite`);
      }
      if (typeof navigator !== 'undefined') navigator.vibrate?.([700, 300, 700]);
    });
    const unsubscribeCancel = driverTrackingClient.onUrgentCancel(offerId => {
      window.AndroidApp?.cancelUrgentOffer?.(offerId);
      if (activeOfferId.current === offerId) activeOfferId.current = null;
      setOffer(current => current?.offerId === offerId ? null : current);
    });
    return () => {
      unsubscribeOffer();
      unsubscribeCancel();
      activeOfferId.current = null;
    };
  }, [isAuthenticated, currentRole]);

  useEffect(() => {
    if (!offer) return;
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((offer.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0) {
        window.AndroidApp?.cancelUrgentOffer?.(offer.offerId);
        if (activeOfferId.current === offer.offerId) activeOfferId.current = null;
        setOffer(current => current?.offerId === offer.offerId ? null : current);
      }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, [offer]);

  const accept = async () => {
    if (!offer || busy) return;
    setBusy(true);
    setError('');
    try {
      const accepted = await claimPublicOrder(offer.place.id, 'coleta');
      if (accepted) {
        window.AndroidApp?.cancelUrgentOffer?.(offer.offerId);
        activeOfferId.current = null;
        setOffer(null);
      }
      else setError('Outro motorista já aceitou esta coleta ou ela não está mais disponível.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar a coleta.');
    } finally {
      setBusy(false);
    }
  };

  if (!offer || !isAuthenticated || currentRole !== 'motorista') return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="urgent-offer-title"
        className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <header className="flex items-center gap-3 bg-red-600 px-5 py-4 text-white">
          <div className="rounded-full bg-white/20 p-2"><AlertTriangle size={23} /></div>
          <div className="min-w-0 flex-1">
            <h1 id="urgent-offer-title" className="text-lg font-black">Coleta urgente</h1>
            <p className="text-sm font-semibold text-red-100">Responda antes de o convite passar ao próximo motorista</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-2 font-black tabular-nums">
            <Clock3 size={16} /> {remainingSeconds}s
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <UrgentOfferMap offer={offer} />
          <div className="rounded-xl bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 shrink-0 text-red-600" size={19} />
              <div>
                <h2 className="font-black text-slate-900">{offer.place.name}</h2>
                <p className="mt-0.5 text-sm text-slate-600">{offer.place.address || 'Endereço não informado'}</p>
                {offer.distanceKm !== undefined && (
                  <p className="mt-1 text-xs font-bold text-red-700">{offer.distanceKm.toFixed(1)} km de você</p>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="block text-[11px] font-bold uppercase text-slate-500">Pedido</span>
              <span className="font-black text-slate-800">#{offer.place.orderCode || offer.place.orderId || ''}</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="block text-[11px] font-bold uppercase text-slate-500">Operação</span>
              <span className="font-black text-slate-800">Coleta</span>
            </div>
          </div>
          {(offer.place.customerName || offer.place.pickupContact || offer.place.pickupPhone || offer.place.vehicleType) && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {offer.place.customerName && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="block text-[11px] font-bold uppercase text-slate-500">Cliente</span>
                  <span className="font-semibold text-slate-800">{offer.place.customerName}</span>
                </div>
              )}
              {offer.place.vehicleType && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="block text-[11px] font-bold uppercase text-slate-500">Veículo</span>
                  <span className="font-semibold capitalize text-slate-800">{offer.place.vehicleType}</span>
                </div>
              )}
              {offer.place.pickupContact && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="block text-[11px] font-bold uppercase text-slate-500">Contato da coleta</span>
                  <span className="font-semibold text-slate-800">{offer.place.pickupContact}</span>
                </div>
              )}
              {offer.place.pickupPhone && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="block text-[11px] font-bold uppercase text-slate-500">Telefone</span>
                  <span className="font-semibold text-slate-800">{offer.place.pickupPhone}</span>
                </div>
              )}
            </div>
          )}
          {(offer.place.pickupNotes || offer.place.observations || offer.place.description) && (
            <div className="rounded-xl border border-slate-200 p-3">
              <span className="block text-[11px] font-bold uppercase text-slate-500">Detalhes do pedido</span>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {offer.place.pickupNotes || offer.place.observations || offer.place.description}
              </p>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-700">{error}</p>}
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-slate-100 p-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decline()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 font-black text-slate-700 disabled:opacity-50"
          >
            <X size={19} /> Recusar
          </button>
          <button
            type="button"
            disabled={busy || remainingSeconds <= 0}
            onClick={() => void accept()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-black text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            <Check size={19} /> {busy ? 'Aguarde...' : 'Aceitar'}
          </button>
        </footer>
      </section>
    </div>
  );
};
