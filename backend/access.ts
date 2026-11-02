import type { Request } from 'express';
import { prisma } from './db';

export interface AssignmentLike {
  orderId?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  assignedAt?: number;
  enRoute?: boolean;
}

export interface Caller {
  id: number;
  role: string;
  phone: string;
}

/** Atribuições de pedidos em memória (compartilhadas entre as rotas REST e o tempo real). */
export const assignmentStore = new Map<string, AssignmentLike>();

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

const PRIVILEGED_ROLES = new Set(['admin', 'admin_geral', 'atendente', 'terminal']);

export function getRequestToken(req: Request, body?: any): string {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer || String(body?.token || req.query?.token || '');
}

/** Identifica quem chama pela sessão do servidor (nunca por cabeçalhos informados pelo cliente). */
export async function resolveCaller(req: Request, body?: any): Promise<Caller | null> {
  const token = getRequestToken(req, body);
  if (!token) return null;
  const session = await prisma.user_sessions.findUnique({ where: { token }, include: { user: true } });
  if (!session || !session.is_logged || !session.user) return null;
  return {
    id: session.user.id,
    role: String(session.user.access_level || '').toLowerCase(),
    phone: digits(session.user.phone)
  };
}

/** Só admin/atendente/terminal autenticados enxergam tudo; motorista, cliente ou anônimo ficam restritos. */
export const isPrivileged = (caller: Caller | null) => Boolean(caller && PRIVILEGED_ROLES.has(caller.role));

export function isAssignmentMine(a: AssignmentLike | undefined | null, caller: Caller | null): boolean {
  if (!a || !caller) return false;
  const id = digits(a.driverId);
  if (id && id === String(caller.id)) return true;
  const phone = digits(a.driverPhone);
  return phone.length >= 8 && caller.phone.length >= 8 && phone.slice(-8) === caller.phone.slice(-8);
}

const hasDriver = (a: AssignmentLike) => Boolean(a.driverId || a.driverPhone || a.driverName);

/** Atribuições em tempo real que o chamador pode ver: motorista só recebe as suas. */
export function assignmentsVisibleTo(caller: Caller | null): Record<string, AssignmentLike> {
  const all = Object.fromEntries(assignmentStore);
  if (isPrivileged(caller)) return all;
  return Object.fromEntries(Object.entries(all).filter(([, a]) => isAssignmentMine(a, caller)));
}

function orderIdOfKey(key: string): string {
  return key.match(/\d+/)?.[0] || '';
}

const driversFromField = (raw: unknown): string[] => {
  if (raw === null || raw === undefined || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const text = String(raw).trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  return text ? [text] : [];
};

/**
 * Um pedido com motorista definido (em tempo real ou nos campos do próprio pedido)
 * só pode ser visto por esse motorista. Pedidos sem nenhum motorista seguem abertos.
 */
export function canCallerSeeOrder(pedido: any, caller: Caller | null): boolean {
  // Restringe motoristas e requisições sem sessão (quem omite o token não pode escapar do filtro)
  if (caller && caller.role !== 'motorista') return true;
  const orderId = String(pedido?.id ?? '').match(/\d+/)?.[0] || '';
  let anyAssigned = false;
  let mine = false;

  if (orderId) {
    for (const [key, a] of assignmentStore) {
      if (orderIdOfKey(key) !== orderId || !hasDriver(a)) continue;
      anyAssigned = true;
      if (isAssignmentMine(a, caller)) mine = true;
    }
  }

  for (const op of ['coleta', 'entrega', 'troca']) {
    const ids = [pedido?.[`${op}_user_id`], ...driversFromField(pedido?.[`${op}_motoristas`])]
      .map(digits)
      .filter(Boolean);
    if (!ids.length) continue;
    anyAssigned = true;
    if (caller && ids.includes(String(caller.id))) mine = true;
  }

  return !anyAssigned || mine;
}
