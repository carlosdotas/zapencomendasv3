import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, X, Wallet, History, ChevronLeft, ChevronDown, Calendar } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { driverEarningsService, DriverEarningRow, DriverEarningsDay } from '../../services/driverEarningsService';
import { CalendarFilterModal } from '../navigation/CalendarFilterModal';
import { DateRangeFilter } from '../../types/map';
import { useAppVersion } from '../../hooks/useAppVersion';

const TZ = 'America/Sao_Paulo';
const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numericId = (v?: string) => (v || '').match(/\d+/)?.[0] || '';
const OP_LABEL: Record<string, string> = { coleta: 'Coleta', troca: 'Troca', entrega: 'Entrega' };
const centsToText = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDay = (day: string) => {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
};

interface EarningItem {
  key: string;
  operation: string;
  label: string;
  placeName: string;
  customerName: string;
  address: string;
  collected: boolean;
}

export const DriverEarningsBar: React.FC = () => {
  const appVersion = useAppVersion();
  const { allPlaces, completedWaypointMarks, user, currentRole, isAuthenticated } = useMapStore();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'today' | 'history'>('today');
  const [today, setToday] = useState(() => dayOf(Date.now()));
  const [saved, setSaved] = useState<Record<string, DriverEarningRow>>({});
  // Guarda apenas os dÃ­gitos digitados (valor em centavos)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<DriverEarningsDay[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [histRange, setHistRange] = useState<{ from: string; to: string } | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [histEdits, setHistEdits] = useState<Record<string, string>>({});
  const synced = useRef<Set<string>>(new Set());

  const driverId = String(user?.id || '');
  const active = currentRole === 'motorista' && isAuthenticated && !!driverId;

  useEffect(() => {
    const t = setInterval(() => setToday(dayOf(Date.now())), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    synced.current = new Set();
    setEdits({});
    driverEarningsService.list(driverId, today).then(rows => {
      if (cancelled) return;
      const map: Record<string, DriverEarningRow> = {};
      rows.forEach(r => { map[r.order_key] = r; });
      setSaved(map);
    });
    return () => { cancelled = true; };
  }, [active, driverId, today]);

  const rangeFrom = histRange?.from || today;
  const rangeTo = histRange?.to || today;

  const loadHistory = () => {
    setHistoryLoading(true);
    driverEarningsService.history(driverId, rangeFrom, rangeTo).then(setHistory).finally(() => setHistoryLoading(false));
  };

  // Ao abrir o histÃ³rico volta para o dia de hoje
  useEffect(() => {
    if (!open) { setHistRange(null); setHistEdits({}); setExpandedDay(null); }
  }, [open]);

  useEffect(() => {
    if (open && view === 'history' && active) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, active, driverId, rangeFrom, rangeTo]);

  const items = useMemo<EarningItem[]>(() => {
    if (!active) return [];
    const myMarks = (completedWaypointMarks || []).filter(m =>
      m.completedDate === today && m.status !== 'failed' && m.driverId && String(m.driverId) === driverId
    );
    const doneKeys = new Set(myMarks.map(m => `${numericId(m.orderId || m.orderCode)}_${m.operationType}`));
    const map = new Map<string, EarningItem>();

    (allPlaces || []).forEach(p => {
      if (!realtimeAssignmentService.isDirectlyAssignedToUser(p, user)) return;
      const num = numericId(p.id) || numericId(p.orderCode);
      if (!num) return;
      const op = p.operationType || 'coleta';
      const rt = realtimeAssignmentService.getAssignmentForOrder(p.id, op) || realtimeAssignmentService.getAssignmentForOrder(num, op);
      if (rt?.assignedAt && dayOf(rt.assignedAt) !== today) return;
      const key = `${num}_${op}`;
      map.set(key, {
        key,
        operation: op,
        label: p.orderCode || `Pedido ${num}`,
        placeName: p.name || '',
        customerName: p.customerName || '',
        address: p.address || '',
        collected: doneKeys.has(key)
      });
    });

    myMarks.forEach(m => {
      const num = numericId(m.orderId || m.orderCode);
      if (!num) return;
      const key = `${num}_${m.operationType}`;
      const prev = map.get(key);
      if (prev) {
        prev.collected = true;
      } else {
        map.set(key, {
          key,
          operation: m.operationType,
          label: m.orderCode || `Pedido ${num}`,
          placeName: m.placeName || '',
          customerName: m.customerName || '',
          address: m.address || '',
          collected: true
        });
      }
    });

    return Array.from(map.values());
  }, [active, allPlaces, completedWaypointMarks, user, today, driverId]);

  const priceOf = (key: string) => {
    if (edits[key] !== undefined) return (parseInt(edits[key] || '0', 10) || 0) / 100;
    return saved[key]?.price || 0;
  };

  const inputText = (key: string) => {
    if (edits[key] !== undefined) return edits[key] ? centsToText(parseInt(edits[key], 10)) : '';
    const price = saved[key]?.price;
    return price ? centsToText(Math.round(price * 100)) : '';
  };

  const persist = async (item: EarningItem, price: number) => {
    const status = item.collected ? 'coletado' : 'aceito';
    const ok = await driverEarningsService.save({
      driverId, day: today, orderKey: item.key, price, status,
      operation: item.operation, label: item.label, placeName: item.placeName,
      customerName: item.customerName, address: item.address
    });
    if (ok) {
      setSaved(prev => ({
        ...prev,
        [item.key]: { ...(prev[item.key] || ({} as DriverEarningRow)), order_key: item.key, price, status } as DriverEarningRow
      }));
    }
  };

  useEffect(() => {
    if (!active) return;
    items.forEach(item => {
      const status = item.collected ? 'coletado' : 'aceito';
      const sig = `${today}:${item.key}:${status}`;
      if (synced.current.has(sig)) return;
      if (saved[item.key]?.status === status) { synced.current.add(sig); return; }
      synced.current.add(sig);
      void persist(item, saved[item.key]?.price || 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, saved, active, today]);

  if (!active) return null;

  const acceptedCount = items.length;
  const collectedCount = items.filter(i => i.collected).length;
  const pendingItems = items.filter(i => !i.collected);
  const total = items.reduce((sum, i) => sum + priceOf(i.key), 0);

  const openModal = (v: 'today' | 'history') => {
    setHistRange(null);
    setView(v);
    setOpen(true);
  };

  const isExpanded = (day: string) => expandedDay === day || (expandedDay === null && history.length === 1);

  const calendarValue: DateRangeFilter = {
    startDate: rangeFrom,
    endDate: rangeTo,
    preset: rangeFrom === today && rangeTo === today ? ('hoje' as DateRangeFilter['preset']) : null
  };

  const handleApplyDates = (range: DateRangeFilter) => {
    if (!range.startDate && !range.endDate) { setHistRange(null); return; }
    const a = range.startDate || range.endDate || today;
    const b = range.endDate || range.startDate || today;
    setHistRange({ from: a <= b ? a : b, to: a <= b ? b : a });
  };

  const saveHistoryPrice = async (it: DriverEarningRow) => {
    const digits = histEdits[it.id];
    if (digits === undefined) return;
    const price = (parseInt(digits || '0', 10) || 0) / 100;
    const ok = await driverEarningsService.save({
      driverId, day: it.day, orderKey: it.order_key, price, status: 'coletado',
      operation: it.operation || undefined, label: it.label || undefined,
      placeName: it.place_name || undefined, customerName: it.customer_name || undefined, address: it.address || undefined
    });
    if (ok) {
      setHistory(prev => prev.map(d => d.day !== it.day ? d : {
        ...d,
        items: d.items.map(x => x.id === it.id ? { ...x, price } : x),
        total: d.items.reduce((s, x) => s + (x.id === it.id ? price : x.price || 0), 0)
      }));
      if (it.day === today) setSaved(prev => prev[it.order_key] ? { ...prev, [it.order_key]: { ...prev[it.order_key], price } } : prev);
      setHistEdits(prev => { const n = { ...prev }; delete n[it.id]; return n; });
    }
  };

  const toggleDayPaid = async (d: DriverEarningsDay) => {
    const next = !d.paid;
    const ok = await driverEarningsService.setDayPaid(driverId, d.day, next);
    if (ok) {
      setHistory(prev => prev.map(x => x.day === d.day ? { ...x, paid: next, paid_at: next ? new Date().toISOString() : null } : x));
    }
  };

  return (
    <>
      <div className="absolute left-1/2 -translate-x-1/2 top-3 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => openModal('today')}
          className="h-11 sm:h-12 flex items-center gap-3 px-4 sm:px-5 bg-white/95 backdrop-blur rounded-xl shadow-lg border-2 border-white/90 text-xs sm:text-sm font-bold text-slate-700 cursor-pointer active:scale-95 transition-all"
          title="Ver meus pedidos de hoje"
        >
          <span className="flex items-center gap-1.5"><ClipboardList className="w-4 h-4 text-[#0B5187]" /> {acceptedCount} <span className="text-slate-300">|</span> <span className="text-emerald-700 font-black">{brl(total)}</span></span>
        </button>
        <button
          type="button"
          onClick={() => openModal('history')}
          className="relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center bg-white/95 backdrop-blur rounded-xl shadow-lg border-2 border-white/90 text-[#0B5187] cursor-pointer active:scale-95 transition-all"
          title={`HistÃ³rico â€¢ ${collectedCount} coletados hoje`}
        >
          <History className="w-5 h-5" />
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-emerald-600 text-white text-[11px] font-black flex items-center justify-center border-2 border-white">
            {collectedCount}
          </span>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                {view === 'history' && (
                  <button type="button" onClick={() => setView('today')} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer">
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                )}
                <div>
                  <h3 className="text-base font-black text-slate-900">{view === 'today' ? 'Meus pedidos de hoje' : 'HistÃ³rico'}</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {view === 'today'
                      ? `${acceptedCount} aceitos â€¢ ${collectedCount} coletados â€¢ renova todo dia`
                      : rangeFrom === rangeTo ? `Coletados em ${formatDay(rangeFrom)}` : `Coletados de ${formatDay(rangeFrom)} a ${formatDay(rangeTo)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {view === 'today' && (
                  <button type="button" onClick={() => { setHistRange(null); setView('history'); }} className="h-8 px-2.5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer">
                    <History className="w-3.5 h-3.5" /> HistÃ³rico
                  </button>
                )}
                {view === 'history' && (
                  <button type="button" onClick={() => setShowCalendar(true)} className="h-8 px-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1 text-[11px] font-bold cursor-pointer" title="Filtrar por data">
                    <Calendar className="w-3.5 h-3.5" /> Datas
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>

            {view === 'today' ? (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {pendingItems.length === 0 && (
                    <p className="text-center text-xs text-slate-500 py-8">{items.length ? 'Todos os pedidos de hoje jÃ¡ foram coletados. Veja no histÃ³rico.' : 'Nenhum pedido aceito hoje ainda.'}</p>
                  )}
                  {pendingItems.map(item => (
                    <div key={item.key} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50/60">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900 truncate">{item.label}</span>
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{OP_LABEL[item.operation] || item.operation}</span>
                        </div>
                        <p className="text-[11px] font-bold text-slate-700 truncate">{item.placeName || item.address || 'Sem local'}</p>
                        {item.customerName && <p className="text-[11px] text-slate-500 truncate">Cliente: {item.customerName}</p>}
                        <p className={`text-[10px] font-bold mt-0.5 ${item.collected ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {item.collected ? 'âœ” Coletado' : 'Aceito'}
                        </p>
                      </div>
                      <label className="flex flex-col items-end">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">PreÃ§o cobrado</span>
                        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 focus-within:border-[#0B5187]">
                          <span className="text-[11px] text-slate-400 font-bold">R$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0,00"
                            value={inputText(item.key)}
                            onChange={e => {
                              const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
                              setEdits(prev => ({ ...prev, [item.key]: digits }));
                            }}
                            onBlur={() => {
                              if (edits[item.key] === undefined) return;
                              void persist(item, priceOf(item.key));
                            }}
                            className="w-20 text-right text-xs font-black text-slate-900 outline-none bg-transparent"
                          />
                        </div>
                      </label>
                    </div>
                  ))}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between bg-emerald-50 rounded-b-3xl">
                  <span className="flex items-center gap-1.5 text-xs font-black text-emerald-800 uppercase"><Wallet className="w-4 h-4" /> Total ganho hoje</span>
                  <span className="text-lg font-black text-emerald-700">{brl(total)}</span>
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {historyLoading && <p className="text-center text-xs text-slate-500 py-8">Carregando...</p>}
                {!historyLoading && history.length === 0 && (
                  <p className="text-center text-xs text-slate-500 py-8">Nenhum pedido coletado neste período.</p>
                )}
                {history.map(d => (
                  <div key={d.day} className="rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedDay(isExpanded(d.day) ? '' : d.day)}
                      className="w-full flex items-center gap-3 p-3 text-left cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900">{formatDay(d.day)}</p>
                        <p className="text-[11px] text-slate-500">{d.accepted} aceitos â€¢ {d.collected} coletados</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-slate-900">{brl(d.total)}</p>
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${d.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {d.paid ? 'Pago' : 'Pendente'}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded(d.day) ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded(d.day) && (
                      <div className="px-3 pb-3 space-y-1.5 border-t border-slate-200 pt-2">
                        {d.items.map(it => (
                          <div key={it.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 truncate">
                                {it.label || it.order_key} â€¢ {OP_LABEL[it.operation || ''] || it.operation}
                              </p>
                              <p className="text-slate-500 truncate">
                                {[it.place_name || it.address, it.customer_name].filter(Boolean).join(' â€¢ ') || 'Sem local'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-1.5 py-0.5 shrink-0 focus-within:border-[#0B5187]">
                              <span className="text-[10px] text-slate-400 font-bold">R$</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0,00"
                                value={histEdits[it.id] !== undefined ? (histEdits[it.id] ? centsToText(parseInt(histEdits[it.id], 10)) : '') : (it.price ? centsToText(Math.round(it.price * 100)) : '')}
                                onChange={e => {
                                  const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
                                  setHistEdits(prev => ({ ...prev, [it.id]: digits }));
                                }}
                                onBlur={() => void saveHistoryPrice(it)}
                                className="w-16 text-right text-[11px] font-black text-slate-800 outline-none bg-transparent"
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[10px] text-slate-500">
                            {d.paid && d.paid_at ? `Pago em ${new Date(d.paid_at).toLocaleDateString('pt-BR', { timeZone: TZ })}` : 'Aguardando pagamento'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void toggleDayPaid(d)}
                            className={`h-7 px-3 rounded-lg text-[11px] font-black cursor-pointer ${d.paid ? 'bg-slate-200 text-slate-700' : 'bg-emerald-600 text-white'}`}
                          >
                            {d.paid ? 'Desmarcar pago' : 'Marcar como pago'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>EncomendasZap Logística</span>
              <span className="font-semibold text-slate-500">Versão {appVersion}</span>
            </div>
          </div>
        </div>
      )}

      <CalendarFilterModal
        isOpen={showCalendar}
        onClose={() => setShowCalendar(false)}
        value={calendarValue}
        onApply={handleApplyDates}
        places={[]}
        title="Filtrar HistÃ³rico por Data"
        zIndexClass="z-[140]"
      />
    </>
  );
};
