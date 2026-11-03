export interface OrderSyncSnapshot {
  requestVersion: number;
  mutationVersion: number;
}

export function shouldApplyOrderSync(
  snapshot: OrderSyncSnapshot,
  currentRequestVersion: number,
  currentMutationVersion: number
): boolean {
  return snapshot.requestVersion === currentRequestVersion &&
    snapshot.mutationVersion === currentMutationVersion;
}

export function runOncePerKey<K, V>(
  pending: Map<K, Promise<V>>,
  key: K,
  operation: () => Promise<V>
): Promise<V> {
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = operation();
  pending.set(key, promise);
  const clearPending = () => {
    if (pending.get(key) === promise) pending.delete(key);
  };
  void promise.then(clearPending, clearPending);
  return promise;
}
