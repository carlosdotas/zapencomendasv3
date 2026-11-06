import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';
import type { WebSocketServer } from 'ws';

type Handler = (req: Request, res: Response) => Promise<void> | void;
type Message = { type: string; offerId?: string; place?: { coordinates: { lat: number; lng: number } } };

class Socket extends EventEmitter {
  readyState = 1;
  messages: Message[] = [];
  send(raw: string) { this.messages.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.emit('close'); }
}

test('approved pickups notify the nearest driver and advance on refusal or after 30 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const order = {
    id: 700, stage: 'aprovado', order_type: 'coleta', pickup_location_id: 7,
    origin_location_id: null, collector_id: null, orig_drivers: '[]', extra: '{}'
  };
  const users = new Map([
    ['driver-a', { id: 11, access_level: 'motorista', phone: '11111111111' }],
    ['driver-b', { id: 22, access_level: 'motorista', phone: '22222222222' }]
  ]);
  let queriedStages: string[] = [];
  const db = {
    assignments: { findMany: async () => [] },
    user_sessions: { findUnique: async ({ where }: { where: { token: string } }) => {
      const user = users.get(where.token);
      return user ? { is_logged: true, user } : null;
    } },
    app_settings: { findUnique: async () => ({ value: '{"operation":{"urgentNotificationRadiusKm":5}}' }) },
    orders: { findMany: async ({ where }: { where: { stage: { in: string[] } } }) => {
      queriedStages = where.stage.in;
      return queriedStages.includes(order.stage) ? [order] : [];
    } },
    locations: { findMany: async () => [{ id: 7, name: 'Coleta', lat: -16.7, lng: -49.2 }] }
  };
  (globalThis as unknown as { prisma: unknown }).prisma = db;
  const { registerRealtime } = await import('./realtime');
  const { assignmentStore } = await import('./access');
  assignmentStore.clear();
  const handlers = new Map<string, Handler>();
  const app = {
    post: (path: string, handler: Handler) => handlers.set(path, handler),
    get: () => undefined,
    all: () => undefined
  };
  const wss = Object.assign(new EventEmitter(), { clients: new Set<Socket>() });
  await registerRealtime(app as unknown as Express, wss as unknown as WebSocketServer);
  const call = async (path: string, body: object, token = '') => {
    let status = 200;
    let payload: { success: boolean } | undefined;
    const req = { body, headers: { authorization: token ? `Bearer ${token}` : '' }, query: {} } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json(value: typeof payload) { payload = value; return this; }
    } as unknown as Response;
    const handler = handlers.get(path);
    assert.ok(handler);
    await handler(req, res);
    return { status, payload };
  };
  for (const [id, lat] of [['11', -16.701], ['22', -16.71]] as const) {
    await call('/api/tracking/update-driver', {
      id, phone: id === '11' ? '11111111111' : '22222222222',
      coordinates: { lat, lng: -49.2 }, status: 'disponivel', isOnline: true
    });
  }
  const a = new Socket();
  const b = new Socket();
  wss.clients.add(a); wss.clients.add(b);
  wss.emit('connection', a); wss.emit('connection', b);
  a.emit('message', JSON.stringify({ type: 'auth', token: 'driver-a' }));
  b.emit('message', JSON.stringify({ type: 'auth', token: 'driver-b' }));
  for (let i = 0; i < 10 && !a.messages.some(message => message.type === 'urgent:offer'); i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(queriedStages.includes('aprovado'));
  assert.ok(queriedStages.includes('a_caminho_da_coleta'));
  const offer = a.messages.find(message => message.type === 'urgent:offer');
  assert.equal(offer?.offerId, '700-coleta');
  assert.deepEqual(offer?.place?.coordinates, { lat: -16.7, lng: -49.2 });
  assert.equal(b.messages.some(message => message.type === 'urgent:offer'), false);
  const secondSocket = new Socket();
  wss.clients.add(secondSocket);
  const previousOfferCount = a.messages.filter(message => message.type === 'urgent:offer').length;
  wss.emit('connection', secondSocket);
  secondSocket.emit('message', JSON.stringify({ type: 'auth', token: 'driver-a' }));
  for (let i = 0; i < 10 && !secondSocket.messages.some(message => message.type === 'urgent:offer'); i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(secondSocket.messages.some(message => message.type === 'urgent:offer' && message.offerId === '700-coleta'));
  assert.equal(a.messages.filter(message => message.type === 'urgent:offer').length, previousOfferCount);
  assert.equal((await call('/api/realtime/urgent-offer/respond', { offerId: '700-coleta', accepted: false }, 'driver-a')).status, 200);
  assert.ok(a.messages.some(message => message.type === 'urgent:cancel'));
  assert.ok(b.messages.some(message => message.type === 'urgent:offer'));
  assert.equal((await call('/api/realtime/urgent-offer/respond', { offerId: '700-coleta', accepted: false }, 'driver-b')).status, 200);

  order.id = 701;
  await call('/api/tracking/update-driver', {
    id: '11', phone: '11111111111', coordinates: { lat: -16.701, lng: -49.2 },
    status: 'disponivel', isOnline: true
  });
  for (let i = 0; i < 10 && !a.messages.some(message => message.type === 'urgent:offer' && message.offerId === '701-coleta'); i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(a.messages.some(message => message.type === 'urgent:offer' && message.offerId === '701-coleta'));
  t.mock.timers.tick(29_999);
  assert.equal(b.messages.some(message => message.type === 'urgent:offer' && message.offerId === '701-coleta'), false);
  t.mock.timers.tick(1);
  assert.ok(a.messages.some(message => message.type === 'urgent:cancel' && message.offerId === '701-coleta'));
  assert.ok(b.messages.some(message => message.type === 'urgent:offer' && message.offerId === '701-coleta'));
  assert.equal((await call('/api/realtime/urgent-offer/respond', { offerId: '701-coleta', accepted: false }, 'driver-b')).status, 200);
  a.close(); b.close(); secondSocket.close();
});
