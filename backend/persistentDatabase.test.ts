import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';

test('unavailable MySQL does not fall back for orders and carriers', async () => {
  process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/nonexistent?connect_timeout=1';
  const { prisma, DatabaseUnavailableError } = await import('./db');
  await assert.rejects(prisma.orders.findMany(), DatabaseUnavailableError);
  await assert.rejects(prisma.orders.create({ data: { date: '2026-01-01', client_name: 'Teste', contact_phone: '' } }), DatabaseUnavailableError);
  await assert.rejects(prisma.transportadoras.findMany(), DatabaseUnavailableError);
  await assert.rejects(prisma.transportadoras.upsert({
    where: { id: 'test' }, create: { id: 'test', data: '{}' }, update: { data: '{}' }
  }), DatabaseUnavailableError);

  const { registerApiRoutes } = await import('./routes');
  const handlers = new Map<string, (req: Request, res: Response) => Promise<void>>();
  registerApiRoutes({
    all: (paths: string[], handler: (req: Request, res: Response) => Promise<void>) =>
      paths.forEach(path => handlers.set(path, handler)),
    get: () => undefined
  } as unknown as Express, {
    saveBase64Image: () => null, uploadToPhpServer: async () => null, imageServerConfigured: () => false
  });
  for (const [path, body] of [
    ['/pedidos/save', { cliente: 'Teste' }],
    ['/companies/save', { company: { name: 'Teste' } }],
    ['/companies', {}]
  ] as const) {
    let status = 200;
    let payload: { success: boolean; message: string } | undefined;
    const req = { body, method: 'POST', path, headers: {}, query: {} } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json(value: typeof payload) { payload = value; return this; }
    } as unknown as Response;
    const handler = handlers.get(path);
    assert.ok(handler);
    await handler(req, res);
    assert.equal(status, 503);
    assert.equal(payload?.success, false);
    assert.match(payload?.message || '', /Banco de dados indisponível/);
  }
});
