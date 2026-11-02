/**
 * Importa/enriquece usuários a partir de JSONs do sistema anterior.
 * Uso: npm run db:import-users [arquivo.json ...] [--dry]
 * Padrão: importedUsers.json (prioridade) e importedUsers.legacy.json.
 *
 * - Telefone novo: cria o usuário.
 * - Telefone já existente e mesmo nome: só preenche campos que estão vazios no banco
 *   (CPF, CNPJ, cidade, nome completo, foto, tipo de pessoa e extras). Nada é sobrescrito.
 * - Telefone existente mas nome diferente: ignorado (é outra pessoa/contato).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { userFromBackend } from './mappers';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const given = args.filter(a => !a.startsWith('--'));
const files = (given.length ? given : ['backend/database/importedUsers.json', 'backend/database/importedUsers.legacy.json'])
  .map(f => path.resolve(f))
  .filter(f => fs.existsSync(f));

const IGNORED_KEYS = ['id', 'token', 'source', 'pedidos_count', 'order_count', 'created_at', 'updated_at'];
const FILLABLE = ['city', 'cpf', 'cnpj', 'full_name', 'photo'] as const;

const phoneKeys = (phone: string | null): string[] => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return [];
  const bare = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return [bare, `55${bare}`];
};
const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const UNTRUSTED_KEYS = [
  'cpf', 'cnpj', 'cidade', 'city', 'name_completo', 'full_name', 'person_type', 'address', 'endereco',
  'coordinates', 'additionalAddresses', 'additional_addresses'
];
const tokens = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
function relatedNames(a: unknown, b: unknown): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  return ta.some(x => tb.some(y => x === y || (x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x)))));
}
const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

function sameName(a: { name: string; full_name: string | null }, b: { name?: unknown; full_name?: unknown }) {
  const mine = [norm(a.name), norm(a.full_name)].filter(Boolean);
  const theirs = [norm(b.name), norm(b.full_name)].filter(Boolean);
  return mine.some(x => theirs.some(y => x === y || (x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x)))));
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const parseExtra = (v: unknown): Record<string, any> => {
  try { return typeof v === 'string' && v ? JSON.parse(v) : {}; } catch { return {}; }
};

async function main() {
  const dbUsers = await prisma.users.findMany();
  const byPhone = new Map<string, any[]>();
  const index = (u: any) => phoneKeys(u.phone).forEach(k => byPhone.set(k, [...(byPhone.get(k) || []), u]));
  dbUsers.forEach(index);
  const takenIds = new Set(dbUsers.map(u => u.id));

  const stats = { criados: 0, enriquecidos: 0, camposPreenchidos: 0, semMudanca: 0, outroNome: 0, invalidos: 0, documentosDescartados: 0 };

  for (const file of files) {
    const list: any[] = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    for (const item of list) {
      const keys = phoneKeys(String(item?.phone ?? ''));
      if (!keys.length || !String(item?.name ?? '').trim()) { stats.invalidos++; continue; }

      const body: Record<string, any> = { ...item };
      for (const key of IGNORED_KEYS) delete body[key];
      // Nos JSONs antigos, CPF/CNPJ/nome completo/cidade dos ids baixos estão deslocados em relação ao nome.
      // Só confia nesses campos quando o nome completo tem relação com o nome do cadastro.
      // Ids altos (recentes) não sofrem o deslocamento; o telefone exato já garante a correspondência.
      const trusted = Number(item.id) >= 996 || relatedNames(item.name, item.name_completo ?? item.full_name);
      if (!trusted) {
        for (const key of UNTRUSTED_KEYS) delete body[key];
        stats.documentosDescartados++;
      }
      const data: Record<string, any> = userFromBackend(body);

      const candidates = [...new Set(keys.flatMap(k => byPhone.get(k) || []))];
      if (!candidates.length) {
        data.phone = String(item.phone).replace(/\D/g, '');
        data.access_level = data.access_level || 'cliente';
        const id = Number(item.id);
        if (Number.isInteger(id) && id > 0 && !takenIds.has(id)) { data.id = id; takenIds.add(id); }
        const createdAt = parseDate(item.created_at);
        if (createdAt) data.created_at = createdAt;
        const created = dryRun ? { ...data, full_name: data.full_name ?? null } : await prisma.users.create({ data: data as any });
        index(created);
        stats.criados++;
        continue;
      }

      const target = candidates.find(u => sameName(u, data));
      if (!target) { stats.outroNome++; continue; }

      const patch: Record<string, any> = {};
      for (const f of FILLABLE) if (empty(target[f]) && !empty(data[f])) patch[f] = data[f];
      if (patch.cnpj && data.person_type === 'juridica') patch.person_type = 'juridica';
      const extra = parseExtra(target.extra);
      let extraChanged = false;
      for (const [k, v] of Object.entries(parseExtra(data.extra))) {
        if (!(k in extra) || (empty(extra[k]) && !empty(v))) { extra[k] = v; extraChanged = true; }
      }
      if (extraChanged) patch.extra = JSON.stringify(extra);

      const filled = Object.keys(patch).length;
      if (!filled) { stats.semMudanca++; continue; }
      Object.assign(target, dryRun ? patch : await prisma.users.update({ where: { id: target.id }, data: patch }));
      stats.enriquecidos++;
      stats.camposPreenchidos += filled;
    }
  }

  if (!dryRun) {
    // Todo usuário termina com nome completo: sem outra fonte, usa o próprio nome de contato
    const filledFromName = await prisma.$executeRawUnsafe(
      "UPDATE users SET full_name = name WHERE full_name IS NULL OR TRIM(full_name) = ''"
    );
    console.log('full_name preenchido com o nome de contato:', filledFromName);
  }

  console.log(dryRun ? '[simulação]' : 'Concluído', stats);
  console.log('Total de usuários:', dryRun ? dbUsers.length + stats.criados : await prisma.users.count());
}

main()
  .catch(err => {
    console.error('Falha ao importar usuários:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
