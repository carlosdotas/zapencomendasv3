import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  DollarSign,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Send,
  MessageSquare,
  FileCheck2,
  AlertCircle,
  User,
  Users,
  Calendar,
  Layers,
  Check,
  ChevronDown,
  Receipt,
  FileSpreadsheet,
  CheckSquare,
  Sparkles,
  Phone
} from 'lucide-react';
import { useBackButton } from '../../hooks/useBackButton';
import { useMapStore } from '../../context/MapContext';
import {
  PayableAccount,
  ReceivableAccount,
  formatCurrency,
  generateAuthCode,
  calculatePayableSubtotals,
  calculateReceivableSubtotals,
  filterPayableAccounts,
  filterReceivableAccounts,
  buildDriverReceiptWhatsAppMessage,
  buildCustomerBillingWhatsAppMessage,
  buildCustomerReceiptWhatsAppMessage
} from '../../utils/financialUtils';
import { financialService } from '../../services/financialService';

interface FinancialModalFullScreenProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'pagar' | 'receber';
}

export const FinancialModalFullScreen: React.FC<FinancialModalFullScreenProps> = ({
  isOpen,
  onClose,
  initialTab = 'pagar'
}) => {
  useBackButton('financial-modal-fullscreen', isOpen, onClose, 80);

  const { allPlaces } = useMapStore();

  const [activeTab, setActiveTab] = useState<'pagar' | 'receber'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Contas a Pagar State (default: unpaid accounts)
  const [payableStatus, setPayableStatus] = useState<'unpaid' | 'paid' | 'all'>('unpaid');
  const [selectedDriverKey, setSelectedDriverKey] = useState<string>('all');
  const [payableList, setPayableList] = useState<PayableAccount[]>([]);

  // Contas a Receber State (default: unpaid accounts)
  const [receivableStatus, setReceivableStatus] = useState<'unpaid' | 'paid' | 'all'>('unpaid');
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [receivableList, setReceivableList] = useState<ReceivableAccount[]>([]);

  // Modal de Confirmação de Baixa
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'payable' | 'receivable';
    item: PayableAccount | ReceivableAccount | null;
    action: 'settle' | 'revert';
  }>({
    isOpen: false,
    type: 'payable',
    item: null,
    action: 'settle'
  });

  // Feedback toast temporário
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sincroniza tab inicial quando o modal abre
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Carrega dados do backend
  const loadFinancialData = useCallback(async () => {
    setLoading(true);
    try {
      const [resPayable, resReceivable] = await Promise.all([
        financialService.getPayableAccounts(),
        financialService.getReceivableAccounts()
      ]);

      if (resPayable.success && Array.isArray(resPayable.data)) {
        setPayableList(resPayable.data);
      }

      if (resReceivable.success && Array.isArray(resReceivable.data)) {
        setReceivableList(resReceivable.data);
      } else if (allPlaces.length > 0) {
        // Fallback local caso o backend não retorne pedidos ainda
        const localReceivables: ReceivableAccount[] = allPlaces.map((p, idx) => ({
          id: idx + 1,
          order_id: parseInt(p.id.replace(/\D/g, ''), 10) || idx + 1,
          code: p.orderCode || `EZ-${idx + 1}-GO`,
          client_id: null,
          client_name: p.customerName || p.name || 'Cliente',
          client_phone: p.customerPhone || '',
          seller_name: p.sellerName || '',
          seller_phone: p.sellerPhone || '',
          date: p.orderDate || new Date().toISOString().slice(0, 10),
          total: Number(p.orderTotal || p.orderBaseValue || 0),
          base_value: Number(p.orderBaseValue || p.orderTotal || 0),
          discount: Number(p.orderDiscount || 0),
          payment_status: p.paymentStatus === 'pago' ? 'pago' : 'nao_pago',
          orig_name: p.pickupName || p.pickupAddress || '',
          dest_name: p.deliveryName || p.deliveryAddress || '',
          tipo_encomenda: p.operationType || 'entrega',
          etapa: p.orderStage || 'novo'
        }));
        setReceivableList(localReceivables);
      }
    } catch (err) {
      console.warn('Erro ao carregar dados financeiros:', err);
    } finally {
      setLoading(false);
    }
  }, [allPlaces]);

  useEffect(() => {
    if (isOpen) {
      loadFinancialData();
    }
  }, [isOpen, loadFinancialData]);

  // Lista única de motoristas disponíveis para o filtro
  const availableDrivers = useMemo(() => {
    const map = new Map<string, { key: string; name: string; phone?: string; unpaidCount: number }>();
    payableList.forEach(p => {
      const existing = map.get(p.driver_key) || {
        key: p.driver_key,
        name: p.driver_name || `Motorista #${p.driver_key}`,
        phone: p.driver_phone,
        unpaidCount: 0
      };
      if (!p.paid) existing.unpaidCount += 1;
      map.set(p.driver_key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [payableList]);

  // Lista única de clientes disponíveis para o filtro
  const availableClients = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone?: string; unpaidCount: number }>();
    receivableList.forEach(r => {
      const key = String(r.client_id || r.client_name);
      const existing = map.get(key) || {
        id: key,
        name: r.client_name || 'Cliente Geral',
        phone: r.client_phone,
        unpaidCount: 0
      };
      if (r.payment_status !== 'pago') existing.unpaidCount += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [receivableList]);

  // Contas a Pagar Filtradas e Subtotais
  const payableSubtotals = useMemo(() => calculatePayableSubtotals(payableList), [payableList]);

  const filteredPayables = useMemo(() => {
    return filterPayableAccounts(payableList, {
      status: payableStatus,
      driverKey: selectedDriverKey,
      searchTerm
    });
  }, [payableList, payableStatus, selectedDriverKey, searchTerm]);

  const filteredPayablesTotal = useMemo(() => {
    return filteredPayables.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
  }, [filteredPayables]);

  // Contas a Receber Filtradas e Subtotais
  const receivableSubtotals = useMemo(() => calculateReceivableSubtotals(receivableList), [receivableList]);

  const filteredReceivables = useMemo(() => {
    return filterReceivableAccounts(receivableList, {
      status: receivableStatus,
      clientId: selectedClientFilter,
      searchTerm
    });
  }, [receivableList, receivableStatus, selectedClientFilter, searchTerm]);

  const filteredReceivablesTotal = useMemo(() => {
    return filteredReceivables.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
  }, [filteredReceivables]);

  // Ação de Dar Baixa / Reverter Baixa
  const handleExecuteSettle = async () => {
    const { type, item, action } = confirmDialog;
    if (!item) return;

    const shouldPay = action === 'settle';
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));

    if (type === 'payable') {
      const pItem = item as PayableAccount;
      // Atualização otimista imediata
      setPayableList(prev =>
        prev.map(p =>
          p.id === pItem.id
            ? { ...p, paid: shouldPay, paid_at: shouldPay ? new Date().toISOString() : null }
            : p
        )
      );
      showToast(shouldPay ? 'Baixa realizada com sucesso!' : 'Baixa revertida.');
      const ok = await financialService.settlePayableAccount(pItem.id, shouldPay);
      if (!ok) {
        showToast('Aviso: atualizado localmente.');
      }
    } else {
      const rItem = item as ReceivableAccount;
      // Atualização otimista imediata
      setReceivableList(prev =>
        prev.map(r =>
          r.id === rItem.id
            ? { ...r, payment_status: shouldPay ? 'pago' : 'nao_pago', paid_at: shouldPay ? new Date().toISOString() : null }
            : r
        )
      );
      showToast(shouldPay ? 'Baixa do pedido confirmada!' : 'Baixa revertida.');
      const ok = await financialService.settleReceivableAccount(rItem.order_id || rItem.id, shouldPay);
      if (!ok) {
        showToast('Aviso: atualizado localmente.');
      }
    }
  };

  // Envio WhatsApp para Motorista (Individual ou Geral)
  const handleSendDriverWhatsApp = (driverKey: string, specificItem?: PayableAccount) => {
    const driver = availableDrivers.find(d => d.key === driverKey);
    const driverName = driver?.name || specificItem?.driver_name || 'Motorista';
    const rawPhone = driver?.phone || specificItem?.driver_phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');

    const itemsToSend = specificItem
      ? [specificItem]
      : payableList.filter(p => p.driver_key === driverKey && (payableStatus === 'all' || (payableStatus === 'paid' ? p.paid : !p.paid)));

    if (!itemsToSend.length) {
      showToast('Nenhum serviço disponível para este motorista.');
      return;
    }

    const message = buildDriverReceiptWhatsAppMessage(
      itemsToSend,
      driverName,
      !specificItem
    );

    const url = cleanPhone
      ? `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
  };

  // Envio WhatsApp para Cliente (Individual ou Geral: Cobrança ou Recibo com Autenticação)
  const handleSendCustomerWhatsApp = (clientKey: string, specificItem?: ReceivableAccount) => {
    const client = availableClients.find(c => c.id === clientKey);
    const clientName = client?.name || specificItem?.client_name || 'Cliente';
    const rawPhone = client?.phone || specificItem?.client_phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');

    const itemsToSend = specificItem
      ? [specificItem]
      : receivableList.filter(r => {
          const match = String(r.client_id || r.client_name) === clientKey;
          if (!match) return false;
          if (receivableStatus === 'unpaid') return r.payment_status !== 'pago';
          if (receivableStatus === 'paid') return r.payment_status === 'pago';
          return true;
        });

    if (!itemsToSend.length) {
      showToast('Nenhum pedido disponível para este cliente.');
      return;
    }

    const isPaidContext = specificItem
      ? specificItem.payment_status === 'pago'
      : receivableStatus === 'paid' || itemsToSend.every(i => i.payment_status === 'pago');

    const message = isPaidContext
      ? buildCustomerReceiptWhatsAppMessage(itemsToSend, clientName, !specificItem)
      : buildCustomerBillingWhatsAppMessage(itemsToSend, clientName, !specificItem);

    const url = cleanPhone
      ? `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end sm:justify-center p-0 animate-in fade-in duration-200">
      <div className="w-full h-full sm:max-w-6xl sm:h-[94vh] sm:rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden border border-slate-200/90">
        
        {/* ========================================================================= */}
        {/* CABEÇALHO PRINCIPAL FULLSCREEN */}
        {/* ========================================================================= */}
        <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between border-b border-slate-700/80 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-[#FF5E00]/20 text-[#FF5E00] border border-[#FF5E00]/40">
                  <DollarSign className="w-4 h-4 stroke-[2.5]" />
                </span>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Área Financeira
                </h1>
                <span className="hidden sm:inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {activeTab === 'pagar' ? 'Repasses de Motoristas' : 'Faturamento de Clientes'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium">
                Controle de pagamentos, cobranças WhatsApp e recibos autenticados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={loadFinancialData}
              disabled={loading}
              title="Recarregar dados"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#FF5E00]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* TABS PRINCIPAIS: CONTAS A PAGAR & CONTAS A RECEBER */}
        {/* ========================================================================= */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-3 sm:px-6 pt-2 shrink-0 flex items-center justify-between">
          <nav className="flex space-x-2" aria-label="Abas Financeiras">
            <button
              type="button"
              onClick={() => setActiveTab('pagar')}
              className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'pagar'
                  ? 'border-[#FF5E00] text-[#FF5E00] bg-white rounded-t-lg shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-t-lg'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>Contas a Pagar</span>
              {payableSubtotals.unpaidCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-red-100 text-red-700 text-[10px] font-black rounded-full border border-red-200">
                  {payableSubtotals.unpaidCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('receber')}
              className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'receber'
                  ? 'border-[#0B5187] text-[#0B5187] bg-white rounded-t-lg shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-t-lg'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Contas a Receber</span>
              {receivableSubtotals.unpaidCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full border border-amber-200">
                  {receivableSubtotals.unpaidCount}
                </span>
              )}
            </button>
          </nav>

          {/* Botão de Envio Geral WhatsApp do Usuário/Cliente Selecionado */}
          <div className="hidden sm:flex items-center pb-1">
            {activeTab === 'pagar' && selectedDriverKey !== 'all' && (
              <button
                type="button"
                onClick={() => handleSendDriverWhatsApp(selectedDriverKey)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Enviar Resumo do Motorista</span>
              </button>
            )}

            {activeTab === 'receber' && selectedClientFilter !== 'all' && (
              <button
                type="button"
                onClick={() => handleSendCustomerWhatsApp(selectedClientFilter)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>
                  {receivableStatus === 'paid' ? 'Enviar Recibo Geral' : 'Enviar Cobrança Geral'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CARDS DE MÉTRICAS / SUBTOTAL NO TOPO */}
        {/* ========================================================================= */}
        <div className="bg-slate-50 px-3 sm:px-6 py-2.5 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 shrink-0">
          {activeTab === 'pagar' ? (
            <>
              {/* Pendente / A Pagar (Destaque conforme pedido) */}
              <div className="bg-red-50/80 border border-red-200/90 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-red-700">
                  <span>A Pagar (Pendente)</span>
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="text-base sm:text-lg font-black text-red-800 tracking-tight mt-0.5">
                  {formatCurrency(payableSubtotals.unpaidTotal)}
                </div>
                <div className="text-[10px] text-red-600 font-medium">
                  {payableSubtotals.unpaidCount} {payableSubtotals.unpaidCount === 1 ? 'serviço' : 'serviços'}
                </div>
              </div>

              {/* Pago / Baixa Realizada */}
              <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700">
                  <span>Pago (Baixado)</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-800 tracking-tight mt-0.5">
                  {formatCurrency(payableSubtotals.paidTotal)}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium">
                  {payableSubtotals.paidCount} {payableSubtotals.paidCount === 1 ? 'serviço' : 'serviços'}
                </div>
              </div>

              {/* Total Geral de Repasses */}
              <div className="bg-white border border-slate-200 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Total Acumulado</span>
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-slate-800 tracking-tight mt-0.5">
                  {formatCurrency(payableSubtotals.allTotal)}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {payableSubtotals.allCount} serviços registrados
                </div>
              </div>

              {/* Total na Visualização Filtrada */}
              <div className="bg-orange-50/70 border border-orange-200 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-orange-800">
                  <span>Subtotal da Lista</span>
                  <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                </div>
                <div className="text-base sm:text-lg font-black text-[#FF5E00] tracking-tight mt-0.5">
                  {formatCurrency(filteredPayablesTotal)}
                </div>
                <div className="text-[10px] text-orange-700 font-medium">
                  {filteredPayables.length} itens exibidos
                </div>
              </div>
            </>
          ) : (
            <>
              {/* A Receber / Pendente */}
              <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-800">
                  <span>A Receber (Pendente)</span>
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="text-base sm:text-lg font-black text-amber-900 tracking-tight mt-0.5">
                  {formatCurrency(receivableSubtotals.unpaidTotal)}
                </div>
                <div className="text-[10px] text-amber-700 font-medium">
                  {receivableSubtotals.unpaidCount} {receivableSubtotals.unpaidCount === 1 ? 'pedido' : 'pedidos'}
                </div>
              </div>

              {/* Recebido / Quitado */}
              <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700">
                  <span>Recebido (Quitado)</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-800 tracking-tight mt-0.5">
                  {formatCurrency(receivableSubtotals.paidTotal)}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium">
                  {receivableSubtotals.paidCount} {receivableSubtotals.paidCount === 1 ? 'pedido' : 'pedidos'}
                </div>
              </div>

              {/* Faturamento Acumulado */}
              <div className="bg-white border border-slate-200 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Faturamento Total</span>
                  <Receipt className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-slate-800 tracking-tight mt-0.5">
                  {formatCurrency(receivableSubtotals.allTotal)}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {receivableSubtotals.allCount} pedidos registrados
                </div>
              </div>

              {/* Total na Visualização Filtrada */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2 sm:p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#0B5187]">
                  <span>Subtotal da Lista</span>
                  <Sparkles className="w-3.5 h-3.5 text-[#0B5187]" />
                </div>
                <div className="text-base sm:text-lg font-black text-[#0B5187] tracking-tight mt-0.5">
                  {formatCurrency(filteredReceivablesTotal)}
                </div>
                <div className="text-[10px] text-blue-700 font-medium">
                  {filteredReceivables.length} pedidos exibidos
                </div>
              </div>
            </>
          )}
        </div>

        {/* ========================================================================= */}
        {/* BARRA DE FILTROS MINIMALISTA */}
        {/* ========================================================================= */}
        <div className="bg-white px-3 sm:px-6 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* 1. Status Filter Pills */}
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
              Status:
            </span>
            {activeTab === 'pagar' ? (
              <>
                <button
                  type="button"
                  onClick={() => setPayableStatus('unpaid')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    payableStatus === 'unpaid'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Não Pagas ({payableSubtotals.unpaidCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPayableStatus('paid')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    payableStatus === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Pagas ({payableSubtotals.paidCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPayableStatus('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    payableStatus === 'all'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas ({payableSubtotals.allCount})
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setReceivableStatus('unpaid')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    receivableStatus === 'unpaid'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Não Pagas ({receivableSubtotals.unpaidCount})
                </button>
                <button
                  type="button"
                  onClick={() => setReceivableStatus('paid')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    receivableStatus === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Recebidas ({receivableSubtotals.paidCount})
                </button>
                <button
                  type="button"
                  onClick={() => setReceivableStatus('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    receivableStatus === 'all'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas ({receivableSubtotals.allCount})
                </button>
              </>
            )}
          </div>

          {/* 2. Filtro de Usuário / Motorista OU Cliente */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            {activeTab === 'pagar' ? (
              <div className="relative flex-1">
                <select
                  value={selectedDriverKey}
                  onChange={e => setSelectedDriverKey(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#FF5E00] cursor-pointer"
                >
                  <option value="all">Todos os Motoristas ({availableDrivers.length})</option>
                  {availableDrivers.map(d => (
                    <option key={d.key} value={d.key}>
                      {d.name} {d.unpaidCount > 0 ? `(${d.unpaidCount} pendentes)` : '✓'}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="relative flex-1">
                <select
                  value={selectedClientFilter}
                  onChange={e => setSelectedClientFilter(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0B5187] cursor-pointer"
                >
                  <option value="all">Todos os Clientes ({availableClients.length})</option>
                  {availableClients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.unpaidCount > 0 ? `(${c.unpaidCount} pendentes)` : '✓'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Campo de Busca Rápida */}
            <div className="relative w-36 sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-2.5 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#FF5E00]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* LISTA ULTRA-SLIM E MINIMALISTA COM DADOS DE ALTA DENSIDADE */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-2 divide-y divide-slate-100">
          {activeTab === 'pagar' ? (
            /* TABELA / LISTA DE CONTAS A PAGAR (MOTORISTAS) */
            filteredPayables.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                <CheckCircle2 className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">Nenhum repasse encontrado neste filtro</p>
                <p className="text-[11px] text-slate-400">Todas as contas filtradas estão em dia ou não há registros.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredPayables.map(item => (
                  <div
                    key={item.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:py-1.5 sm:px-3 rounded-lg border transition-colors gap-2 ${
                      item.paid
                        ? 'bg-slate-50/60 border-slate-200/60 text-slate-600'
                        : 'bg-white border-red-200/70 hover:border-red-300 shadow-2xs'
                    }`}
                  >
                    {/* Linha de Dados: Motorista, Operação, Local, Data */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Status Indicator */}
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          item.paid ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                        }`}
                        title={item.paid ? 'Pago' : 'Pendente de pagamento'}
                      />

                      {/* Motorista & Operação */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold text-slate-900 truncate">
                            {item.driver_name}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded uppercase bg-slate-100 text-slate-700">
                            {item.operation || 'serviço'}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {item.day}
                          </span>
                          {item.order_key && (
                            <span className="text-[10px] font-mono text-slate-400">
                              #{item.order_key}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-600 truncate flex items-center gap-1 mt-0.5">
                          <span className="font-semibold text-slate-700">
                            {item.place_name || item.label || 'Corrida'}
                          </span>
                          {item.customer_name && (
                            <span className="text-slate-400">
                              • Cliente: {item.customer_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Preço e Ações */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {/* Valor do Serviço */}
                      <div className="text-right">
                        <span className="text-xs sm:text-sm font-black text-slate-900">
                          {formatCurrency(item.price)}
                        </span>
                        <div className="text-[9.5px] font-bold">
                          {item.paid ? (
                            <span className="text-emerald-700">Baixado</span>
                          ) : (
                            <span className="text-red-600 font-extrabold">A Pagar</span>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex items-center gap-1.5">
                        {/* Botão Dar Baixa */}
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDialog({
                              isOpen: true,
                              type: 'payable',
                              item,
                              action: item.paid ? 'revert' : 'settle'
                            })
                          }
                          className={`px-2.5 py-1 text-xs font-bold rounded-md shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1 ${
                            item.paid
                              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>{item.paid ? 'Reverter' : 'Dar Baixa'}</span>
                        </button>

                        {/* Botão Enviar Comprovante WhatsApp */}
                        <button
                          type="button"
                          onClick={() => handleSendDriverWhatsApp(item.driver_key, item)}
                          title="Enviar comprovante de pagamento via WhatsApp"
                          className="p-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* TABELA / LISTA DE CONTAS A RECEBER (PEDIDOS DE CLIENTES) */
            filteredReceivables.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Receipt className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">Nenhum pedido encontrado neste filtro</p>
                <p className="text-[11px] text-slate-400">Todos os pedidos estão quitados ou não há registros.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredReceivables.map(item => {
                  const isPaid = item.payment_status === 'pago';
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:py-1.5 sm:px-3 rounded-lg border transition-colors gap-2 ${
                        isPaid
                          ? 'bg-slate-50/60 border-slate-200/60 text-slate-600'
                          : 'bg-white border-amber-200/70 hover:border-amber-300 shadow-2xs'
                      }`}
                    >
                      {/* Linha de Dados: Pedido, Cliente, Origem ➔ Destino */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isPaid ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                          }`}
                          title={isPaid ? 'Pago' : 'Aguardando Pagamento'}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-900 truncate">
                              {item.client_name}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-[#0B5187] border border-blue-200/60 font-mono">
                              #{item.code || item.order_id}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              {item.date}
                            </span>
                            {item.tipo_encomenda && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded uppercase bg-slate-100 text-slate-600">
                                {item.tipo_encomenda}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-600 truncate flex items-center gap-1 mt-0.5">
                            {item.orig_name && (
                              <span className="truncate">Coleta: {item.orig_name}</span>
                            )}
                            {item.dest_name && (
                              <span className="truncate text-slate-700 font-medium">
                                ➔ Entrega: {item.dest_name}
                              </span>
                            )}
                            {item.seller_name && (
                              <span className="text-slate-400 text-[10px]">
                                (Vendedor: {item.seller_name})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Preço e Ações */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* Valor Total */}
                        <div className="text-right">
                          <span className="text-xs sm:text-sm font-black text-slate-900">
                            {formatCurrency(item.total)}
                          </span>
                          <div className="text-[9.5px] font-bold">
                            {isPaid ? (
                              <span className="text-emerald-700">Quitado ✓</span>
                            ) : (
                              <span className="text-amber-700 font-extrabold">Pendente</span>
                            )}
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex items-center gap-1.5">
                          {/* Botão Dar Baixa */}
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDialog({
                                isOpen: true,
                                type: 'receivable',
                                item,
                                action: isPaid ? 'revert' : 'settle'
                              })
                            }
                            className={`px-2.5 py-1 text-xs font-bold rounded-md shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1 ${
                              isPaid
                                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                : 'bg-[#0B5187] hover:bg-[#083e68] text-white'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>{isPaid ? 'Reverter' : 'Dar Baixa'}</span>
                          </button>

                          {/* Botão WhatsApp: Cobrança (Pendente) ou Recibo Autenticado (Quitado) */}
                          <button
                            type="button"
                            onClick={() =>
                              handleSendCustomerWhatsApp(String(item.client_id || item.client_name), item)
                            }
                            title={
                              isPaid
                                ? 'Enviar recibo de quitação com número de autenticação'
                                : 'Enviar cobrança pelo WhatsApp'
                            }
                            className={`p-1.5 rounded-md border transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold ${
                              isPaid
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200'
                            }`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">
                              {isPaid ? 'Recibo' : 'Cobrar'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* ========================================================================= */}
        {/* RODAPÉ INFORMATIVO */}
        {/* ========================================================================= */}
        <footer className="bg-slate-50 px-3 sm:px-6 py-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Sistema Financeiro EncomendasZap</span>
            <span className="text-slate-300">•</span>
            <span>Recibos com autenticação criptográfica</span>
          </div>

          <div className="font-semibold text-slate-700">
            {activeTab === 'pagar'
              ? `${filteredPayables.length} repasses listados`
              : `${filteredReceivables.length} pedidos listados`}
          </div>
        </footer>

        {/* ========================================================================= */}
        {/* MODAL DE CONFIRMAÇÃO DE BAIXA */}
        {/* ========================================================================= */}
        {confirmDialog.isOpen && confirmDialog.item && (
          <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-4 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2.5 text-slate-900">
                <div
                  className={`p-2 rounded-lg ${
                    confirmDialog.action === 'settle'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {confirmDialog.action === 'settle' ? 'Confirmar Baixa' : 'Reverter Baixa'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {confirmDialog.type === 'payable' ? 'Repasse de Motorista' : 'Pedido de Cliente'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Destinatário:</span>
                  <span className="font-bold text-slate-800">
                    {confirmDialog.type === 'payable'
                      ? (confirmDialog.item as PayableAccount).driver_name
                      : (confirmDialog.item as ReceivableAccount).client_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor:</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(
                      confirmDialog.type === 'payable'
                        ? (confirmDialog.item as PayableAccount).price
                        : (confirmDialog.item as ReceivableAccount).total
                    )}
                  </span>
                </div>
                {confirmDialog.action === 'settle' && (
                  <div className="flex justify-between text-[11px] text-emerald-700 font-semibold pt-1 border-t border-slate-200">
                    <span>Código de Autenticação:</span>
                    <span className="font-mono font-bold">
                      {generateAuthCode(
                        confirmDialog.type,
                        confirmDialog.type === 'payable'
                          ? (confirmDialog.item as PayableAccount).id
                          : (confirmDialog.item as ReceivableAccount).order_id
                      )}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600">
                {confirmDialog.action === 'settle'
                  ? 'Tem certeza de que deseja confirmar a baixa e quitação deste valor?'
                  : 'Deseja reverter esta baixa para o status pendente?'}
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSettle}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition-all active:scale-95 cursor-pointer ${
                    confirmDialog.action === 'settle'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOAST FLUTUANTE */}
        {toastMessage && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-70 bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-150">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

      </div>
    </div>
  );
};
