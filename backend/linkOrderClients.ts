/**
 * Vincula pedidos aos clientes (orders.client_id) sem inventar dados.
 *
 * Por que não dá para confiar em orders.client_id: nos pedidos antigos ele guarda ids do
 * cadastro legado, que não existem (ou apontam para outra pessoa) na tabela `users`.
 * Ex.: client_id=25 é "Murilo Lindria" em `users`, mas os 475 pedidos com esse id são
 * todos do cliente "Adilson". O nome do cliente do pedido (client_name) é o dado fiel.
 *
 * Regras, nesta ordem:
 *   1. client_id atual só é mantido se o usuário tiver o mesmo nome do pedido;
 *   2. senão, vincula ao único usuário com esse nome (name/full_name);
 *   3. se houver vários com o mesmo nome, escolhe o único que tem telefone;
 *   4. nos demais casos client_id fica NULL (o nome continua em client_name).
 * Nenhum usuário é criado. Uso: npm run db:link-clients [--dry]
 */
import 'dotenv/config';
import { prisma } from './db';

const dryRun = process.argv.includes('--dry');
const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const GENERIC = new Set(['', 'cliente', 'sem nome', 'null', 'undefined']);
const CLIENT_ROLES = new Set(['cliente', '', 'null']);

async function main() {
  const users = await prisma.users.findMany({
    select: { id: true, name: true, full_name: true, phone: true, access_level: true }
  });
  const byName = new Map<string, typeof users>();
  for (const u of users) {
    if (!CLIENT_ROLES.has(String(u.access_level ?? ''))) continue;
    for (const n of new Set([norm(u.name), norm(u.full_name)].filter(Boolean))) {
      byName.set(n, [...(byName.get(n) || []), u]);
    }
  }

  const orders = await prisma.orders.findMany({ select: { id: true, client_id: true, client_name: true } });

  // Evidência para desempatar nomes duplicados: pedidos que já apontam para o usuário com o mesmo nome
  const evidence = new Map<string, number>();
  for (const o of orders) {
    if (o.client_id) evidence.set(`${norm(o.client_name)}|${o.client_id}`, (evidence.get(`${norm(o.client_name)}|${o.client_id}`) || 0) + 1);
  }

  const resolve = (key: string): number | null => {
    const list = byName.get(key) || [];
    if (list.length === 1) return list[0].id;
    const ranked = list
      .map(u => ({ u, score: (evidence.get(`${key}|${u.id}`) || 0) * 2 + (u.phone ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    return ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score) ? ranked[0].u.id : null;
  };

  const target = new Map<number | null, number[]>();
  const stats = { mantidos: 0, religados: 0, semCliente: 0 };
  for (const o of orders) {
    const key = norm(o.client_name);
    const next = GENERIC.has(key) ? null : resolve(key);
    if (next === o.client_id) next === null ? stats.semCliente++ : stats.mantidos++;
    else {
      target.set(next, [...(target.get(next) || []), o.id]);
      next === null ? stats.semCliente++ : stats.religados++;
    }
  }
  console.log(dryRun ? '[simulação]' : 'Aplicando', stats);

  if (!dryRun) {
    for (const [clientId, ids] of target) {
      for (let i = 0; i < ids.length; i += 1000) {
        await prisma.orders.updateMany({ where: { id: { in: ids.slice(i, i + 1000) } }, data: { client_id: clientId } });
      }
    }
  }

  const groups = await prisma.orders.groupBy({ by: ['client_id'], _count: { _all: true }, orderBy: { _count: { client_id: 'desc' } }, take: 10 });
  const names = new Map(users.map(u => [u.id, u.name]));
  console.log('Top clientes:', groups.map(g => `${g.client_id ?? 'sem cliente'} ${names.get(g.client_id ?? 0) ?? ''}=${g._count._all}`).join(' | '));
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
