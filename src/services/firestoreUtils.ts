/**
 * Utilitários do Firestore para sanitização e garantia de integridade
 */

export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }

  if (typeof data === 'string') {
    // Limite de segurança: Firestore rejeita documentos > 1MB.
    // Se houver fotos em base64 gigantes (>300KB), truncamos ou substituímos por referência
    if (data.length > 300000) {
      if (data.startsWith('data:image')) {
        return 'data:image/jpeg;base64,[Omitted: imagem grande]' as any;
      }
      return data.slice(0, 300000) as any;
    }
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as any;
  }

  if (data instanceof Date) {
    return data.toISOString() as any;
  }

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(data as Record<string, any>)) {
    if (val === undefined) {
      // Omite campos undefined pois o Firestore rejeita
      continue;
    }
    result[key] = sanitizeForFirestore(val);
  }

  return result as T;
}
