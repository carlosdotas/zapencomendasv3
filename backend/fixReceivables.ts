/**
 * Saneia os pedidos "a receber" (orders.payment_status <> 'pago'), que alimentam o financeiro.
 * Contas a receber são lidas direto de `orders`; não existe tabela própria.
 *
 *  1. Pedidos-fantasma (sem nome, total 0, sem cliente, data 1970 e sem valores) são
 *     copiados para um JSON de backup e removidos, pois aparecem como contas de R$ 0.
 *  2. Pedidos a receber sem client_id são ligados ao único cliente com o mesmo nome.
 *
 * Uso: npm run db:fix-receivables [--dry]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from './db';

const dryRun = process.argv.includes('--dry');
const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const GENERIC = new Set(['', 'cliente', 'sem nome', 'null', 'undefined']);
const CLIENT_ROLES = new Set(['cliente', '', 'null']);

export const isGhostOrder = (o: {
  client_name: string | null; client_id: number | null; total: number | null; date: string | Date | null;
  orig_value: number | null; dest_value: number | null; intercity_value: number | null; base_value: number | null;
}) =>
  GENERIC.has(norm(o.client_name)) &&
  !o.client_id &&
  !Number(o.total) &&
  !Number(o.base_value) &&
  !Number(o.orig_value) &&
  !Number(o.dest_value) &&
  !Number(o.intercity_value) &&
  String(o.date ?? '').startsWith('1970');

async function main() {
  const unpaid = await prisma.orders.findMany({ where: { payment_status: { not: 'pago' } } });
  const ghosts = unpaid.filter(o => isGhostOrder(o as any));
  const ghostIds = new Set(ghosts.map(g => g.id));

  const users = await prisma.users.findMany({ select: { id: true, name: true, full_name: true, access_level: true } });
  const byName = new Map<string, number[]>();
  for (const u of users) {
    if (!CLIENT_ROLES.has(String(u.access_level ?? ''))) continue;
    for (const n of new Set([norm(u.name), norm(u.full_name)].filter(Boolean))) {
      byName.set(n, [...(byName.get(n) || []), u.id]);
    }
  }

  const links: Array<{ id: number; client: number; name: string }> = [];
  const unmatched: string[] = [];
  for (const o of unpaid) {
    if (ghostIds.has(o.id) || o.client_id) continue;
    const ids = byName.get(norm(o.client_name)) || [];
    if (ids.length === 1) links.push({ id: o.id, client: ids[0], name: o.client_name });
    else unmatched.push(`${o.id}:${o.client_name}${ids.length > 1 ? ' (nome duplicado)' : ''}`);
  }

  const real = unpaid.length - ghosts.length;
  const total = unpaid.filter(o => !ghostIds.has(o.id)).reduce((s, o) => s + (Number(o.total) || 0), 0);
  console.log(dryRun ? '[simulação]' : 'Aplicando', {
    aReceber: unpaid.length, fantasmas: ghosts.length, reais: real, totalReal: Math.round(total * 100) / 100,
    vinculados: links.length, semVinculo: unmatched.length
  });
  if (unmatched.length) console.log('Sem vínculo:', unmatched.join(' | '));

  if (dryRun) return;

  if (ghosts.length) {
    const file = path.resolve('backend/database', `backup-pedidos-fantasma-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(ghosts, null, 2));
    console.log('Backup dos pedidos removidos:', file);
    await prisma.orders.deleteMany({ where: { id: { in: [...ghostIds] } } });
  }
  for (const l of links) await prisma.orders.update({ where: { id: l.id }, data: { client_id: l.client } });
}

if (process.argv[1]?.endsWith('fixReceivables.ts')) {
  main()
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
