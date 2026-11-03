import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runOncePerKey, shouldApplyOrderSync } from './orderSync';

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
