import test from 'node:test';
import assert from 'node:assert/strict';
import { claimPickupTransition } from './pickupTransition';
import { canAssignCollectedOrder, collectionOwnership } from '../src/utils/collectionOwnership';

test('only one simultaneous pickup can advance a given order stage', async () => {
  let stage = 'a_caminho_da_coleta';
  const store = {
    updateMany: async ({ where }: { where: { id: number; stage: string } }) => {
      if (where.id !== 42 || where.stage !== stage) return { count: 0 };
      stage = 'coletado';
      return { count: 1 };
    }
  };
  const order = { id: 42, stage };
  const results = await Promise.all([
    claimPickupTransition(store, order, { stage: 'coletado', collector_id: 11 }),
    claimPickupTransition(store, order, { stage: 'coletado', collector_id: 22 })
  ]);
  assert.deepEqual(results, [true, false]);
});

test('a collected order cannot be claimed or assigned to another driver', () => {
  const reserved = collectionOwnership({ etapa: 'coletado', coleta_user_id: 11 });
  assert.equal(canAssignCollectedOrder(reserved, '22', true), false);
  assert.equal(canAssignCollectedOrder(reserved, '11', true), false);
  assert.equal(canAssignCollectedOrder(reserved, '22', false), false);
  assert.equal(canAssignCollectedOrder(reserved, '11', false), true);
  assert.equal(canAssignCollectedOrder(collectionOwnership({ etapa: 'pendente' }), '22', true), true);
});
