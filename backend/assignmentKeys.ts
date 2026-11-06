export function assignmentOrderNumber(key: string): string {
  return key.match(/^(?:pedido-)?(\d+)(?:[-_](?:coleta|entrega|troca|retorno))?$/i)?.[1] || '';
}

export function assignmentOperation(key: string): string {
  return key.match(/(?:^|[-_])(coleta|entrega|troca|retorno)$/i)?.[1]?.toLowerCase() || '';
}

export function sameAssignmentOperation(a: string, b: string): boolean {
  const number = assignmentOrderNumber(a);
  if (!number || number !== assignmentOrderNumber(b)) return a === b;
  const aOperation = assignmentOperation(a);
  const bOperation = assignmentOperation(b);
  return !aOperation || !bOperation || aOperation === bOperation;
}

export function serializeByKey() {
  const pending = new Map<string, Promise<void>>();
  return async <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const previous = pending.get(key) || Promise.resolve();
    let release!: () => void;
    const finished = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => finished);
    pending.set(key, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (pending.get(key) === tail) pending.delete(key);
    }
  };
}
