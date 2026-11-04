import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runOncePerKey, shouldApplyOrderSync } from './orderSync';
import { mergeCompletedWaypointMarks } from './completedWaypointMarks';
import type { CompletedWaypointMark } from '../types/map';

test('rejects stale order syncs after a newer sync or local order mutation', () => {
  const snapshot = { requestVersion: 4, mutationVersion: 2 };

  assert.equal(shouldApplyOrderSync(snapshot, 4, 2), true);
  assert.equal(shouldApplyOrderSync(snapshot, 5, 2), false);
  assert.equal(shouldApplyOrderSync(snapshot, 4, 3), false);
});

test('coalesces concurrent order creation requests and allows retry after completion', async () => {
  const pending = new Map<string, Promise<string>>();
  let resolveSave!: (value: string) => void;
  let calls = 0;
  const operation = () => {
    calls += 1;
    return new Promise<string>(resolve => {
      resolveSave = resolve;
    });

  };

  const first = runOncePerKey(pending, 'draft-1', operation);
  const duplicate = runOncePerKey(pending, 'draft-1', operation);
  assert.equal(first, duplicate);
  assert.equal(calls, 1);

  resolveSave('pedido-101');
  assert.equal(await first, 'pedido-101');
  await Promise.resolve();
  assert.equal(pending.has('draft-1'), false);

  const retry = runOncePerKey(pending, 'draft-1', async () => 'pedido-102');
  assert.equal(await retry, 'pedido-102');
});

test('merges local and server pickup marks for the same order in either arrival order', () => {
  const local: CompletedWaypointMark = {
    id: 'mark-local', orderId: 'pedido-42-coleta', orderCode: 'EZ-42-GO',
    operationType: 'coleta', completedAt: 1, timeStr: '12:00', completedDate: '2026-11-04',
    placeName: 'Coleta', address: '', coordinates: { lat: 1, lng: 2 }, status: 'success'
  };
  const server: CompletedWaypointMark = { ...local, id: 'backend-coleta-42', orderId: 'pedido-42' };
  const otherOrder = { ...server, id: 'backend-coleta-43', orderId: 'pedido-43', orderCode: 'EZ-43-GO' };
  const failed = { ...local, id: 'failed-42', status: 'failed' as const };
  const delivery = { ...local, id: 'delivery-42', operationType: 'entrega' as const };

  assert.deepEqual(mergeCompletedWaypointMarks([local], [server, otherOrder, failed, delivery]), [local, otherOrder, failed, delivery]);
  assert.deepEqual(mergeCompletedWaypointMarks([server], [local]), [local]);
  assert.deepEqual(mergeCompletedWaypointMarks([], [server, local]), [local]);
});
