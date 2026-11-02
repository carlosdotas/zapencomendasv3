import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, CheckCircle2, X, Wallet } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { driverEarningsService, DriverEarningRow } from '../../services/driverEarningsService';

const TZ = 'America/Sao_Paulo';
const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numericId = (v?: string) => (v || '').match(/\d+/)?.[0] || '';
const OP_LABEL: Record<string, string> = { coleta: 'Coleta', troca: 'Troca', entrega: 'Entrega' };

interface EarningItem {
  key: string;
  operation: string;
  label: string;
  address: string;
  collected: boolean;
}

export const DriverEarningsBar: React.FC = () => {
  const { allPlaces, completedWaypointMarks, user, currentRole, isAuthenticated } = useMapStore();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(() => dayOf(Date.now()));
  const [saved, setSaved] = useState<Record<string, DriverEarningRow>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const synced = useRef<Set<string>>(new Set());

  const driverId = String(user?.id || '');
  const active = currentRole === 'motorista' && isAuthenticated && !!driverId;

  // Renova a contagem quando o dia vira
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
        address: p.name || p.address || '',
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
          address: m.placeName || m.address || '',
          collected: true
        });
      }
    });

    return Array.from(map.values());
  }, [active, allPlaces, completedWaypointMarks, user, today, driverId]);

  const priceOf = (key: string) => {
    if (edits[key] !== undefined) return parseFloat(edits[key].replace(',', '.')) || 0;
    return saved[key]?.price || 0;
  };

  const persist = async (item: EarningItem, price: number) => {
    const status = item.collected ? 'coletado' : 'aceito';
    const ok = await driverEarningsService.save({
      driverId, day: today, orderKey: item.key, price, status,
      operation: item.operation, label: item.label, address: item.address
    });
    if (ok) {
      setSaved(prev => ({
        ...prev,
        [item.key]: { ...(prev[item.key] || ({} as DriverEarningRow)), order_key: item.key, price, status } as DriverEarningRow
      }));
    }
  };

  // Registra no banco cada pedido aceito/coletado do dia (sem alterar o preço já salvo)
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
  const total = items.reduce((sum, i) => sum + priceOf(i.key), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-1/2 -translate-x-1/2 top-[68px] sm:top-[72px] z-20 flex items-center gap-3 px-3.5 py-1.5 bg-white/95 backdrop-blur rounded-full shadow-lg border border-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer active:scale-95 transition-all"
        title="Ver meus pedidos de hoje"
      >
        <span className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5 text-[#0B5187]" /> {acceptedCount} {acceptedCount === 1 ? 'aceito' : 'aceitos'}</span>
        <span className="w-px h-4 bg-slate-200" />
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {collectedCount} {collectedCount === 1 ? 'coletado' : 'coletados'}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Meus pedidos de hoje</h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  {acceptedCount} aceitos • {collectedCount} coletados • renova todo dia
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {items.length === 0 && (
                <p className="text-center text-xs text-slate-500 py-8">Nenhum pedido aceito hoje ainda.</p>
              )}
              {items.map(item => (
                <div key={item.key} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50/60">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900 truncate">{item.label}</span>
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{OP_LABEL[item.operation] || item.operation}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{item.address || 'Sem endereço'}</p>
                    <p className={`text-[10px] font-bold mt-0.5 ${item.collected ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {item.collected ? '✔ Coletado' : 'Aceito'}
                    </p>
                  </div>
                  <label className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Preço cobrado</span>
                    <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1 focus-within:border-[#0B5187]">
                      <span className="text-[11px] text-slate-400 font-bold">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={edits[item.key] ?? (saved[item.key]?.price ? String(saved[item.key].price).replace('.', ',') : '')}
                        onChange={e => setEdits(prev => ({ ...prev, [item.key]: e.target.value.replace(/[^\d,.]/g, '') }))}
                        onBlur={() => {
                          if (edits[item.key] === undefined) return;
                          void persist(item, priceOf(item.key));
                        }}
                        className="w-16 text-right text-xs font-black text-slate-900 outline-none bg-transparent"
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
          </div>
        </div>
      )}
    </>
  );
};
