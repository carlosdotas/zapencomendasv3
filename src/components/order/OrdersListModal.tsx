import React, { useState, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, 
  X, 
  Search, 
  Package, 
  MapPin, 
  User, 
  Phone, 
  Bike, 
  Car, 
  Truck, 
  Clock, 
  CheckCircle2, 
  Navigation, 
  ArrowRight, 
  MessageCircle, 
  Calendar,
  Layers,
  ChevronRight,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Trash2,
  DollarSign,
  CreditCard,
  Banknote,
  RotateCcw,
  Check,
  Filter,
  Zap,
  Link2,
  Loader2
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { Place, OperationType } from '../../types/map';
import { useBackButton } from '../../hooks/useBackButton';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { api } from '../../services/api';

interface OrdersListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type OperationFilterTab = 'todos' | 'coleta' | 'entrega' | 'troca';
type StatusFilterTab = 'todos' | 'pendente' | 'em_rota' | 'concluido';
type PaymentFilterTab = 'todos' | 'pago' | 'pendente';
type DateFilterTab = 'todos' | 'hoje' | 'agendados';

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
    claimPublicOrder
  } = useMapStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [opFilter, setOpFilter] = useState<OperationFilterTab>('todos');
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('todos');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterTab>('todos');
  const [dateFilter, setDateFilter] = useState<DateFilterTab>('hoje');
  // Filtro de intervalo de datas personalizado
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Estado para confirmação de exclusão segura
  const [orderToDelete, setOrderToDelete] = useState<Place | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [trackingLinkOrderId, setTrackingLinkOrderId] = useState<string | null>(null);

  // Consolida todos os pedidos do mapa sem duplicidades (ativos + concluídos)
  const uniqueOrders = useMemo(() => {
    const map = new Map<string, Place>();
    // Pedidos ativos do mapa
    [...allPlaces, ...savedPlaces].forEach(p => {
      if (p && p.id) {
        map.set(p.id, p);
      }
    });
    // Pedidos concluídos/entregues — aparecem na lista mas não no mapa
    (completedOrders || []).forEach(p => {
      if (p && p.id) {
        // Só adiciona se não houver versão ativa com o mesmo ID base
        const baseId = p.id.replace(/-coleta$|-entrega$|-troca$|-retorno$/, '');
        const alreadyActive = Array.from(map.keys()).some(k => k.startsWith(baseId));
        if (!alreadyActive) {
          map.set(p.id, p);
        }
      }
    });
    return Array.from(map.values());
  }, [allPlaces, savedPlaces, completedOrders]);

  // Contadores por tipo de operação
  const counts = useMemo(() => {
    let coleta = 0;
    let entrega = 0;
    let troca = 0;
    let pagos = 0;
    let pendentes = 0;

    uniqueOrders.forEach(p => {
      const op = p.operationType || 'coleta';
      if (op === 'coleta') coleta++;
      else if (op === 'entrega') entrega++;
      else if (op === 'troca') troca++;

      const isPaid = (p as any).status_pagamento === 'pago' || 
                     (p as any).paymentStatus === 'pago' || 
                     (p as any).isPaid === true;
      if (isPaid) pagos++;
      else pendentes++;
    });

    return {
      total: uniqueOrders.length,
      coleta,
      entrega,
      troca,
      pagos,
      pendentes
    };
  }, [uniqueOrders]);

  // Extrai informações completas e padronizadas de preço e pagamento
  const getOrderPaymentInfo = useCallback((order: Place) => {
    const isPaid = (order as any).status_pagamento === 'pago' || 
                   (order as any).paymentStatus === 'pago' || 
                   (order as any).isPaid === true;

    const rawPrice = order.price !== undefined && order.price !== null 
      ? order.price 
      : ((order as any).total || (order as any).valor_total || (order as any).valor || 0);
    const numPrice = Number(rawPrice) || 0;
    const formattedPrice = numPrice > 0 ? `R$ ${numPrice.toFixed(2).replace('.', ',')}` : 'A Combinar';

    const rawMethod = (order as any).forma_pagamento || 
                      (order as any).paymentMethod || 
                      order.paymentCondition || 
                      '';
    let methodLabel = '';
    if (rawMethod === 'antes_entrega') methodLabel = 'Antes da entrega';
    else if (rawMethod === 'depois_entrega') methodLabel = 'Na entrega';
    else if (rawMethod === 'semanal') methodLabel = 'Fat. Semanal';
    else if (rawMethod === 'quinzenal') methodLabel = 'Fat. Quinzenal';
    else if (rawMethod === 'mensal') methodLabel = 'Fat. Mensal';
    else if (rawMethod) methodLabel = String(rawMethod).toUpperCase();

    return {
      isPaid,
      statusLabel: isPaid ? 'Pago' : 'A Cobrar',
      price: numPrice,
      formattedPrice,
      methodLabel
    };
  }, []);

  // Filtra os pedidos com base na busca e nos filtros selecionados
  const filteredOrders = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');
    const todayStr = new Date().toISOString().slice(0, 10);

    return uniqueOrders.filter(p => {
      // 0. Regra para motorista: vê pedidos públicos e pedidos atribuídos a ele!
      if (currentRole === 'motorista') {
        const isPublic = realtimeAssignmentService.isPublicOrder(p);
        const isMine = realtimeAssignmentService.isDirectlyAssignedToUser(p, user);
        if (!isPublic && !isMine) {
          return false;
        }
      }

      // 1. Filtro por Tipo de Operação
      const op = p.operationType || 'coleta';
      if (opFilter !== 'todos' && op !== opFilter) return false;

      // 2. Filtro por Status
      const stage = p.orderStage || 'coleta';
      const isFinished = stage === 'concluido' || (p as any).isCompleted || (p as any).etapa === 'concluido' || (p as any).etapa === 'finalizado' || (p as any).etapa === 'entregue';
      const hasDriver = Boolean(p.assignedDriverId || p.assignedDriverName);

      if (statusFilter === 'concluido' && !isFinished) return false;
      if (statusFilter === 'em_rota' && (!hasDriver || isFinished)) return false;
      if (statusFilter === 'pendente' && (hasDriver || isFinished)) return false;

      // 3. Filtro por Pagamento
      if (paymentFilter !== 'todos') {
        const isPaid = (p as any).status_pagamento === 'pago' || 
                       (p as any).paymentStatus === 'pago' || 
                       (p as any).isPaid === true;
        if (paymentFilter === 'pago' && !isPaid) return false;
        if (paymentFilter === 'pendente' && isPaid) return false;
      }

      // 4. Filtro por Data — chips rápidos E intervalo customizado
      // Extrai a data do pedido (YYYY-MM-DD)
      const rawOrderDate = p.scheduledDate || (p as any).data || (p as any).orderDate || '';
      const orderDateStr = String(rawOrderDate).slice(0, 10);

      if (dateFrom || dateTo) {
        // Filtro de intervalo de datas customizado tem prioridade sobre chips
        if (dateFrom && orderDateStr && orderDateStr < dateFrom) return false;
        if (dateTo && orderDateStr && orderDateStr > dateTo) return false;
      } else if (dateFilter === 'hoje') {
        const isToday = p.orderDateBadge === 'hoje' || orderDateStr === todayStr || (!orderDateStr && !p.orderDateBadge);
        if (!isToday) return false;
      } else if (dateFilter === 'agendados') {
        const isScheduled = Boolean(orderDateStr && orderDateStr !== todayStr);
        if (!isScheduled) return false;
      }

      // 5. Busca por texto
      if (!q) return true;

      const code = (p.orderCode || p.id || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const customer = (p.customerName || '').toLowerCase();
      const custPhone = (p.customerPhone || '').replace(/\D/g, '');
      const addr = (p.address || '').toLowerCase();
      const pickupAddr = (p.pickupAddress || '').toLowerCase();
      const deliveryAddr = (p.deliveryAddress || '').toLowerCase();
      const driver = (p.assignedDriverName || '').toLowerCase();
      const obs = (p.observations || p.driverNotes || '').toLowerCase();

      if (code.includes(q)) return true;
      if (name.includes(q)) return true;
      if (customer.includes(q)) return true;
      if (addr.includes(q) || pickupAddr.includes(q) || deliveryAddr.includes(q)) return true;
      if (driver.includes(q)) return true;
      if (obs.includes(q)) return true;
      if (qDigits && custPhone && (custPhone.includes(qDigits) || custPhone.endsWith(qDigits))) return true;

      return false;
    });
  }, [uniqueOrders, searchTerm, opFilter, statusFilter, paymentFilter, dateFilter, dateFrom, dateTo, currentRole, user]);

  if (!isOpen) return null;

  // Ação ao clicar em "Ver no Mapa"
  const handleSelectOrder = (place: Place) => {
    setSelectedPlace(place);
    if (place.coordinates && typeof place.coordinates.lat === 'number' && typeof place.coordinates.lng === 'number') {
      flyToLocation(place.coordinates, 17);
    }
    onClose();
  };

  // Ação para motorista assumir pedido público direto da lista
  const handleClaimFromList = async (e: React.MouseEvent, ord: Place) => {
    e.stopPropagation();
    try {
      await claimPublicOrder(ord.id);
      setToastMsg(`Pedido ${ord.orderCode || ord.id} aceito com sucesso!`);
      setTimeout(() => setToastMsg(null), 3000);
    } catch (err) {
      console.warn('Erro ao aceitar pedido:', err);
    }
  };

  const handleWhatsApp = (phone?: string) => {
    if (!phone) return;
    let clean = phone.replace(/\D/g, '');
    if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
      clean = `55${clean}`;
    }
    if (typeof window !== 'undefined' && (window as any).AndroidApp?.openWhatsApp) {
      (window as any).AndroidApp.openWhatsApp(clean, '');
    } else {
      window.open(`https://wa.me/${clean}`, '_blank');
    }
  };

  const handleCopyTrackingLink = async (event: React.MouseEvent, order: Place) => {
    event.stopPropagation();
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

  // Executa exclusão do pedido
  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    try {
      await deletePlace(orderToDelete.id);
      setToastMsg(`Pedido excluído com sucesso!`);
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

  return (
    <div className="fixed inset-0 z-[100] w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      
      {/* TOAST DE NOTIFICAÇÃO RÁPIDA */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-150">
          <Check className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* CABEÇALHO FULLSCREEN MODERNO E ULTRA RESPONSIVO */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-gradient-to-r from-[#0B5187] via-[#09436E] to-[#072F4E] text-white flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar ao mapa"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all cursor-pointer text-white shrink-0"
            title="Voltar ao mapa"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-lg font-black tracking-tight text-white truncate">
                Central de Pedidos
              </h1>
              <span className="px-2 py-0.2 sm:py-0.5 rounded-full bg-white/20 text-sky-100 text-[10px] sm:text-xs font-black shrink-0">
                {counts.total}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-sky-200 font-medium truncate leading-tight">
              {filteredOrders.length === counts.total 
                ? 'Visualização completa da base de encomendas' 
                : `${filteredOrders.length} de ${counts.total} pedidos encontrados`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-90 cursor-pointer"
            title="Fechar tela cheia"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* ÁREA DE BUSCA E FILTROS RÁPIDOS (OTIMIZADA PARA CELULAR) */}
      <div className="px-3 sm:px-6 py-2.5 bg-white border-b border-slate-200 shrink-0 space-y-2 shadow-2xs">
        {/* Campo de Busca Rápida Compacto */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none stroke-[2.3]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, pedido, endereço, motorista..."
            className="w-full h-9 sm:h-10 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/15 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Linha 1 de Filtros: Tipo de Operação */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[11px] sm:text-xs font-bold">
          <button
            type="button"
            onClick={() => setOpFilter('todos')}
            className={`px-2.5 py-1 sm:py-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
              opFilter === 'todos'
                ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Todos ({counts.total})
          </button>

          <button
            type="button"
            onClick={() => setOpFilter('coleta')}
            className={`px-2.5 py-1 sm:py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              opFilter === 'coleta'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-blue-50/60 text-blue-900 border-blue-200 hover:bg-blue-100/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span>Coletas ({counts.coleta})</span>
          </button>

          <button
            type="button"
            onClick={() => setOpFilter('entrega')}
            className={`px-2.5 py-1 sm:py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              opFilter === 'entrega'
                ? 'bg-[#FF5E00] text-white border-[#FF5E00] shadow-xs'
                : 'bg-orange-50/60 text-orange-950 border-orange-200 hover:bg-orange-100/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5E00] shrink-0" />
            <span>Entregas ({counts.entrega})</span>
          </button>

          <button
            type="button"
            onClick={() => setOpFilter('troca')}
            className={`px-2.5 py-1 sm:py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              opFilter === 'troca'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50/60 text-emerald-950 border-emerald-200 hover:bg-emerald-100/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Trocas ({counts.troca})</span>
          </button>
        </div>

        {/* Linha 2 de Filtros: Status, Pagamento e Data */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[10.5px] sm:text-[11.5px] font-bold">
          {/* Status */}
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'pendente' ? 'todos' : 'pendente')}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
              statusFilter === 'pendente'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Pendentes
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'em_rota' ? 'todos' : 'em_rota')}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
              statusFilter === 'em_rota'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Em Rota
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'concluido' ? 'todos' : 'concluido')}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
              statusFilter === 'concluido'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Concluídos
          </button>

          <div className="h-4 w-px bg-slate-200 shrink-0 mx-0.5" />

          {/* Filtro de Pagamento */}
          <button
            type="button"
            onClick={() => setPaymentFilter(paymentFilter === 'pago' ? 'todos' : 'pago')}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
              paymentFilter === 'pago'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-emerald-50/70 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70'
            }`}
          >
            <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
            <span>Pagos ({counts.pagos})</span>
          </button>

          <button
            type="button"
            onClick={() => setPaymentFilter(paymentFilter === 'pendente' ? 'todos' : 'pendente')}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
              paymentFilter === 'pendente'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100/70'
            }`}
          >
            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
            <span>A Cobrar ({counts.pendentes})</span>
          </button>

          <div className="h-4 w-px bg-slate-200 shrink-0 mx-0.5" />

          {/* Filtro de Data */}
          <button
            type="button"
            onClick={() => { setDateFilter(dateFilter === 'hoje' ? 'todos' : 'hoje'); setDateFrom(''); setDateTo(''); }}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
              dateFilter === 'hoje' && !dateFrom && !dateTo
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Hoje
          </button>

          <button
            type="button"
            onClick={() => { setDateFilter(dateFilter === 'agendados' ? 'hoje' : 'agendados'); setDateFrom(''); setDateTo(''); }}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
              dateFilter === 'agendados'
                ? 'bg-purple-700 text-white border-purple-700'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Agendados
          </button>

          <button
            type="button"
            onClick={() => { setDateFilter('todos'); setDateFrom(''); setDateTo(''); }}
            className={`px-2 py-0.5 sm:py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
              dateFilter === 'todos' && !dateFrom && !dateTo
                ? 'bg-indigo-700 text-white border-indigo-700'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Todos
          </button>
        </div>

        {/* Linha 3 de Filtros: Intervalo de Data Personalizado */}
        <div className="flex items-center gap-1.5 text-[10.5px] sm:text-[11.5px]">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); if (e.target.value) setDateFilter('todos'); }}
            className="h-7 px-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#0B5187] focus:ring-1 focus:ring-[#0B5187]/20 transition-all flex-1 min-w-0"
            title="Data inicial"
          />
          <span className="text-slate-400 font-bold text-[10px] shrink-0">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); if (e.target.value) setDateFilter('todos'); }}
            className="h-7 px-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#0B5187] focus:ring-1 focus:ring-[#0B5187]/20 transition-all flex-1 min-w-0"
            title="Data final"
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); setDateFilter('hoje'); }}
              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center cursor-pointer transition-colors shrink-0 border border-slate-200"
              title="Limpar datas"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* LISTA ROLÁVEL DE PEDIDOS (LAYOUT COMPACTO E LIMPO PARA CELULAR) */}
      <div className="flex-1 overflow-y-auto px-2.5 sm:px-6 py-2.5 sm:py-3.5 space-y-2 sm:space-y-2.5 bg-slate-100">
        {filteredOrders.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center py-12 px-4">
            <div className="w-14 h-14 rounded-2xl bg-white text-slate-300 flex items-center justify-center mb-3 border border-slate-200 shadow-2xs">
              <Package className="w-7 h-7 stroke-[1.8]" />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-700">
              Nenhum pedido encontrado
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Experimente ajustar os filtros ou pesquisar com outro nome ou telefone.
            </p>
            {(searchTerm || opFilter !== 'todos' || statusFilter !== 'todos' || paymentFilter !== 'todos' || dateFilter !== 'hoje' || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setOpFilter('todos');
                  setStatusFilter('todos');
                  setPaymentFilter('todos');
                  setDateFilter('hoje');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="mt-3.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs active:scale-95 transition-all"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          filteredOrders.map((order) => {
            const op = order.operationType || 'coleta';
            const isColeta = op === 'coleta';
            const isEntrega = op === 'entrega';
            const isTroca = op === 'troca';

            const opLabel = isColeta ? 'Coleta' : isEntrega ? 'Entrega' : 'Troca';
            const opBadgeBg = isColeta 
              ? 'bg-blue-50 text-blue-800 border-blue-300' 
              : isEntrega 
              ? 'bg-orange-50 text-orange-800 border-orange-300' 
              : 'bg-emerald-50 text-emerald-800 border-emerald-300';
            const opDot = isColeta ? 'bg-blue-600' : isEntrega ? 'bg-[#FF5E00]' : 'bg-emerald-600';

            const code = order.orderCode || `#${order.id.replace('pedido-', '').slice(0, 8)}`;
            const clientName = order.customerName || 'Cliente';
            const clientPhone = order.customerPhone || '';
            const driverName = order.assignedDriverName;
            const isPublicOrder = realtimeAssignmentService.isPublicOrder(order);
            
            // Informações de Preço e Pagamento
            const payInfo = getOrderPaymentInfo(order);

            const mainAddress = isColeta 
              ? (order.pickupAddress || order.address) 
              : isEntrega 
              ? (order.deliveryAddress || order.address) 
              : (order.exchangeAddress || order.address);

            // Cor de fundo do tipo de veículo
            const vehicleBg = order.vehicleType === 'moto' 
              ? 'bg-orange-50 text-[#FF5E00] border-orange-200'
              : order.vehicleType === 'carro'
              ? 'bg-sky-50 text-sky-700 border-sky-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200';

            return (
              <div
                key={order.id}
                onClick={() => handleSelectOrder(order)}
                className="bg-white rounded-2xl p-2.5 sm:p-3.5 border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-[#0B5187]/40 transition-all cursor-pointer active:scale-[0.99] group space-y-2 relative"
              >
                {/* Linha 1: Badges de Tipo, Código, Veículo, Preço, Pagamento e Botão Excluir */}
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${opBadgeBg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${opDot}`} />
                      {opLabel}
                    </span>

                    <span className="text-xs font-black text-slate-800 shrink-0 font-mono">
                      {code}
                    </span>

                    {order.vehicleType && (
                      <span className={`px-1.5 py-0.5 rounded-md border text-[9.5px] font-black flex items-center gap-1 shrink-0 ${vehicleBg}`}>
                        {order.vehicleType === 'moto' ? <Bike className="w-3 h-3" /> : order.vehicleType === 'carro' ? <Car className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                        <span className="capitalize">{order.vehicleType}</span>
                      </span>
                    )}

                    {order.orderDateBadge && (
                      <span className="text-[9.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                        {order.orderDateBadge}
                      </span>
                    )}

                    {isPublicOrder && (
                      <span className="px-1.5 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[9.5px] font-black uppercase flex items-center gap-1 shrink-0">
                        <Zap className="w-2.5 h-2.5 fill-current text-amber-600" />
                        <span>Público</span>
                      </span>
                    )}
                  </div>

                  {/* Lado Direito: Preço, Pagamento e Ação de Excluir */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Badge de Preço */}
                    <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-300 shrink-0">
                      {payInfo.formattedPrice}
                    </span>

                    {/* Badge de Status do Pagamento */}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-1 shrink-0 ${
                      payInfo.isPaid 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-amber-50 text-amber-900 border-amber-200'
                    }`}>
                      {payInfo.isPaid ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                      )}
                      <span>{payInfo.statusLabel}</span>
                    </span>

                    {/* Botão de Excluir Pedido (Apenas Admin/Atendente) */}
                    {currentRole !== 'motorista' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOrderToDelete(order);
                        }}
                        className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-colors active:scale-90 cursor-pointer border border-slate-200 hover:border-rose-300"
                        title="Excluir este pedido"
                        aria-label="Excluir pedido"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Linha 2: Cliente & Informação de Forma de Pagamento */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs font-black text-slate-800 truncate">
                      {clientName}
                    </span>
                    {clientPhone && (
                      <span className="text-[11px] text-slate-500 font-medium truncate">
                        • {clientPhone}
                      </span>
                    )}
                  </div>

                  {/* WhatsApp rápido e/ou Método de Pagamento */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {payInfo.methodLabel && (
                      <span className="text-[9.5px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded truncate max-w-[120px]">
                        {payInfo.methodLabel}
                      </span>
                    )}

                    {clientPhone && (
                      <button
                        type="button"
                        onClick={() => handleWhatsApp(clientPhone)}
                        className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-black flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                        title="WhatsApp do cliente"
                      >
                        <MessageCircle className="w-3 h-3 fill-current" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Linha 3: Endereço & Trajeto Compacto */}
                <div className="flex items-start gap-1.5 text-[11px] sm:text-xs text-slate-600 bg-slate-50/90 p-2 rounded-xl border border-slate-200/60 leading-snug">
                  <MapPin className="w-3.5 h-3.5 text-[#FF5E00] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">
                      {mainAddress || 'Endereço a definir'}
                    </p>
                    {isTroca && order.pickupAddress && order.deliveryAddress && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
                        <span className="truncate">{order.pickupAddress.split(',')[0]}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <span className="truncate">{order.deliveryAddress.split(',')[0]}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Linha 4: Motorista & Botão Ver no Mapa */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[10.5px] sm:text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-500 truncate min-w-0">
                    {driverName ? (
                      <span className="flex items-center gap-1 text-[#0B5187] font-bold truncate">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">Motorista: {driverName}</span>
                      </span>
                    ) : isPublicOrder ? (
                      <span className="flex items-center gap-1 text-amber-700 font-bold truncate">
                        <Zap className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                        <span>Aberto p/ qualquer motorista</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400 font-semibold italic truncate">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Aguardando motorista</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {currentRole !== 'motorista' && (
                      <button
                        type="button"
                        onClick={(e) => handleCopyTrackingLink(e, order)}
                        disabled={trackingLinkOrderId === order.id}
                        className="w-7 h-7 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center transition-colors active:scale-90 cursor-pointer disabled:opacity-50"
                        title="Copiar link público de rastreio"
                        aria-label="Copiar link público de rastreio"
                      >
                        {trackingLinkOrderId === order.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Link2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {currentRole === 'motorista' && isPublicOrder && (
                      <button
                        type="button"
                        onClick={(e) => handleClaimFromList(e, order)}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-[10px] inline-flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0 animate-pulse"
                        title="Assumir este pedido"
                      >
                        <Zap className="w-3 h-3 fill-current" />
                        <span>Aceitar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectOrder(order);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#0B5187] hover:bg-[#083e68] text-white font-black text-[10px] inline-flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                    >
                      <Navigation className="w-3 h-3 stroke-[2.5]" />
                      <span>Ver no Mapa</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* RODAPÉ ENXUTO COM RESUMO E FECHAR */}
      <footer className="px-3 sm:px-6 py-2 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
        <span className="font-bold text-[11px] text-slate-600">
          {filteredOrders.length} {filteredOrders.length === 1 ? 'pedido listado' : 'pedidos listados'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs cursor-pointer transition-all"
        >
          Voltar ao Mapa
        </button>
      </footer>

      {/* DIÁLOGO MODAL DE CONFIRMAÇÃO DE EXCLUSÃO SEGURO */}
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
              <h3 className="text-base font-black text-slate-900">
                Excluir Pedido?
              </h3>
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

    </div>
  );
};