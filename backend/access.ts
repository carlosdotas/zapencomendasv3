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
  acceptedByDriver?: boolean;
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
  try {
    const session = await prisma.user_sessions.findUnique({ where: { token }, include: { user: true } });
    if (!session || !session.is_logged || !session.user) return null;
    return {
      id: session.user.id,
      role: String(session.user.access_level || '').toLowerCase(),
      phone: digits(session.user.phone)
    };
  } catch (err: any) {
    return null;
  }
}

/** Só admin/atendente/terminal autenticados enxergam tudo; motorista, cliente ou anônimo ficam restritos. */
export const isPrivileged = (caller: Caller | null) => Boolean(caller && PRIVILEGED_ROLES.has(caller.role));

export function isConfirmedDriverClaim(caller: Caller | null, claim: unknown): boolean {
  return caller?.role === 'motorista' && claim === true;
}

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

function operationOfKey(key: string): string {
  return key.match(/(?:^|[-_])(coleta|troca|entrega|retorno)$/i)?.[1]?.toLowerCase() || '';
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

/** Filtra a encomenda pela atribuição da parada ativa, sem misturar motoristas de outras etapas. */
export function canCallerSeeOrder(pedido: any, caller: Caller | null): boolean {
  // Restringe motoristas e requisições sem sessão (quem omite o token não pode escapar do filtro)
  if (caller && caller.role !== 'motorista') return true;
  const orderId = String(pedido?.id ?? '').match(/\d+/)?.[0] || '';
  let extra: Record<string, unknown> = {};
  const rawExtra = pedido?.itens_extras;
  if (typeof rawExtra === 'string') {
    try {
      const parsed = JSON.parse(rawExtra);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        extra = parsed as Record<string, unknown>;
      }
    } catch {
      extra = {};
    }
  }

  const stage = String(pedido?.etapa || '').toLowerCase().trim();
  const isExchange = String(pedido?.tipo_encomenda || '').toLowerCase() === 'troca' ||
    Boolean(pedido?.troca_lat || pedido?.troca_nome);
  const activePoint = isExchange
    ? ['trocado', 'retornando', 'segunda_entrega', 'retorno', 'entregando'].includes(stage)
      ? 'delivery'
      : ['coletado', 'trocando'].includes(stage)
        ? 'exchange'
        : 'pickup'
    : ['coletado', 'entregando'].includes(stage)
      ? 'delivery'
      : 'pickup';
  const operation = activePoint === 'pickup' ? 'coleta' : activePoint === 'exchange' ? 'troca' : 'entrega';
  const rawPointVisibility = pedido?.[`${activePoint}Visibility`] ?? extra[`${activePoint}Visibility`];
  const legacyVisibility = pedido?.orderVisibility ?? extra.orderVisibility;
  const pointVisibility = rawPointVisibility === 'publico' || rawPointVisibility === 'privado'
    ? rawPointVisibility
    : legacyVisibility === 'publico' || legacyVisibility === 'privado'
      ? legacyVisibility
      : undefined;
  const hasPointVisibility = rawPointVisibility === 'publico' || rawPointVisibility === 'privado';

  const staticDriverIds = [
    pedido?.[`${activePoint}AssignedDriverId`],
    extra[`${activePoint}AssignedDriverId`],
    pedido?.[`${operation}_user_id`],
    ...driversFromField(pedido?.[`${operation}_motoristas`])
  ].map(digits).filter(Boolean);
  const staticDriverPhones = [
    pedido?.[`${activePoint}AssignedDriverPhone`],
    extra[`${activePoint}AssignedDriverPhone`]
  ].map(digits).filter(phone => phone.length >= 8);
  const legacyDriverIds = [
    pedido?.assignedDriverId,
    extra.assignedDriverId,
    pedido?.motorista_id
  ].map(digits).filter(Boolean);
  const legacyDriverPhones = [
    pedido?.assignedDriverPhone,
    extra.assignedDriverPhone,
    pedido?.motorista_telefone
  ].map(digits).filter(phone => phone.length >= 8);

  let anyAssigned = false;
  let mine = false;

  if (orderId) {
    for (const [key, a] of assignmentStore) {
      const assignmentOperation = operationOfKey(key);
      if (
        orderIdOfKey(key) !== orderId ||
        (assignmentOperation && assignmentOperation !== operation) ||
        !hasDriver(a)
      ) continue;
      anyAssigned = true;
      if (isAssignmentMine(a, caller)) mine = true;
    }
  }

  if (pointVisibility === 'privado') {
    const allowedDriverIds = hasPointVisibility ? staticDriverIds : [...staticDriverIds, ...legacyDriverIds];
    const allowedDriverPhones = hasPointVisibility ? staticDriverPhones : [...staticDriverPhones, ...legacyDriverPhones];
    if (allowedDriverIds.length || allowedDriverPhones.length) {
      anyAssigned = true;
      if (caller && (
        allowedDriverIds.includes(String(caller.id)) ||
        allowedDriverPhones.some(phone => caller.phone.length >= 8 && phone.slice(-8) === caller.phone.slice(-8))
      )) mine = true;
    }
  } else if (!pointVisibility) {
    const allDriverIds = [...staticDriverIds, ...legacyDriverIds];
    const allDriverPhones = [...staticDriverPhones, ...legacyDriverPhones];
    if (allDriverIds.length || allDriverPhones.length) {
      anyAssigned = true;
      if (caller && (
        allDriverIds.includes(String(caller.id)) ||
        allDriverPhones.some(phone => caller.phone.length >= 8 && phone.slice(-8) === caller.phone.slice(-8))
      )) mine = true;
    }
  }

  if (pointVisibility === 'privado' && !anyAssigned) return false;
  return !anyAssigned || mine;
}
