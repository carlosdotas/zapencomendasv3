import type { Express, Request, Response } from 'express';
import { WebSocket, type WebSocketServer } from 'ws';
import { prisma } from './db';
import { parseRawJsonBody } from './routes';
import { parseExtra, pedidoToBackend, toInt } from './mappers';
import { canAssignCollectedOrder, collectionOwnership } from '../src/utils/collectionOwnership';
import { notifyOrderProgress, notifyUser } from './notifications';
import { assignmentStore, resolveCaller, isPrivileged, isAssignmentMine, isConfirmedDriverClaim, assignmentsVisibleTo } from './access';
import { getDriverPermanentColor } from '../src/utils/driverColorUtils';
import { distanceInKm, nearestAvailableDriver } from './urgentDispatch';

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

interface UrgentOfferState {
  orderKey: string;
  orderId: string;
  place: Record<string, unknown>;
  attemptedDriverIds: Set<string>;
  currentDriverId?: string;
  currentDriverKey?: string;
  expiresAt?: number;
  timeout?: ReturnType<typeof setTimeout>;
}

// Motoristas sem atualização há mais de 30 minutos somem do mapa
const MAX_OFFLINE_MS = 30 * 60 * 1000;
const TRACKING_HISTORY_INTERVAL_MS = 30 * 1000;
const URGENT_OFFER_DURATION_MS = 30 * 1000;

export async function registerRealtime(
  app: Express,
  wss: WebSocketServer,
  deps?: { notifyOrdersChanged?: () => void }
) {
  const activeDrivers = new Map<string, LiveDriverData>();
  const activeAssignments = assignmentStore as unknown as Map<string, OrderAssignmentData>;
  const lastHistoryWrite = new Map<string, number>();
  const authenticatedSockets = new Map<WebSocket, { id: number; role: string; phone: string }>();
  const socketsByUserId = new Map<number, Set<WebSocket>>();
  const urgentOffers = new Map<string, UrgentOfferState>();
  let dispatchInProgress = false;

  try {
    const stored = await Promise.race([
      prisma.assignments.findMany(),
      new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('DB offline / timeout')), 500))
    ]);
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

  function sendToUser(userId: number, data: unknown) {
    const payload = JSON.stringify(data);
    socketsByUserId.get(userId)?.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  function resendUrgentOffers(userId: number) {
    for (const state of urgentOffers.values()) {
      if (state.currentDriverId !== String(userId) || !state.expiresAt || state.expiresAt <= Date.now()) continue;
      sendToUser(userId, {
        type: 'urgent:offer',
        offerId: state.orderKey,
        expiresAt: state.expiresAt,
        place: state.place
      });
    }
  }

  function cancelUrgentOffer(orderId: string) {
    const assignedOrderId = numOfKey(orderId);
    const assignedOperation = opOfKey(orderId);
    for (const [key, state] of urgentOffers) {
      if (
        state.orderId !== orderId &&
        state.orderKey !== orderId &&
        (state.orderId !== assignedOrderId || (assignedOperation && assignedOperation !== 'coleta'))
      ) continue;
      if (state.timeout) clearTimeout(state.timeout);
      if (state.currentDriverId) {
        const driverId = Number(state.currentDriverId);
        if (Number.isFinite(driverId)) sendToUser(driverId, { type: 'urgent:cancel', offerId: state.orderKey });
      }
      urgentOffers.delete(key);
    }
  }

  function sendNextUrgentOffer(state: UrgentOfferState, radiusKm: number) {
    if (state.timeout) clearTimeout(state.timeout);
    const pickup = state.place.coordinates as { lat: number; lng: number };
    const userByDriverId = new Map<string, number>();
    const nearby = validDrivers()
      .filter(driver =>
        driver.status !== 'em_pausa' &&
        driver.status !== 'offline' &&
        Number.isFinite(driver.coordinates?.lat) &&
        Number.isFinite(driver.coordinates?.lng)
      )
      .map(driver => {
        const recipient = Array.from(authenticatedSockets.entries()).find(([socket, caller]) =>
          socket.readyState === WebSocket.OPEN &&
          caller.role === 'motorista' &&
          isAssignmentMine({ driverId: driver.id, driverPhone: driver.phone }, caller)
        )?.[1].id;
        if (recipient !== undefined) userByDriverId.set(String(driver.id), recipient);
        return {
          id: String(driver.id),
          distanceKm: distanceInKm(pickup, driver.coordinates)
        };
      })
      .filter(driver => userByDriverId.has(driver.id));
    const next = nearestAvailableDriver(nearby, state.attemptedDriverIds, radiusKm);
    if (!next) {
      state.currentDriverId = undefined;
      state.currentDriverKey = undefined;
      state.expiresAt = undefined;
      return;
    }

    state.currentDriverId = String(userByDriverId.get(next.id));
    state.currentDriverKey = next.id;
    state.expiresAt = Date.now() + URGENT_OFFER_DURATION_MS;
    const recipientId = userByDriverId.get(next.id);
    if (recipientId === undefined) return;
    sendToUser(recipientId, {
      type: 'urgent:offer',
      offerId: state.orderKey,
      expiresAt: state.expiresAt,
      distanceKm: next.distanceKm,
      place: state.place
    });
    state.timeout = setTimeout(() => {
      if (urgentOffers.get(state.orderKey) !== state) return;
      sendToUser(recipientId, { type: 'urgent:cancel', offerId: state.orderKey });
      state.attemptedDriverIds.add(next.id);
      state.attemptedDriverIds.add(String(recipientId));
      sendNextUrgentOffer(state, radiusKm);
    }, URGENT_OFFER_DURATION_MS);
  }

  async function dispatchUrgentOrders() {
    if (dispatchInProgress) return;
    if (
      urgentOffers.size === 0 &&
      !Array.from(authenticatedSockets.values()).some(caller => caller.role === 'motorista')
    ) return;
    dispatchInProgress = true;
    try {
    const settingsRow = await prisma.app_settings.findUnique({ where: { key: 'global_config' } });
    const settings = settingsRow ? parseExtra(settingsRow.value) : {};
    const configuredRadius = Number((settings.operation as any)?.urgentNotificationRadiusKm);
    const radiusKm = Number.isFinite(configuredRadius) ? Math.min(50, Math.max(1, configuredRadius)) : 5;
    const rows = await prisma.orders.findMany({
      where: { stage: { in: ['novo', 'pendente'] } },
      orderBy: { created_at: 'asc' },
      take: 500
    });
    const pendingOrderIds = new Set(rows.map(row => String(row.id)));
    for (const state of urgentOffers.values()) {
      if (!pendingOrderIds.has(state.orderId)) cancelUrgentOffer(state.orderKey);
    }
    const locationIds = Array.from(new Set(rows.flatMap(row => [row.pickup_location_id, row.origin_location_id].filter((id): id is number => Boolean(id)))));
    const locations = new Map<number, any>();
    if (locationIds.length) {
      const locationRows = await prisma.locations.findMany({ where: { id: { in: locationIds } } });
      locationRows.forEach(location => locations.set(location.id, location));
    }

    for (const row of rows) {
      const order = pedidoToBackend(row, locations);
      const orderId = String(row.id);
      const orderKey = `${orderId}-coleta`;
      const hasPickup = Number.isFinite(Number(order.coleta_lat)) &&
        Number.isFinite(Number(order.coleta_lng)) &&
        (Number(order.coleta_lat) !== 0 || Number(order.coleta_lng) !== 0);
      let legacyDrivers: unknown[] = [];
      if (Array.isArray(order.coleta_motoristas)) legacyDrivers = order.coleta_motoristas;
      else if (typeof order.coleta_motoristas === 'string' && order.coleta_motoristas.trim()) {
        try {
          const parsed = JSON.parse(order.coleta_motoristas);
          legacyDrivers = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          legacyDrivers = [order.coleta_motoristas];
        }
      }
      const hasAssignedId = (value: unknown) => {
        const normalized = String(value ?? '').trim();
        return normalized !== '' && normalized !== '0';
      };
      const assigned = hasAssignedId(order.pickupAssignedDriverId) ||
        hasAssignedId(order.coleta_user_id) ||
        legacyDrivers.some(hasAssignedId);
      const visibility = order.pickupVisibility || order.orderVisibility;
      const alreadyClaimed = Array.from(activeAssignments.keys()).some(key =>
        numOfKey(key) === orderId && (!opOfKey(key) || opOfKey(key) === 'coleta')
      );
      if (!hasPickup ||
        assigned ||
        visibility === 'privado' ||
        alreadyClaimed
      ) {
        cancelUrgentOffer(orderKey);
        continue;
      }

      const activeOffer = urgentOffers.get(orderKey);
      if (activeOffer) {
        if (!activeOffer.currentDriverId) sendNextUrgentOffer(activeOffer, radiusKm);
        continue;
      }

      const state: UrgentOfferState = {
        orderKey,
        orderId,
        attemptedDriverIds: new Set(),
        place: {
          id: `pedido-${orderId}-coleta`,
          name: String(order.coleta_nome || order.coleta_local || `Coleta do pedido #${orderId}`),
          address: String(order.coleta_endereco || order.coleta_nome || order.coleta_local || ''),
          coordinates: { lat: Number(order.coleta_lat), lng: Number(order.coleta_lng) },
          category: 'Coleta urgente',
          orderId,
          orderCode: String(order.codigo || orderId),
          operationType: 'coleta',
          pickupName: String(order.coleta_nome || ''),
          pickupAddress: String(order.coleta_endereco || order.coleta_nome || order.coleta_local || ''),
          pickupNotes: String(order.coleta_obs || ''),
          pickupContact: String(order.coleta_contato || order.coleta_responsavel || ''),
          pickupPhone: String(order.coleta_phone || order.coleta_responsavel_phone || ''),
          vehicleType: String(order.tipo_veiculo || ''),
          description: String(order.detalhes || order.notes || ''),
          observations: String(order.detalhes || order.notes || ''),
          orderDateBadge: String(order.data || ''),
          customerName: String(order.cliente_nome || order.client_name || '')
        }
      };
      urgentOffers.set(orderKey, state);
      sendNextUrgentOffer(state, radiusKm);
    }
    } finally {
      dispatchInProgress = false;
    }
  }

  const validDrivers = () => {
    const now = Date.now();
    return Array.from(activeDrivers.values()).filter(d => now - d.lastSeenTimestamp <= MAX_OFFLINE_MS && d.isOnline !== false);
  };

  function upsertDriver(d: any): LiveDriverData {
    const now = Date.now();
    const id = String(d.id);
    const permanentColor = getDriverPermanentColor(id || d.phone || d.name);
    const driver: LiveDriverData = {
      ...d,
      id,
      color: d.color && d.color !== '#FF5E00' && d.color !== '#2563eb' ? d.color : permanentColor,
      lastSeenTimestamp: now,
      lastUpdatedStr: new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      status: d.isOnline === false ? 'offline' : d.status || 'em_rota'
    };
    activeDrivers.set(id, driver);
    broadcast({ type: d.isOnline === false ? 'driver:offline' : 'driver:update', driver });
    return driver;
  }

  // Atribuições completas nunca são transmitidas em broadcast; alterações passam pela API autenticada.
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
    const authTimeout = setTimeout(() => ws.close(4401, 'Autenticação necessária'), 5000);

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        const caller = authenticatedSockets.get(ws);
        if (!caller && msg.type === 'auth' && typeof msg.token === 'string') {
          void prisma.user_sessions.findUnique({
            where: { token: msg.token },
            include: { user: true }
          }).then(session => {
            if (!session?.is_logged || !session.user) {
              ws.close(4401, 'Sessão inválida');
              return;
            }
            clearTimeout(authTimeout);
            const user = {
              id: session.user.id,
              role: String(session.user.access_level || '').toLowerCase(),
              phone: String(session.user.phone || '').replace(/\D/g, '')
            };
            authenticatedSockets.set(ws, user);
            if (!socketsByUserId.has(user.id)) socketsByUserId.set(user.id, new Set());
            socketsByUserId.get(user.id)!.add(ws);
            ws.send(JSON.stringify({ type: 'drivers:init', drivers: validDrivers() }));
            resendUrgentOffers(user.id);
            void dispatchUrgentOrders().catch(err => console.warn('[Urgent Dispatch] Falha ao verificar coletas:', err?.message || err));
          }).catch(() => ws.close(4401, 'Falha ao validar sessão'));
          return;
        }
        if (!caller) return;
        if (msg.type === 'driver:update_location' && msg.driver) {
          const driverId = String(msg.driver.id || '');
          const driverPhone = String(msg.driver.phone || '');
          if (caller.role !== 'motorista' || !isAssignmentMine({ driverId, driverPhone }, caller)) return;
          upsertDriver(msg.driver);
          void dispatchUrgentOrders().catch(err => console.warn('[Urgent Dispatch] Falha ao verificar coletas:', err?.message || err));
        }
      } catch {
        // payload inválido é ignorado
      }
    });
    ws.on('close', () => {
      clearTimeout(authTimeout);
      const caller = authenticatedSockets.get(ws);
      if (!caller) return;
      authenticatedSockets.delete(ws);
      const sockets = socketsByUserId.get(caller.id);
      sockets?.delete(ws);
      if (!sockets?.size) socketsByUserId.delete(caller.id);
    });
    ws.on('error', () => {});
  });

  setInterval(() => {
    void dispatchUrgentOrders().catch(err => console.warn('[Urgent Dispatch] Falha ao verificar coletas:', err?.message || err));
  }, 10 * 1000);

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
    const driver = upsertDriver(body);
    void dispatchUrgentOrders().catch(err => console.warn('[Urgent Dispatch] Falha ao verificar coletas:', err?.message || err));
    res.json({ success: true, data: driver });
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
    const numericOrderId = toInt(numOfKey(String(orderId)));
    if (numericOrderId) {
      const order = await prisma.orders.findUnique({ where: { id: numericOrderId } });
      if (order) {
        const owner = collectionOwnership(pedidoToBackend(order));
        if (!canAssignCollectedOrder(owner, String(driverId), Boolean(claim))) {
          res.status(403).json({ success: false, message: 'Após a coleta, o pedido fica reservado a quem coletou.' });
          return;
        }
      }
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
    cancelUrgentOffer(String(orderId));
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

      app.post('/api/realtime/urgent-offer/respond', async (req: Request, res: Response) => {
        const body = parseRawJsonBody(req);
        const caller = await resolveCaller(req, body);
        if (!caller || caller.role !== 'motorista') {
          res.status(caller ? 403 : 401).json({ success: false, message: 'Apenas motoristas autenticados podem responder ao convite.' });
          return;
        }

        const state = urgentOffers.get(String(body.offerId || ''));
        if (!state || state.currentDriverId !== String(caller.id)) {
          res.status(404).json({ success: false, message: 'Este convite não está mais ativo para você.' });
          return;
        }
        if (body.accepted === true) {
          res.json({ success: true });
          return;
        }

        if (state.timeout) clearTimeout(state.timeout);
        sendToUser(caller.id, { type: 'urgent:cancel', offerId: state.orderKey });
        state.attemptedDriverIds.add(String(caller.id));
        if (state.currentDriverKey) state.attemptedDriverIds.add(state.currentDriverKey);
        state.currentDriverId = undefined;
        state.currentDriverKey = undefined;
        state.expiresAt = undefined;
        const settingsRow = await prisma.app_settings.findUnique({ where: { key: 'global_config' } });
        const settings = settingsRow ? parseExtra(settingsRow.value) : {};
        const configuredRadius = Number((settings.operation as any)?.urgentNotificationRadiusKm);
        const radiusKm = Number.isFinite(configuredRadius) ? Math.min(50, Math.max(1, configuredRadius)) : 5;
        sendNextUrgentOffer(state, radiusKm);
        res.json({ success: true });
      });
    }

    if (numericOrderId) {
      try {
        const orderRow = await prisma.orders.findUnique({ where: { id: numericOrderId } });
        if (orderRow) {
          const extra = parseExtra(orderRow.extra);
          const op = opOfKey(String(orderId));
          const numDriverId = toInt(driverId);
          extra.assignedDriverId = String(driverId);
          if (driverName) extra.assignedDriverName = String(driverName);
          if (driverPhone) extra.assignedDriverPhone = String(driverPhone);
          if (claim) extra.acceptedByDriver = true;
          extra.orderVisibility = 'privado';

          const updateData: any = {};
          if (op === 'coleta') {
            if (numDriverId) {
              updateData.collector_id = numDriverId;
              updateData.orig_drivers = JSON.stringify([numDriverId]);
            }
            extra.pickupAssignedDriverId = String(driverId);
            if (driverName) extra.pickupAssignedDriverName = String(driverName);
            if (driverPhone) extra.pickupAssignedDriverPhone = String(driverPhone);
            extra.pickupVisibility = 'privado';
          } else if (op === 'entrega') {
            if (numDriverId) {
              updateData.dest_drivers = JSON.stringify([numDriverId]);
            }
            extra.deliveryAssignedDriverId = String(driverId);
            if (driverName) extra.deliveryAssignedDriverName = String(driverName);
            if (driverPhone) extra.deliveryAssignedDriverPhone = String(driverPhone);
            extra.deliveryVisibility = 'privado';
          } else if (op === 'troca') {
            extra.exchangeAssignedDriverId = String(driverId);
            if (driverName) extra.exchangeAssignedDriverName = String(driverName);
            if (driverPhone) extra.exchangeAssignedDriverPhone = String(driverPhone);
            extra.exchangeVisibility = 'privado';
          } else {
            if (numDriverId) {
              updateData.collector_id = numDriverId;
              updateData.orig_drivers = JSON.stringify([numDriverId]);
              updateData.dest_drivers = JSON.stringify([numDriverId]);
            }
          }
          if (numDriverId && !orderRow.collector_id) {
            updateData.collector_id = numDriverId;
          }
          updateData.extra = JSON.stringify(extra);
          await prisma.orders.update({ where: { id: numericOrderId }, data: updateData });
        }
      } catch (err: any) {
        console.warn('[Realtime] Erro ao persistir motorista no pedido:', err?.message || err);
      }
    }

    try {
      deps?.notifyOrdersChanged?.();
      broadcast({ type: 'orders:changed', at: Date.now() });
    } catch {}

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

    const numericOrderId = toInt(numOfKey(String(orderId)));
    if (numericOrderId) {
      try {
        const orderRow = await prisma.orders.findUnique({ where: { id: numericOrderId } });
        if (orderRow) {
          const extra = parseExtra(orderRow.extra);
          const op = opOfKey(String(orderId));
          const point = op === 'coleta' ? 'pickup' : op === 'troca' ? 'exchange' : op === 'entrega' ? 'delivery' : null;
          if (point) {
            extra[`${point}Visibility`] = 'publico';
            delete extra[`${point}AssignedDriverId`];
            delete extra[`${point}AssignedDriverName`];
            delete extra[`${point}AssignedDriverPhone`];
          }
          extra.orderVisibility = 'publico';
          delete extra.assignedDriverId;
          delete extra.assignedDriverName;
          delete extra.assignedDriverPhone;
          delete extra.acceptedByDriver;

          const updateData: any = {};
          if (op === 'coleta' || !op) {
            updateData.collector_id = null;
            updateData.orig_drivers = '[]';
          }
          if (op === 'entrega' || !op) {
            updateData.dest_drivers = '[]';
          }
          updateData.extra = JSON.stringify(extra);
          await prisma.orders.update({ where: { id: numericOrderId }, data: updateData });
        }
      } catch (err: any) {
        console.warn('[Realtime] Erro ao desvincular motorista do pedido:', err?.message || err);
      }
    }

    try {
      deps?.notifyOrdersChanged?.();
      broadcast({ type: 'orders:changed', at: Date.now() });
    } catch {}

    res.json({ success: true });
  });

  app.post('/api/realtime/decline-order', async (req: Request, res: Response) => {
    const body = parseRawJsonBody(req);
    const orderId = toInt(body.orderId);
    const operation = String(body.operation || '').toLowerCase();
    const reason = String(body.reason || '').trim();
    if (!orderId || !['coleta', 'troca', 'entrega'].includes(operation) || reason.length < 5) {
      res.status(400).json({ success: false, message: 'Pedido, etapa e justificativa são obrigatórios.' });
      return;
    }

    const caller = await resolveCaller(req, body);
    if (!caller || caller.role !== 'motorista') {
      res.status(403).json({ success: false, message: 'Somente o motorista pode recusar o pedido aceito.' });
      return;
    }

    const matchingAssignments = Array.from(activeAssignments.entries()).filter(([key, assignment]) =>
      numOfKey(key) === String(orderId) &&
      opOfKey(key) === operation &&
      Boolean(assignment?.driverId)
    );
    const callerClaims = matchingAssignments.filter(([, assignment]) =>
      isAssignmentMine(assignment, caller) && assignment.acceptedByDriver === true
    );
    if (!callerClaims.length) {
      res.status(409).json({ success: false, message: 'O pedido não está mais aceito por este motorista.' });
      return;
    }
    if (matchingAssignments.some(([, assignment]) => !isAssignmentMine(assignment, caller))) {
      res.status(409).json({ success: false, message: 'O pedido possui outra atribuição ativa.' });
      return;
    }

    const order = await prisma.orders.findUnique({ where: { id: orderId } });
    if (!order) {
      res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
      return;
    }

    const extra = parseExtra(order.extra);
    const point = operation === 'coleta' ? 'pickup' : operation === 'troca' ? 'exchange' : 'delivery';
    extra[`${point}Visibility`] = 'publico';
    for (const suffix of ['AssignedDriverId', 'AssignedDriverName', 'AssignedDriverPhone']) {
      delete extra[`${point}${suffix}`];
    }
    extra.orderVisibility = 'publico';
    delete extra.assignedDriverId;
    delete extra.assignedDriverName;
    delete extra.assignedDriverPhone;
    delete extra.motorista_id;
    delete extra.motorista_nome;
    delete extra.motorista_telefone;
    delete extra.acceptedByDriver;

    const orderPatch: Record<string, unknown> = {
      driver_cancel_reason: reason,
      driver_cancel_at: new Date(),
      driver_cancel_user_id: caller.id
    };
    if (operation === 'coleta' || operation === 'troca') {
      delete extra.coleta_user_id;
      delete extra.coleta_user_nome;
      orderPatch.collector_id = null;
      orderPatch.orig_drivers = '[]';
    }
    if (operation === 'entrega' || operation === 'troca') {
      delete extra.entrega_user_id;
      delete extra.entrega_user_nome;
      orderPatch.dest_drivers = '[]';
    }
    orderPatch.extra = JSON.stringify(extra);

    await prisma.orders.update({ where: { id: orderId }, data: orderPatch });

    const keysToClear = matchingAssignments.map(([key]) => key);
    keysToClear.forEach(key => activeAssignments.delete(key));
    if (keysToClear.length) {
      await prisma.assignments.deleteMany({ where: { order_key: { in: keysToClear } } });
    }

    try {
      deps?.notifyOrdersChanged?.();
      broadcast({ type: 'orders:changed', at: Date.now() });
    } catch {}

    res.json({ success: true, data: { orderId, operation } });
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
    const permanentColor = getDriverPermanentColor(id || body.user_nome);
    return {
      color: previous?.color || permanentColor,
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
