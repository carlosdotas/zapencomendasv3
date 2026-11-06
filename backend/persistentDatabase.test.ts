import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';

test('unavailable MySQL seamlessly falls back to local storage for orders and carriers', async () => {
  const { prisma, persistentDatabase } = await import('./db');
  const db = await persistentDatabase();
  assert.ok(db, 'persistentDatabase should always return an active database client');

  // Orders create and findMany work
  const order = await prisma.orders.create({
    data: { date: '2026-01-01', client_name: 'Teste Local', contact_phone: '62999999999' }
  });
  assert.ok(order.id, 'Order should be created with an id');
  const foundOrders = await prisma.orders.findMany({ take: 5 });
  assert.ok(Array.isArray(foundOrders) && foundOrders.length > 0, 'Orders findMany should return orders');

  // Transportadoras upsert and findMany work
  await prisma.transportadoras.upsert({
    where: { id: 'test-transportadora' },
    create: { id: 'test-transportadora', data: JSON.stringify({ name: 'Transportadora Teste' }) },
    update: { data: JSON.stringify({ name: 'Transportadora Atualizada' }) }
  });
  const foundCarriers = await prisma.transportadoras.findMany();
  assert.ok(Array.isArray(foundCarriers) && foundCarriers.some(c => c.id === 'test-transportadora'));

  // API route /pedidos/save succeeds
  const { registerApiRoutes } = await import('./routes');
  const handlers = new Map<string, (req: Request, res: Response) => Promise<void>>();
  registerApiRoutes({
    all: (paths: string[], handler: (req: Request, res: Response) => Promise<void>) =>
      paths.forEach(path => handlers.set(path, handler)),
    get: () => undefined
  } as unknown as Express, {
    saveBase64Image: () => null, uploadToPhpServer: async () => null, imageServerConfigured: () => false
  });

  let status = 200;
  let payload: any;
  const req = {
    body: { cliente: 'Cliente API Teste', etapa: 'pendente', tipo_encomenda: 'coleta' },
    method: 'POST',
    path: '/pedidos/save',
    headers: {},
    query: {}
  } as unknown as Request;
  const res = {
    status(code: number) { status = code; return this; },
    json(value: any) { payload = value; return this; }
  } as unknown as Response;

  const handler = handlers.get('/pedidos/save');
  assert.ok(handler);
  await handler(req, res);
  assert.equal(status, 200);
  assert.equal(payload?.success, true);
  assert.ok(payload?.data?.id);
});

