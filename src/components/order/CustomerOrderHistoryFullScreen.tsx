import React, { useState, useMemo } from 'react';
import { 
  X, 
  ArrowLeft, 
  RotateCcw, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Package, 
  Search, 
  Clock, 
  User, 
  AlertTriangle, 
  Scale, 
  Layers, 
  Bike, 
  Car, 
  Truck, 
  Sparkles,
  TrendingUp,
  ChevronDown,
  Phone,
  MessageSquare,
  Copy,
  Check
} from 'lucide-react';
import { Customer } from '../../types/customer';
import { PastOrderRecord } from './NewOrderModal';
import { extractCityFromAddress } from '../../utils/addressUtils';
import { useBackButton } from '../../hooks/useBackButton';

interface CustomerOrderHistoryFullScreenProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  orders: PastOrderRecord[];
  isDriver?: boolean;
  onRepeatOrder: (order: PastOrderRecord) => void;
}

export const CustomerOrderHistoryFullScreen: React.FC<CustomerOrderHistoryFullScreenProps> = ({
  isOpen,
  onClose,
  customer,
  orders,
  isDriver = false,
  onRepeatOrder
}) => {
  useBackButton('customer-order-history-fullscreen', isOpen, onClose, 100);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'coleta' | 'entrega' | 'troca'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyOrder = (order: PastOrderRecord) => {
    const op = order.operationType.toUpperCase();
    const loc = order.placeName || order.deliveryAddress || order.pickupAddress;
    const seller = order.sellerName || order.responsibleName ? ` | Vendedor: ${order.sellerName || order.responsibleName} ${order.sellerPhone || order.responsiblePhone ? `(${order.sellerPhone || order.responsiblePhone})` : ''}` : '';
    const text = `Pedido #${order.orderCode} [${op}]\nLocal: ${loc}\nColeta: ${order.pickupAddress}\nEntrega: ${order.deliveryAddress}${order.exchangeAddress ? `\nTroca: ${order.exchangeAddress}` : ''}\nVeículo: ${order.vehicleType.toUpperCase()} | Pacote: ${order.packageType} (${order.volumesCount})${seller}\nValor: R$ ${(order.price || 0).toFixed(2)}${order.observations ? `\nObs: ${order.observations}` : ''}`;
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(order.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {}
  };

  // Contagem de frequência dos locais (endereços de entrega/coleta) do cliente
  const locationFrequencies = useMemo(() => {
    const freqMap: Record<string, number> = {};
    orders.forEach(order => {
      const key = (order.deliveryAddress || order.pickupAddress || '').trim().toLowerCase();
      if (key) {
        freqMap[key] = (freqMap[key] || 0) + (order.executionCount || 1);
      }
    });
    return freqMap;
  }, [orders]);

  // Filtragem e ordenação inteligente da lista de histórico: ORDENADA PELOS LOCAIS MAIS FEITOS
  const filteredOrders = useMemo(() => {
    const list = orders.filter(order => {
      // Filtro por tipo de operação
      if (filterType !== 'all' && order.operationType !== filterType) {
        return false;
      }

      // Filtro por termo de busca
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();

      return (
        order.orderCode?.toLowerCase().includes(term) ||
        order.pickupAddress?.toLowerCase().includes(term) ||
        order.deliveryAddress?.toLowerCase().includes(term) ||
        order.exchangeAddress?.toLowerCase().includes(term) ||
        order.packageType?.toLowerCase().includes(term) ||
        order.responsibleName?.toLowerCase().includes(term) ||
        order.observations?.toLowerCase().includes(term) ||
        order.dateStr?.toLowerCase().includes(term)
      );
    });

    // Ordenação estrita: Locais mais feitos no topo!
    return list.sort((a, b) => {
      const keyA = (a.deliveryAddress || a.pickupAddress || '').trim().toLowerCase();
      const keyB = (b.deliveryAddress || b.pickupAddress || '').trim().toLowerCase();
      const freqA = locationFrequencies[keyA] || 0;
      const freqB = locationFrequencies[keyB] || 0;

      if (freqB !== freqA) {
        return freqB - freqA; // O local mais repetido fica em 1º lugar
      }
      return (b.executionCount || 0) - (a.executionCount || 0);
    });
  }, [orders, filterType, searchTerm, locationFrequencies]);

  // Contadores por tipo de operação
  const counts = useMemo(() => {
    const total = orders.length;
    const coletas = orders.filter(o => o.operationType === 'coleta').length;
    const entregas = orders.filter(o => o.operationType === 'entrega').length;
    const trocas = orders.filter(o => o.operationType === 'troca').length;
    return { total, coletas, entregas, trocas };
  }, [orders]);

  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      
      {/* ========================================================
          1. HEADER PADRONIZADO EM TELA CHEIA (LEITURA CLARA)
          ======================================================== */}
      <header className="shrink-0 bg-[#0B5187] text-white px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-tight flex items-center gap-2">
                <span>Histórico de Encomendas</span>
                <span className="text-[11px] font-extrabold uppercase tracking-wider bg-white/20 text-white px-2 py-0.5 rounded-full">
                  Tela Cheia
                </span>
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-white/90 font-medium truncate max-w-[280px] sm:max-w-xl mt-0.5">
              Cliente: <strong className="text-white underline">{customer.fullName}</strong>
              {customer.phone && <span> • {customer.phone}</span>}
              <span> • {orders.length} {orders.length === 1 ? 'encomenda registrada' : 'encomendas registradas'}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* ========================================================
          2. FAIXA SUPERIOR: BUSCA RÁPIDA E FILTROS PADRONIZADOS
          ======================================================== */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 shrink-0 shadow-2xs space-y-2">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          
          {/* Campo de Busca Rápida com Fonte Legível */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por endereço, carga, código ou data..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-300 focus:bg-white focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/20 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none transition-all placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtros por Tipo de Operação */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
            {[
              { id: 'all', label: `Todas (${counts.total})` },
              { id: 'coleta', label: `Coletas (${counts.coletas})` },
              { id: 'entrega', label: `Entregas (${counts.entregas})` },
              { id: 'troca', label: `Trocas (${counts.trocas})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap border ${
                  filterType === tab.id
                    ? 'bg-[#0B5187] text-white border-[#0B5187] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>

        {/* Resumo compacto de destaque */}
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-600 font-semibold px-0.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-extrabold text-slate-800">Ordenado pelos locais mais feitos</span>
            <span className="text-slate-400 hidden sm:inline">• Endereços e destinos habituais no topo</span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline font-medium">
            Clique em <strong>Repetir Pedido</strong> para gerar na data atual
          </span>
        </div>
      </div>

      {/* ========================================================
          3. LISTAGEM COM FONTE LEGÍVEL E COMPONENTES ILUSTRATIVOS
             1. Cliente | 2. Local Coleta | 3. Local Entrega | 4. Preço + Detalhes
          ======================================================== */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto space-y-2">
          
          {/* CABEÇALHO TABULAR EM DESKTOP (FONTE BEM LEGÍVEL) */}
          <div className="hidden lg:grid grid-cols-12 gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-600 bg-slate-200/90 rounded-lg select-none shadow-2xs">
            <div className="col-span-4">1. Local & Operação (Em Evidência)</div>
            <div className="col-span-5">2. Vendedor, Veículo & Detalhes</div>
            <div className="col-span-1 text-right">Preço</div>
            <div className="col-span-2 text-right">Ações Rápidas</div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-xs">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-black text-slate-800">Nenhuma encomenda encontrada</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                {searchTerm 
                  ? 'Nenhum resultado corresponde à sua pesquisa.'
                  : 'Este cliente ainda não possui encomendas registradas com este filtro.'}
              </p>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black cursor-pointer transition-colors"
                >
                  Limpar busca
                </button>
              )}
            </div>
          ) : (
            filteredOrders.map((order, index) => {
              const isTop = index === 0;
              const isColeta = order.operationType === 'coleta';
              const isTroca = order.operationType === 'troca';
              const formattedPrice = (order.price || 18.5).toFixed(2).replace('.', ',');
              const locDisplayName = order.placeName || (isColeta ? order.pickupAddress.split(',')[0] : order.deliveryAddress.split(',')[0]) || 'Local';
              const mainAddress = isColeta ? order.pickupAddress : order.deliveryAddress;

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-lg border transition-all px-3 py-1.5 sm:py-2 shadow-2xs hover:border-[#0B5187] flex flex-col lg:grid lg:grid-cols-12 gap-2 items-start lg:items-center text-xs ${
                    isTop ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'
                  }`}
                >
                  {/* 1. LOCAL & OPERAÇÃO EM EVIDÊNCIA (col-span-4) */}
                  <div className="lg:col-span-4 flex items-center gap-2 min-w-0 w-full">
                    {/* Badge de Operação */}
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-white shadow-2xs ${
                        isColeta ? 'bg-[#0B5187]' : isTroca ? 'bg-purple-700' : 'bg-[#FF5E00]'
                      }`}
                      title={`Operação: ${order.operationType.toUpperCase()}`}
                    >
                      {order.operationType}
                    </span>

                    {/* Nome do Local em Evidência */}
                    <div className="min-w-0 flex-1">
                      <span
                        className="font-black text-xs sm:text-sm text-[#0B2F5B] truncate block uppercase tracking-tight"
                        title={`Local: ${locDisplayName}`}
                      >
                        📍 {locDisplayName}
                      </span>
                      <span className="text-[10.5px] font-semibold text-slate-500 truncate block" title={mainAddress}>
                        {mainAddress}
                      </span>
                    </div>
                  </div>

                  {/* 2. VENDEDOR, VEÍCULO & CARGA (col-span-5) */}
                  <div className="lg:col-span-5 flex items-center gap-1.5 flex-wrap min-w-0">
                    {/* Contato do Vendedor */}
                    {(order.sellerName || order.responsibleName) && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-950 border border-amber-200 text-[10.5px] font-bold">
                        <User className="w-3 h-3 text-amber-700 shrink-0" />
                        <span className="truncate max-w-[130px]">
                          Vendedor: <strong>{order.sellerName || order.responsibleName}</strong>
                        </span>
                        {(order.sellerPhone || order.responsiblePhone) && (
                          <span className="text-amber-800 font-medium">({order.sellerPhone || order.responsiblePhone})</span>
                        )}
                      </span>
                    )}

                    {/* Tamanho do Veículo */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-[#0B5187] border border-blue-200 text-[10.5px] font-black uppercase">
                      {order.vehicleType === 'carro' ? <Car className="w-3 h-3 text-blue-600" /> : order.vehicleType === 'utilitario' ? <Truck className="w-3 h-3 text-indigo-600" /> : <Bike className="w-3 h-3 text-emerald-600" />}
                      <span>{order.vehicleType}</span>
                    </span>

                    {/* Carga / Volumes */}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10.5px] font-bold">
                      <Package className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate max-w-[80px]">{order.packageType}</span>
                      {order.volumesCount && <span className="text-slate-400">({order.volumesCount})</span>}
                    </span>

                    {/* Medidas / Peso se houver */}
                    {order.dimensions && (
                      <span className="text-[10px] text-slate-500 font-semibold hidden xl:inline">📐 {order.dimensions}</span>
                    )}
                    {order.weightKg && (
                      <span className="text-[10px] text-slate-500 font-semibold hidden xl:inline">⚖️ {order.weightKg}kg</span>
                    )}
                  </div>

                  {/* 3. PREÇO (col-span-1) */}
                  <div className="lg:col-span-1 text-left lg:text-right">
                    <span className="font-black text-xs sm:text-sm text-emerald-700 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 whitespace-nowrap inline-block">
                      R$ {formattedPrice}
                    </span>
                  </div>

                  {/* 4. AÇÕES RÁPIDAS: COPIAR E REFAZER PEDIDO (col-span-2) */}
                  <div className="lg:col-span-2 flex items-center justify-end gap-1.5 w-full lg:w-auto">
                    <button
                      type="button"
                      onClick={() => handleCopyOrder(order)}
                      className="px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title="Copiar dados do pedido"
                      aria-label="Copiar dados do pedido"
                    >
                      {copiedId === order.id ? <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === order.id ? 'Copiado' : 'Copiar'}</span>
                    </button>

                    {!isDriver && (
                      <button
                        type="button"
                        onClick={() => onRepeatOrder(order)}
                        className="px-2.5 py-1 rounded-lg bg-[#FF5E00] hover:bg-[#E05300] active:scale-95 text-white text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                        title="Refazer pedido gerando nova encomenda para hoje"
                        aria-label="Refazer pedido"
                      >
                        <RotateCcw className="w-3.5 h-3.5 stroke-[2.8]" />
                        <span>Refazer</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

        </div>
      </div>

      {/* ========================================================
          4. FOOTER INFERIOR COM BOTÃO FECHAR PADRONIZADO
          ======================================================== */}
      <footer className="bg-white border-t border-slate-200 px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between">
        <div className="text-xs sm:text-sm text-slate-600 font-semibold hidden sm:flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Tipografia legível e contrastada com visualização completa dos dados da corrida.</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-extrabold text-xs sm:text-sm rounded-xl cursor-pointer transition-colors ml-auto shadow-2xs"
        >
          Fechar Histórico
        </button>
      </footer>

    </div>
  );
};
