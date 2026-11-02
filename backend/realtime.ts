import type { Express, Request, Response } from 'express';
import { WebSocket, type WebSocketServer } from 'ws';
import { prisma } from './db';
import { parseRawJsonBody } from './routes';
import { toInt } from './mappers';
import { notifyOrderProgress, notifyUser } from './notifications';
import { assignmentStore, resolveCaller, isPrivileged, isAssignmentMine, isConfirmedDriverClaim, assignmentsVisibleTo } from './access';

interface LiveDriverData {
  id: string;
  name: string;
  nickname?: string;
  phone?: string;
  avatarUrl?: string;
  vehicleType: 'moto' | 'carro' | 'utilitario';
  vehicleModel?: string;
  vehiclePlate?: string;
  color: string;
  coordinates: { lat: number; lng: number; heading?: number | null; speed?: number | null; timestamp?: number };
  heading?: number;
  speedKmH?: number;
  batteryLevel?: number;
  status: 'em_rota' | 'disponivel' | 'em_pausa' | 'offline';
  isOnline: boolean;
  lastSeenTimestamp: number;
  lastUpdatedStr: string;
}

interface OrderAssignmentData {
  orderId: string;
  driverId: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  assignedAt: number;
  enRoute?: boolean;
  acceptedByDriver?: boolean;
}

// Motoristas sem atualização há mais de 30 minutos somem do mapa
const MAX_OFFLINE_MS = 30 * 60 * 1000;
const TRACKING_HISTORY_INTERVAL_MS = 30 * 1000;

export async function registerRealtime(app: Express, wss: WebSocketServer) {
  const activeDrivers = new Map<string, LiveDriverData>();
  const activeAssignments = assignmentStore as unknown as Map<string, OrderAssignmentData>;
  const lastHistoryWrite = new Map<string, number>();

  try {
    const stored = await prisma.assignments.findMany();
    for (const row of stored) {
      try {
        activeAssignments.set(row.order_key, JSON.parse(row.data));
      } catch {
        // registro corrompido é ignorado
      }
    }
    console.log(`[Realtime Assignments] ${activeAssignments.size} atribuições carregadas do banco.`);
  } catch (err: any) {
    console.warn(`[Realtime Assignments] Banco de dados não conectado (${err?.message || 'offline'}). Atribuições em memória ativas.`);
  }

  const persistAssignment = (key: string, data: OrderAssignmentData) =>
    prisma.assignments
      .upsert({
        where: { order_key: key },
        create: { order_key: key, data: JSON.stringify(data), assigned_at: data.assignedAt },
        update: { data: JSON.stringify(data), assigned_at: data.assignedAt }
      })
      .catch(err => console.warn('[Realtime Assignments] Erro ao salvar:', err.message));

  const removeAssignment = (key: string) =>
    prisma.assignments.delete({ where: { order_key: key } }).catch(() => null);

  function broadcast(data: any, except?: WebSocket) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client !== except && client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  const validDrivers = () => {
    const now = Date.now();
    return Array.from(activeDrivers.values()).filter(d => now - d.lastSeenTimestamp <= MAX_OFFLINE_MS && d.isOnline !== false);
  };

  function upsertDriver(d: any): LiveDriverData {
    const now = Date.now();
    const driver: LiveDriverData = {
      ...d,
      lastSeenTimestamp: now,
      lastUpdatedStr: new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      status: d.isOnline === false ? 'offline' : d.status || 'em_rota'
    };
    activeDrivers.set(String(d.id), driver);
    broadcast({ type: d.isOnline === false ? 'driver:offline' : 'driver:update', driver });
    return driver;
  }

  // Atribuições nunca vão por WebSocket (o canal é aberto a qualquer conexão); só pela API autenticada
  function setAssignment(orderId: string, data: Partial<OrderAssignmentData>) {
    const assignment = { ...data, orderId, assignedAt: Date.now() } as OrderAssignmentData;
    activeAssignments.set(orderId, assignment);
    void persistAssignment(orderId, assignment);
    return assignment;
  }

  function clearAssignment(orderId: string) {
    activeAssignments.delete(orderId);
    void removeAssignment(orderId);
  }

  setInterval(() => {
    const now = Date.now();
    activeDrivers.forEach((driver, id) => {
      if (now - (driver.lastSeenTimestamp || 0) > MAX_OFFLINE_MS) {
        activeDrivers.delete(id);
        broadcast({ type: 'driver:remove', driverId: id });
      }
    });
  }, 30 * 1000);

  wss.on('connection', (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: 'drivers:init', drivers: validDrivers() }));

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'driver:update_location' && msg.driver) upsertDriver(msg.driver);
      } catch {
        // payload inválido é ignorado
      }
    });
    ws.on('error', () => {});
  });

  const noCache = (res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', 'application/json');
  };

  app.get('/api/tracking/live-drivers', (_req: Request, res: Response) => {
    noCache(res);
    res.json({ success: true, data: validDrivers() });
  });

  app.post('/api/tracking/update-driver', (req: Request, res: Response) => {
    const body = parseRawJsonBody(req);
    if (!body?.id) {
      res.status(400).json({ success: false, message: 'Dados inválidos' });
      return;
    }
    res.json({ success: true, data: upsertDriver(body) });
  });

  app.get('/api/realtime/assignments', async (req: Request, res: Response) => {
    noCache(res);
    const caller = await resolveCaller(req, parseRawJsonBody(req));
    res.json({ success: true, data: assignmentsVisibleTo(caller) });
  });

  const opOfKey = (key: string) => key.match(/coleta|entrega|troca|retorno/i)?.[0]?.toLowerCase() || '';
  const numOfKey = (key: string) => key.match(/\d+/)?.[0] || '';

  app.post('/api/realtime/assign-driver', async (req: Request, res: Response) => {
    const body = parseRawJsonBody(req);
    const { orderId, driverId, driverName, driverPhone, vehicleType, claim } = body;
    if (!orderId || !driverId) {
      res.status(400).json({ success: false, message: 'orderId e driverId são obrigatórios' });
      return;
    }
    const caller = await resolveCaller(req, body);
    if (!caller) {
      res.status(401).json({ success: false, message: 'Faça login para atribuir pedidos.' });
      return;
    }
    // Motorista só pode aceitar o pedido para si mesmo; quem direciona para outros é admin/atendente
    if (!isPrivileged(caller) && !(caller.role === 'motorista' && isAssignmentMine({ driverId, driverPhone }, caller))) {
      res.status(403).json({ success: false, message: 'Sem permissão para atribuir este pedido.' });
      return;
    }
    // Aceite de pedido: se outro motorista já aceitou (em qualquer chave do mesmo pedido/operação), recusa
    if (claim || !isPrivileged(caller)) {
      const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '') || String(v ?? '');
      const num = numOfKey(String(orderId));
      const op = opOfKey(String(orderId));
      for (const [key, current] of activeAssignments) {
        if (!current?.driverId || digits(current.driverId) === digits(driverId)) continue;
        const sameOrder = key === String(orderId) || (num && numOfKey(key) === num && (!op || !opOfKey(key) || opOfKey(key) === op));
        if (sameOrder) {
          res.status(409).json({ success: false, message: 'Este pedido já foi aceito por outro motorista.' });
          return;
        }
      }
    }
    const assignment = setAssignment(String(orderId), {
      driverId: String(driverId),
      driverName: driverName || undefined,
      driverPhone: driverPhone || undefined,
      vehicleType: vehicleType || undefined,
      acceptedByDriver: isConfirmedDriverClaim(caller, claim)
    });
    const opLabel = opOfKey(String(orderId));
    const who = driverName || `Motorista ${driverId}`;
    if (!isPrivileged(caller)) void notifyOrderProgress(
      numOfKey(String(orderId)),
      {
        type: 'aceito',
        title: `Pedido #${numOfKey(String(orderId))} aceito`,
        message: `${who} aceitou ${opLabel ? `a ${opLabel} do ` : 'o '}pedido #${numOfKey(String(orderId))}.`
      },
      caller.id
    );
    // Admin/atendente direcionando para um motorista: avisa o motorista escolhido
    const targetId = toInt(driverId);
    if (isPrivileged(caller) && targetId && targetId !== caller.id) {
      void notifyUser(targetId, {
        type: 'direcionado',
        title: 'Pedido direcionado a você',
        message: `O pedido #${numOfKey(String(orderId))}${opLabel ? ` (${opLabel})` : ''} foi direcionado a você.`,
        orderId: toInt(numOfKey(String(orderId)))
      });
    }
    res.json({ success: true, data: assignment });
  });

  app.post('/api/realtime/en-route', async (req: Request, res: Response) => {
    const body = parseRawJsonBody(req);
    const { orderIds, enRoute } = body;
    if (!Array.isArray(orderIds)) {
      res.status(400).json({ success: false, message: 'orderIds é obrigatório' });
      return;
    }
    const caller = await resolveCaller(req, body);
    if (!caller) {
      res.status(401).json({ success: false, message: 'Faça login para continuar.' });
      return;
    }
    for (const id of orderIds) {
      const current = activeAssignments.get(String(id));
      if (!current) continue;
      if (!isPrivileged(caller) && !isAssignmentMine(current, caller)) continue;
      const assignment = { ...current, enRoute: Boolean(enRoute) };
      activeAssignments.set(String(id), assignment);
      void persistAssignment(String(id), assignment);
    }
    res.json({ success: true });
  });

  app.post('/api/realtime/unassign-driver', async (req: Request, res: Response) => {
    const body = parseRawJsonBody(req);
    const { orderId } = body;
    if (!orderId) {
      res.status(400).json({ success: false, message: 'orderId é obrigatório' });
      return;
    }
    const caller = await resolveCaller(req, body);
    if (!caller) {
      res.status(401).json({ success: false, message: 'Faça login para continuar.' });
      return;
    }
    const current = activeAssignments.get(String(orderId));
    if (current && !isPrivileged(caller) && !isAssignmentMine(current, caller)) {
      res.status(403).json({ success: false, message: 'Este pedido pertence a outro motorista.' });
      return;
    }
    clearAssignment(String(orderId));
    res.json({ success: true });
  });

  // Endpoints de rastreamento no formato legado (/tracking/*), usados pelo app dos motoristas
  const legacy = (path: string, handler: (body: any, res: Response) => Promise<void> | void) => {
    app.all([path, `/api${path}`], async (req: Request, res: Response) => {
      try {
        await handler(parseRawJsonBody(req), res);
      } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
      }
    });
  };

  const driverFromBody = (body: any, coords?: { lat: number; lng: number }): any => {
    const id = String(body.user_id);
    const previous = activeDrivers.get(id);
    return {
      color: '#2563eb',
      vehicleType: 'moto',
      ...previous,
      id,
      name: body.user_nome || previous?.name || `Motorista ${id}`,
      avatarUrl: body.user_foto || previous?.avatarUrl,
      isOnline: true,
      status: previous?.status && previous.status !== 'offline' ? previous.status : 'disponivel',
      coordinates: coords
        ? { lat: coords.lat, lng: coords.lng, heading: body.heading ?? null, speed: body.speed ?? null, timestamp: Date.now() }
        : previous?.coordinates
    };
  };

  legacy('/tracking/live_locations', (_body, res) => {
    const data = validDrivers()
      .filter(d => d.coordinates)
      .map(d => ({
        user_id: d.id,
        user_nome: d.name,
        user_foto: d.avatarUrl,
        lat: d.coordinates.lat,
        lng: d.coordinates.lng,
        speed: d.coordinates.speed ?? null,
        heading: d.coordinates.heading ?? null,
        updated_at: new Date(d.lastSeenTimestamp).toISOString()
      }));
    res.json({ success: true, data });
  });

  legacy('/tracking/update_location', async (body, res) => {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!body.user_id || isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ success: false, message: 'user_id, lat e lng são obrigatórios' });
      return;
    }
    upsertDriver(driverFromBody(body, { lat, lng }));

    const userId = toInt(body.user_id);
    const now = Date.now();
    if (userId && now - (lastHistoryWrite.get(String(userId)) || 0) >= TRACKING_HISTORY_INTERVAL_MS) {
      lastHistoryWrite.set(String(userId), now);
      await prisma.driver_tracking.create({ data: { user_id: userId, lat, lng, timestamp: now } }).catch(() => null);
    }
    res.json({ success: true });
  });

  legacy('/tracking/heartbeat', (body, res) => {
    if (!body.user_id) {
      res.status(400).json({ success: false, message: 'user_id é obrigatório' });
      return;
    }
    const driver = driverFromBody(body);
    if (driver.coordinates) upsertDriver(driver);
    res.json({ success: true });
  });
}
