/**
 * Importa o dump MariaDB (u195978639_dotas.sql) para o MySQL gerenciado pelo Prisma.
 * Uso: npm run db:import [caminho-do-dump]
 * Atenção: apaga os dados das tabelas importadas antes de inserir.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Prisma } from '@prisma/client';
import { prisma } from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DUMP_PATH = path.resolve(process.argv[2] || path.join(__dirname, 'database', 'u195978639_dotas.sql'));

// Ordem respeitando chaves estrangeiras
const IMPORT_ORDER = [
  'users', 'user_sessions', 'bills', 'caixa_lancamentos', 'company', 'config_cities',
  'driver_tracking', 'drivers', 'locais', 'locations', 'merchandises', 'order_logs', 'orders'
];

type Row = Record<string, unknown>;

export function parseColumns(sql: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const re = /CREATE TABLE `(\w+)` \(([\s\S]*?)\n\) ENGINE/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const cols: string[] = [];
    for (const line of m[2].split('\n')) {
      const c = line.match(/^\s+`(\w+)`\s/);
      if (c) cols.push(c[1]);
    }
    tables.set(m[1], cols);
  }
  return tables;
}

function unescapeChar(ch: string): string {
  switch (ch) {
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    case '0': return '\0';
    case 'b': return '\b';
    case 'Z': return '\x1a';
    default: return ch;
  }
}

// Lê os tuplas de um INSERT ... VALUES a partir de `pos`; devolve a posição final
function parseValues(sql: string, start: number, onRow: (values: unknown[]) => void): number {
  let i = start;
  const n = sql.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(sql[i])) i++;
    if (sql[i] === ';') return i + 1;
    if (sql[i] !== '(') throw new Error(`Esperava "(" na posição ${i}: ${sql.slice(i, i + 40)}`);
    i++;
    const values: unknown[] = [];
    while (true) {
      while (sql[i] === ' ') i++;
      const ch = sql[i];
      if (ch === "'") {
        i++;
        let out = '';
        while (i < n) {
          const c = sql[i];
          if (c === '\\') { out += unescapeChar(sql[i + 1]); i += 2; continue; }
          if (c === "'") {
            if (sql[i + 1] === "'") { out += "'"; i += 2; continue; }
            i++;
            break;
          }
          out += c;
          i++;
        }
        values.push(out);
      } else {
        let j = i;
        while (j < n && sql[j] !== ',' && sql[j] !== ')') j++;
        const token = sql.slice(i, j).trim();
        i = j;
        if (/^null$/i.test(token)) values.push(null);
        else if (/^0x[0-9a-f]+$/i.test(token)) values.push(Buffer.from(token.slice(2), 'hex').toString('utf8'));
        else values.push(Number(token));
      }
      if (sql[i] === ',') { i++; continue; }
      if (sql[i] === ')') { i++; break; }
      throw new Error(`Valor inválido na posição ${i}: ${sql.slice(i, i + 40)}`);
    }
    onRow(values);
  }
  return i;
}

export function parseInserts(sql: string, columns: Map<string, string[]>): Map<string, Row[]> {
  const data = new Map<string, Row[]>();
  const re = /INSERT INTO `(\w+)` VALUES\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1];
    const cols = columns.get(table);
    if (!cols) continue;
    const rows = data.get(table) || [];
    re.lastIndex = parseValues(sql, re.lastIndex, values => {
      const row: Row = {};
      cols.forEach((col, idx) => { row[col] = values[idx]; });
      rows.push(row);
    });
    data.set(table, rows);
  }
  return data;
}

function coerce(row: Row, model: Prisma.DMMF.Model): Row {
  const out: Row = {};
  for (const field of model.fields) {
    if (field.kind !== 'scalar' || !(field.name in row)) continue;
    let value = row[field.name];
    if (value === null || value === undefined) {
      if (field.isRequired && field.type === 'DateTime') value = new Date(0);
      else if (field.isRequired && field.type === 'String' && !field.hasDefaultValue) value = '';
      else { if (!field.isRequired) out[field.name] = null; continue; }
    }
    switch (field.type) {
      case 'DateTime': {
        if (value instanceof Date) { out[field.name] = value; break; }
        const d = new Date(String(value).replace(' ', 'T') + 'Z');
        out[field.name] = isNaN(d.getTime()) ? (field.isRequired ? new Date(0) : null) : d;
        break;
      }
      case 'Boolean': out[field.name] = Number(value) === 1 || value === true; break;
      case 'Int': out[field.name] = Math.trunc(Number(value)); break;
      case 'Float': out[field.name] = Number(value); break;
      default: {
        const s = String(value);
        out[field.name] = field.type === 'String' && /^0000-00-00/.test(s) ? null : s;
      }
    }
  }
  return out;
}

/** O Prisma (@updatedAt) sobrescreve updated_at na importação; restaura o original do dump e ajusta totais zerados. */
export async function fixOrders(rows: Row[]) {
  const toDate = (v: unknown) => (v ? new Date(String(v).replace(' ', 'T') + 'Z') : null);
  for (let i = 0; i < rows.length; i += 25) {
    await Promise.all(rows.slice(i, i + 25).map(row => {
      const updated = toDate(row.updated_at);
      if (!updated || isNaN(updated.getTime())) return Promise.resolve();
      return prisma.$executeRaw`UPDATE orders SET updated_at = ${updated} WHERE id = ${Number(row.id)}`;
    }));
  }
  await prisma.$executeRawUnsafe('UPDATE orders SET total = base_value WHERE total = 0 AND base_value > 0');
}

async function main() {
  if (!fs.existsSync(DUMP_PATH)) throw new Error(`Dump não encontrado: ${DUMP_PATH}`);
  const sql = fs.readFileSync(DUMP_PATH, 'utf8');
  const columns = parseColumns(sql);
  const data = parseInserts(sql, columns);
  const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name, model]));

  for (const table of [...IMPORT_ORDER].reverse()) {
    await (prisma as any)[table].deleteMany();
  }

  for (const table of IMPORT_ORDER) {
    const model = models.get(table);
    const rows = (data.get(table) || []).map(row => coerce(row, model!));
    let inserted = 0;
    let skipped = 0;
    const delegate = (prisma as any)[table];
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      try {
        await delegate.createMany({ data: chunk });
        inserted += chunk.length;
      } catch {
        for (const row of chunk) {
          try { await delegate.create({ data: row }); inserted++; } catch (err: any) {
            skipped++;
            console.warn(`  [${table}] linha ignorada (id=${row.id}): ${String(err.message).split('\n').pop()}`);
          }
        }
      }
    }
    console.log(`${table}: ${inserted} importadas${skipped ? `, ${skipped} ignoradas` : ''}`);
    if (table === 'orders') await fixOrders(data.get('orders') || []);
  }
}

if (process.argv[1] && /importSql\.ts$/.test(process.argv[1])) {
  main()
    .catch(err => { console.error(err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
