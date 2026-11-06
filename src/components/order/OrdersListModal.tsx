import React, { useState, useMemo, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  Search,
  Package,
  Clock,
  CheckCircle2,
  DollarSign,
  Navigation,
  MessageCircle,
  Calendar,
  AlertCircle,
  Trash2,
  Check,
  CheckCheck,
  Ban,
  ShieldCheck,
  ShoppingCart,
  LayoutGrid,
  ExternalLink,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Camera,
  MoreVertical,
  SlidersHorizontal,
  Map as MapIcon,
  Link2,
  Loader2,
  Zap,
  Truck,
  Box
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { Place, DateRangeFilter } from '../../types/map';
import { useBackButton } from '../../hooks/useBackButton';
import { CalendarFilterModal } from '../navigation/CalendarFilterModal';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { canClaimOrders } from '../../utils/canClaimOrders';
import { getBaseOrderId, getOrderKey } from '../../utils/orderIds';
import { api } from '../../services/api';
import { collectOpenBills, buildOpenBillsMessage } from '../../utils/customerBilling';

interface OrdersListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type OperationFilterTab = 'todos' | 'coleta' | 'entrega' | 'troca';
type StatusFilterTab = 'todos' | 'pendente' | 'em_rota' | 'concluido';
type PaymentFilterTab = 'todos' | 'pago' | 'pendente';
type DateFilterTab = 'todos' | 'hoje' | 'agendados';

const PAGE_SIZE = 60;

const formatBRL = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const orderIsPaid = (p: Place) =>
  (p as any).status_pagamento === 'pago' ||
  (p as any).paymentStatus === 'pago' ||
  (p as any).isPaid === true;

const orderIsFinished = (p: Place) =>
  p.orderStage === 'concluido' ||
  (p as any).isCompleted ||
  ['concluido', 'finalizado', 'entregue'].includes((p as any).etapa);

interface OrderPriceBreakdown {
  finalPrice: number;
  items: Array<{ name: string; value: number }>;
  discount: number;
  paymentCondition?: string;
}

const getOrderPriceBreakdown = (p: Place): OrderPriceBreakdown => {
  let finalPrice = Number(p.price) || 0;
  const items: Array<{ name: string; value: number }> = [];
  let discount = 0;

  if (p.priceItems && Array.isArray(p.priceItems) && p.priceItems.length > 0) {
    p.priceItems.forEach(item => {
      const val = Number(item.value) || 0;
      if (val > 0) items.push({ name: item.name, value: val });
    });
  }

  if (p.discountItems && Array.isArray(p.discountItems) && p.discountItems.length > 0) {
    discount = p.discountItems.reduce((acc, d) => acc + (Number(d.value) || 0), 0);
  } else if (p.totalDiscounts) {
    discount = Number(p.totalDiscounts) || 0;
  }

  if (!finalPrice) {
    const raw = (p as any).total ?? (p as any).valor_total ?? (p as any).valor;
    if (raw !== undefined && raw !== null && !isNaN(Number(raw))) {
      finalPrice = Number(raw);
    } else if (items.length > 0) {
      const sum = items.reduce((acc, it) => acc + it.value, 0);
      finalPrice = Math.max(0, sum - discount);
    }
  }

  return {
    finalPrice,
    items,
    discount,
    paymentCondition: p.paymentCondition
  };
};

const orderPrice = (p: Place) => getOrderPriceBreakdown(p).finalPrice;

const orderDateKey = (p: Place, todayStr: string) => {
  const raw = p.scheduledDate || (p as any).data || (p as any).orderDate || '';
  const key = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : todayStr;
};

const formatDateBR = (key: string) => {
  const [y, m, d] = key.split('-');
  return y && m && d ? `${d}/${m}/${y}` : key;
};

// Primeiro trecho do endereço (ex.: "R. V-4, 373 - Centro" → "R. V-4, 373")
const shortPlace = (name?: string, address?: string, city?: string) => {
  const value = (name || '').trim() || (address || '').split(' - ')[0].trim() || (city || '').trim();
  return value || 'A definir';
};

export const OrdersListModal: React.FC<OrdersListModalProps> = ({ isOpen, onClose }) => {
  useBackButton('orders-list-fullscreen', isOpen, onClose, 85);

  const {
    allPlaces,
    savedPlaces,
    completedOrders,
    setSelectedPlace,
    flyToLocation,
    deletePlace,
    currentRole,
    user,
    claimPublicOrder,
    openFinancialModal
  } = useMapStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [opFilter, setOpFilter] = useState<OperationFilterTab>('todos');
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('todos');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterTab>('todos');
  const [dateFilter, setDateFilter] = useState<DateFilterTab>('hoje');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOrderId, setMenuOrderId] = useState<string | null>(null);

  const [orderToDelete, setOrderToDelete] = useState<Place | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [trackingLinkOrderId, setTrackingLinkOrderId] = useState<string | null>(null);

  // Consolida todos os pedidos do mapa sem duplicidades (1 pedido = 1 card, nunca duplica por coleta/entrega)
  const uniqueOrders = useMemo(() => {
    const map = new Map<string, Place>();
    const mergePlaceLegs = (base: Place, next: Place): Place => ({
      ...base,
      ...next,
      id: base.id && !base.id.endsWith('-coleta') && !base.id.endsWith('-entrega') && !base.id.endsWith('-troca') ? base.id : next.id,
      orderCode: base.orderCode || next.orderCode,
      pickupName: base.pickupName || next.pickupName,
      pickupAddress: base.pickupAddress || next.pickupAddress,
      pickupCoordinates: base.pickupCoordinates || next.pickupCoordinates,
      pickupContact: base.pickupContact || next.pickupContact,
      pickupPhone: base.pickupPhone || next.pickupPhone,
      pickupNotes: base.pickupNotes || next.pickupNotes,
      deliveryName: base.deliveryName || next.deliveryName,
      deliveryAddress: base.deliveryAddress || next.deliveryAddress,
      deliveryCoordinates: base.deliveryCoordinates || next.deliveryCoordinates,
      deliveryContact: base.deliveryContact || next.deliveryContact,
      deliveryPhone: base.deliveryPhone || next.deliveryPhone,
      deliveryNotes: base.deliveryNotes || next.deliveryNotes,
      exchangeName: base.exchangeName || next.exchangeName,
      exchangeAddress: base.exchangeAddress || next.exchangeAddress,
      exchangeCoordinates: base.exchangeCoordinates || next.exchangeCoordinates,
      exchangeContact: base.exchangeContact || next.exchangeContact,
      exchangePhone: base.exchangePhone || next.exchangePhone,
      exchangeNotes: base.exchangeNotes || next.exchangeNotes,
      price: base.price ?? next.price,
      priceItems: (base.priceItems && base.priceItems.length > 0) ? base.priceItems : next.priceItems,
      customerName: base.customerName || next.customerName,
      customerPhone: base.customerPhone || next.customerPhone,
      scheduledDate: base.scheduledDate || next.scheduledDate || (base as any).data || (next as any).data
    });

    [...allPlaces, ...savedPlaces].forEach(p => {
      if (!p || !p.id) return;
      const key = getOrderKey(p);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, p);
      } else {
        map.set(key, mergePlaceLegs(existing, p));
      }
    });

    const activeOrderKeys = new Set(Array.from(map.keys()));

    (completedOrders || []).forEach(p => {
      if (!p || !p.id) return;
      const key = getOrderKey(p);
      if (!activeOrderKeys.has(key)) {
        map.set(key, p);
      }
    });

    return Array.from(map.values());
  }, [allPlaces, savedPlaces, completedOrders]);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  // A cada abertura a lista volta a mostrar só os pedidos de hoje
  React.useEffect(() => {
    if (isOpen) {
      setDateFilter('hoje');
      setDateFrom('');
      setDateTo('');
      setVisibleCount(PAGE_SIZE);
    }
  }, [isOpen]);

  // Pedidos filtrados (busca, operação, status, pagamento e datas)
  const filteredOrders = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');

    return uniqueOrders.filter(p => {
      if (currentRole === 'motorista') {
        const isPublic = realtimeAssignmentService.isPublicOrder(p);
        const isMine = realtimeAssignmentService.isDirectlyAssignedToUser(p, user);
        if (!isPublic && !isMine) return false;
      }

      const op = p.operationType || 'coleta';
      if (opFilter !== 'todos' && op !== opFilter) return false;

      const isFinished = orderIsFinished(p);
      const hasDriver = Boolean(p.assignedDriverId || p.assignedDriverName);
      if (statusFilter === 'concluido' && !isFinished) return false;
      if (statusFilter === 'em_rota' && (!hasDriver || isFinished)) return false;
      if (statusFilter === 'pendente' && (hasDriver || isFinished)) return false;

      if (paymentFilter === 'pago' && !orderIsPaid(p)) return false;
      if (paymentFilter === 'pendente' && orderIsPaid(p)) return false;

      const rawOrderDate = p.scheduledDate || (p as any).data || (p as any).orderDate || '';
      const orderDateStr = String(rawOrderDate).slice(0, 10);
      if (dateFrom || dateTo) {
        if (dateFrom && orderDateStr && orderDateStr < dateFrom) return false;
        if (dateTo && orderDateStr && orderDateStr > dateTo) return false;
      } else if (dateFilter === 'hoje') {
        const isToday = p.orderDateBadge === 'hoje' || orderDateStr === todayStr || (!orderDateStr && !p.orderDateBadge);
        if (!isToday) return false;
      } else if (dateFilter === 'agendados') {
        if (!(orderDateStr && orderDateStr !== todayStr)) return false;
      }

      if (!q) return true;

      const haystack = [
        p.orderCode || p.id,
        p.name,
        p.customerName,
        p.address,
        p.pickupAddress,
        p.deliveryAddress,
        p.pickupName,
        p.deliveryName,
        p.assignedDriverName,
        p.observations || p.driverNotes
      ].map(v => (v || '').toString().toLowerCase());
      if (haystack.some(v => v.includes(q))) return true;

      const custPhone = (p.customerPhone || '').replace(/\D/g, '');
      return Boolean(qDigits && custPhone && custPhone.includes(qDigits));
    });
  }, [uniqueOrders, searchTerm, opFilter, statusFilter, paymentFilter, dateFilter, dateFrom, dateTo, currentRole, user, todayStr]);

  // Totais do topo respeitam a busca/filtros, exceto o próprio filtro de pagamento
  const summary = useMemo(() => {
    const base = filteredOrders;
    let totalValue = 0;
    let paidValue = 0;
    let pendingValue = 0;
    let paidCount = 0;
    let pendingCount = 0;
    base.forEach(p => {
      const price = orderPrice(p);
      totalValue += price;
      if (orderIsPaid(p)) { paidCount++; paidValue += price; }
      else { pendingCount++; pendingValue += price; }
    });
    return { total: base.length, totalValue, paidCount, paidValue, pendingCount, pendingValue };
  }, [filteredOrders]);

  // Agrupa por data (mais recentes primeiro)
  const groups = useMemo(() => {
    const visible = filteredOrders.slice().sort((a, b) => {
      const da = orderDateKey(a, todayStr);
      const db = orderDateKey(b, todayStr);
      if (da !== db) return da < db ? 1 : -1;
      return String(b.orderCode || b.id).localeCompare(String(a.orderCode || a.id), undefined, { numeric: true });
    });
    const countByDate = new Map<string, number>();
    visible.forEach(p => {
      const key = orderDateKey(p, todayStr);
      countByDate.set(key, (countByDate.get(key) || 0) + 1);
    });
    const result: Array<{ date: string; total: number; orders: Place[] }> = [];
    visible.slice(0, visibleCount).forEach(p => {
      const key = orderDateKey(p, todayStr);
      const last = result[result.length - 1];
      if (last && last.date === key) last.orders.push(p);
      else result.push({ date: key, total: countByDate.get(key) || 0, orders: [p] });
    });
    return result;
  }, [filteredOrders, visibleCount, todayStr]);

  const hasActiveFilters = Boolean(
    searchTerm || opFilter !== 'todos' || statusFilter !== 'todos' || paymentFilter !== 'todos' || dateFilter !== 'todos' || dateFrom || dateTo
  );

  // Intervalo mostrado no calendário: o escolhido, ou o dia de hoje enquanto o filtro "hoje" estiver ativo
  const calendarValue: DateRangeFilter = dateFrom || dateTo
    ? { startDate: dateFrom || dateTo || null, endDate: dateTo || dateFrom || null, preset: null }
    : dateFilter === 'hoje'
      ? { startDate: todayStr, endDate: todayStr, preset: 'hoje' as DateRangeFilter['preset'] }
      : { startDate: null, endDate: null, preset: null };

  const handleApplyDates = (range: DateRangeFilter) => {
    setVisibleCount(PAGE_SIZE);
    if (!range.startDate && !range.endDate) {
      setDateFilter('todos');
      setDateFrom('');
      setDateTo('');
      return;
    }
    setDateFilter('todos');
    setDateFrom(range.startDate || range.endDate || '');
    setDateTo(range.endDate || range.startDate || '');
  };

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setOpFilter('todos');
    setStatusFilter('todos');
    setPaymentFilter('todos');
    setDateFilter('todos');
    setDateFrom('');
    setDateTo('');
    setVisibleCount(PAGE_SIZE);
  }, []);

  if (!isOpen) return null;

  const handleSelectOrder = (place: Place) => {
    setSelectedPlace(place);
    if (place.coordinates && typeof place.coordinates.lat === 'number' && typeof place.coordinates.lng === 'number') {
      flyToLocation(place.coordinates, 17);
    }
    onClose();
  };

  const handleClaimFromList = async (e: React.MouseEvent, ord: Place) => {
    e.stopPropagation();
    setMenuOrderId(null);
    try {
      const won = await claimPublicOrder(ord.id, ord.operationType);
      if (!won) {
        setToastMsg('Este pedido já foi aceito por outro motorista.');
        setTimeout(() => setToastMsg(null), 3000);
        return;
      }
      setToastMsg(`Pedido ${ord.orderCode || ord.id} aceito com sucesso!`);
      setTimeout(() => setToastMsg(null), 3000);
    } catch (err) {
      console.warn('Erro ao aceitar pedido:', err);
      setToastMsg(err instanceof Error ? err.message : 'Não foi possível aceitar o pedido.');
      setTimeout(() => setToastMsg(null), 3000);
    }
  };

  const handleWhatsApp = (phone?: string, message = '') => {
    if (!phone) return;
    let clean = phone.replace(/\D/g, '');
    if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) clean = `55${clean}`;
    if (typeof window !== 'undefined' && (window as any).AndroidApp?.openWhatsApp) {
      (window as any).AndroidApp.openWhatsApp(clean, message);
    } else {
      window.open(message ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}` : `https://wa.me/${clean}`, '_blank');
    }
  };

  const handleSendBilling = (event: React.MouseEvent, order: Place) => {
    event.stopPropagation();
    setMenuOrderId(null);
    if (!order.customerPhone) {
      setToastMsg('Cliente sem telefone cadastrado.');
      return;
    }
    const items = collectOpenBills(uniqueOrders, order);
    if (!items.length) {
      setToastMsg('Cliente sem contas em aberto.');
      return;
    }
    handleWhatsApp(order.customerPhone, buildOpenBillsMessage(order.customerName || order.name || '', items));
  };

  const handleCopyTrackingLink = async (event: React.MouseEvent, order: Place) => {
    event.stopPropagation();
    setMenuOrderId(null);
    setTrackingLinkOrderId(order.id);
    try {
      const result = await api.createPublicTrackingLink(order.orderId || order.id);
      if (!result.success || !result.data?.token) {
        throw new Error(result.message || 'Não foi possível criar o link.');
      }
      const link = `${window.location.origin}/rastreio/${result.data.token}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        window.prompt('Copie o link público de rastreio:', link);
      }
      setToastMsg('Link público de rastreio copiado.');
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : 'Erro ao criar link de rastreio.');
    } finally {
      setTrackingLinkOrderId(null);
      setTimeout(() => setToastMsg(null), 3000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    try {
      const deleted = await deletePlace(orderToDelete.id);
      if (!deleted) throw new Error('delete-failed');
      setToastMsg('Pedido excluído com sucesso!');
      setTimeout(() => setToastMsg(null), 3000);
      setOrderToDelete(null);
    } catch (err: any) {
      console.warn('Erro ao excluir pedido:', err);
      setToastMsg('Erro ao excluir pedido.');
      setTimeout(() => setToastMsg(null), 3000);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      let removed = 0;
      for (const id of ids) {
        if (await deletePlace(id)) removed += 1;
      }
      const failed = ids.length - removed;
      setToastMsg(failed
        ? `${removed} excluídos, ${failed} não puderam ser excluídos.`
        : `${removed} ${removed === 1 ? 'pedido excluído' : 'pedidos excluídos'} com sucesso!`);
      setSelectedIds(new Set());
      setShowBulkDelete(false);
    } catch (err) {
      console.warn('Erro ao excluir pedidos:', err);
      setToastMsg('Erro ao excluir pedidos.');
    } finally {
      setIsDeleting(false);
      setTimeout(() => setToastMsg(null), 3000);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const summaryChip = (
    key: PaymentFilterTab,
    label: string,
    count: number,
    value: number,
    icon: React.ReactNode
  ) => {
    const active = paymentFilter === key;
    return (
      <button
        type="button"
        onClick={() => { setPaymentFilter(key); setVisibleCount(PAGE_SIZE); }}
        className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 rounded-2xl border transition-all cursor-pointer text-left ${
          active
            ? 'bg-[#EEF1FB] border-[#3B4BB8] shadow-sm'
            : 'bg-white border-slate-200 hover:bg-slate-50'
        }`}
      >
        {icon}
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wide text-slate-600">
            {label}
            <span className="px-1.5 rounded-full bg-slate-200 text-slate-700 text-[9px] leading-4">{count}</span>
          </span>
          <span className="block text-[13px] font-black text-slate-900 truncate leading-tight">{formatBRL(value)}</span>
        </span>
      </button>
    );
  };

  const chipBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer shrink-0 transition-all ${
        active ? 'bg-[#0B5187] text-white border-[#0B5187]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  const renderCard = (order: Place) => {
    const op = order.operationType || 'coleta';
    const opLabel = op === 'coleta' ? 'Coleta' : op === 'entrega' ? 'Entrega' : 'Troca';
    const OpIcon = op === 'entrega' ? ArrowUp : ArrowDown;

    const code = order.orderCode || `#${order.id.replace('pedido-', '').slice(0, 8)}`;
    const clientName = order.customerName || order.name || 'Cliente';
    const clientPhone = order.customerPhone || '';
    const isPublicOrder = realtimeAssignmentService.isPublicOrder(order);
    const isFinished = orderIsFinished(order);
    const hasDriver = Boolean(order.assignedDriverId || order.assignedDriverName);
    const isPaid = orderIsPaid(order);
    const breakdown = getOrderPriceBreakdown(order);
    const price = breakdown.finalPrice;
    const photosCount = order.photos?.length || (order.imageUrl ? 1 : 0);
    const contact = order.deliveryContact || order.pickupContact || order.responsibleName || '';

    const originLabel = shortPlace(order.pickupName, order.pickupAddress, order.originCity);
    const destLabel = shortPlace(order.deliveryName, order.deliveryAddress || order.address, order.destinationCity);
    const originCity = (order.originCity || '').trim();
    const destCity = (order.destinationCity || '').trim();

    const stageLabel = isFinished ? 'Entregue' : hasDriver ? 'Em rota' : 'Pendente';
    const stageClass = isFinished ? 'bg-emerald-500' : hasDriver ? 'bg-indigo-600' : 'bg-amber-500';
    const cardClass = isFinished
      ? 'bg-emerald-50 border-emerald-300'
      : hasDriver
        ? 'bg-indigo-50/60 border-indigo-200'
        : 'bg-white border-slate-200';
    const selected = selectedIds.has(order.id);

    return (
      <div
        key={order.id}
        onClick={() => handleSelectOrder(order)}
        className={`relative rounded-2xl border p-2.5 shadow-2xs cursor-pointer transition-all active:scale-[0.995] ${cardClass} ${selected ? 'ring-2 ring-[#3B4BB8]' : ''}`}
      >
        <div className="flex gap-2.5">
          {/* Coluna esquerda: seleção e ícone de status */}
          <div className="relative shrink-0 w-14 h-14 rounded-xl bg-white/60 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleSelected(order.id)}
              aria-label={`Selecionar pedido ${code}`}
              className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-md border-slate-300 accent-[#3B4BB8] cursor-pointer"
            />
            {isFinished
              ? <CheckCheck className="w-9 h-9 text-emerald-500 stroke-[2.2]" />
              : hasDriver
                ? <Truck className="w-8 h-8 text-indigo-500" />
                : <Clock className="w-8 h-8 text-amber-500" />}
          </div>

          <div className="min-w-0 flex-1">
            {/* Nome, ações rápidas e preço */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="text-[15px] font-black uppercase text-[#0B2F5B] truncate leading-tight">{clientName}</h3>
                {clientPhone && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleWhatsApp(clientPhone); }}
                    className="shrink-0 text-emerald-500 hover:text-emerald-600 cursor-pointer"
                    title="WhatsApp do cliente"
                    aria-label="WhatsApp do cliente"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleSelectOrder(order); }}
                  className="shrink-0 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                  title="Ver no mapa"
                  aria-label="Ver no mapa"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              <span
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[12px] font-black ${
                  isPaid
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-red-50 text-red-700 border-red-300'
                }`}
              >
                {isPaid ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                {formatBRL(price)}
              </span>
            </div>

            {/* Rotas e data/código */}
            <div className="mt-0.5 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-0.5 text-[11px] font-black uppercase leading-tight">
                <p className="text-emerald-800 truncate">{originLabel} <span className="text-slate-500">{'=>'}</span> {destLabel}</p>
                {(originCity || destCity) && (
                  <p className="text-orange-600 truncate">{originCity || 'A definir'} <span className="text-slate-500">{'=>'}</span> {destCity || 'A definir'}</p>
                )}
              </div>
              <div className="shrink-0 text-right text-[10px] font-semibold text-slate-500 leading-tight">
                <p className="flex items-center justify-end gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDateBR(orderDateKey(order, todayStr))}
                </p>
                <p className="flex items-center justify-end">{code}<ChevronRight className="w-3 h-3" /></p>
              </div>
            </div>
          </div>
        </div>

        {/* Contato em destaque */}
        {contact && (
          <div className="mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-semibold italic w-fit max-w-full">
            <ArrowDown className="w-3 h-3 shrink-0 not-italic" />
            <span className="truncate">{contact}</span>
          </div>
        )}

        {/* Detalhamento de valores como na tela de detalhes */}
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10.5px] font-semibold text-slate-600 bg-slate-50/90 p-1.5 rounded-xl border border-slate-200/80">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Valores:</span>
          {breakdown.items.length > 0 ? (
            breakdown.items.map((it, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200 shadow-2xs font-bold">
                <span>{it.name}:</span>
                <span className="text-[#0B5187] font-black">{formatBRL(it.value)}</span>
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white text-slate-700 border border-slate-200 shadow-2xs font-bold">
              <span>Frete:</span>
              <span className="text-[#0B5187] font-black">{formatBRL(price)}</span>
            </span>
          )}
          {breakdown.discount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold">
              <span>Desconto:</span>
              <span className="font-black">-{formatBRL(breakdown.discount)}</span>
            </span>
          )}
          {order.paymentCondition && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 font-bold">
              <span>Condição:</span>
              <span className="font-black">{order.paymentCondition}</span>
            </span>
          )}
          <span className="ml-auto text-[11px] font-black text-[#FF5E00]">
            Total Final: {formatBRL(price)}
          </span>
        </div>

        {/* Etiquetas e ações */}
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10.5px] font-bold ${stageClass}`}>
              {isFinished ? <CheckCheck className="w-3.5 h-3.5" /> : hasDriver ? <Truck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {stageLabel}
            </span>
            {order.packageType && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500 text-white text-[10.5px] font-bold">
                <Box className="w-3 h-3" />
                {order.packageType}
              </span>
            )}
            {order.vehicleType && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-800 text-white text-[10.5px] font-bold capitalize">
                {order.vehicleType}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10.5px] font-bold">
              <OpIcon className="w-3 h-3" />
              {opLabel}
            </span>
            {isPublicOrder && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10.5px] font-bold">
                <Zap className="w-3 h-3 fill-current" />
                Público
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 text-slate-500" onClick={(e) => e.stopPropagation()}>
            {photosCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold">
                <Camera className="w-3.5 h-3.5" />
                {photosCount}
              </span>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOrderId(menuOrderId === order.id ? null : order.id)}
                className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center cursor-pointer"
                aria-label="Mais ações"
                title="Mais ações"
              >
                {trackingLinkOrderId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
              </button>
              {menuOrderId === order.id && (
                <div className="absolute right-0 bottom-8 z-20 w-48 rounded-xl bg-white border border-slate-200 shadow-xl py-1 text-xs font-bold text-slate-700">
                  <button type="button" onClick={() => handleSelectOrder(order)} className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 cursor-pointer">
                    <Navigation className="w-3.5 h-3.5" /> Ver no mapa
                  </button>
                  {currentRole !== 'motorista' && (
                    <button type="button" onClick={(e) => handleCopyTrackingLink(e, order)} className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 cursor-pointer">
                      <Link2 className="w-3.5 h-3.5" /> Copiar link de rastreio
                    </button>
                  )}
                  {currentRole !== 'motorista' && clientName && (
                    <button type="button" onClick={(e) => handleSendBilling(e, order)} className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 text-emerald-700 cursor-pointer">
                      <MessageCircle className="w-3.5 h-3.5" /> Enviar cobrança
                    </button>
                  )}
                  {canClaimOrders(currentRole) && isPublicOrder && (
                    <button type="button" onClick={(e) => handleClaimFromList(e, order)} className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 text-emerald-700 cursor-pointer">
                      <Zap className="w-3.5 h-3.5" /> Aceitar pedido
                    </button>
                  )}
                  {currentRole !== 'motorista' && (
                    <button
                      type="button"
                      onClick={() => { setMenuOrderId(null); setOrderToDelete(order); }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-rose-50 text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir pedido
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150" onClick={() => menuOrderId && setMenuOrderId(null)}>
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-150">
          <Check className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Barra de título */}
      <header className="shrink-0 sticky top-0 z-20 bg-gradient-to-r from-[#0B5187] via-[#09436E] to-[#072F4E] text-white px-4 sm:px-8 py-3 shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all cursor-pointer text-white shrink-0"
              title="Voltar ao mapa"
              aria-label="Voltar ao mapa"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white/20 text-sky-100">
                Central de Pedidos
              </span>
              <h1 className="text-base sm:text-xl font-black leading-tight truncate">Pedidos</h1>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-black leading-tight">{summary.total} pedidos</p>
            <p className="text-[11px] font-semibold text-sky-200 leading-tight">{formatBRL(summary.totalValue)}</p>
          </div>
        </div>
        <div className="relative mt-2.5">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(PAGE_SIZE); }}
            placeholder="Buscar por cliente, pedido, endereço, motorista..."
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-white text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Limpar busca">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Resumo: total, pago e pendente */}
      <div className="px-2.5 sm:px-6 pt-2.5 pb-2 bg-white border-b border-slate-200 shrink-0 shadow-2xs">
        <div className="flex items-stretch gap-2">
          {summaryChip('todos', 'Total', summary.total, summary.totalValue,
            <span className="w-9 h-9 rounded-xl bg-[#3B4BB8] text-white flex items-center justify-center shrink-0"><ShoppingCart className="w-4 h-4" /></span>)}
          {summaryChip('pago', 'Pago', summary.paidCount, summary.paidValue,
            <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 className="w-4 h-4" /></span>)}
          {summaryChip('pendente', 'Pendente', summary.pendingCount, summary.pendingValue,
            <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Clock className="w-4 h-4" /></span>)}
        </div>

        {selectedIds.size > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-[#EEF1FB] border border-[#3B4BB8]/30 px-3 py-1.5 text-xs font-bold text-[#3B4BB8]">
            <span>{selectedIds.size} {selectedIds.size === 1 ? 'selecionado' : 'selecionados'}</span>
            <div className="flex items-center gap-3">
              {currentRole !== 'motorista' && (
                <button type="button" onClick={() => setShowBulkDelete(true)} className="flex items-center gap-1 text-rose-600 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              )}
              <button type="button" onClick={() => setSelectedIds(new Set())} className="underline cursor-pointer">Limpar seleção</button>
            </div>
          </div>
        )}

        {/* Painel de busca e filtros (botão de filtro) */}
        {showFilters && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {chipBtn(opFilter === 'todos', () => setOpFilter('todos'), 'Todas operações')}
              {chipBtn(opFilter === 'coleta', () => setOpFilter(opFilter === 'coleta' ? 'todos' : 'coleta'), 'Coletas')}
              {chipBtn(opFilter === 'entrega', () => setOpFilter(opFilter === 'entrega' ? 'todos' : 'entrega'), 'Entregas')}
              {chipBtn(opFilter === 'troca', () => setOpFilter(opFilter === 'troca' ? 'todos' : 'troca'), 'Trocas')}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {chipBtn(statusFilter === 'pendente', () => setStatusFilter(statusFilter === 'pendente' ? 'todos' : 'pendente'), 'Pendentes')}
              {chipBtn(statusFilter === 'em_rota', () => setStatusFilter(statusFilter === 'em_rota' ? 'todos' : 'em_rota'), 'Em rota')}
              {chipBtn(statusFilter === 'concluido', () => setStatusFilter(statusFilter === 'concluido' ? 'todos' : 'concluido'), 'Entregues')}
            </div>
          </div>
        )}
      </div>

      {/* Lista agrupada por data */}
      <div className="flex-1 overflow-y-auto px-2.5 sm:px-6 py-2.5 space-y-2.5 bg-slate-100 pb-28">
        {groups.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center py-12 px-4">
            <div className="w-14 h-14 rounded-2xl bg-white text-slate-300 flex items-center justify-center mb-3 border border-slate-200">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-700">Nenhum pedido encontrado</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">Experimente ajustar os filtros ou pesquisar com outro nome ou telefone.</p>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="mt-3.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {groups.map(group => {
              const groupTotalValue = group.orders.reduce((sum, o) => sum + orderPrice(o), 0);
              return (
                <section key={group.date} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-1 pt-1 flex-wrap">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-orange-500" />
                      <h2 className="text-[17px] font-black text-slate-900">{group.date}</h2>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-600 text-[11px] font-bold">{group.total} pedidos</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 text-[12px] font-black shadow-2xs">
                      Total somado: {formatBRL(groupTotalValue)}
                    </span>
                  </div>
                  {group.orders.map(renderCard)}
                </section>
              );
            })}
            {visibleCount < filteredOrders.length && (
              <button
                type="button"
                onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
                className="w-full py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Carregar mais ({filteredOrders.length - visibleCount} restantes)
              </button>
            )}
          </>
        )}
      </div>

      {/* Botões flutuantes: mapa, datas e filtros */}
      <div className="fixed right-3 bottom-4 z-[110] flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="w-12 h-12 rounded-full bg-[#5B5BD6] hover:bg-[#4A4AC4] text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all"
          title="Voltar ao mapa"
          aria-label="Voltar ao mapa"
        >
          <MapIcon className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowDates(v => !v)}
          className={`w-12 h-12 rounded-full text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all ${showDates ? 'bg-emerald-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}
          title="Filtrar por data"
          aria-label="Filtrar por data"
        >
          <Calendar className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={`relative w-12 h-12 rounded-full text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all ${showFilters ? 'bg-emerald-700' : 'bg-emerald-500 hover:bg-emerald-600'}`}
          title="Buscar e filtrar"
          aria-label="Buscar e filtrar"
        >
          <SlidersHorizontal className="w-5 h-5" />
          {hasActiveFilters && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-white" />}
        </button>
      </div>

      {/* Calendário de datas (mesmo do filtro de marcadores do mapa, mas só para esta lista) */}
      <CalendarFilterModal
        isOpen={showDates}
        onClose={() => setShowDates(false)}
        value={calendarValue}
        onApply={handleApplyDates}
        places={uniqueOrders}
        title="Filtrar Pedidos por Data"
        zIndexClass="z-[140]"
      />

      {/* Confirmação de exclusão */}
      {orderToDelete && (
        <div
          className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !isDeleting && setOrderToDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 stroke-[2.2]" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-black text-slate-900">Excluir Pedido?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Deseja realmente excluir permanentemente o pedido <span className="font-bold text-slate-800">{orderToDelete.orderCode || orderToDelete.id}</span> do cliente <span className="font-bold text-slate-800">{orderToDelete.customerName || 'Cliente'}</span>?
              </p>
              <p className="text-[11px] text-rose-600 font-semibold mt-1">
                Esta ação removerá o pedido do mapa e do banco de dados.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setOrderToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão em lote */}
      {showBulkDelete && (
        <div
          className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !isDeleting && setShowBulkDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-slate-900">Excluir {selectedIds.size} {selectedIds.size === 1 ? 'pedido' : 'pedidos'}?</h3>
              <p className="text-[11px] text-rose-600 font-semibold mt-1">
                Esta ação removerá os pedidos selecionados do mapa e do banco de dados.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowBulkDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmBulkDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
