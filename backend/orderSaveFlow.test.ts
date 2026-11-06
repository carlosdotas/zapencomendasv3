import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Express, Request, Response } from 'express';

test('creating and saving an order persists correctly and is retrievable without database errors', async () => {
  const { registerApiRoutes } = await import('./routes');
  const handlers = new Map<string, (req: Request, res: Response, body: any) => Promise<void>>();

  registerApiRoutes({
    all: (paths: string[], handler: any) =>
      paths.forEach(path => handlers.set(path, handler)),
    get: () => undefined
  } as unknown as Express, {
    saveBase64Image: () => null,
    uploadToPhpServer: async () => null,
    imageServerConfigured: () => false
  });

  const call = async (path: string, body: any, headers: Record<string, string> = {}) => {
    let status = 200;
    let payload: any;
    const req = {
      body,
      method: 'POST',
      path,
      headers: { 'x-user-role': 'admin', ...headers },
      query: {}
    } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json(value: any) { payload = value; return this; }
    } as unknown as Response;

    const handler = handlers.get(path);
    assert.ok(handler, `Route handler for ${path} should exist`);
    await handler(req, res, body);
    return { status, payload };
  };

  // 1. Create a new order with pickup and delivery details and observations
  const createPayload = {
    cliente: 'Maria Distribuidora',
    phone: '62998887766',
    tipo_encomenda: 'coleta',
    tipo_veiculo: 'moto',
    cidade: 'Goiânia',
    detalhes: 'Cuidado pacote frágil',
    coleta_nome: 'Galpão Central',
    coleta_endereco: 'Av Central 100, Setor Bueno',
    coleta_lat: -16.6869,
    coleta_lng: -49.2648,
    coleta_obs: 'Entregar para Seu Pedro na portaria',
    coleta_contato: 'Pedro Portaria',
    coleta_phone: '62981112233',
    entrega_nome: 'Loja 2 Sul',
    entrega_endereco: 'Rua 9, Setor Sul',
    entrega_lat: -16.6980,
    entrega_lng: -49.2570,
    entrega_obs: 'Deixar no caixa 3',
    total: 35.50
  };

  const saveRes = await call('/pedidos/save', createPayload);
  assert.equal(saveRes.status, 200, `Save should return HTTP 200, got ${saveRes.status} with message: ${saveRes.payload?.message}`);
  assert.equal(saveRes.payload.success, true, 'Save should return success: true');
  assert.ok(saveRes.payload.data?.id, 'Save should return generated order ID');

  const orderId = saveRes.payload.data.id;

  // 2. Fetch the created order via /pedidos/get
  const getRes = await call('/pedidos/get', { id: orderId });
  assert.equal(getRes.status, 200);
  assert.equal(getRes.payload.success, true);
  assert.equal(getRes.payload.data.id, orderId);
  assert.equal(getRes.payload.data.cliente, 'Maria Distribuidora');
  assert.equal(getRes.payload.data.coleta_obs, 'Entregar para Seu Pedro na portaria');
  assert.equal(getRes.payload.data.entrega_obs, 'Deixar no caixa 3');

  // 3. Update the existing order (e.g. updating notes or stage)
  const updateRes = await call('/pedidos/save', {
    id: orderId,
    cliente: 'Maria Distribuidora',
    coleta_obs: 'Entregar para Seu Pedro - URGENTE',
    entrega_obs: 'Deixar no caixa 3 com Maria'
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.payload.success, true);

  const getUpdatedRes = await call('/pedidos/get', { id: orderId });
  assert.equal(getUpdatedRes.payload.data.coleta_obs, 'Entregar para Seu Pedro - URGENTE');
  assert.equal(getUpdatedRes.payload.data.entrega_obs, 'Deixar no caixa 3 com Maria');
});
