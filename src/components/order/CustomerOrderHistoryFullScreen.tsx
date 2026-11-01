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
  MessageSquare
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
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

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
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700 bg-slate-200/80 rounded-xl select-none shadow-2xs">
            <div className="col-span-3">1. Cliente / Operação</div>
            <div className="col-span-4">2. Coleta (A) ➔ 3. Entrega (B)</div>
            <div className="col-span-3">Detalhes da Carga</div>
            <div className="col-span-1 text-right">4. Preço</div>
            <div className="col-span-1 text-right">Ação</div>
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
              const isExpanded = expandedOrderId === order.id;

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border-2 transition-all p-2.5 sm:px-4 sm:py-3 shadow-2xs hover:border-[#0B5187] hover:bg-blue-50/20 ${
                    isTop 
                      ? 'border-amber-400 ring-1 ring-amber-400/40 bg-linear-to-r from-amber-50/40 via-white to-white' 
                      : 'border-slate-200'
                  }`}
                >
                  
                  {/* LINHA PRINCIPAL COM FONTE LEGÍVEL */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 lg:gap-3 items-center">
                    
                    {/* 1. CLIENTE & OPERAÇÃO (col-span-3) */}
                    <div className="lg:col-span-3 flex items-center gap-2.5 min-w-0">
                      
                      {/* Tag com Ícone da Operação */}
                      <span 
                        className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center font-black shadow-2xs ${
                          isColeta 
                            ? 'bg-blue-100 text-[#0B5187] border border-blue-200' 
                            : isTroca 
                            ? 'bg-purple-100 text-purple-900 border border-purple-200' 
                            : 'bg-orange-100 text-[#FF5E00] border border-orange-200'
                        }`}
                        title={`Operação: ${order.operationType.toUpperCase()}`}
                      >
                        {isColeta ? (
                          <ArrowDownToLine className="w-4 h-4 stroke-[2.5]" />
                        ) : isTroca ? (
                          <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                        ) : (
                          <ArrowUpFromLine className="w-4 h-4 stroke-[2.5]" />
                        )}
                      </span>

                      {/* Nome do Cliente e Tag de Repetições */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                            {customer.fullName}
                          </span>
                          {(() => {
                            const locKey = (order.deliveryAddress || order.pickupAddress || '').trim().toLowerCase();
                            const locFreq = locationFrequencies[locKey] || order.executionCount || 1;
                            return locFreq > 1 ? (
                              <span className="shrink-0 text-[10px] font-black px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-0.5">
                                <span>📍</span>
                                <span>Local {locFreq}x</span>
                              </span>
                            ) : null;
                          })()}
                          {order.executionCount && order.executionCount > 1 && (
                            <span className="shrink-0 text-[10px] font-black px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                              🔥 {order.executionCount}x
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 truncate mt-0.5">
                          <span className="font-extrabold text-slate-700">#{order.orderCode}</span>
                          <span>•</span>
                          <span className="truncate">{order.dateStr}</span>
                        </div>
                      </div>

                      {/* Preço visível em mobile ao lado do nome */}
                      <span className="lg:hidden text-sm sm:text-base font-black text-[#0B5187] shrink-0">
                        R$ {formattedPrice}
                      </span>
                    </div>

                    {/* 2 & 3. LOCAL DE COLETA (A) ➔ LOCAL DE ENTREGA (B) (col-span-4) */}
                    <div className="lg:col-span-4 flex items-center gap-2 min-w-0">
                      
                      {/* Ponto A (Coleta) */}
                      <div className="flex items-start gap-1.5 min-w-0 flex-1 bg-blue-50/80 lg:bg-transparent px-2 py-1 lg:p-0 rounded-xl">
                        <span className="w-5 h-5 rounded-md bg-[#0B5187] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs mt-0.5">
                          A
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate" title={`Coleta: ${order.pickupAddress}`}>
                            {order.pickupAddress}
                          </p>
                          {/* Cidade embaixo do endereço de coleta com fonte legível */}
                          <p className="text-xs font-bold text-slate-600 truncate flex items-center gap-1 mt-0.5">
                            <span className="text-[#0B5187] font-black">📍</span>
                            <span className="truncate">{extractCityFromAddress(order.pickupAddress)}</span>
                          </p>
                        </div>
                      </div>

                      <span className="text-slate-400 font-black text-xs shrink-0 self-center">➔</span>

                      {/* Ponto B (Entrega) */}
                      <div className="flex items-start gap-1.5 min-w-0 flex-1 bg-orange-50/80 lg:bg-transparent px-2 py-1 lg:p-0 rounded-xl">
                        <span className="w-5 h-5 rounded-md bg-[#FF5E00] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs mt-0.5">
                          B
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate" title={`Entrega: ${order.deliveryAddress}`}>
                            {order.deliveryAddress}
                          </p>
                          {/* Cidade embaixo do endereço de entrega com fonte legível */}
                          <p className="text-xs font-bold text-slate-600 truncate flex items-center gap-1 mt-0.5">
                            <span className="text-[#FF5E00] font-black">📍</span>
                            <span className="truncate">{extractCityFromAddress(order.deliveryAddress)}</span>
                          </p>
                          {/* Se for troca */}
                          {isTroca && order.exchangeAddress && (
                            <div className="pt-1 border-t border-purple-100 mt-1">
                              <p className="text-xs text-purple-900 font-extrabold truncate flex items-center gap-1" title={`Ponto de Troca: ${order.exchangeAddress}`}>
                                <span>🔄</span>
                                <span className="truncate">{order.exchangeAddress}</span>
                              </p>
                              <p className="text-xs text-purple-700 font-bold truncate pl-3.5 mt-0.5">
                                📍 {extractCityFromAddress(order.exchangeAddress)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* DETALHES COMPLETOS DA CARGA EM LINHA (col-span-3) - FONTE LEGÍVEL */}
                    <div className="lg:col-span-3 flex items-center gap-1.5 flex-wrap min-w-0">
                      
                      {/* Tipo de Carga */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200 shadow-2xs">
                        <Package className="w-3.5 h-3.5 text-slate-500" />
                        <span className="truncate max-w-[80px]">{order.packageType}</span>
                      </span>

                      {/* Volumes */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200 shadow-2xs">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        <span>{order.volumesCount}</span>
                      </span>

                      {/* Veículo */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-100 text-[#0B5187] font-black text-xs border border-blue-200 uppercase shadow-2xs">
                        {order.vehicleType === 'carro' ? <Car className="w-3.5 h-3.5" /> : order.vehicleType === 'utilitario' ? <Truck className="w-3.5 h-3.5" /> : <Bike className="w-3.5 h-3.5" />}
                        <span>{order.vehicleType}</span>
                      </span>

                      {/* Frágil */}
                      {order.isFragile && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-black text-xs border border-amber-300 shadow-2xs">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                          <span>Frágil</span>
                        </span>
                      )}

                      {/* Peso */}
                      {order.weightKg && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 shadow-2xs">
                          <Scale className="w-3.5 h-3.5 text-slate-400" />
                          <span>{order.weightKg}kg</span>
                        </span>
                      )}

                      {/* Medidas */}
                      {order.dimensions && (
                        <span className="text-xs font-semibold text-slate-500 hidden xl:inline">
                          📐 {order.dimensions}
                        </span>
                      )}
                    </div>

                    {/* 4. PREÇO (col-span-1) - DESKTOP (DESTAQUE GRANDE E LEGÍVEL) */}
                    <div className="hidden lg:flex flex-col items-end justify-center lg:col-span-1">
                      <span className="text-base sm:text-lg font-black text-[#0B5187] whitespace-nowrap">
                        R$ {formattedPrice}
                      </span>
                    </div>

                    {/* AÇÃO: REPETIR & EXPANDIR (col-span-1) */}
                    <div className="lg:col-span-1 flex items-center justify-end gap-1.5">
                      
                      {/* Botão de Expandir Observações */}
                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer border ${
                          isExpanded ? 'bg-blue-100 text-[#0B5187] border-blue-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Ver responsável e observações completas"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${isExpanded ? 'rotate-180 text-[#0B5187]' : ''}`} />
                      </button>

                      {/* Botão Repetir Pedido (Oculto para motoristas) */}
                      {!isDriver && (
                        <button
                          type="button"
                          onClick={() => onRepeatOrder(order)}
                          className="px-3 py-1.5 bg-[#FF5E00] hover:bg-[#E05300] active:scale-95 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                          title="Repetir este pedido gerando uma nova encomenda na data atual"
                        >
                          <RotateCcw className="w-3.5 h-3.5 stroke-[2.8]" />
                          <span>Repetir Pedido</span>
                        </button>
                      )}
                    </div>

                  </div>

                  {/* SUB-LINHA EXPANSÍVEL: RESPONSÁVEL E OBSERVAÇÕES (FONTE CLARA E LEGÍVEL) */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-4 flex-wrap text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl">
                      <span className="flex items-center gap-1.5 font-bold text-slate-900">
                        <User className="w-4 h-4 text-slate-500" />
                        <span>Responsável: <strong>{order.responsibleName}</strong></span>
                        {order.responsiblePhone && <span className="text-slate-600 font-semibold">({order.responsiblePhone})</span>}
                      </span>

                      {order.dimensions && (
                        <span>📐 Medidas: <strong className="text-slate-900">{order.dimensions}</strong></span>
                      )}

                      {order.distanceKm && (
                        <span className="text-emerald-800 font-black">⚡ Distância: {order.distanceKm} km</span>
                      )}

                      {order.observations && (
                        <span className="flex items-center gap-1 text-slate-700 italic font-medium">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                          <span>"{order.observations}"</span>
                        </span>
                      )}
                    </div>
                  )}

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
