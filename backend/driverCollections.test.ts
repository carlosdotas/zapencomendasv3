import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewDriverCollections, collectionSummary, openDriverCollectionsWhere } from './driverCollections';

test('allows staff and only the driver whose collections were requested', () => {
  const driver = { id: 21, role: 'motorista', phone: '' };
  assert.equal(canViewDriverCollections(driver, 21), true);
  assert.equal(canViewDriverCollections(driver, 22), false);
  assert.equal(canViewDriverCollections({ ...driver, role: 'atendente' }, 22), true);
  assert.equal(canViewDriverCollections({ ...driver, role: 'admin_geral' }, 22), true);
  assert.equal(canViewDriverCollections({ ...driver, role: 'cliente' }, 21), false);
  assert.equal(canViewDriverCollections(null, 21), false);
});

test('exposes pickup location, customer and original photo without unrelated order data', () => {
  const summary = collectionSummary({
    id: 42, coleta_locais_name: 'Loja A', coleta_local: 'Nome antigo',
    coleta_endereco: 'Rua A', cliente: 'Cliente A',
    coleta_foto: '["/uploads/pedidos/coleta/foto.jpg"]',
    coleta_saida_at: '2026-11-04T10:00:00.000Z', entrega_obs: 'privado'
  });

  assert.deepEqual(summary, {
    id: '42', pickupName: 'Loja A', pickupAddress: 'Rua A', customerName: 'Cliente A',
    photo: '["/uploads/pedidos/coleta/foto.jpg"]', collectedAt: '2026-11-04T10:00:00.000Z'
  });
  assert.equal(collectionSummary({ id: 43 }).pickupName, 'Local de coleta não informado');
});

test('queries only collected orders still open for the requested driver', () => {
  const where = openDriverCollectionsWhere(21);
  assert.deepEqual(where, {
    collector_id: 21,
    collected_at: { not: null },
    stage: { notIn: ['entregue', 'finalizado', 'cancelado'] }
  });
  for (const stage of ['coletado', 'troca', 'em_transito', 'a_caminho_da_entrega']) {
    assert.equal(where.stage.notIn.includes(stage), false);
  }
  for (const stage of ['entregue', 'finalizado', 'cancelado']) {
    assert.equal(where.stage.notIn.includes(stage), true);
  }
});
