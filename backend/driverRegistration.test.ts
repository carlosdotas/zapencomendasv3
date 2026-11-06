import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';

type Handler = (req: Request, res: Response) => Promise<void>;
type User = {
  id: number; name: string; full_name: string; phone: string; password: string;
  access_level: string; cpf: string | null; city: string | null; extra: string;
};

test('registration persists driver details, authenticates and lists the registered driver', async () => {
  const users: User[] = [];
  let failCreate = false;
  const db = {
    users: {
      findMany: async ({ where }: { where: { phone?: { in: string[] }; access_level?: { in: string[] } } }) =>
        users.filter(user => where.phone ? where.phone.in.includes(user.phone) : where.access_level?.in.includes(user.access_level)),
      create: async ({ data }: { data: Omit<User, 'id'> }) => {
        if (failCreate) throw new Error('simulated database failure');
        const user = { ...data, id: users.length + 1 };
        users.push(user);
        return user;
      }
    },
    drivers: { findMany: async () => [] },
    user_sessions: { create: async () => ({}) }
  };
  (globalThis as unknown as { prisma: unknown }).prisma = db;
  const { registerApiRoutes } = await import('./routes');
  const handlers = new Map<string, Handler>();
  const app = {
    all: (paths: string[], handler: Handler) => paths.forEach(path => handlers.set(path, handler)),
    get: () => undefined
  };
  registerApiRoutes(app as unknown as Express, {
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
  const input = {
    name: 'Motorista Teste', phone: '62912345678', password: 'senha123',
    access_level: 'motorista', cpf: '12345678901', cidade: 'Goiânia',
    tipo_veiculo: 'carro', modelo_veiculo: 'Modelo', placa: 'ABC-1234'
  };
  const registered = await call('/users/register', input);
  assert.equal(registered.status, 200);
  assert.equal(registered.payload.data.id, 1);
  assert.notEqual(users[0].password, input.password);
  assert.equal(users[0].cpf, input.cpf);
  const login = await call('/login/login', { phone: input.phone, password: input.password });
  assert.equal(login.payload.data.user_id, 1);
  assert.equal(login.payload.data.access_level, 'motorista');
  const listed = await call('/motoristas/list', {});
  assert.equal(listed.payload.data.length, 1);
  assert.equal(listed.payload.data[0].cpf, input.cpf);
  assert.equal(listed.payload.data[0].tipo_veiculo, input.tipo_veiculo);
  assert.equal(listed.payload.data[0].modelo_veiculo, input.modelo_veiculo);
  assert.equal(listed.payload.data[0].placa, input.placa);
  assert.equal((await call('/users/register', { ...input, phone: `55${input.phone}` })).status, 409);
  failCreate = true;
  assert.equal((await call('/users/register', { ...input, phone: '62912345679' })).status, 500);
  assert.equal(users.length, 1);
});
