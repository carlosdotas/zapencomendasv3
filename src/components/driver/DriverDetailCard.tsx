import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  MessageCircle, 
  Phone, 
  Navigation, 
  BatteryCharging, 
  Gauge, 
  CheckCircle2, 
  Star, 
  Bike, 
  Car,
  Truck,
  PackageCheck,
  Radio
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { formatLastSeen } from '../../utils/driverUtils';
import { formatDriverLastSeen } from '../../services/driverTrackingClient';
import { getDriverPermanentColor } from '../../utils/driverColorUtils';
import { extractPhotoUrls, formatPhotoUrl } from '../../services/apiAdapters';
import { listDriverCollections, type DriverCollection } from '../../services/driverCollectionsService';

export const DriverDetailCard: React.FC = () => {
  const { selectedDriver, setSelectedDriver, flyToLocation, openPhotoViewer } = useMapStore();
  const driverId = selectedDriver?.id;
  const [collections, setCollections] = useState<DriverCollection[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    setCollections([]);
    setPage(0);
    setHasMore(false);
    setError('');
    if (!driverId) {
      setLoading(false);
      if (driverId === '') setError('Não foi possível identificar o motorista.');
      return;
    }
    setLoading(true);
    void listDriverCollections(driverId).then(response => {
      if (requestVersion.current !== version) return;
      if (!response.success || !Array.isArray(response.data)) {
        setError(response.message || 'Não foi possível carregar as coletas.');
      } else {
        setCollections(response.data);
        setPage(1);
        setHasMore(Boolean(response.hasMore));
      }
      setLoading(false);
    });
    return () => { requestVersion.current += 1; };
  }, [driverId, retry]);

  useEffect(() => {
    if (!driverId || page === 0 || loading) return;
    let active = true;
    let running = false;
    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void (async () => {
        const refreshed: DriverCollection[] = [];
        const seen = new Set<string>();
        let lastPage = 0;
        let more = false;
        for (let currentPage = 1; currentPage <= page; currentPage += 1) {
          const response = await listDriverCollections(driverId, currentPage);
          if (!active) return;
          if (!response.success || !Array.isArray(response.data)) {
            setCollections([]);
            setPage(0);
            setHasMore(false);
            setError(response.message || 'Não foi possível atualizar as coletas.');
            return;
          }
          for (const order of response.data) {
            if (!seen.has(order.id)) {
              seen.add(order.id);
              refreshed.push(order);
            }
          }
          lastPage = currentPage;
          more = Boolean(response.hasMore);
          if (!more) break;
        }
        if (!active) return;
        setCollections(refreshed);
        setPage(lastPage);
        setHasMore(more);
        setError('');
      })().catch(error => {
        console.error('[Driver collections] Falha ao atualizar coletas:', error);
        if (active) {
          setCollections([]);
          setPage(0);
          setHasMore(false);
          setError('Não foi possível atualizar as coletas.');
        }
      }).finally(() => { running = false; });
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [driverId, page, loading]);

  const loadMore = async () => {
    if (!driverId || loading || !hasMore) return;
    const version = requestVersion.current;
    setLoading(true);
    setError('');
    const response = await listDriverCollections(driverId, page + 1);
    if (requestVersion.current !== version) return;
    if (!response.success || !Array.isArray(response.data)) {
      setError(response.message || 'Não foi possível carregar mais coletas.');
    } else {
      const nextCollections = response.data;
      setCollections(previous => {
        const ids = new Set(previous.map(order => order.id));
        return [...previous, ...nextCollections.filter(order => !ids.has(order.id))];
      });
      setPage(page + 1);
      setHasMore(Boolean(response.hasMore));
    }
    setLoading(false);
  };

  if (!selectedDriver) return null;
  const driverColor = selectedDriver.color || getDriverPermanentColor(selectedDriver.id || selectedDriver.phone || selectedDriver.name);

  const handleWhatsApp = () => {
    let cleanPhone = selectedDriver.phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('55') && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
      cleanPhone = `55${cleanPhone}`;
    }
    if (typeof window !== 'undefined' && window.AndroidApp?.openWhatsApp) {
      window.AndroidApp.openWhatsApp(cleanPhone, '');
    } else {
      window.open(`https://wa.me/${cleanPhone}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCall = () => {
    window.open(`tel:${selectedDriver.phone}`, '_self');
  };

  const handleFocusDriver = () => {
    flyToLocation(selectedDriver.coordinates, 17);
  };

  const VehicleIcon = 
    selectedDriver.vehicleType === 'moto' 
      ? Bike 
      : selectedDriver.vehicleType === 'utilitario' 
      ? Truck 
      : Car;

  const lastSeen = formatLastSeen(selectedDriver.lastSeenTimestamp);
  const avatarUrl = selectedDriver.avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none p-3 sm:p-4 animate-in slide-in-from-bottom-6 duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-slate-200/90 w-full max-w-md max-h-[85dvh] pointer-events-auto overflow-hidden flex flex-col">
        
        {/* Header com a cor do motorista e Foto do Perfil */}
        <div 
          className="p-3.5 text-white flex items-center justify-between transition-colors shadow-xs"
          style={{ backgroundColor: driverColor }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Foto Real do Motorista com indicador de veículo no cantinho */}
            <div className="relative w-12 h-12 rounded-full border-2 border-white shadow-md shrink-0 bg-slate-900">
              <img 
                src={avatarUrl} 
                alt={selectedDriver.name} 
                className="w-full h-full rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80';
                }}
              />
              <div 
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center shadow-xs"
                style={{ backgroundColor: driverColor }}
              >
                <VehicleIcon className="w-3 h-3 text-white stroke-[2.5]" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight leading-tight truncate">
                  {selectedDriver.name}
                </span>
                {selectedDriver.nickname && (
                  <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-black/25 tracking-wider">
                    {selectedDriver.nickname}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/90 font-semibold truncate">
                {[selectedDriver.vehicleModel, selectedDriver.vehiclePlate].filter(Boolean).join(' • ')}
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedDriver(null)}
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/35 text-white flex items-center justify-center transition-colors active:scale-90 shrink-0 ml-2"
            title="Fechar"
          >
            <X className="w-4 h-4 stroke-[2.8]" />
          </button>
        </div>

        {/* Corpo com Informações do Motorista */}
        <div className="p-3.5 flex flex-col gap-3 overflow-y-auto">
          
          {/* Barra de Status de Rastreamento & Última Vez Visto */}
          <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span 
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{
                    backgroundColor: lastSeen.status === 'online' ? '#10B981' : lastSeen.status === 'warning' ? '#F59E0B' : '#EF4444'
                  }}
                />
                <span 
                  className="relative inline-flex rounded-full h-2.5 w-2.5"
                  style={{
                    backgroundColor: lastSeen.status === 'online' ? '#10B981' : lastSeen.status === 'warning' ? '#F59E0B' : '#EF4444'
                  }}
                />
              </span>
              <span className="font-bold text-slate-700">
                Última localização: <span className="font-black text-slate-900">{formatDriverLastSeen(selectedDriver.lastSeenTimestamp, selectedDriver.lastUpdatedStr)}</span>
              </span>
            </div>

            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border flex items-center gap-1 ${
              lastSeen.status === 'online' 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : lastSeen.status === 'warning'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              <Radio className="w-3 h-3 animate-pulse" />
              {lastSeen.status === 'online' ? 'GPS Conectado' : lastSeen.status === 'warning' ? 'Sinal Instável' : 'Sem Sinal'}
            </span>
          </div>
          
          {/* Status & Telemetria em Grid */}
          <div className="grid grid-cols-3 gap-2">
            
            {/* Status Operacional */}
            <div className="bg-slate-50 rounded-2xl p-2 border border-slate-200/80 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-black uppercase text-slate-400">Status</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span 
                  className="w-2 h-2 rounded-full animate-ping"
                  style={{ backgroundColor: driverColor }}
                />
                <span className="text-xs font-black text-slate-800">
                  {selectedDriver.status === 'em_rota' ? 'Em rota' : selectedDriver.status === 'disponivel' ? 'Disponível' : selectedDriver.status === 'em_pausa' ? 'Em pausa' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Velocidade Atual */}
            <div className="bg-slate-50 rounded-2xl p-2 border border-slate-200/80 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-black uppercase text-slate-400">Velocidade</span>
              <div className="flex items-center gap-1 mt-0.5 text-slate-800">
                <Gauge className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-black">
                  {selectedDriver.speedKmH ? `${selectedDriver.speedKmH} km/h` : 'Parado'}
                </span>
              </div>
            </div>

            {/* Bateria & Avaliação */}
            <div className="bg-slate-50 rounded-2xl p-2 border border-slate-200/80 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-black uppercase text-slate-400">Avaliação</span>
              <div className="flex items-center gap-1 mt-0.5 text-amber-600">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span className="text-xs font-black text-slate-800">
                  {selectedDriver.rating ?? '—'}
                </span>
              </div>
            </div>

          </div>

          {/* Destino / Pedido Atual */}
          {selectedDriver.currentOrderCode && (
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-[#0B5187] text-white flex items-center justify-center shrink-0">
                  <PackageCheck className="w-4 h-4 stroke-[2.4]" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#0B5187] block leading-tight">
                    Pedido em Andamento
                  </span>
                  <span className="text-xs font-black text-slate-900 truncate block">
                    {selectedDriver.currentOrderCode} {selectedDriver.destinationName ? `• ${selectedDriver.destinationName}` : ''}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                {selectedDriver.deliveriesCompleted || 100}+ entregas
              </span>
            </div>
          )}

          <section aria-label="Encomendas coletadas em aberto">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Encomendas coletadas em aberto</h3>
            <div className="mt-2 space-y-2">
              {collections.map(order => {
                const photo = extractPhotoUrls(order.photo, 'md')[0];
                return (
                  <div key={order.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    {photo ? (
                      <button
                        type="button"
                        aria-label={`Abrir foto da coleta ${order.id}`}
                        onClick={() => openPhotoViewer(formatPhotoUrl(photo, 'lg') || photo, {
                          id: `pedido-${order.id}-coleta`,
                          name: order.pickupName,
                          address: order.pickupAddress,
                          coordinates: { lat: 0, lng: 0 },
                          operationType: 'coleta',
                          customerName: order.customerName
                        })}
                        className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200"
                      >
                        <img src={photo} alt="Foto da coleta indisponível" className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-bold text-slate-600">Sem foto</div>
                    )}
                    <div className="min-w-0">
                      <p className="break-words text-xs font-black text-slate-900">{order.pickupName}</p>
                      <p className="break-words text-xs text-slate-600">Cliente: {order.customerName}</p>
                      <p className="text-[10px] text-slate-500">Pedido #{order.id}</p>
                    </div>
                  </div>
                );
              })}
              {loading && <p className="text-xs text-slate-500" role="status">Carregando coletas...</p>}
              {error && (
                <div role="alert" className="text-xs text-red-700">
                  {error}{' '}
                  <button type="button" className="font-bold underline" onClick={() => setRetry(value => value + 1)}>
                    Tentar novamente
                  </button>
                </div>
              )}
              {!loading && !error && collections.length === 0 && <p className="text-xs text-slate-500">Nenhuma encomenda coletada em aberto para este motorista.</p>}
              {!loading && !error && hasMore && (
                <button type="button" onClick={() => void loadMore()} className="text-xs font-bold text-blue-700 underline">Mostrar mais</button>
              )}
            </div>
          </section>

          {/* Ações: WhatsApp + Ligar + Centralizar */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleWhatsApp}
              className="py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/25 transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 fill-current" />
              <span>Chamar no WhatsApp</span>
            </button>

            <button
              onClick={handleFocusDriver}
              className="py-2.5 px-3 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-slate-900/20 transition-all cursor-pointer"
            >
              <Navigation className="w-4 h-4 text-sky-400 stroke-[2.4]" />
              <span>Ver no Mapa</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
