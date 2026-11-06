import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';

type Handler = (req: Request, res: Response) => Promise<void>;

test('orders and carriers persist and are read back; failed writes are reported', async () => {
  const orders = new Map<number, Record<string, unknown>>();
  const companies = new Map<string, { id: string; data: string }>();
  const location = { id: 8, name: 'Depósito', address: 'Rua A', city: 'Goiânia', state: 'GO' };
  let failOrder = false;
  let failCompany = false;
  const db = {
    orders: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failOrder) throw new Error('order write failed');
        const order = { stage: 'novo', order_type: 'coleta', ...data, id: orders.size + 1 };
        orders.set(order.id, order);
        return order;
      },
      findUnique: async ({ where }: { where: { id: number } }) => orders.get(where.id) || null
    },
    users: { findMany: async () => [] },
    locations: {
      findUnique: async ({ where }: { where: { id: number } }) => where.id === location.id ? location : null,
      findMany: async () => [location]
    },
    transportadoras: {
      upsert: async ({ create }: { create: { id: string; data: string } }) => {
        if (failCompany) throw new Error('carrier write failed');
        companies.set(create.id, create);
        return create;
      },
      findMany: async () => [...companies.values()]
    }
  };
  (globalThis as unknown as { prisma: unknown }).prisma = db;
  const { registerApiRoutes } = await import('./routes');
  const handlers = new Map<string, Handler>();
  registerApiRoutes({
    all: (paths: string[], handler: Handler) => paths.forEach(path => handlers.set(path, handler)),
    get: () => undefined
  } as unknown as Express, {
    saveBase64Image: () => null, uploadToPhpServer: async () => null, imageServerConfigured: () => false
  });
  const call = async (path: string, body: object) => {
    let status = 200;
    let payload: any;
    const req = { body, method: 'POST', path, headers: {}, query: {} } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json(value: unknown) { payload = value; return this; }
    } as unknown as Response;
    const handler = handlers.get(path);
    assert.ok(handler);
    await handler(req, res);
    return { status, payload };
  };
  const order = await call('/pedidos/save', { cliente: 'Cliente teste', etapa: 'pendente', tipo_encomenda: 'coleta', coleta_lat: -16.7, coleta_lng: -49.2 });
  assert.equal(order.payload.data.id, 1);
  const fetched = await call('/pedidos/get', { id: 1 });
  assert.equal(fetched.payload.data.cliente, 'Cliente teste');
  assert.equal(fetched.payload.data.coleta_lat, -16.7);

  const company = await call('/companies/save', { company: { id: 'carrier-1', name: ' Transportadora ', locationId: 8 } });
  assert.equal(company.payload.data.location.id, 8);
  const listed = await call('/companies', {});
  assert.equal(listed.payload.data[0].name, 'Transportadora');
  assert.equal(listed.payload.data[0].location.id, 8);
  assert.equal((await call('/companies/save', { company: { id: 'invalid', name: 'Inválida', locationId: 9 } })).status, 400);
  failOrder = true;
  assert.equal((await call('/pedidos/save', { cliente: 'Não salvo' })).status, 500);
  failCompany = true;
  assert.equal((await call('/companies/save', { company: { id: 'carrier-2', name: 'Não salva' } })).status, 500);
  assert.equal(orders.size, 1);
  assert.equal(companies.size, 1);
});
