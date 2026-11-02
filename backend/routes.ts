import type { Express, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from './db';
import {
  parseExtra,
  userToBackend,
  userFromBackend,
  localToBackend,
  localFromBackend,
  pedidoToBackend,
  pedidoFromBackend,
  pedidoLocationIds,
  cleanPedidoId,
  todaySaoPaulo,
  toInt,
  hasValue,
  iso
} from './mappers';

export interface RouteDeps {
  saveBase64Image: (dataUrl: string, subfolder?: string) => string | null;
  uploadToPhpServer: (dataUrl: string, tipo?: string) => Promise<string | null>;
  imageServerConfigured: () => boolean;
}

export function parseRawJsonBody(req: Request): any {
  if (req.body && Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf-8'));
    } catch {
      return {};
    }
  }
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

type Handler = (req: Request, res: Response, body: any) => Promise<void> | void;

function route(app: Express, paths: string | string[], handler: Handler) {
  const list = (Array.isArray(paths) ? paths : [paths]).flatMap(p => [p, `/api${p}`]);
  app.all(list, async (req: Request, res: Response) => {
    try {
      await handler(req, res, parseRawJsonBody(req));
    } catch (err: any) {
      console.error(`[API] ${req.method} ${req.path}:`, err);
      if (!res.headersSent) res.status(500).json({ success: false, message: err?.message || 'Erro interno do servidor' });
    }
  });
}

const digitsOf = (value: unknown) => String(value ?? '').replace(/\D/g, '');

function phoneVariants(raw: unknown): string[] {
  const d = digitsOf(raw);
  if (!d) return [];
  const variants = new Set<string>([d]);
  if (d.startsWith('55') && d.length > 11) variants.add(d.slice(2));
  else variants.add(`55${d}`);
  return [...variants];
}

async function findUserByPhone(raw: unknown) {
  const variants = phoneVariants(raw);
  if (!variants.length) return null;
  const matches = await prisma.users.findMany({ where: { phone: { in: variants } } });
  const exact = digitsOf(raw);
  // Com telefones duplicados (com/sem 55), prioriza o número exato e quem tem senha
  const score = (u: { phone: string | null; password: string | null }) => (u.password ? 2 : 0) + (u.phone === exact ? 1 : 0);
  return matches.sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function findUserFromBody(body: any) {
  const id = toInt(body.id ?? body.user_id);
  if (id) {
    const byId = await prisma.users.findUnique({ where: { id } });
    if (byId) return byId;
  }
  if (digitsOf(body.phone).length >= 8) return findUserByPhone(body.phone);
  return null;
}

async function orderCounts(): Promise<Map<number, number>> {
  const groups = await prisma.orders.groupBy({ by: ['client_id'], _count: { _all: true } });
  const map = new Map<number, number>();
  for (const g of groups) if (g.client_id) map.set(g.client_id, g._count._all);
  return map;
}

async function findPedido(raw: unknown) {
  const id = toInt(cleanPedidoId(raw));
  return id ? prisma.orders.findUnique({ where: { id } }) : null;
}

async function pedidosToBackend(rows: any[]) {
  const ids = pedidoLocationIds(rows);
  const locations = new Map<number, any>();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 500) {
      const found = await prisma.locations.findMany({ where: { id: { in: ids.slice(i, i + 500) } } });
      found.forEach(l => locations.set(l.id, l));
    }
  }
  return rows.map(row => pedidoToBackend(row, locations));
}

async function logStage(orderId: number, before: string, after: string, userId?: unknown, details?: string) {
  if (before === after) return;
  try {
    await prisma.order_logs.create({
      data: { order_id: orderId, user_id: toInt(userId), stage_before: before, stage_after: after, details: details || null }
    });
  } catch {
    // o log nunca deve impedir a operação principal
  }
}

const NEXT_ETAPA: Record<string, (tipo: string) => string> = {
  pendente: () => 'coletando',
  aprovado: () => 'coletando',
  coletando: () => 'coletado',
  coletado: tipo => (tipo === 'troca' ? 'trocando' : 'entregando'),
  trocando: () => 'trocado',
  trocado: () => 'retornando',
  retornando: () => 'entregue',
  entregando: () => 'entregue'
};

/** Atualiza a etapa do pedido preenchendo os carimbos de tempo correspondentes. */
async function applyEtapa(existing: any, etapa: string, userId?: unknown, userName?: string) {
  const nowIso = new Date().toISOString();
  const patch: any = { etapa };
  if (etapa === 'coletado') {
    patch.coleta_saida_at = nowIso;
    if (userId) patch.coleta_user_id = userId;
    if (userName) patch.coleta_user_nome = userName;
  } else if (etapa === 'trocado' || etapa === 'troca') {
    patch.troca_saida_at = nowIso;
    patch.troca_at = nowIso;
    if (userId) patch.troca_user_id = userId;
    if (userName) patch.troca_user_nome = userName;
  } else if (etapa === 'entregue') {
    patch.entrega_saida_at = nowIso;
    patch.entrega_at = nowIso;
    if (userId) patch.entrega_user_id = userId;
    if (userName) patch.entrega_user_nome = userName;
    patch.status_pagamento = 'pago';
  } else if (etapa === 'finalizado') {
    patch.status_pagamento = 'pago';
    patch.finalizado_em = nowIso;
    if (!existing?.delivered_at) patch.entrega_saida_at = nowIso;
  }
  const data = pedidoFromBackend(patch, existing);
  // Sem pedido existente não cria um novo: isso gerava pedidos "fantasmas" já finalizados.
  if (!existing) return null;
  const updated = await prisma.orders.update({ where: { id: existing.id }, data });
  await logStage(existing.id, existing.stage, updated.stage, userId);
  return updated;
}

async function searchPedidosWhere(body: any) {
  const where: any = {};
  const and: any[] = [];

  const rawId = body.id;
  if (hasValue(rawId)) {
    const id = toInt(cleanPedidoId(rawId));
    and.push({ id: id ?? -1 });
  }
  if (hasValue(body.clientes_id ?? body.cliente_id)) {
    and.push({ client_id: toInt(body.clientes_id ?? body.cliente_id) ?? -1 });
  }
  if (hasValue(body.motorista_id)) {
    const m = String(body.motorista_id);
    const mid = toInt(m);
    and.push({
      OR: [
        ...(mid ? [{ collector_id: mid }] : []),
        { orig_drivers: { contains: m } },
        { dest_drivers: { contains: m } }
      ]
    });
  }
  if (body.tipo_encomenda) {
    const t = String(body.tipo_encomenda).toLowerCase();
    and.push({ order_type: t === 'troca' ? 'coleta_entrega' : t });
  }
  if (body.tipo_veiculo) {
    const v = String(body.tipo_veiculo).toLowerCase();
    and.push({ vehicle_type: v === 'utilitario' ? { in: ['pick_up', 'van', 'caminhao'] } : v });
  }
  if (body.status_pagamento) {
    const s = String(body.status_pagamento).toLowerCase();
    and.push({ payment_status: s === 'pago' ? 'pago' : 'nao_pago' });
  }
  if (body.cidade) {
    const c = String(body.cidade);
    and.push({ OR: [{ orig_city: { contains: c } }, { dest_city: { contains: c } }] });
  }
  if (body.nome) {
    const q = String(body.nome).trim();
    and.push({ OR: [{ client_name: { contains: q } }, { item_name: { contains: q } }, { contact_phone: { contains: q } }] });
  }
  if (body.data_ini) and.push({ date: { gte: String(body.data_ini).slice(0, 10) } });
  if (body.data_fim) and.push({ date: { lte: String(body.data_fim).slice(0, 10) } });
  if (and.length) where.AND = and;
  return where;
}

export function registerApiRoutes(app: Express, deps: RouteDeps) {
  // ------------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------------
  const loginPayload = (user: any, token: string) => ({
    user_id: user.id,
    token,
    name: user.full_name || user.name,
    phone: user.phone || '',
    access_level: user.access_level,
    foto: user.photo || undefined,
    avatarUrl: user.photo || undefined
  });

  route(app, '/login/login', async (_req, res, body) => {
    const user = await findUserByPhone(body.phone);
    const hash = user?.password ? user.password.replace(/^\$2y\$/, '$2a$') : '';
    const ok = !!user && !!hash && !!body.password && bcrypt.compareSync(String(body.password), hash);
    if (!user || !ok) {
      res.status(401).json({ success: false, message: 'Telefone ou senha inválidos.' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    await prisma.user_sessions.create({
      data: {
        user_id: user.id,
        token,
        device_id: String(body.device_id || 'web'),
        source: body.source ? String(body.source) : 'web',
        type: user.access_level
      }
    });
    res.json({ success: true, data: loginPayload(user, token) });
  });

  route(app, '/login/islogged', async (_req, res, body) => {
    const token = String(body.token || '');
    const session = token ? await prisma.user_sessions.findUnique({ where: { token }, include: { user: true } }) : null;
    if (!session || !session.is_logged) {
      res.json({ success: false, logged: false, message: 'Sessão inválida ou expirada.' });
      return;
    }
    res.json({ success: true, logged: true, data: loginPayload(session.user, token) });
  });

  route(app, '/login/logout', async (_req, res, body) => {
    const token = String(body.token || '');
    if (token) await prisma.user_sessions.updateMany({ where: { token }, data: { is_logged: false } });
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // USUÁRIOS
  // ------------------------------------------------------------------
  route(app, '/users/reload', async (_req, res) => {
    res.json({ success: true, message: 'Usuários carregados do banco.', count: await prisma.users.count() });
  });

  route(app, '/users/list', async (_req, res, body) => {
    const where: any = {};
    if (body.access_level && typeof body.access_level === 'string') where.access_level = body.access_level.toLowerCase().trim();
    const [rows, counts] = await Promise.all([prisma.users.findMany({ where, orderBy: { id: 'asc' } }), orderCounts()]);

    let list = rows;
    if (body.search && typeof body.search === 'string') {
      const q = body.search.toLowerCase().trim();
      const digits = q.replace(/\D/g, '');
      list = rows.filter(u => {
        const text = [u.name, u.full_name, u.city].map(v => (v || '').toLowerCase());
        if (text.some(t => t.includes(q))) return true;
        return !!digits && (digitsOf(u.phone).includes(digits) || digitsOf(u.cpf).includes(digits));
      });
    }
    list.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.id - b.id);

    const page = Math.max(1, parseInt(body.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(body.limit, 10) || 50), 500);
    const slice = list.slice((page - 1) * limit, page * limit);
    res.json({
      success: true,
      data: slice.map(u => userToBackend(u, counts.get(u.id) || 0)),
      total: list.length,
      page,
      limit,
      hasMore: page * limit < list.length
    });
  });

  route(app, '/users/get', async (req, res, body) => {
    const id = toInt(body.id ?? req.query.id);
    const user = id ? await prisma.users.findUnique({ where: { id } }) : null;
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuário não encontrado' });
      return;
    }
    const counts = await prisma.orders.count({ where: { client_id: user.id } });
    res.json({ success: true, data: userToBackend(user, counts) });
  });

  const resolvePhoto = async (body: any, res: Response): Promise<boolean> => {
    const image = [body.foto, body.avatarUrl].find(v => typeof v === 'string' && v.startsWith('data:image/'));
    if (image) {
      if (!deps.imageServerConfigured()) {
        res.status(503).json({ success: false, message: 'Configure IMAGE_SERVER_URL e IMAGE_SERVER_PASSWORD no .env do servidor.' });
        return false;
      }
      const url = await deps.uploadToPhpServer(image, 'perfil');
      if (!url) {
        res.status(502).json({ success: false, message: 'Não foi possível enviar a foto ao servidor de imagens configurado.' });
        return false;
      }
      body.foto = url;
      body.avatarUrl = url;
    } else if (body.foto) {
      body.avatarUrl = body.foto;
    } else if (body.avatarUrl) {
      body.foto = body.avatarUrl;
    }
    return true;
  };

  const hashPassword = (plain: string) => bcrypt.hashSync(plain, 10);

  route(app, '/users/save', async (_req, res, body) => {
    if (!(await resolvePhoto(body, res))) return;
    const existing = await findUserFromBody(body);
    const data = userFromBackend(body, existing);
    if (typeof body.password === 'string' && body.password.trim()) data.password = hashPassword(body.password);

    let saved;
    if (existing) {
      saved = await prisma.users.update({ where: { id: existing.id }, data });
    } else {
      saved = await prisma.users.create({
        data: {
          ...data,
          name: data.name || 'Usuário Sem Nome',
          full_name: data.full_name || data.name || 'Usuário Sem Nome',
          phone: data.phone || null,
          access_level: data.access_level || 'cliente'
        }
      });
    }
    const user = userToBackend(saved, await prisma.orders.count({ where: { client_id: saved.id } }));
    res.json({ success: true, id: saved.id, foto: user.foto, avatarUrl: user.avatarUrl, data: user, message: 'Usuário salvo com sucesso!' });
  });

  route(app, '/users/delete', async (req, res, body) => {
    const id = toInt(body.id ?? req.query.id);
    if (!id) {
      res.status(400).json({ success: false, message: 'ID do usuário obrigatório' });
      return;
    }
    await prisma.users.delete({ where: { id } }).catch(() => null);
    res.json({ success: true });
  });

  route(app, '/users/upload_foto', async (_req, res, body) => {
    const base64Data = body.base64 || body.image || body.foto || body.avatarUrl;
    let photoPath = '';
    if (typeof base64Data === 'string' && base64Data.startsWith('data:image/')) {
      if (!deps.imageServerConfigured()) {
        res.status(503).json({ success: false, message: 'Configure IMAGE_SERVER_URL e IMAGE_SERVER_PASSWORD no .env do servidor.' });
        return;
      }
      const url = await deps.uploadToPhpServer(base64Data, 'perfil');
      if (!url) {
        res.status(502).json({ success: false, message: 'Não foi possível enviar a foto ao servidor de imagens configurado.' });
        return;
      }
      photoPath = url;
    } else if (typeof base64Data === 'string' && !base64Data.startsWith('data:')) {
      photoPath = base64Data;
    }
    if (!photoPath) {
      res.status(400).json({ success: false, message: 'Nenhuma foto foi enviada.' });
      return;
    }
    const user = await findUserFromBody(body);
    if (user) await prisma.users.update({ where: { id: user.id }, data: { photo: photoPath } });
    res.json({ success: true, data: { path: photoPath, foto: photoPath, avatarUrl: photoPath }, path: photoPath, foto: photoPath, avatarUrl: photoPath });
  });

  route(app, '/users/register', async (_req, res, body) => {
    const phone = digitsOf(body.phone);
    if (!phone) {
      res.status(400).json({ success: false, message: 'Telefone obrigatório.' });
      return;
    }
    if (await findUserByPhone(phone)) {
      res.status(409).json({ success: false, message: 'Já existe um usuário com este telefone.' });
      return;
    }
    const extra: any = { cliente_especial: 0, paga_semanal: 0, pendencias: 0 };
    const created = await prisma.users.create({
      data: {
        name: String(body.name || '').trim() || 'Usuário',
        phone,
        password: typeof body.password === 'string' && body.password ? hashPassword(body.password) : null,
        access_level: String(body.access_level || 'cliente').toLowerCase(),
        city: body.cidade || body.city || null,
        full_name: body.name_completo || body.full_name || String(body.name || '').trim() || 'Usuário',
        extra: JSON.stringify(extra)
      }
    });
    res.json({ success: true, data: { id: created.id }, message: 'Usuário registrado com sucesso!' });
  });

  // ------------------------------------------------------------------
  // PEDIDOS
  // ------------------------------------------------------------------
  route(app, '/pedidos/list_pedidos', async (_req, res, body) => {
    const where = await searchPedidosWhere(body);
    const etapas: string[] | null = body.etapa
      ? (Array.isArray(body.etapa) ? body.etapa : [body.etapa]).map((e: string) => String(e).toLowerCase())
      : null;
    const limit = Math.min(Math.max(1, parseInt(body.limit, 10) || 2000), 2000);
    const page = Math.max(1, parseInt(body.page, 10) || 1);

    const rows = await prisma.orders.findMany({ where, orderBy: { id: 'desc' } });
    let data = await pedidosToBackend(rows);
    if (etapas) data = data.filter(o => etapas.includes(String(o.etapa).toLowerCase()));
    const total = data.length;
    res.json({ success: true, data: data.slice((page - 1) * limit, page * limit), total, page, limit, hasMore: page * limit < total });
  });

  route(app, '/pedidos/get', async (req, res, body) => {
    const row = await findPedido(body.id ?? body.pedido_id ?? req.query.id);
    if (!row) {
      res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      return;
    }
    res.json({ success: true, data: (await pedidosToBackend([row]))[0] });
  });

  route(app, ['/pedidos/save', '/pedidos/save_pedido'], async (req, res, body) => {
    const callerRole = (req.headers['x-user-role'] as string) || body.caller_role || body.userRole || body.user_role;
    if (callerRole === 'motorista') {
      res.status(403).json({ success: false, message: 'Motoristas não possuem permissão para adicionar ou editar pedidos.' });
      return;
    }

    const hasIdentifier = hasValue(body.id) || hasValue(body.pedido_id);
    const existing = await findPedido(hasValue(body.id) ? body.id : body.pedido_id);
    // id informado que não existe (ex.: id temporário do app) não pode criar um pedido novo duplicado
    if (hasIdentifier && !existing) {
      res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      return;
    }
    const data = pedidoFromBackend(body, existing);
    let saved;
    if (existing) {
      saved = await prisma.orders.update({ where: { id: existing.id }, data });
      await logStage(existing.id, existing.stage, saved.stage, body.users_id, 'Atualização do pedido');
    } else {
      if (data.client_id === undefined && body.phone) {
        const customer = await findUserByPhone(body.phone);
        if (customer) data.client_id = customer.id;
      }
      saved = await prisma.orders.create({
        data: {
          ...data,
          date: data.date || todaySaoPaulo(),
          client_name: data.client_name || 'Cliente',
          contact_phone: data.contact_phone ?? ''
        }
      });
      await logStage(saved.id, 'novo', saved.stage, body.users_id, 'Pedido criado');
    }
    res.json({ success: true, data: { id: saved.id }, id: saved.id, message: 'Pedido salvo com sucesso!' });
  });

  route(app, '/pedidos/marcar_coleta_entrega', async (_req, res, body) => {
    const existing = await findPedido(body.pedido_id ?? body.id);
    const etapa = String(body.etapa || '');
    const updated = await applyEtapa(existing, etapa, body.user_id, body.usuario_nome || body.user_nome);
    if (!updated) {
      res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      return;
    }
    res.json({ success: true, data: { pedido_id: updated.id, etapa } });
  });

  route(app, '/pedidos/set_etapa', async (_req, res, body) => {
    const existing = await findPedido(body.pedido_id ?? body.id);
    if (existing) {
      const view = pedidoToBackend(existing);
      const next = (NEXT_ETAPA[view.etapa] || (() => 'finalizado'))(view.tipo_encomenda);
      await applyEtapa(existing, next, body.user_id);
    }
    res.json({ success: true });
  });

  route(app, '/pedidos/finalizar_pedido', async (_req, res, body) => {
    const existing = await findPedido(body.pedido_id ?? body.id);
    if (existing) await applyEtapa(existing, 'finalizado', body.user_id);
    res.json({ success: true });
  });

  route(app, '/pedidos/upload_foto', async (_req, res, body) => {
    const tipo = String(body.tipo || 'coleta').replace(/[^a-z0-9_-]/gi, '');
    const base64Data = body.base64 || body.image || body.foto;
    if (typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
      res.status(400).json({ success: false, message: 'Nenhuma imagem válida foi enviada.' });
      return;
    }
    const photoPath = deps.saveBase64Image(base64Data, `pedidos/${tipo || 'coleta'}`);
    if (!photoPath) {
      res.status(500).json({ success: false, message: 'Não foi possível gravar a foto do pedido.' });
      return;
    }
    res.json({ success: true, data: { path: photoPath } });
  });

  route(app, '/pedidos/append_foto', async (_req, res, body) => {
    const existing = await findPedido(body.pedido_id ?? body.id);
    const foto = body.foto;
    const campo = String(body.campo || 'coleta_foto');
    if (existing && foto) {
      const current = pedidoToBackend(existing)[campo];
      const list: string[] = [];
      try {
        if (typeof current === 'string' && current.trim().startsWith('[')) list.push(...JSON.parse(current));
        else if (current) list.push(String(current));
      } catch {
        // valor antigo inválido: recomeça a lista
      }
      list.push(foto);
      await prisma.orders.update({ where: { id: existing.id }, data: pedidoFromBackend({ [campo]: JSON.stringify(list) }, existing) });
    }
    res.json({ success: true, data: { path: foto } });
  });

  route(app, '/pedidos/registrar_presenca', async (_req, res, body) => {
    const existing = await findPedido(body.pedido_id ?? body.id);
    if (existing && body.campo) {
      const ts = body.timestamp || new Date().toISOString();
      await prisma.orders.update({ where: { id: existing.id }, data: pedidoFromBackend({ [body.campo]: ts }, existing) });
    }
    res.json({ success: true });
  });

  route(app, '/pedidos/ensure_public_token', async (_req, res, body) => {
    const existing = await findPedido(body.pedido_id ?? body.id);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Pedido não encontrado' });
      return;
    }
    const token = existing.public_tracking_token || crypto.randomBytes(24).toString('hex');
    if (!existing.public_tracking_token) {
      await prisma.orders.update({ where: { id: existing.id }, data: { public_tracking_token: token } });
    }
    res.json({ success: true, data: { public_tracking_token: token } });
  });

  route(app, '/pedidos/delete', async (req, res, body) => {
    const id = toInt(cleanPedidoId(body.pedido_id ?? body.id ?? req.query.id));
    if (!id) {
      res.status(400).json({ success: false, message: 'ID do pedido obrigatório' });
      return;
    }
    await prisma.orders.delete({ where: { id } }).catch(() => null);
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // GANHOS DO MOTORISTA (por dia)
  // ------------------------------------------------------------------
  const earningDay = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '').slice(0, 10)) ? String(v).slice(0, 10) : '');

  route(app, '/driver-earnings/list', async (_req, res, body) => {
    const driverKey = String(body.driver_id || '').trim();
    const day = earningDay(body.day);
    if (!driverKey || !day) {
      res.status(400).json({ success: false, message: 'driver_id e day são obrigatórios' });
      return;
    }
    const rows = await prisma.driver_earnings.findMany({ where: { driver_key: driverKey, day }, orderBy: { id: 'asc' } });
    res.json({ success: true, data: rows });
  });

  route(app, '/driver-earnings/save', async (_req, res, body) => {
    const driverKey = String(body.driver_id || '').trim();
    const day = earningDay(body.day);
    const orderKey = String(body.order_key || '').trim();
    if (!driverKey || !day || !orderKey) {
      res.status(400).json({ success: false, message: 'driver_id, day e order_key são obrigatórios' });
      return;
    }
    const price = Math.max(0, Number(body.price) || 0);
    const status = body.status === 'coletado' ? 'coletado' : 'aceito';
    const common = {
      operation: body.operation ? String(body.operation).slice(0, 20) : null,
      label: body.label ? String(body.label).slice(0, 255) : null,
      address: body.address ? String(body.address).slice(0, 255) : null,
      status,
      price
    };
    const row = await prisma.driver_earnings.upsert({
      where: { driver_key_day_order_key: { driver_key: driverKey, day, order_key: orderKey } },
      create: { driver_key: driverKey, day, order_key: orderKey, ...common, accepted_at: new Date(), collected_at: status === 'coletado' ? new Date() : null },
      update: { ...common, ...(status === 'coletado' ? { collected_at: new Date() } : {}) }
    });
    res.json({ success: true, data: row });
  });

  app.get('/api/public/tracking/:token', async (req: Request, res: Response) => {
    const token = String(req.params.token || '').toLowerCase();
    res.setHeader('Cache-Control', 'no-store');
    if (!/^[a-f0-9]{48}$/.test(token)) {
      res.status(404).json({ success: false, message: 'Rastreio não encontrado.' });
      return;
    }
    try {
      const order = await prisma.orders.findUnique({ where: { public_tracking_token: token } });
      if (!order) {
        res.status(404).json({ success: false, message: 'Rastreio não encontrado.' });
        return;
      }
      const view = pedidoToBackend(order);
      const events = [
        { label: 'Pedido recebido', at: view.created_at || view.data },
        { label: 'Coleta realizada', at: view.coleta_saida_at },
        { label: 'Troca realizada', at: view.troca_saida_at },
        { label: 'Entrega realizada', at: view.entrega_saida_at }
      ].filter(e => e.at).map(e => ({ label: e.label, at: String(e.at) }));
      res.json({
        success: true,
        data: {
          code: String(view.orderCode || view.codigo || order.id),
          stage: String(view.etapa).toLowerCase(),
          operation: String(view.tipo_encomenda).toLowerCase(),
          scheduledDate: String(order.date || ''),
          updatedAt: String(view.updated_at || view.created_at || ''),
          originCity: String(view.coleta_cidade || ''),
          destinationCity: String(view.entrega_cidade || ''),
          events
        }
      });
    } catch (error) {
      console.warn('[Public tracking] Falha ao consultar o pedido:', error);
      res.status(503).json({ success: false, message: 'Rastreio temporariamente indisponível.' });
    }
  });

  // ------------------------------------------------------------------
  // LOCAIS
  // ------------------------------------------------------------------
  route(app, '/locais', async (req, res, body) => {
    const q = { ...body, ...req.query } as any;
    const search = String(q.search || '').trim();
    const cidade = String(q.cidade || '').trim();
    const setor = String(q.setor || '').trim();
    const and: any[] = [];
    if (search) {
      and.push({
        OR: ['name', 'address', 'street', 'district', 'city'].map(f => ({ [f]: { contains: search } }))
      });
    }
    if (cidade) and.push({ city: { contains: cidade } });
    if (setor) and.push({ district: { contains: setor } });
    if (q.central_coletas !== undefined && q.central_coletas !== '') {
      and.push({ is_collection_hub: ['true', '1', 1, true].includes(q.central_coletas) });
    }
    const where = and.length ? { AND: and } : {};
    const page = Math.max(1, parseInt(String(q.page), 10) || 1);
    const limit = Math.max(1, parseInt(String(q.limit), 10) || 100);
    const [rows, total] = await Promise.all([
      prisma.locations.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.locations.count({ where })
    ]);
    res.json({ success: true, data: rows.map(localToBackend), total });
  });

  route(app, '/locais/centrais', async (_req, res) => {
    const rows = await prisma.locations.findMany({ where: { is_collection_hub: true } });
    res.json({
      success: true,
      data: rows.map(p => ({ id: p.id, name: p.name, cidade: p.city || 'Goiânia', lat: Number(p.lat), lng: Number(p.lng) }))
    });
  });

  route(app, '/locais/nearby', async (_req, res, body) => {
    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.lng);
    const radiusKm = parseFloat(body.radius_km) || 0.5;
    if (isNaN(lat) || isNaN(lng)) {
      res.json({ success: true, data: null });
      return;
    }
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
    const candidates = await prisma.locations.findMany({
      where: { lat: { gte: lat - dLat, lte: lat + dLat }, lng: { gte: lng - dLng, lte: lng + dLng } }
    });
    let closest: { local: any; dist: number } | null = null;
    for (const p of candidates) {
      const rLat = (p.lat! - lat) * Math.PI / 180;
      const rLng = (p.lng! - lng) * Math.PI / 180;
      const a = Math.sin(rLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(p.lat! * Math.PI / 180) * Math.sin(rLng / 2) ** 2;
      const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist <= radiusKm && (!closest || dist < closest.dist)) closest = { local: p, dist };
    }
    res.json({
      success: true,
      data: closest
        ? { id: closest.local.id, name: closest.local.name, lat: closest.local.lat, lng: closest.local.lng, dist_km: Math.round(closest.dist * 100) / 100 }
        : null
    });
  });

  route(app, '/locais/buscar_local_link', async (req, res, body) => {
    const link = String(body.link || req.query.link || '').trim();
    const local = link ? await prisma.locations.findFirst({ where: { link_maps: link } }) : null;
    if (!local) {
      res.status(404).json({ success: false, message: 'Local não encontrado para este link' });
      return;
    }
    res.json({ success: true, data: localToBackend(local) });
  });

  route(app, '/locais/update', async (_req, res, body) => {
    const id = toInt(body.id);
    const existing = id ? await prisma.locations.findUnique({ where: { id } }) : null;
    if (!existing) {
      res.status(404).json({ success: false, message: 'Local não encontrado' });
      return;
    }
    const updated = await prisma.locations.update({ where: { id: existing.id }, data: localFromBackend(body, existing) });
    res.json({ success: true, data: localToBackend(updated) });
  });

  route(app, '/locais/save', async (_req, res, body) => {
    const id = toInt(body.id);
    const existing = id ? await prisma.locations.findUnique({ where: { id } }) : null;
    const data = localFromBackend(body, existing);
    const saved = existing
      ? await prisma.locations.update({ where: { id: existing.id }, data })
      : await prisma.locations.create({
          data: {
            ...data,
            name: data.name || 'Local Sem Nome',
            lat: data.lat ?? -16.6869,
            lng: data.lng ?? -49.2648,
            city: data.city ?? 'Goiânia'
          }
        });
    res.json({ success: true, id: saved.id, data: localToBackend(saved) });
  });

  route(app, '/locais/delete', async (req, res, body) => {
    const id = toInt(body.id ?? req.query.id);
    if (!id) {
      res.status(400).json({ success: false, message: 'ID do local obrigatório' });
      return;
    }
    await prisma.locations.delete({ where: { id } }).catch(() => null);
    res.json({ success: true });
  });

  route(app, '/locais/:id', async (req, res) => {
    const id = toInt(req.params.id);
    const local = id ? await prisma.locations.findUnique({ where: { id } }) : null;
    if (!local) {
      res.status(404).json({ success: false, message: 'Local não encontrado' });
      return;
    }
    res.json({ success: true, data: localToBackend(local) });
  });

  // ------------------------------------------------------------------
  // CIDADES
  // ------------------------------------------------------------------
  route(app, '/cidades', async (req, res, body) => {
    const search = String(req.query.search || body.search || '').toLowerCase().trim();
    const [cities, counts] = await Promise.all([
      prisma.config_cities.findMany({ orderBy: { city: 'asc' } }),
      prisma.orders.groupBy({ by: ['orig_city'], _count: { _all: true } })
    ]);
    const byCity = new Map(counts.filter(c => c.orig_city).map(c => [c.orig_city!.toLowerCase(), c._count._all]));
    const data = cities
      .filter(c => !search || c.city.toLowerCase().includes(search))
      .map(c => ({ id: c.id, name: c.city, estado: c.state || 'GO', pedidos_count: byCity.get(c.city.toLowerCase()) || 0 }));
    res.json({ success: true, data });
  });

  const cityRecord = (c: any) => ({
    id: String(c.id),
    name: c.city,
    state: c.state || undefined,
    createdAt: c.created_at.getTime(),
    updatedAt: c.updated_at.getTime()
  });

  route(app, '/cities', async (_req, res) => {
    const rows = await prisma.config_cities.findMany({ orderBy: { city: 'asc' } });
    res.json({ success: true, data: rows.map(cityRecord) });
  });

  route(app, '/cities/save', async (_req, res, body) => {
    const name = String(body.name || body.city || '').trim();
    if (!name) {
      res.status(400).json({ success: false, message: 'Nome da cidade obrigatório' });
      return;
    }
    const state = body.state ? String(body.state).trim() : null;
    const id = toInt(body.id);
    const existing = id ? await prisma.config_cities.findUnique({ where: { id } }) : await prisma.config_cities.findUnique({ where: { city: name } });
    const saved = existing
      ? await prisma.config_cities.update({ where: { id: existing.id }, data: { city: name, state } })
      : await prisma.config_cities.create({ data: { city: name, state } });
    res.json({ success: true, data: cityRecord(saved) });
  });

  route(app, '/cities/delete', async (_req, res, body) => {
    const id = toInt(body.id);
    if (id) await prisma.config_cities.delete({ where: { id } }).catch(() => null);
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // CONFIGURAÇÕES GLOBAIS E EMPRESAS (TRANSPORTADORAS)
  // ------------------------------------------------------------------
  route(app, '/settings', async (_req, res) => {
    const row = await prisma.app_settings.findUnique({ where: { key: 'global_config' } });
    res.json({ success: true, data: row ? parseExtra(row.value) : null });
  });

  route(app, '/settings/save', async (_req, res, body) => {
    const value = JSON.stringify(body.settings ?? body);
    await prisma.app_settings.upsert({
      where: { key: 'global_config' },
      create: { key: 'global_config', value },
      update: { value }
    });
    res.json({ success: true, data: JSON.parse(value) });
  });

  route(app, '/companies', async (_req, res) => {
    const rows = await prisma.transportadoras.findMany({ orderBy: { updated_at: 'desc' } });
    res.json({ success: true, data: rows.map(r => ({ ...parseExtra(r.data), id: r.id })) });
  });

  route(app, '/companies/save', async (_req, res, body) => {
    const company = body.company ?? body;
    const id = String(company.id || `comp-${Date.now()}`);
    const data = JSON.stringify({ ...company, id });
    await prisma.transportadoras.upsert({ where: { id }, create: { id, data }, update: { data } });
    res.json({ success: true, data: { ...company, id } });
  });

  route(app, '/companies/delete', async (_req, res, body) => {
    const id = String(body.id || '');
    if (id) await prisma.transportadoras.delete({ where: { id } }).catch(() => null);
    res.json({ success: true });
  });

  // ------------------------------------------------------------------
  // TABELA DE PREÇOS
  // ------------------------------------------------------------------
  const parseJson = (raw: string | null | undefined, fallback: any) => {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  route(app, '/tabela-precos/entre-cidades', async (_req, res) => {
    const [company, cities] = await Promise.all([prisma.company.findFirst(), prisma.config_cities.findMany({ orderBy: { city: 'asc' } })]);
    res.json({
      success: true,
      data: {
        cidades: cities.map(c => ({ id: c.id, name: c.city, estado: c.state || 'GO' })),
        lista: parseJson(company?.orders_city_price_rules, [])
      }
    });
  });

  route(app, '/tabela-precos/coleta', async (_req, res) => {
    const [company, hubs] = await Promise.all([prisma.company.findFirst(), prisma.locations.findMany({ where: { is_collection_hub: true } })]);
    const config = parseJson(company?.orders_pickup_delivery_prices, { coleta: '0', entrega: '0' });
    res.json({ success: true, data: hubs.map(h => ({ local_id: h.id, nome: h.name, cidade: h.city || '', config })) });
  });

  // ------------------------------------------------------------------
  // MOTORISTAS
  // ------------------------------------------------------------------
  const DRIVER_LEVELS = ['motorista', 'driver', 'motoboy'];

  const driverView = (user: any, driver: any) => {
    const extra = parseExtra(user.extra);
    return {
      id: user.id,
      nome: user.full_name || user.name,
      telefone: user.phone,
      cpf: user.cpf || driver?.cpf || undefined,
      cnh: driver?.cnh || extra.cnh || undefined,
      email: driver?.email || extra.email || undefined,
      endereco: driver?.address || extra.address || extra.endereco || undefined,
      cidade: user.city || driver?.city || undefined,
      estado: driver?.state || undefined,
      tipo_veiculo: extra.tipo_veiculo || (driver?.vehicle_type === 'pick_up' ? 'utilitario' : driver?.vehicle_type) || 'moto',
      placa: driver?.vehicle_plate || extra.placa || undefined,
      modelo_veiculo: driver?.vehicle_model || extra.modelo_veiculo || undefined,
      status: extra.status || (driver && !driver.is_active ? 'inativo' : 'ativo'),
      foto: user.photo || undefined,
      avatarUrl: user.photo || undefined,
      created_at: iso(user.created_at),
      updated_at: iso(user.updated_at)
    };
  };

  route(app, '/motoristas/list', async (_req, res, body) => {
    const users = await prisma.users.findMany({ where: { access_level: { in: DRIVER_LEVELS } } });
    const cpfs = users.map(u => u.cpf).filter(Boolean) as string[];
    const drivers = cpfs.length ? await prisma.drivers.findMany({ where: { cpf: { in: cpfs } } }) : [];
    const byCpf = new Map(drivers.map(d => [d.cpf, d]));
    let list = users.map(u => driverView(u, u.cpf ? byCpf.get(u.cpf) : null));
    if (body.status) list = list.filter(m => m.status === body.status);
    if (body.tipo_veiculo) list = list.filter(m => m.tipo_veiculo === body.tipo_veiculo);
    if (body.busca) {
      const q = String(body.busca).toLowerCase();
      list = list.filter(m => [m.nome, m.telefone, m.cpf, m.placa].some(v => String(v || '').toLowerCase().includes(q)));
    }
    res.json({ success: true, data: list });
  });

  route(app, '/motoristas/save', async (_req, res, body) => {
    const phone = digitsOf(body.telefone ?? body.phone);
    const existing = await findUserFromBody({ id: body.id, phone });
    const extra = parseExtra(existing?.extra);
    for (const key of ['tipo_veiculo', 'status', 'placa', 'modelo_veiculo', 'cnh', 'email']) {
      if (body[key] !== undefined) extra[key] = body[key];
    }
    const base = {
      name: String(body.nome || body.name || existing?.name || 'Motorista'),
      cpf: body.cpf ? String(body.cpf) : existing?.cpf ?? null,
      city: body.cidade ?? existing?.city ?? null,
      photo: body.foto ?? body.avatarUrl ?? existing?.photo ?? null,
      access_level: 'motorista',
      extra: JSON.stringify(extra)
    };
    const user = existing
      ? await prisma.users.update({ where: { id: existing.id }, data: base })
      : await prisma.users.create({ data: { ...base, phone: phone || `sem-${Date.now()}` } });

    if (body.cpf && body.cnh) {
      const common = {
        name: base.name,
        phone: user.phone || phone || '',
        city: body.cidade || null,
        address: body.endereco || null,
        vehicle_type: body.tipo_veiculo === 'utilitario' ? 'pick_up' : body.tipo_veiculo || null,
        vehicle_plate: body.placa || null,
        vehicle_model: body.modelo_veiculo || null,
        is_active: body.status ? body.status === 'ativo' : true
      };
      await prisma.drivers.upsert({
        where: { cpf: String(body.cpf) },
        create: { ...common, cpf: String(body.cpf), cnh: String(body.cnh) },
        update: { ...common, cnh: String(body.cnh) }
      });
    }
    res.json({ success: true, data: { id: user.id }, id: user.id });
  });

  // ------------------------------------------------------------------
  // MARCADORES DE PEDIDOS NO MAPA
  // ------------------------------------------------------------------
  route(app, '/tracking/order_markers', async (_req, res, body) => {
    const date = String(body.date || todaySaoPaulo()).slice(0, 10);
    const rows = await prisma.orders.findMany({ where: { date } });
    const ids = pedidoLocationIds(rows);
    const locations = new Map<number, any>();
    if (ids.length) (await prisma.locations.findMany({ where: { id: { in: ids } } })).forEach(l => locations.set(l.id, l));

    const markers: any[] = [];
    for (const row of rows) {
      const view = pedidoToBackend(row);
      const isExchange = view.tipo_encomenda === 'troca';
      const base = { pedido_id: row.id, etapa: view.etapa, cliente: row.client_name, tipo_encomenda: view.tipo_encomenda, is_exchange: isExchange };
      const push = (tipo: string, locationId: number | null) => {
        const loc = locationId ? locations.get(locationId) : null;
        if (!loc || loc.lat == null || loc.lng == null) return;
        markers.push({ ...base, tipo, has_coleta: !!row.pickup_location_id, local_id: loc.id, local_name: loc.name, lat: loc.lat, lng: loc.lng });
      };
      if (view.tipo_encomenda !== 'entrega') push('coleta', row.pickup_location_id);
      if (isExchange) {
        push('troca', row.delivery_location_id);
        push('entrega', row.origin_location_id || row.pickup_location_id);
      } else {
        push('entrega', row.delivery_location_id);
      }
    }
    res.json({ success: true, data: markers });
  });
}
