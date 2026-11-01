import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Route, 
  DollarSign, 
  Plus, 
  Trash2, 
  Tag, 
  MessageCircle, 
  Check, 
  Compass, 
  Loader2, 
  Share2, 
  Copy,
  Clock,
  MapPin,
  Package,
  Bike,
  Car,
  Truck,
  CreditCard,
  ChevronDown
} from 'lucide-react';
import L from 'leaflet';
import { Place, PaymentConditionType } from '../../types/map';
import { CachedTileLayer, PRIMARY_TILE_CONFIG } from '../../services/tileCache';
import { createPlaceMarkerIcon } from '../map/FullscreenMap';
import { fetchRoute, RouteResult } from '../../services/routingService';
import { 
  formatCurrency, 
  getPaymentRules, 
  calculatePaymentAdjustment, 
  PaymentConditionRule 
} from '../../services/paymentSettingsService';
import { CurrencyCentsInput } from '../common/CurrencyCentsInput';
import { getPricingSettings } from '../../services/pricingSettingsService';
import { PricingItemAddMenu } from '../common/PricingItemAddMenu';

interface OrderFinalDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  place: Place;
  readOnly?: boolean;
  onUpdatePlace?: (updates: Partial<Place>) => void;
}

export const OrderFinalDetailsModal: React.FC<OrderFinalDetailsModalProps> = ({
  isOpen,
  onClose,
  place,
  readOnly = false,
  onUpdatePlace
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Preços discriminados ou frete único editáveis
  const [priceItems, setPriceItems] = useState<Array<{
    id: string;
    name: string;
    value: number;
    category?: 'coleta' | 'transporte' | 'entrega' | 'extra';
    isRemovable?: boolean;
  }>>(() => {
    if (place.priceItems && place.priceItems.length > 0) {
      return place.priceItems;
    }
    const pricingSettings = getPricingSettings();
    const baseTotal = place.price || 30.5;

    if (pricingSettings.pricingModel === 'frete_unico') {
      return [
        { id: 'frete', name: 'Preço do Frete', value: baseTotal, category: 'extra', isRemovable: false }
      ];
    }

    return [
      { id: 'coleta', name: 'Preço de Coleta', value: 8.0, category: 'coleta', isRemovable: false },
      { id: 'transporte', name: 'Transporte Entre Cidades', value: Math.max(0, Math.round((baseTotal - 14) * 10) / 10), category: 'transporte', isRemovable: false },
      { id: 'entrega', name: 'Preço de Entrega', value: 6.0, category: 'entrega', isRemovable: false }
    ];
  });

  // Descontos editáveis
  const [discountItems, setDiscountItems] = useState<Array<{
    id: string;
    name: string;
    value: number;
    isRemovable?: boolean;
  }>>(() => {
    if (place.discountItems && place.discountItems.length > 0) {
      return place.discountItems;
    }
    return [
      { id: 'desc-principal', name: 'Desconto Comercial', value: 0, isRemovable: false }
    ];
  });

  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Condição de pagamento selecionada
  const [paymentCondition, setPaymentCondition] = useState<PaymentConditionType>(() => {
    return place.paymentCondition || 'antes_entrega';
  });

  // Regras de pagamento carregadas das configurações
  const [paymentRules, setPaymentRules] = useState<PaymentConditionRule[]>(() => getPaymentRules());

  // Menu dropdown da condição de pagamento
  const [isPaymentMenuOpen, setIsPaymentMenuOpen] = useState(false);

  useEffect(() => {
    const handleGlobalClick = () => setIsPaymentMenuOpen(false);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const currentRule = useMemo(() => {
    return paymentRules.find(r => r.id === paymentCondition) || paymentRules[0] || {
      id: paymentCondition,
      label: 'Pagar antes da entrega',
      description: 'Pagamento antecipado',
      adjustmentType: 'desconto' as const,
      adjustmentMode: 'percent' as const,
      adjustmentValue: 5
    };
  }, [paymentRules, paymentCondition]);

  // Recalcular totais
  const totalPrices = useMemo(() => {
    return priceItems.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
  }, [priceItems]);

  const totalDiscounts = useMemo(() => {
    return discountItems.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
  }, [discountItems]);

  const subtotalAfterDiscounts = useMemo(() => {
    return Math.max(0, Math.round((totalPrices - totalDiscounts) * 100) / 100);
  }, [totalPrices, totalDiscounts]);

  const paymentAdjustment = useMemo(() => {
    return calculatePaymentAdjustment(subtotalAfterDiscounts, paymentCondition, paymentRules);
  }, [subtotalAfterDiscounts, paymentCondition, paymentRules]);

  const finalPrice = useMemo(() => {
    return Math.max(0, Math.round((subtotalAfterDiscounts + paymentAdjustment.amount) * 100) / 100);
  }, [subtotalAfterDiscounts, paymentAdjustment]);

  // Coordenadas dos pontos (apenas exibe se estiverem realmente setadas)
  const op = place.operationType || 'coleta';
  const hasColetaCoords = Boolean(place.pickupCoordinates?.lat && place.pickupCoordinates?.lng);
  const hasEntregaCoords = Boolean(place.deliveryCoordinates?.lat && place.deliveryCoordinates?.lng);
  const hasTrocaCoords = Boolean(place.exchangeCoordinates?.lat && place.exchangeCoordinates?.lng);

  const pickupCoords = hasColetaCoords 
    ? place.pickupCoordinates! 
    : (op === 'coleta' ? place.coordinates : null);
  const deliveryCoords = hasEntregaCoords 
    ? place.deliveryCoordinates! 
    : (op === 'entrega' ? place.coordinates : null);
  const exchangeCoords = hasTrocaCoords 
    ? place.exchangeCoordinates! 
    : (op === 'troca' ? place.coordinates : null);

  const shouldShowColeta = hasColetaCoords || op === 'coleta';
  const shouldShowEntrega = hasEntregaCoords || op === 'entrega';
  const shouldShowTroca = op === 'troca';

  const distanceKm = routeInfo?.distanceKm ?? (place.operationType === 'troca' ? 18.2 : 12.5);
  const durationMin = routeInfo?.durationMin ?? (place.operationType === 'troca' ? 38 : 26);

  // Inicializa mapa e traçado da rota
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const centerCoords = place.coordinates || deliveryCoords || pickupCoords || { lat: -16.686893, lng: -49.264843 };

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      center: [centerCoords.lat, centerCoords.lng],
      zoom: 14
    });

    const tileLayer = new CachedTileLayer(PRIMARY_TILE_CONFIG.url, {
      maxZoom: PRIMARY_TILE_CONFIG.maxZoom,
      minZoom: 4
    });
    tileLayer.addTo(map);

    const allPts: L.LatLngExpression[] = [];

    // Marcador de Coleta (Azul)
    if (shouldShowColeta && pickupCoords) {
      const pickupMarker = L.marker([pickupCoords.lat, pickupCoords.lng], {
        icon: createPlaceMarkerIcon({
          ...place,
          id: `${place.id}-coleta`,
          name: place.pickupName || 'Coleta',
          operationType: 'coleta',
          coordinates: pickupCoords
        }, false)
      }).addTo(map);
      pickupMarker.bindTooltip('A • Ponto de Coleta', { permanent: false, direction: 'top' });
      allPts.push([pickupCoords.lat, pickupCoords.lng]);
    }

    // Marcador de Troca (se for modalidade troca)
    if (shouldShowTroca && exchangeCoords) {
      const exchangeMarker = L.marker([exchangeCoords.lat, exchangeCoords.lng], {
        icon: createPlaceMarkerIcon({
          ...place,
          id: `${place.id}-troca`,
          name: place.exchangeName || 'Troca',
          operationType: 'troca',
          coordinates: exchangeCoords
        }, false)
      }).addTo(map);
      exchangeMarker.bindTooltip('T • Ponto de Troca', { permanent: false, direction: 'top' });
      allPts.push([exchangeCoords.lat, exchangeCoords.lng]);
    }

    // Marcador de Entrega (Laranja)
    if (shouldShowEntrega && deliveryCoords) {
      const deliveryMarker = L.marker([deliveryCoords.lat, deliveryCoords.lng], {
        icon: createPlaceMarkerIcon({
          ...place,
          id: `${place.id}-entrega`,
          name: place.deliveryName || 'Entrega',
          operationType: 'entrega',
          coordinates: deliveryCoords
        }, true)
      }).addTo(map);
      deliveryMarker.bindTooltip('B • Ponto de Entrega', { permanent: false, direction: 'top' });
      allPts.push([deliveryCoords.lat, deliveryCoords.lng]);
    }

    // Ajusta visualização inicial
    if (allPts.length >= 2) {
      map.fitBounds(L.latLngBounds(allPts), { padding: [40, 40] });
    } else if (allPts.length === 1) {
      map.setView(allPts[0], 15);
    }

    mapInstanceRef.current = map;

    // Busca rota real pelas vias SOMENTE se houver Coleta E Entrega reais
    if (hasColetaCoords && hasEntregaCoords && pickupCoords && deliveryCoords) {
      setIsCalculatingRoute(true);
      fetchRoute(pickupCoords, deliveryCoords)
        .then(res => {
          if (!res || !mapInstanceRef.current) return;
          setRouteInfo(res);
          if (res.coordinates && res.coordinates.length > 0) {
            const latLngs = res.coordinates.map(c => [c.lat, c.lng] as [number, number]);
            const polyline = L.polyline(latLngs, {
              color: '#0B5187',
              weight: 5,
              opacity: 0.85,
              lineJoin: 'round'
            }).addTo(mapInstanceRef.current);
            mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40] });
          }
        })
        .catch(() => {
          if (!mapInstanceRef.current || allPts.length < 2) return;
          const poly = L.polyline(allPts, {
            color: '#0B5187',
            weight: 4,
            opacity: 0.7,
            dashArray: '6, 8'
          }).addTo(mapInstanceRef.current);
          mapInstanceRef.current.fitBounds(poly.getBounds(), { padding: [40, 40] });
        })
        .finally(() => {
          setIsCalculatingRoute(false);
        });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, deliveryCoords?.lat, deliveryCoords?.lng, pickupCoords?.lat, pickupCoords?.lng, exchangeCoords?.lat, exchangeCoords?.lng, place.operationType, hasColetaCoords, hasEntregaCoords, hasTrocaCoords]);

  if (!isOpen) return null;

  // Handlers de edição de preços
  const handleUpdatePriceItem = (id: string, updates: Partial<{ name: string; value: number }>) => {
    if (readOnly) return;
    setPriceItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleAddPriceItem = (preset?: { name: string; value: number }) => {
    if (readOnly) return;
    const newId = `extra-${Date.now()}`;
    setPriceItems(prev => [
      ...prev,
      { 
        id: newId, 
        name: preset?.name || 'Taxa de Espera', 
        value: preset?.value !== undefined ? preset.value : 10.0, 
        category: 'extra', 
        isRemovable: true 
      }
    ]);
  };

  const handleRemovePriceItem = (id: string) => {
    if (readOnly) return;
    setPriceItems(prev => prev.filter(item => item.id !== id));
  };

  // Handlers de desconto
  const handleUpdateDiscountItem = (id: string, updates: Partial<{ name: string; value: number }>) => {
    if (readOnly) return;
    setDiscountItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleAddDiscountItem = (preset?: { name: string; value: number }) => {
    if (readOnly) return;
    const newId = `desc-${Date.now()}`;
    setDiscountItems(prev => [
      ...prev,
      { 
        id: newId, 
        name: preset?.name || 'Desconto Comercial', 
        value: preset?.value !== undefined ? preset.value : 5.0, 
        isRemovable: true 
      }
    ]);
  };

  const handleRemoveDiscountItem = (id: string) => {
    if (readOnly) return;
    setDiscountItems(prev => prev.filter(item => item.id !== id));
  };

  // Salvar alterações de preço no local
  const handleSavePriceDetails = () => {
    if (readOnly) return;
    if (onUpdatePlace) {
      onUpdatePlace({
        price: finalPrice,
        priceItems,
        discountItems,
        totalDiscounts,
        paymentCondition,
        paymentAdjustmentType: paymentAdjustment.adjustmentType,
        paymentAdjustmentValue: paymentAdjustment.configuredValue,
        paymentAdjustmentMode: paymentAdjustment.adjustmentMode
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    }
  };

  // Compartilhamento no WhatsApp
  const handleShareOnWhatsApp = (targetPhone?: string) => {
    const code = place.orderCode || place.id.replace('pedido-', '#EN-');
    const opLabel = (place.operationType || 'coleta').toUpperCase();
    const cust = place.customerName || 'A definir';
    const custTel = place.customerPhone || '';
    const resp = place.responsibleName || 'A definir';
    const respTel = place.responsiblePhone || '';
    const pickup = place.pickupAddress || place.address;
    const delivery = place.deliveryAddress || place.address;
    const exchange = place.exchangeAddress || '';

    const mapLink = pickupCoords && deliveryCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${pickupCoords.lat},${pickupCoords.lng}&destination=${deliveryCoords.lat},${deliveryCoords.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${place.coordinates.lat},${place.coordinates.lng}`;

    let text = `🚚 *PEDIDO ${code}*\n`;
    text += `🏷️ *Operação:* ${opLabel}\n`;
    text += `👤 *Cliente:* ${cust}${custTel ? ` (${custTel})` : ''}\n`;
    text += `📋 *Responsável:* ${resp}${respTel ? ` (${respTel})` : ''}\n\n`;

    text += `📍 *Locais:*\n`;
    text += `• *Coleta:* ${pickup}\n`;
    if (place.operationType === 'troca' && exchange) {
      text += `• *Troca:* ${exchange}\n`;
    }
    text += `• *Entrega:* ${delivery}\n\n`;

    if (distanceKm > 0) {
      text += `⚡ *Distância estimada:* ${distanceKm} km (~${durationMin} min)\n`;
    }
    text += `🛵 *Veículo:* ${(place.vehicleType || 'moto').toUpperCase()} | Carga: ${place.packageType || 'Caixa'}\n`;
    if (place.volumesCount && place.volumesCount > 1) {
      text += `📦 *Volumes:* ${place.volumesCount} volumes\n`;
    }
    if (place.dimensions) {
      text += `📐 *Dimensões:* ${place.dimensions}\n`;
    }
    if (place.weightKg) {
      text += `⚖️ *Peso:* ${place.weightKg}\n`;
    }
    if (place.isFragile) {
      text += `⚠️ *Atenção:* Carga Frágil\n`;
    }
    if (place.scheduledDate) {
      text += `📅 *Agendado para:* ${place.scheduledDate} ${place.scheduledTime ? `(${place.scheduledTimeMode === 'partir' ? 'Após' : 'Até'} ${place.scheduledTime})` : ''}\n`;
    }
    if (place.observations) {
      text += `📝 *Observações:* ${place.observations}\n`;
    }

    text += `\n💰 *Preço Discriminado:*\n`;
    priceItems.forEach(item => {
      text += `• ${item.name}: ${formatCurrency(item.value)}\n`;
    });
    if (totalDiscounts > 0) {
      text += `🏷️ *Descontos Comerciais:* - ${formatCurrency(totalDiscounts)}\n`;
    }
    text += `💳 *Condição de Pagamento:* ${paymentAdjustment.conditionLabel}`;
    if (paymentAdjustment.adjustmentType !== 'nenhum') {
      text += ` (${paymentAdjustment.summaryText})`;
    }
    text += `\n`;
    text += `\n💵 *TOTAL FINAL A PAGAR: ${formatCurrency(finalPrice)}*\n\n`;
    text += `🗺️ *Traçado da Rota:* ${mapLink}`;

    let cleanPhone = (targetPhone || custTel || respTel || '').replace(/\D/g, '');
    if (cleanPhone && !cleanPhone.startsWith('55') && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
      cleanPhone = `55${cleanPhone}`;
    }

    const encodedText = encodeURIComponent(text);
    if (cleanPhone) {
      window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
    }
  };

  const handleCopySummary = async () => {
    const code = place.orderCode || place.id.replace('pedido-', '#EN-');
    const opLabel = (place.operationType || 'coleta').toUpperCase();
    const cust = place.customerName || 'A definir';
    const pickup = place.pickupAddress || place.address;
    const delivery = place.deliveryAddress || place.address;

    let text = `🚚 PEDIDO ${code} (${opLabel})\n`;
    text += `Cliente: ${cust}\n`;
    text += `Coleta: ${pickup}\n`;
    text += `Entrega: ${delivery}\n`;
    text += `Distância: ${distanceKm} km\n`;
    text += `Condição de Pagamento: ${paymentAdjustment.conditionLabel}\n`;
    text += `Total: ${formatCurrency(finalPrice)}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const orderDisplayCode = place.orderCode || (place.id.startsWith('pedido-') ? `#EN-${place.id.slice(-4)}` : `#${place.id}`);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* CABEÇALHO */}
        <header className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-slate-900 via-[#0B5187] to-slate-900 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-xs">
              <DollarSign className="w-5 h-5 stroke-[2.8]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full border border-amber-300/30">
                  Detalhes do Pedido
                </span>
                <span className="text-xs font-black text-slate-200">
                  {orderDisplayCode}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black leading-tight text-white">
                Detalhes do Pedido
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
            title="Fechar"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </header>

        {/* FEEDBACK TOASTS */}
        {savedToast && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-black flex items-center justify-center gap-1.5 shrink-0 shadow-xs animate-in slide-in-from-top-1">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Preços e taxas salvos com sucesso na encomenda!</span>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL COM SCROLL */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* LADO ESQUERDO: MAPA REAL DA ROTA + ENDEREÇOS (7 COLUNAS) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Route className="w-4 h-4 text-[#0B5187]" />
                  <span>Traçado da Rota nas Vias</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-[#0B5187] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    ⚡ {distanceKm} km
                  </span>
                  <span className="text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                    ⏱️ ~{durationMin} min
                  </span>
                </div>
              </div>

              {/* MAPA INTERATIVO REAL LEAFLET */}
              <div className="relative w-full h-56 sm:h-72 rounded-2xl overflow-hidden border-2 border-slate-300 shadow-md bg-slate-100">
                <div 
                  ref={mapContainerRef} 
                  className="w-full h-full pointer-events-auto"
                />

                {isCalculatingRoute && (
                  <div className="absolute top-3 left-3 z-[400] bg-slate-900/90 text-white backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 pointer-events-none">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                    <span>Calculando rota oficial...</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const map = mapInstanceRef.current;
                    if (!map) return;
                    const allPts: L.LatLngExpression[] = [];
                    if (pickupCoords) allPts.push([pickupCoords.lat, pickupCoords.lng]);
                    if (exchangeCoords) allPts.push([exchangeCoords.lat, exchangeCoords.lng]);
                    if (deliveryCoords) allPts.push([deliveryCoords.lat, deliveryCoords.lng]);
                    if (allPts.length === 0 && place.coordinates) allPts.push([place.coordinates.lat, place.coordinates.lng]);

                    if (allPts.length >= 2) {
                      map.fitBounds(L.latLngBounds(allPts), { padding: [45, 45], animate: true });
                    } else if (allPts.length === 1) {
                      map.setView(allPts[0], 15, { animate: true });
                    }
                  }}
                  className="absolute bottom-3 right-3 z-[400] bg-white/95 backdrop-blur-xs hover:bg-white text-[#0B5187] font-black text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  title="Enquadrar a rota inteira"
                >
                  <Compass className="w-3.5 h-3.5 text-[#0B5187]" />
                  <span>Enquadrar Rota</span>
                </button>
              </div>

              {/* RESUMO DOS LOCAIS */}
              <div className={`grid gap-2 text-xs ${place.operationType === 'troca' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {/* Coleta */}
                <div className="bg-blue-50/80 p-2.5 rounded-xl border border-blue-200 shadow-2xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#0B5187] block">
                    A • Coleta
                  </span>
                  <p className="font-extrabold text-slate-900 truncate mt-0.5">
                    {place.pickupAddress || place.address}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold truncate mt-0.5">
                    {place.pickupContact || place.customerName || 'Ponto de retirada'}
                  </p>
                </div>

                {/* Troca */}
                {place.operationType === 'troca' && (
                  <div className="bg-purple-50/80 p-2.5 rounded-xl border border-purple-200 shadow-2xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#7C3AED] block">
                      T • Troca
                    </span>
                    <p className="font-extrabold text-slate-900 truncate mt-0.5">
                      {place.exchangeAddress || 'Ponto de troca'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold truncate mt-0.5">
                      {place.exchangeContact || 'Responsável na troca'}
                    </p>
                  </div>
                )}

                {/* Entrega */}
                <div className="bg-orange-50/80 p-2.5 rounded-xl border border-orange-200 shadow-2xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#FF5E00] block">
                    B • Entrega
                  </span>
                  <p className="font-extrabold text-slate-900 truncate mt-0.5">
                    {place.deliveryAddress || place.address}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold truncate mt-0.5">
                    {place.deliveryContact || place.responsibleName || place.customerName || 'Destinatário'}
                  </p>
                </div>
              </div>

              {/* DADOS ADICIONAIS DO PEDIDO */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 flex flex-wrap gap-2 items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black text-slate-900 uppercase text-[11px]">Modalidade:</span>
                  <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold">
                    {place.operationType === 'coleta' ? 'Coleta' : place.operationType === 'troca' ? 'Troca' : 'Entrega'}
                  </span>
                  <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold">
                    {place.vehicleType || 'Moto'}
                  </span>
                  <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold capitalize">
                    {place.packageType || 'Caixa'}
                  </span>
                  {place.volumesCount && place.volumesCount > 1 && (
                    <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold text-slate-900">
                      📦 {place.volumesCount} volumes
                    </span>
                  )}
                  {place.dimensions && (
                    <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold text-slate-900">
                      📐 {place.dimensions}
                    </span>
                  )}
                  {place.weightKg && (
                    <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold text-slate-900">
                      ⚖️ {place.weightKg}
                    </span>
                  )}
                  {place.isFragile && (
                    <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 font-bold">
                      ⚠️ Frágil
                    </span>
                  )}
                  {place.scheduledDate && (
                    <span className="bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded-md border border-indigo-200 font-bold">
                      📅 {place.scheduledDate} {place.scheduledTime ? `(${place.scheduledTimeMode === 'partir' ? 'Após' : 'Até'} ${place.scheduledTime})` : ''}
                    </span>
                  )}
                </div>
                {place.observations && (
                  <div className="w-full text-[11px] bg-amber-50 p-2 rounded-lg border border-amber-200 text-amber-900">
                    <strong>Obs:</strong> {place.observations}
                  </div>
                )}
              </div>
            </div>

            {/* LADO DIREITO: FINANCEIRO, ITENS DISCRIMINADOS E DESCONTOS (5 COLUNAS) */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              
              <div className="space-y-3">
                {/* Cabeçalho da Seção de Preços */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>{priceItems.length === 1 && priceItems[0].id === 'frete' ? 'Preço do Frete' : 'Preços Discriminados'}</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{readOnly ? 'Somente Leitura' : 'Editáveis'}</span>
                </div>

                {/* 1. Lista de Itens de Preço */}
                <div className="space-y-1.5">
                  {priceItems.map((item) => {
                    const isFrete = item.id === 'frete';
                    const isColeta = item.id === 'coleta';
                    const isTransp = item.id === 'transporte';
                    const isEntrega = item.id === 'entrega';

                    return (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200/90 shadow-2xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {item.isRemovable && !readOnly ? (
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handleUpdatePriceItem(item.id, { name: e.target.value })}
                              placeholder="Nome da taxa ou item..."
                              className="w-full text-xs font-bold text-slate-800 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 focus:border-[#0B5187] focus:outline-none"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isFrete ? 'bg-emerald-600' : isColeta ? 'bg-[#0B5187]' : isTransp ? 'bg-indigo-600' : isEntrega ? 'bg-[#FF5E00]' : 'bg-emerald-600'}`} />
                              <span className="text-xs font-bold text-slate-800 truncate">
                                {item.name}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {readOnly ? (
                            <div className="px-2.5 py-1 bg-slate-100 rounded-lg text-right text-xs font-black text-slate-800">
                              R$ {Number(item.value || 0).toFixed(2)}
                            </div>
                          ) : (
                            <div className="flex items-center bg-slate-50 border border-slate-300 focus-within:border-[#0B5187] focus-within:ring-2 focus-within:ring-[#0B5187]/15 rounded-lg px-2 py-1 w-24 sm:w-28">
                              <CurrencyCentsInput
                                value={item.value}
                                onChange={(val) => handleUpdatePriceItem(item.id, { value: val })}
                                prefix="R$"
                                placeholder="0,00"
                                className="w-full text-right text-xs font-black text-slate-900"
                              />
                            </div>
                          )}

                          {item.isRemovable && !readOnly && (
                            <button
                              type="button"
                              onClick={() => handleRemovePriceItem(item.id)}
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              title="Remover item de preço"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {!readOnly && (
                    <PricingItemAddMenu 
                      type="fee" 
                      onSelect={handleAddPriceItem} 
                    />
                  )}
                </div>

                {/* 2. Seção de Descontos */}
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Descontos {totalDiscounts > 0 ? `(- ${formatCurrency(totalDiscounts)})` : '(Sem desconto)'}</span>
                    </span>
                    {totalDiscounts === 0 && (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        Sem desconto
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {discountItems.map((item) => (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-50/60 border border-emerald-200/80"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {item.isRemovable && !readOnly ? (
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handleUpdateDiscountItem(item.id, { name: e.target.value })}
                              placeholder="Nome do desconto..."
                              className="w-full text-xs font-bold text-emerald-950 bg-white px-2 py-1 rounded-lg border border-emerald-300 focus:border-emerald-600 focus:outline-none"
                            />
                          ) : (
                            <span className="text-xs font-bold text-emerald-950 truncate">
                              {item.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {readOnly ? (
                            <div className="px-2.5 py-1 bg-emerald-100/60 rounded-lg text-right text-xs font-black text-emerald-800">
                              - R$ {Number(item.value || 0).toFixed(2)}
                            </div>
                          ) : (
                            <div className="flex items-center bg-white border border-emerald-300 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/15 rounded-lg px-2 py-1 w-24 sm:w-28">
                              <CurrencyCentsInput
                                value={item.value}
                                onChange={(val) => handleUpdateDiscountItem(item.id, { value: val })}
                                prefix="- R$"
                                placeholder="0,00"
                                className="w-full text-right text-xs font-black text-emerald-800"
                              />
                            </div>
                          )}

                          {item.isRemovable && !readOnly && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDiscountItem(item.id)}
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              title="Remover desconto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {!readOnly && (
                      <PricingItemAddMenu 
                        type="discount" 
                        onSelect={handleAddDiscountItem} 
                      />
                    )}
                  </div>
                </div>

                {/* 3. Seção Condição de Pagamento: Apenas um botão com seletor */}
                <div className="pt-2 border-t border-slate-200 space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#0B5187]" />
                      <span>Condição de Pagamento</span>
                    </span>
                    {paymentAdjustment.adjustmentType !== 'nenhum' && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        paymentAdjustment.adjustmentType === 'desconto' 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {paymentAdjustment.summaryText}
                      </span>
                    )}
                  </div>

                  {/* Apenas um botão seletor para alterar a condição */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={(e) => {
                        if (readOnly) return;
                        e.stopPropagation();
                        setIsPaymentMenuOpen(!isPaymentMenuOpen);
                      }}
                      className={`w-full p-2.5 rounded-xl border border-slate-200 bg-white transition-all flex items-center justify-between gap-2 shadow-xs group ${readOnly ? 'cursor-default' : 'hover:border-[#0B5187]/60 hover:bg-slate-50 cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 text-left">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          currentRule.adjustmentType === 'desconto'
                            ? 'bg-emerald-50 text-emerald-600'
                            : currentRule.adjustmentType === 'acrescimo'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-blue-50 text-[#0B5187]'
                        }`}>
                          <CreditCard className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-800 truncate group-hover:text-[#0B5187] transition-colors">
                            {currentRule.label}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-400 truncate">
                            {currentRule.description}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {currentRule.adjustmentType === 'desconto' && currentRule.adjustmentValue > 0 ? (
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            {currentRule.adjustmentMode === 'percent' ? `-${currentRule.adjustmentValue}% desc.` : `-${formatCurrency(currentRule.adjustmentValue)}`}
                          </span>
                        ) : currentRule.adjustmentType === 'acrescimo' && currentRule.adjustmentValue > 0 ? (
                          <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            {currentRule.adjustmentMode === 'percent' ? `+${currentRule.adjustmentValue}% taxa` : `+${formatCurrency(currentRule.adjustmentValue)}`}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                            Preço padrão
                          </span>
                        )}
                        {!readOnly && (
                          <ChevronDown className={`w-4 h-4 text-slate-400 group-hover:text-[#0B5187] transition-transform duration-200 ${isPaymentMenuOpen ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </button>

                    {/* Menu Popover das Opções */}
                    {isPaymentMenuOpen && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 py-1"
                      >
                        {paymentRules.map((rule) => {
                          const isSelected = paymentCondition === rule.id;
                          const hasDiscount = rule.adjustmentType === 'desconto' && rule.adjustmentValue > 0;
                          const hasSurcharge = rule.adjustmentType === 'acrescimo' && rule.adjustmentValue > 0;

                          return (
                            <button
                              key={rule.id}
                              type="button"
                              onClick={() => {
                                setPaymentCondition(rule.id);
                                setIsPaymentMenuOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                isSelected ? 'bg-[#0B5187]/10 text-[#0B5187]' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                  {isSelected && <Check className="w-3.5 h-3.5 text-[#0B5187] stroke-[3] shrink-0" />}
                                  <span>{rule.label}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate pl-5">
                                  {rule.description}
                                </div>
                              </div>

                              <div className="shrink-0">
                                {hasDiscount ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    {rule.adjustmentMode === 'percent' ? `-${rule.adjustmentValue}% desc.` : `-${formatCurrency(rule.adjustmentValue)}`}
                                  </span>
                                ) : hasSurcharge ? (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                    {rule.adjustmentMode === 'percent' ? `+${rule.adjustmentValue}% taxa` : `+${formatCurrency(rule.adjustmentValue)}`}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-400">
                                    Padrão
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Preço Final com Discriminação Completa e Linhas Explícitas de Desconto / Taxa */}
                <div className="pt-2.5 border-t-2 border-slate-200 bg-white p-3 rounded-2xl border space-y-2">
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-500">Subtotal dos Itens:</span>
                      <span className="font-bold text-slate-800">{formatCurrency(totalPrices)}</span>
                    </div>

                    {totalDiscounts > 0 && (
                      <div className="flex items-center justify-between text-emerald-700">
                        <span className="font-semibold">Descontos Comerciais:</span>
                        <span className="font-black">- {formatCurrency(totalDiscounts)}</span>
                      </div>
                    )}

                    {/* Linha explícita de desconto quando pagar antes da entrega */}
                    {paymentAdjustment.adjustmentType === 'desconto' && (
                      <div className="flex items-center justify-between text-emerald-700 bg-emerald-50/70 px-2 py-1 rounded-lg border border-emerald-200">
                        <span className="font-bold flex items-center gap-1">
                          <span>🏷️ Desconto ({paymentAdjustment.conditionLabel}):</span>
                        </span>
                        <span className="font-black shrink-0">
                          - {paymentAdjustment.formattedAmount}
                        </span>
                      </div>
                    )}

                    {/* Linha explícita de acréscimo de taxa quando quinzenal ou mensal */}
                    {paymentAdjustment.adjustmentType === 'acrescimo' && (
                      <div className="flex items-center justify-between text-amber-800 bg-amber-50/70 px-2 py-1 rounded-lg border border-amber-200">
                        <span className="font-bold flex items-center gap-1">
                          <span>📈 Acréscimo Taxa ({paymentAdjustment.conditionLabel}):</span>
                        </span>
                        <span className="font-black shrink-0">
                          + {paymentAdjustment.formattedAmount}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block leading-tight">
                        Total Final a Pagar
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 truncate max-w-[150px] sm:max-w-[200px] block">
                        {paymentAdjustment.conditionLabel}
                      </span>
                    </div>
                    <span className="text-2xl sm:text-3xl font-black text-[#FF5E00]">
                      {formatCurrency(finalPrice)}
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* RODAPÉ COM BOTÕES: VOLTAR (ESQUERDA) | COPIAR (ÍCONE), COMPARTILHAR (ÍCONE), SALVAR (TEXTO) (DIREITA) */}
        <footer className="px-4 sm:px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer shadow-xs active:scale-95"
          >
            Voltar
          </button>

          <div className="flex items-center gap-2">
            {/* BOTÃO COPIAR (APENAS ÍCONE) */}
            <button
              type="button"
              onClick={handleCopySummary}
              className="w-10 sm:w-11 h-10 sm:h-11 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs"
              title={copiedToast ? "Resumo copiado com sucesso!" : "Copiar resumo do pedido"}
              aria-label="Copiar resumo do pedido"
            >
              {copiedToast ? <Check className="w-5 h-5 text-emerald-600 stroke-[3]" /> : <Copy className="w-5 h-5" />}
            </button>

            {/* BOTÃO COMPARTILHAR NO WHATSAPP (APENAS ÍCONE) */}
            <button
              type="button"
              onClick={() => handleShareOnWhatsApp(place.customerPhone || place.responsiblePhone)}
              className="w-10 sm:w-11 h-10 sm:h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md shadow-emerald-600/25"
              title="Compartilhar no WhatsApp"
              aria-label="Compartilhar no WhatsApp"
            >
              <MessageCircle className="w-5 h-5 fill-current" />
            </button>

            {/* BOTÃO SALVAR PEDIDO (COM TEXTO - Oculto em modo somente leitura para motoristas) */}
            {!readOnly && (
              <button
                type="button"
                onClick={handleSavePriceDetails}
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-[#0B5187] hover:bg-[#083e68] active:scale-[0.98] text-white font-black text-xs sm:text-sm rounded-xl shadow-md shadow-[#0B5187]/25 transition-all cursor-pointer"
                title="Salvar alterações de valores e condição no pedido"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{savedToast ? 'Salvo!' : 'Salvar Pedido'}</span>
              </button>
            )}
          </div>
        </footer>

      </div>
    </div>
  );
};
