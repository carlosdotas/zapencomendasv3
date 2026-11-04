import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = __dirname.endsWith('backend') ? __dirname : path.resolve(__dirname, 'backend');
const DATA_DIR = path.resolve(BACKEND_DIR, 'database');
const STORE_FILE = path.resolve(DATA_DIR, 'local-store.json');
const USERS_LEGACY_FILE = path.resolve(DATA_DIR, 'importedUsers.legacy.json');
const PEDIDOS_BACKUP_FILE = path.resolve(DATA_DIR, 'backup-pedidos-fantasma-1793695267771.json');

const DEFAULT_CITIES = [
  { id: 1, city: 'Anápolis', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 2, city: 'Goiânia', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 3, city: 'Nerópolis', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 4, city: 'Silvânia', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 5, city: 'Vianópolis', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 6, city: 'Leopoldo de Bulhões', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 7, city: 'Gameleira de Goiás', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 8, city: 'Bonfinópolis', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') },
  { id: 9, city: 'São Miguel do Passa Quatro', state: 'GO', is_active: 1, created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') }
];

const DEFAULT_SETTINGS = [
  {
    id: 1,
    key: 'global_config',
    value: JSON.stringify({
      appName: 'EncomendasZap',
      defaultCity: 'Anápolis',
      trackingIntervalSeconds: 15,
      operational_hours: '07:00 - 19:00'
    }),
    created_at: new Date(),
    updated_at: new Date()
  }
];

const DEFAULT_COMPANY = [
  {
    id: 1,
    name: 'EncomendasZap Logística',
    phone: '62998552710',
    orders_city_price_rules: '[]',
    created_at: new Date(),
    updated_at: new Date()
  }
];

export class LocalDbStore {
  private tables = new Map<string, any[]>();
  private maxIds = new Map<string, number>();
  private persistTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // 1. Tenta carregar local-store.json persistido
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const [table, rows] of Object.entries(parsed)) {
          if (Array.isArray(rows)) {
            this.tables.set(table, rows);
            this.updateMaxId(table, rows);
          }
        }
      }

      // 2. Garante tabelas essenciais
      if (!this.tables.has('config_cities')) {
        this.tables.set('config_cities', [...DEFAULT_CITIES]);
        this.updateMaxId('config_cities', DEFAULT_CITIES);
      }
      if (!this.tables.has('app_settings')) {
        this.tables.set('app_settings', [...DEFAULT_SETTINGS]);
        this.updateMaxId('app_settings', DEFAULT_SETTINGS);
      }
      if (!this.tables.has('company')) {
        this.tables.set('company', [...DEFAULT_COMPANY]);
        this.updateMaxId('company', DEFAULT_COMPANY);
      }

      // 3. Usuários a partir de importedUsers.legacy.json se a tabela estiver vazia
      if (!this.tables.has('users')) {
        const seededUsers = this.seedUsersFromLegacy();
        this.tables.set('users', seededUsers);
        this.updateMaxId('users', seededUsers);
      }

      // 4. Pedidos a partir de backup se tabela estiver vazia
      if (!this.tables.has('orders')) {
        const seededOrders = this.seedOrdersFromBackup();
        this.tables.set('orders', seededOrders);
        this.updateMaxId('orders', seededOrders);
      }

      // 5. Inicializa tabelas vazias padrão se ausentes
      for (const t of ['locais', 'locations', 'user_sessions', 'assignments', 'order_logs', 'caixa_lancamentos', 'bills', 'merchandises', 'driver_tracking', 'driver_earnings', 'transportadoras', 'drivers']) {
        if (!this.tables.has(t)) {
          this.tables.set(t, []);
          this.maxIds.set(t, 0);
        }
      }
    } catch (err) {
      console.warn('[LocalDbStore] Falha ao carregar loja local:', err);
    }
  }

  private updateMaxId(table: string, rows: any[]) {
    let max = 0;
    for (const r of rows) {
      const id = typeof r.id === 'number' ? r.id : parseInt(String(r.id), 10);
      if (!Number.isNaN(id) && id > max) max = id;
    }
    this.maxIds.set(table, max);
  }

  private seedUsersFromLegacy(): any[] {
    if (!fs.existsSync(USERS_LEGACY_FILE)) return [];
    try {
      const content = fs.readFileSync(USERS_LEGACY_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (!Array.isArray(list)) return [];
      return list.map((u: any, idx: number) => ({
        id: typeof u.id === 'number' ? u.id : parseInt(String(u.id), 10) || (idx + 1),
        name: String(u.name || u.name_completo || 'Sem nome'),
        phone: u.phone ? String(u.phone).replace(/\D/g, '') : null,
        password: u.password || null,
        access_level: String(u.access_level || 'cliente').toLowerCase(),
        city: u.cidade || u.city || null,
        cpf: u.cpf || null,
        full_name: u.name_completo || u.full_name || null,
        photo: u.foto || u.photo || null,
        cnpj: u.cnpj || null,
        person_type: u.person_type || 'fisica',
        extra: null,
        token: u.token || null,
        created_at: u.created_at ? new Date(u.created_at) : new Date(),
        updated_at: u.updated_at ? new Date(u.updated_at) : new Date()
      }));
    } catch {
      return [];
    }
  }

  private seedOrdersFromBackup(): any[] {
    if (!fs.existsSync(PEDIDOS_BACKUP_FILE)) return [];
    try {
      const content = fs.readFileSync(PEDIDOS_BACKUP_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (!Array.isArray(list)) return [];
      return list.map((o: any, idx: number) => ({
        ...o,
        id: typeof o.id === 'number' ? o.id : parseInt(String(o.id), 10) || (idx + 1),
        created_at: o.created_at ? new Date(o.created_at) : new Date(),
        updated_at: o.updated_at ? new Date(o.updated_at) : new Date()
      }));
    } catch {
      return [];
    }
  }

  private getTable(table: string): any[] {
    let list = this.tables.get(table);
    if (!list) {
      list = [];
      this.tables.set(table, list);
      this.maxIds.set(table, 0);
    }
    return list;
  }

  private writeStore() {
    const obj: Record<string, any[]> = {};
    for (const [table, rows] of this.tables.entries()) {
      // Não precisa persistir logs de rastreamento efêmeros em massa
      if (table === 'driver_tracking' && rows.length > 500) {
        obj[table] = rows.slice(-500);
      } else {
        obj[table] = rows;
      }
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        this.writeStore();
      } catch (err) {
        console.warn('[LocalDbStore] Falha ao persistir loja local:', err);
      }
    }, 100);
  }

  private persistImmediately() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.writeStore();
  }

  private matchCondition(val: any, cond: any): boolean {
    if (cond === undefined) return true;
    if (cond === null) return val === null || val === undefined;
    if (typeof cond !== 'object' || cond instanceof Date) {
      if (val instanceof Date && cond instanceof Date) return val.getTime() === cond.getTime();
      return String(val ?? '') === String(cond);
    }

    // Operadores do Prisma
    if ('in' in cond && Array.isArray(cond.in)) {
      const set = cond.in.map((x: any) => String(x));
      return set.includes(String(val ?? ''));
    }
    if ('notIn' in cond && Array.isArray(cond.notIn)) {
      const set = cond.notIn.map((x: any) => String(x));
      return !set.includes(String(val ?? ''));
    }
    if ('not' in cond) {
      return !this.matchCondition(val, cond.not);
    }
    if ('contains' in cond) {
      const haystack = String(val ?? '').toLowerCase();
      const needle = String(cond.contains ?? '').toLowerCase();
      return haystack.includes(needle);
    }
    if ('startsWith' in cond) {
      return String(val ?? '').toLowerCase().startsWith(String(cond.startsWith ?? '').toLowerCase());
    }
    if ('endsWith' in cond) {
      return String(val ?? '').toLowerCase().endsWith(String(cond.endsWith ?? '').toLowerCase());
    }
    if ('equals' in cond) {
      return String(val ?? '') === String(cond.equals ?? '');
    }
    if ('gte' in cond && cond.gte !== undefined) {
      return (val ?? '') >= cond.gte;
    }
    if ('lte' in cond && cond.lte !== undefined) {
      return (val ?? '') <= cond.lte;
    }
    if ('gt' in cond && cond.gt !== undefined) {
      return (val ?? '') > cond.gt;
    }
    if ('lt' in cond && cond.lt !== undefined) {
      return (val ?? '') < cond.lt;
    }

    return true;
  }

  private matchWhere(row: any, where?: any): boolean {
    if (!where || typeof where !== 'object') return true;

    if (Array.isArray(where.AND)) {
      if (!where.AND.every((w: any) => this.matchWhere(row, w))) return false;
    }
    if (Array.isArray(where.OR)) {
      if (!where.OR.some((w: any) => this.matchWhere(row, w))) return false;
    }
    if (where.NOT) {
      if (Array.isArray(where.NOT)) {
        if (where.NOT.some((w: any) => this.matchWhere(row, w))) return false;
      } else if (this.matchWhere(row, where.NOT)) {
        return false;
      }
    }

    for (const [key, cond] of Object.entries(where)) {
      if (key === 'AND' || key === 'OR' || key === 'NOT') continue;
      if (!this.matchCondition(row[key], cond)) return false;
    }

    return true;
  }

  private projectRow(table: string, row: any, select?: any, include?: any): any {
    if (!row) return null;
    let res = { ...row };

    // Tratamento especial de include
    if (include && typeof include === 'object') {
      if (table === 'user_sessions' && include.user) {
        const users = this.getTable('users');
        res.user = users.find(u => u.id === row.user_id) || null;
      }
    }

    if (select && typeof select === 'object') {
      const projected: any = {};
      for (const [k, v] of Object.entries(select)) {
        if (v) projected[k] = res[k];
      }
      return projected;
    }

    return res;
  }

  public async execute(table: string, method: string, args: any[]): Promise<any> {
    const list = this.getTable(table);
    const params = args[0] || {};

    switch (method) {
      case 'findMany': {
        const { where, orderBy, select, include, skip, take } = params;
        let matched = list.filter(r => this.matchWhere(r, where));

        if (orderBy) {
          const entries = Object.entries(orderBy);
          if (entries.length > 0) {
            const [field, dir] = entries[0];
            const isDesc = String(dir).toLowerCase() === 'desc';
            matched.sort((a, b) => {
              const va = a[field] ?? '';
              const vb = b[field] ?? '';
              if (va < vb) return isDesc ? 1 : -1;
              if (va > vb) return isDesc ? -1 : 1;
              return 0;
            });
          }
        }

        const start = typeof skip === 'number' ? Math.max(0, skip) : 0;
        const end = typeof take === 'number' ? start + Math.max(0, take) : undefined;
        const sliced = matched.slice(start, end);

        return sliced.map(r => this.projectRow(table, r, select, include));
      }

      case 'findUnique':
      case 'findFirst': {
        const { where, select, include } = params;
        let found = list.find(r => this.matchWhere(r, where));

        // Auxílio para user_sessions: se não encontrar pelo token na tabela, busca se algum usuário possui esse token
        if (!found && table === 'user_sessions' && where?.token) {
          const users = this.getTable('users');
          const u = users.find(user => user.token === where.token);
          if (u) {
            found = {
              id: (this.maxIds.get('user_sessions') || 0) + 1,
              user_id: u.id,
              token: where.token,
              device_id: 'web',
              source: 'web',
              type: u.access_level,
              is_logged: true,
              created_at: new Date(),
              updated_at: new Date()
            };
            list.push(found);
            this.maxIds.set('user_sessions', found.id);
            this.schedulePersist();
          }
        }

        return this.projectRow(table, found, select, include);
      }

      case 'count': {
        const { where } = params;
        if (!where) return list.length;
        return list.filter(r => this.matchWhere(r, where)).length;
      }

      case 'groupBy': {
        const { by, _count, where } = params;
        const byFields = Array.isArray(by) ? by : [by];
        const matched = list.filter(r => this.matchWhere(r, where));
        const groups = new Map<string, { group: any; count: number }>();

        for (const row of matched) {
          const keyObj: any = {};
          for (const f of byFields) keyObj[f] = row[f] ?? null;
          const k = JSON.stringify(keyObj);
          const curr = groups.get(k) || { group: keyObj, count: 0 };
          curr.count++;
          groups.set(k, curr);
        }

        return Array.from(groups.values()).map(g => ({
          ...g.group,
          _count: _count?._all ? { _all: g.count } : g.count
        }));
      }

      case 'create': {
        const { data, select, include } = params;
        const curMax = this.maxIds.get(table) || 0;
        const newId = typeof data.id === 'number' ? data.id : (curMax + 1);
        if (newId > curMax) this.maxIds.set(table, newId);

        const record = {
          ...data,
          id: newId,
          created_at: data.created_at || new Date(),
          updated_at: data.updated_at || new Date()
        };
        list.push(record);
        this.schedulePersist();
        return this.projectRow(table, record, select, include);
      }

      case 'createMany': {
        const { data } = params;
        const items = Array.isArray(data) ? data : [data];
        let curMax = this.maxIds.get(table) || 0;
        for (const item of items) {
          const newId = typeof item.id === 'number' ? item.id : (++curMax);
          list.push({
            ...item,
            id: newId,
            created_at: item.created_at || new Date(),
            updated_at: item.updated_at || new Date()
          });
        }
        this.maxIds.set(table, curMax);
        this.schedulePersist();
        return { count: items.length };
      }

      case 'update': {
        const { where, data, select, include } = params;
        const idx = list.findIndex(r => this.matchWhere(r, where));
        if (idx === -1) {
          // Em caso de update não encontrado em fallback, cria para não quebrar fluxo
          return this.execute(table, 'create', [{ data: { ...where, ...data }, select, include }]);
        }
        list[idx] = {
          ...list[idx],
          ...data,
          updated_at: new Date()
        };
        this.schedulePersist();
        return this.projectRow(table, list[idx], select, include);
      }

      case 'updateMany': {
        const { where, data } = params;
        let count = 0;
        for (let i = 0; i < list.length; i++) {
          if (this.matchWhere(list[i], where)) {
            list[i] = { ...list[i], ...data, updated_at: new Date() };
            count++;
          }
        }
        if (count > 0) this.schedulePersist();
        return { count };
      }

      case 'upsert': {
        const { where, create, update, select, include } = params;
        const idx = list.findIndex(r => this.matchWhere(r, where));
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...update, updated_at: new Date() };
          this.schedulePersist();
          return this.projectRow(table, list[idx], select, include);
        } else {
          return this.execute(table, 'create', [{ data: { ...where, ...create }, select, include }]);
        }
      }

      case 'delete': {
        const { where } = params;
        const idx = list.findIndex(r => this.matchWhere(r, where));
        if (idx === -1) return null;
        const [removed] = list.splice(idx, 1);
        this.persistImmediately();
        return removed;
      }

      case 'deleteMany': {
        const { where } = params;
        const prevLen = list.length;
        const kept = list.filter(r => !this.matchWhere(r, where));
        this.tables.set(table, kept);
        const count = prevLen - kept.length;
        if (count > 0) this.persistImmediately();
        return { count };
      }

      default:
        console.warn(`[LocalDbStore] Método não suportado: ${table}.${method}`);
        return null;
    }
  }
}

export const fallbackStore = new LocalDbStore();
