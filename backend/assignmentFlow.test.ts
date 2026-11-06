import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { Express, Request, Response } from 'express';
import type { WebSocketServer } from 'ws';

type Handler = (req: Request, res: Response) => Promise<void>;
type Order = { id: number; stage: string; order_type: string; extra: string; collector_id: number | null; orig_drivers: string; dest_drivers: string; pickup_location_id: number; delivery_location_id: number; date: string };
type AssignmentRow = { order_key: string; data: string; assigned_at: number };

test('assignment endpoints serialize claims, persist aliases, release visibility and surface failures', async () => {
  const rows = new Map<number, Order>([[701, {
    id: 701, stage: 'novo', order_type: 'coleta', extra: '{}',
    collector_id: null, orig_drivers: '[]', dest_drivers: '[]',
    pickup_location_id: 7, delivery_location_id: 8, date: '2026-10-01'
  }]]);
  const assignments = new Map<string, AssignmentRow>();
  const users = new Map([
    ['a', { id: 11, access_level: 'motorista', phone: '11111111111' }],
    ['b', { id: 22, access_level: 'motorista', phone: '22222222222' }],
    ['admin', { id: 1, access_level: 'admin', phone: '' }],
    ['atendente', { id: 2, access_level: 'atendente', phone: '' }]
  ]);
  let failWrite = false;
  const db = {
    user_sessions: { findUnique: async ({ where }: { where: { token: string } }) => {
      const user = users.get(where.token);
      return user ? { is_logged: true, user } : null;
    } },
    users: { findMany: async () => [] },
    notifications: { createMany: async () => ({ count: 0 }) },
    orders: {
      findUnique: async ({ where }: { where: { id: number } }) => rows.get(where.id) || null,
      findMany: async () => Array.from(rows.values()),
      count: async () => rows.size,
      update: async ({ where, data }: { where: { id: number }; data: Partial<Order> }) => {
        const row = rows.get(where.id);
        if (!row) throw new Error('missing order');
        Object.assign(row, data);
        return row;
      }
    },
    locations: { findMany: async () => [
      { id: 7, name: 'Loja', lat: -16.7, lng: -49.2 },
      { id: 8, name: 'Cliente', lat: -16.8, lng: -49.3 }
    ] },
    assignments: {
      findMany: async () => Array.from(assignments.values()),
      upsert: async ({ create }: { create: AssignmentRow }) => {
        if (failWrite) throw new Error('simulated persistence failure');
        assignments.set(create.order_key, create);
        return create;
      },
      deleteMany: async ({ where }: { where: { order_key: { in: string[] } } }) => {
        for (const key of where.order_key.in) assignments.delete(key);
      }
    },
    $transaction: async (run: (tx: object) => Promise<void>) => {
      const beforeRows = structuredClone(rows);
      const beforeAssignments = structuredClone(assignments);
      try {
        await run(db);
      } catch (error) {
        rows.clear(); beforeRows.forEach((value, key) => rows.set(key, value));
        assignments.clear(); beforeAssignments.forEach((value, key) => assignments.set(key, value));
        throw error;
      }
    }
  };
  (globalThis as unknown as { prisma: unknown }).prisma = db;
  const { registerRealtime } = await import('./realtime');
  const { assignmentStore, canCallerSeeOrder } = await import('./access');
  const { pedidoToBackend } = await import('./mappers');
  const { registerApiRoutes } = await import('./routes');
  const { backendOrderMarkerToPlace, backendPedidoToPlaces } = await import('../src/services/apiAdapters');
  assignmentStore.clear();
  const handlers = new Map<string, Handler>();
  const app = {
    post: (path: string, handler: Handler) => handlers.set(path, handler),
    get: () => undefined,
    all: () => undefined
  };
  const ws = Object.assign(new EventEmitter(), { clients: new Set() });
  await registerRealtime(app as unknown as Express, ws as unknown as WebSocketServer);
  registerApiRoutes({
    all: (paths: string[], handler: Handler) => paths.forEach(path => handlers.set(path, handler)),
    get: () => undefined
  } as unknown as Express, {
    saveBase64Image: () => null, uploadToPhpServer: async () => null, imageServerConfigured: () => false
  });
  const call = async (path: string, token: string, body: Record<string, unknown>) => {
    let status = 200;
    let payload: { success: boolean; message?: string; data?: any } | undefined;
    const req = { body, method: 'POST', path, headers: { authorization: `Bearer ${token}` }, query: {} } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json(value: typeof payload) { payload = value; return this; }
    } as unknown as Response;
    const handler = handlers.get(path);
    assert.ok(handler, `missing handler ${path}`);
    await handler(req, res);
    return { status, payload };
  };
  const assign = '/api/realtime/assign-driver';
  const unassign = '/api/realtime/unassign-driver';
  const [a, b] = await Promise.all([
    call(assign, 'a', { orderId: '701_coleta', driverId: '11', claim: true }),
    call(assign, 'b', { orderId: 'pedido-701-coleta', driverId: '22', claim: true })
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const winner = a.status === 200 ? 'a' : 'b';
  const winnerId = winner === 'a' ? 11 : 22;
  const loserId = winner === 'a' ? 22 : 11;
  const persisted = pedidoToBackend(rows.get(701));
  assert.equal(persisted.pickupVisibility, 'privado');
  assert.equal(persisted.acceptedByDriver, true);
  assert.equal(canCallerSeeOrder(persisted, { id: winnerId, role: 'motorista', phone: '' }), true);
  assert.equal(canCallerSeeOrder(persisted, { id: loserId, role: 'motorista', phone: '' }), false);
  for (const token of ['admin', 'atendente', winner]) {
    const list = await call('/pedidos/list_pedidos', token, { active_only: true });
    assert.equal(list.payload?.data.length, 1, `${token} deve receber o pedido aceito`);
    const [fallback] = backendPedidoToPlaces(list.payload!.data[0]);
    assert.equal(fallback.operationType, 'coleta');
    assert.equal(fallback.assignedDriverId, String(winnerId));
    const markers = await call('/tracking/order_markers', token, { date: '2026-10-01' });
    assert.equal(markers.payload?.data.length, 1);
    const place = backendOrderMarkerToPlace(markers.payload!.data[0], 'hoje', list.payload!.data[0]);
    assert.equal(place.operationType, 'coleta');
    assert.equal(place.assignedDriverId, String(winnerId));
    assert.equal(place.acceptedByDriver, true);
  }
  const loser = winner === 'a' ? 'b' : 'a';
  assert.equal((await call('/pedidos/list_pedidos', loser, { active_only: true })).payload?.data.length, 0);
  assert.equal((await call('/tracking/order_markers', loser, { date: '2026-10-01' })).payload?.data.length, 0);
  assert.equal((await call(assign, winner, { orderId: 'pedido-701-coleta', driverId: String(winnerId), claim: true })).status, 200);
  assert.equal(assignments.size, 1);
  assert.equal((await call(assign, winner, { orderId: '701_entrega', driverId: String(winnerId), claim: true })).status, 409);

  assert.equal((await call(assign, 'admin', { orderId: '701_entrega', driverId: '22' })).status, 200);
  const withFutureDelivery = pedidoToBackend(rows.get(701));
  assert.equal(withFutureDelivery.assignedDriverId, String(winnerId));
  assert.equal(withFutureDelivery.pickupAssignedDriverId, String(winnerId));
  assert.equal((await call(unassign, 'admin', { orderId: '701_entrega' })).status, 200);
  assert.equal(pedidoToBackend(rows.get(701)).assignedDriverId, String(winnerId));

  const legacyKey = assignments.has('701_coleta') ? 'pedido-701-coleta' : '701_coleta';
  const alias = { orderId: legacyKey, driverId: String(winnerId), assignedAt: Date.now(), acceptedByDriver: true };
  assignmentStore.set(legacyKey, alias);
  assignments.set(legacyKey, { order_key: legacyKey, data: JSON.stringify(alias), assigned_at: alias.assignedAt });
  assert.equal((await call(unassign, 'admin', { orderId: '701_coleta' })).status, 200);
  assert.equal(assignments.size, 0);
  assert.equal(assignmentStore.size, 0);
  const released = pedidoToBackend(rows.get(701));
  assert.equal(released.pickupVisibility, 'publico');
  assert.equal(canCallerSeeOrder(released, { id: 11, role: 'motorista', phone: '' }), true);
  assert.equal(canCallerSeeOrder(released, { id: 22, role: 'motorista', phone: '' }), true);
  for (const token of ['admin', 'atendente', 'a', 'b']) {
    const markers = await call('/tracking/order_markers', token, { date: '2026-10-01' });
    assert.equal(markers.payload?.data.length, 1, `${token} deve receber a coleta após desvincular`);
    assert.equal(markers.payload?.data[0].tipo, 'coleta');
  }

  failWrite = true;
  assert.equal((await call(assign, 'a', { orderId: '701_coleta', driverId: '11', claim: true })).status, 500);
  assert.equal(assignmentStore.size, 0);
  assert.equal(pedidoToBackend(rows.get(701)).pickupVisibility, 'publico');
  failWrite = false;
  assert.equal((await call(assign, 'a', { orderId: '701_coleta', driverId: '11', claim: true })).status, 200);
  rows.get(701)!.stage = 'coletado';
  assert.equal((await call(unassign, 'admin', { orderId: '701_coleta' })).status, 409);
  assert.equal(assignments.size, 1);
  assert.equal((await call('/api/realtime/urgent-offer/respond', 'a', { offerId: 'not-active', accepted: false })).status, 404);
  assignmentStore.clear();
});
