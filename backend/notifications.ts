import type { Express, Request, Response } from 'express';
import { prisma } from './db';
import { resolveCaller } from './access';
import { parseRawJsonBody } from './routes';
import { toInt } from './mappers';

const DRIVER_LEVELS = ['motorista', 'driver', 'motoboy'];
const STAFF_LEVELS = ['admin', 'admin_geral', 'atendente'];

export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  orderId?: number | null;
}

async function createFor(userIds: number[], input: NotifyInput) {
  const unique = [...new Set(userIds)].filter(id => Number.isInteger(id) && id > 0);
  if (!unique.length) return;
  await prisma.notifications.createMany({
    data: unique.map(user_id => ({
      user_id,
      type: input.type,
      title: input.title.slice(0, 160),
      message: input.message,
      order_id: input.orderId ?? null
    }))
  });
}

async function usersByLevel(levels: string[]) {
  const rows = await prisma.users.findMany({ where: { access_level: { in: levels } }, select: { id: true } });
  return rows.map(r => r.id);
}

export async function notifyUser(userId: number, input: NotifyInput) {
  try {
    await createFor([userId], input);
  } catch (err: any) {
    console.warn('[Notificações] Falha ao notificar usuário:', err.message);
  }
}

async function orderDetail(orderId: number, side: 'orig' | 'dest'): Promise<string> {
  try {
    const o = await prisma.orders.findUnique({ where: { id: orderId }, select: { client_name: true, orig_name: true, dest_name: true } });
    if (!o) return '';
    const place = (side === 'orig' ? o.orig_name || o.dest_name : o.dest_name || o.orig_name) || '';
    return `${o.client_name ? ` Cliente: ${o.client_name}.` : ''}${place ? ` Local: ${place}.` : ''}`;
  } catch {
    return '';
  }
}

/** Novo pedido: avisa todos os motoristas. Nunca derruba a operação principal. */
export async function notifyNewOrder(order: { id: number; client_name?: string | null }, actorId?: number | null) {
  try {
    const drivers = (await usersByLevel(DRIVER_LEVELS)).filter(id => id !== actorId);
    await createFor(drivers, {
      type: 'novo_pedido',
      title: 'Novo pedido disponível',
      message: `Pedido #${order.id} aguardando um motorista.${await orderDetail(order.id, 'orig')}`,
      orderId: order.id
    });
  } catch (err: any) {
    console.warn('[Notificações] Falha ao notificar novo pedido:', err.message);
  }
}

/** Andamento do pedido (aceite, coleta, entrega...): avisa admins, atendentes e o cliente do pedido. */
export async function notifyOrderProgress(
  orderRef: { id?: number | string | null; client_id?: number | null } | number | string,
  event: { type: string; title: string; message: string },
  actorId?: number | null
) {
  try {
    const rawId = typeof orderRef === 'object' ? orderRef.id : orderRef;
    const orderId = toInt(String(rawId ?? '').match(/\d+/)?.[0]);
    if (!orderId) return;
    let clientId = typeof orderRef === 'object' ? orderRef.client_id ?? null : null;
    if (clientId === null || clientId === undefined) {
      const found = await prisma.orders.findUnique({ where: { id: orderId }, select: { client_id: true } });
      clientId = found?.client_id ?? null;
    }
    const recipients = [...(await usersByLevel(STAFF_LEVELS)), ...(clientId ? [clientId] : [])].filter(id => id !== actorId);
    const detail = await orderDetail(orderId, ['a_caminho', 'coletado'].includes(event.type) ? 'orig' : 'dest');
    await createFor(recipients, { ...event, message: `${event.message}${detail}`, orderId });
  } catch (err: any) {
    console.warn('[Notificações] Falha ao notificar andamento:', err.message);
  }
}

const ETAPA_EVENTS: Record<string, { type: string; label: string }> = {
  coletando: { type: 'a_caminho', label: 'está a caminho da coleta' },
  coletado: { type: 'coletado', label: 'foi coletado' },
  entregando: { type: 'em_entrega', label: 'saiu para entrega' },
  trocado: { type: 'trocado', label: 'teve a troca realizada' },
  entregue: { type: 'entregue', label: 'foi entregue' },
  finalizado: { type: 'finalizado', label: 'foi finalizado' }
};

export function etapaEvent(etapa: string, orderId: number, actorName?: string) {
  const info = ETAPA_EVENTS[String(etapa).toLowerCase()];
  if (!info) return null;
  const who = actorName ? ` (${actorName})` : '';
  return {
    type: info.type,
    title: `Pedido #${orderId} ${info.label}`,
    message: `O pedido #${orderId} ${info.label}${who}.`
  };
}

const toView = (n: any) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  orderId: n.order_id,
  createdAt: n.created_at,
  read: Boolean(n.read_at)
});

export function registerNotifications(app: Express) {
  const handler =
    (fn: (caller: { id: number }, req: Request, res: Response, body: any) => Promise<void>) =>
    async (req: Request, res: Response) => {
      try {
        const body = parseRawJsonBody(req);
        const caller = await resolveCaller(req, body);
        if (!caller) {
          res.status(401).json({ success: false, message: 'Faça login para ver as notificações.' });
          return;
        }
        await fn(caller, req, res, body);
      } catch (err: any) {
        if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
      }
    };

  const both = (path: string) => [path, `/api${path}`];

  // Devolve só o que ainda não foi entregue a este aparelho e marca como entregue (usado para o alerta nativo)
  app.all(
    both('/notificacoes/pull'),
    handler(async (caller, _req, res) => {
      const rows = await prisma.notifications.findMany({
        where: { user_id: caller.id, delivered_at: null },
        orderBy: { id: 'asc' },
        take: 50
      });
      if (rows.length) {
        await prisma.notifications.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { delivered_at: new Date() } });
      }
      res.json({ success: true, data: rows.map(toView) });
    })
  );

  app.all(
    both('/notificacoes/list'),
    handler(async (caller, _req, res) => {
      const rows = await prisma.notifications.findMany({ where: { user_id: caller.id }, orderBy: { id: 'desc' }, take: 50 });
      res.json({ success: true, data: rows.map(toView) });
    })
  );

  app.all(
    both('/notificacoes/read'),
    handler(async (caller, _req, res, body) => {
      const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
      await prisma.notifications.updateMany({
        where: { user_id: caller.id, read_at: null, ...(ids.length ? { id: { in: ids } } : {}) },
        data: { read_at: new Date(), delivered_at: new Date() }
      });
      res.json({ success: true });
    })
  );

  app.all(
    both('/notificacoes/clear'),
    handler(async (caller, _req, res, body) => {
      const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
      await prisma.notifications.deleteMany({ where: { user_id: caller.id, ...(ids.length ? { id: { in: ids } } : {}) } });
      res.json({ success: true });
    })
  );
}
