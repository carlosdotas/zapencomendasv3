import type { Request } from 'express';
import { prisma } from './db';
import { collectionOwnership } from '../src/utils/collectionOwnership';

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
  const ownership = collectionOwnership(pedido);
  if (ownership.collectionRestricted) {
    return isPrivileged(caller) || Boolean(caller && ownership.collectionOwnerId === String(caller.id));
  }
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
  const isDeliveryOnly = pedido?.tipo_encomenda === 'entrega' &&
    !pedido?.coleta_locais_id &&
    !pedido?.pickup_location_id &&
    !pedido?.coleta_lat &&
    !pedido?.coleta_nome &&
    !pedido?.coleta_local &&
    !pedido?.orig_name &&
    !pedido?.coleta_user_id &&
    !pedido?.pickupVisibility &&
    !pedido?.pickupAssignedDriverId &&
    !pedido?.orig_drivers &&
    Boolean(
      pedido?.delivery_location_id ||
      pedido?.dest_name ||
      pedido?.entrega_nome ||
      pedido?.entrega_local ||
      pedido?.entrega_user_id ||
      pedido?.deliveryVisibility ||
      pedido?.deliveryAssignedDriverId ||
      pedido?.dest_drivers
    );
  const isColetado = ['coletado', 'trocando', 'trocado', 'retornando', 'segunda_entrega', 'retorno', 'entregando', 'entregue'].includes(stage);
  const activePoint = isExchange
    ? ['trocado', 'retornando', 'segunda_entrega', 'retorno', 'entregando'].includes(stage)
      ? 'delivery'
      : ['coletado', 'trocando'].includes(stage)
        ? 'exchange'
        : 'pickup'
    : (isColetado || isDeliveryOnly)
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
    pedido?.motorista_id,
    extra.motorista_id
  ].map(digits).filter(Boolean);
  const legacyDriverPhones = [
    pedido?.assignedDriverPhone,
    extra.assignedDriverPhone,
    pedido?.motorista_telefone,
    extra.motorista_telefone
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

  const allowedDriverIds = hasPointVisibility && staticDriverIds.length
    ? staticDriverIds
    : [...staticDriverIds, ...legacyDriverIds];
  const allowedDriverPhones = hasPointVisibility && staticDriverPhones.length
    ? staticDriverPhones
    : [...staticDriverPhones, ...legacyDriverPhones];

  if (allowedDriverIds.length || allowedDriverPhones.length) {
    anyAssigned = true;
    if (caller && (
      allowedDriverIds.includes(String(caller.id)) ||
      allowedDriverPhones.some(phone => caller.phone.length >= 8 && phone.slice(-8) === caller.phone.slice(-8))
    )) mine = true;
  }

  // Quando um motorista aceita ou o atendente/admin seta um motorista:
  // O marcador/pedido SÓ deve ser visualizado por aquele motorista.
  // Para todos os outros motoristas, o marcador desaparece imediatamente.
  if (anyAssigned) {
    return mine;
  }

  // Pedido privado sem motorista não fica visível para motoristas
  if (pointVisibility === 'privado') return false;

  // Pedido público/aberto sem motorista: disponível para qualquer motorista da cidade aceitar
  return true;
}
