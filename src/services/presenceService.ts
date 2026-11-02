/**
 * Navegação em andamento e presença no local (hora de chegada + tempo de espera).
 * Tudo é salvo no navegador (continua se o app fechar) e no servidor (/pedidos/presenca).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { request } from './httpClient';

export interface NavSession {
  placeId: string;
  operationType: string;
  name: string;
  lat: number;
  lng: number;
  startedAt: number;
}

export interface PresenceEntry {
  placeId: string;
  chegadaEm: string | null;
  esperaS: number;
  /** Momento local em que a contagem atual começou; null quando o motorista está longe */
  since: number | null;
}

const NAV_KEY = 'encomendaszap_nav_session';
const PRESENCE_KEY = 'encomendaszap_presence';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

let navSession: NavSession | null = readJson<NavSession | null>(NAV_KEY, null);
let presence: Record<string, PresenceEntry> = readJson<Record<string, PresenceEntry>>(PRESENCE_KEY, {});

export const getNavSession = () => navSession;

export const setNavSession = (session: NavSession | null) => {
  navSession = session;
  try {
    if (session) localStorage.setItem(NAV_KEY, JSON.stringify(session));
    else localStorage.removeItem(NAV_KEY);
  } catch {}
  emit();
};

export const useNavSession = (): NavSession | null => useSyncExternalStore(subscribe, getNavSession);

const savePresence = () => {
  try {
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
  } catch {}
  emit();
};

export const getPresenceMap = () => presence;

export const usePresenceMap = (): Record<string, PresenceEntry> => useSyncExternalStore(subscribe, getPresenceMap);

export const removePresence = (placeId: string) => {
  if (!presence[placeId]) return;
  const next = { ...presence };
  delete next[placeId];
  presence = next;
  savePresence();
};

export const pedidoIdFromPlace = (place: { id: string; orderCode?: string }): string => {
  const fromId = String(place.id).match(/pedido-(\d+)/)?.[1] || String(place.id).match(/^(\d+)$/)?.[1];
  return fromId || String(place.orderCode || '').match(/(\d+)/)?.[1] || String(place.id).match(/\d+/)?.[0] || '';
};

/** Informa ao servidor se o motorista está perto; devolve a hora de chegada e o tempo acumulado. */
export const pingPresence = async (place: { id: string; orderCode?: string; operationType?: string }, near: boolean) => {
  const pedidoId = pedidoIdFromPlace(place);
  if (!pedidoId) return;
  const res: any = await request('/pedidos/presenca', 'POST', {
    pedido_id: pedidoId,
    operacao: place.operationType || 'coleta',
    perto: near
  });
  const data = res?.data;
  if (!res?.success || !data) return;
  presence = {
    ...presence,
    [place.id]: {
      placeId: place.id,
      chegadaEm: data.chegada_em || null,
      esperaS: Number(data.espera_s) || 0,
      since: data.counting ? Date.now() : null
    }
  };
  savePresence();
};

export const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}h ${mm}min ${ss}s` : `${mm}min ${ss}s`;
};

/** Tempo de espera (em segundos) atualizado a cada segundo enquanto a contagem está ativa. */
export const useWaitSeconds = (entry: PresenceEntry | undefined): number => {
  const [, tick] = useState(0);
  const counting = Boolean(entry && entry.since !== null);
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [counting]);
  if (!entry) return 0;
  return entry.esperaS + (entry.since !== null ? (Date.now() - entry.since) / 1000 : 0);
};
