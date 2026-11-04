import { PrismaClient } from '@prisma/client';
import { fallbackStore } from './localDb';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'mysql://root:password@127.0.0.1:3306/encomendaszap';
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const realPrisma = new PrismaClient({
  log: ['warn', 'error']
});

let isMysqlAvailable = false;
let hasChecked = false;
let checkPromise: Promise<boolean> | null = null;

export async function isDatabaseOnline(): Promise<boolean> {
  if (hasChecked) return isMysqlAvailable;
  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    try {
      await Promise.race([
        realPrisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
      ]);
      isMysqlAvailable = true;
      console.log('[Database] Conexão MySQL estabelecida com sucesso.');
    } catch {
      isMysqlAvailable = false;
      console.log('[Database] MySQL indisponível no host atual. Ativando armazenamento local persistente (LocalDbStore).');
    } finally {
      hasChecked = true;
      checkPromise = null;
    }
    return isMysqlAvailable;
  })();

  return checkPromise;
}

// Inicia verificação rápida em background
void isDatabaseOnline();

function isPrismaConnectionError(err: any): boolean {
  if (!err) return false;
  if (err.name === 'PrismaClientInitializationError') return true;
  if (err.name === 'PrismaClientRustPanicError') return true;
  if (err.code === 'P1001' || err.code === 'P1000') return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes("can't reach database server") ||
    msg.includes('connection refused') ||
    msg.includes('econnrefused') ||
    msg.includes('database server is running')
  );
}

function createPrismaProxy(): PrismaClient {
  return new Proxy(realPrisma, {
    get(target, prop: string) {
      if (prop === '$transaction') {
        return async (arg: any) => {
          if (isMysqlAvailable) {
            try {
              return await realPrisma.$transaction(arg);
            } catch (err) {
              if (isPrismaConnectionError(err)) {
                isMysqlAvailable = false;
              } else {
                throw err;
              }
            }
          }
          if (Array.isArray(arg)) {
            return Promise.all(arg);
          }
          if (typeof arg === 'function') {
            return arg(proxyPrisma);
          }
          return arg;
        };
      }

      if (prop === '$queryRaw' || prop === '$executeRaw') {
        return async (...args: any[]) => {
          if (isMysqlAvailable) {
            try {
              return await (realPrisma as any)[prop](...args);
            } catch (err) {
              if (isPrismaConnectionError(err)) {
                isMysqlAvailable = false;
                return [];
              }
              throw err;
            }
          }
          return [];
        };
      }

      if (prop === '$connect' || prop === '$disconnect') {
        return async () => {};
      }

      // Intercepta qualquer modelo (users, orders, config_cities, etc.)
      return new Proxy({}, {
        get(_, method: string) {
          return async (...args: any[]) => {
            if (isMysqlAvailable) {
              try {
                return await (target as any)[prop][method](...args);
              } catch (err: any) {
                if (isPrismaConnectionError(err)) {
                  isMysqlAvailable = false;
                  console.warn(`[Database] MySQL falhou em ${prop}.${method}. Alternando para armazenamento local.`);
                  return fallbackStore.execute(prop, method, args);
                }
                throw err;
              }
            }

            return fallbackStore.execute(prop, method, args);
          };
        }
      });
    }
  }) as PrismaClient;
}

const proxyPrisma = globalForPrisma.prisma || createPrismaProxy();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = proxyPrisma;
}

export const prisma = proxyPrisma;
