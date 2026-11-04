/**
 * Conversões entre as linhas do banco (Prisma/MySQL, espelho do dump MariaDB)
 * e os formatos usados pelo frontend (BackendUser / BackendPedido / BackendLocal).
 * Campos do app sem coluna correspondente ficam no JSON da coluna `extra`.
 */

type Json = Record<string, any>;

export function parseExtra(raw: string | null | undefined): Json {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stringifyExtra(extra: Json): string | null {
  const clean: Json = {};
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) clean[key] = value;
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

const iso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  try {
    const d = new Date(value as any);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
  } catch {
    return null;
  }
};

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '';

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function toInt(value: unknown): number | null {
  if (!hasValue(value)) return null;
  const n = Number(String(value).replace(/\D/g, ''));
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'sim';
}

function toDate(value: unknown): Date | null {
  if (!hasValue(value)) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function toStr(value: unknown): string | null {
  if (!hasValue(value)) return null;
  return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function todaySaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

const USER_COLUMN_KEYS = new Set([
  'id', 'name', 'phone', 'password', 'access_level', 'created_at', 'updated_at', 'city', 'cpf',
  'full_name', 'photo', 'cnpj', 'person_type', 'extra'
]);

// Chaves do app que viram colunas (ou são derivadas) e não devem ir para `extra`
const USER_DERIVED_KEYS = new Set([
  ...USER_COLUMN_KEYS, 'cidade', 'name_completo', 'foto', 'avatarUrl', 'token', 'pedidos_count',
  'order_count', 'orderCount', 'caller_role', 'userRole', 'user_role'
]);

export function userToBackend(row: any, orderCount = 0): Json {
  const extra = parseExtra(row.extra);
  const fullName = row.full_name || extra.name_completo || row.name;
  return {
    ...extra,
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    access_level: row.access_level,
    full_name: fullName,
    name_completo: fullName,
    cpf: row.cpf || undefined,
    cnpj: row.cnpj || undefined,
    person_type: row.person_type,
    city: row.city || undefined,
    cidade: row.city || extra.cidade || undefined,
    foto: row.photo || undefined,
    avatarUrl: row.photo || undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    pedidos_count: orderCount,
    order_count: orderCount,
    orderCount
  };
}

export function userFromBackend(body: Json, current?: any): Json {
  const data: Json = {};
  if (hasValue(body.name)) data.name = String(body.name).trim();
  const phone = hasValue(body.phone) ? String(body.phone).replace(/\D/g, '') : '';
  if (phone) data.phone = phone;
  if (hasValue(body.access_level)) data.access_level = String(body.access_level).toLowerCase();
  const city = body.city ?? body.cidade;
  if (city !== undefined) data.city = toStr(city);
  if (body.cpf !== undefined) data.cpf = toStr(body.cpf);
  if (body.cnpj !== undefined) data.cnpj = toStr(body.cnpj);
  if (hasValue(body.person_type)) data.person_type = String(body.person_type);
  const fullName = body.full_name ?? body.name_completo;
  if (fullName !== undefined) data.full_name = toStr(fullName);
  const photo = body.foto ?? body.avatarUrl ?? body.photo;
  if (photo !== undefined) data.photo = toStr(photo);

  const extra = parseExtra(current?.extra);
  for (const [key, value] of Object.entries(body)) {
    if (USER_DERIVED_KEYS.has(key)) continue;
    extra[key] = value;
  }
  data.extra = stringifyExtra(extra);
  return data;
}

// ---------------------------------------------------------------------------
// Locais (tabela `locations`)
// ---------------------------------------------------------------------------

export function localToBackend(row: any): Json {
  const extra = parseExtra(row.extra);
  const lat = row.lat ?? undefined;
  const lng = row.lng ?? undefined;
  return {
    ...extra,
    id: row.id,
    name: row.name,
    endereco: row.address || undefined,
    cidade: row.city || undefined,
    estado: row.state || undefined,
    cep: row.zip || undefined,
    rua: row.street || undefined,
    setor: row.district || undefined,
    numero: row.number || undefined,
    lat,
    lng,
    telefone: row.phone || undefined,
    site: row.website || undefined,
    place_id: row.place_id || undefined,
    icon: row.icon || undefined,
    color: row.icon_color || undefined,
    link: row.link_maps || undefined,
    status: row.status,
    central_coletas: row.is_collection_hub ? 1 : 0,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at)
  };
}

const LOCAL_DERIVED_KEYS = new Set([
  'id', 'name', 'endereco', 'address', 'cidade', 'city', 'estado', 'state', 'cep', 'zip', 'rua', 'street',
  'setor', 'district', 'numero', 'number', 'lat', 'lng', 'telefone', 'phone', 'site', 'website', 'place_id',
  'icon', 'color', 'icon_color', 'link', 'link_maps', 'status', 'central_coletas', 'is_collection_hub',
  'created_at', 'updated_at', 'extra'
]);

export function localFromBackend(body: Json, current?: any): Json {
  const data: Json = {};
  const set = (column: string, value: unknown, transform: (v: unknown) => any = toStr) => {
    if (value !== undefined) data[column] = transform(value);
  };
  set('name', body.name, v => (hasValue(v) ? String(v) : null));
  set('address', body.endereco ?? body.address);
  set('city', body.cidade ?? body.city);
  set('state', body.estado ?? body.state);
  set('zip', body.cep ?? body.zip);
  set('street', body.rua ?? body.street);
  set('district', body.setor ?? body.district);
  set('number', body.numero ?? body.number);
  set('phone', body.telefone ?? body.phone);
  set('website', body.site ?? body.website);
  set('place_id', body.place_id);
  set('icon', body.icon);
  set('icon_color', body.color ?? body.icon_color);
  set('link_maps', body.link ?? body.link_maps);
  if (body.status !== undefined) data.status = String(body.status || 'active');
  if (body.lat !== undefined) data.lat = hasValue(body.lat) ? toNumber(body.lat, NaN) : null;
  if (body.lng !== undefined) data.lng = hasValue(body.lng) ? toNumber(body.lng, NaN) : null;
  if (Number.isNaN(data.lat)) data.lat = null;
  if (Number.isNaN(data.lng)) data.lng = null;
  const hub = body.central_coletas ?? body.is_collection_hub;
  if (hub !== undefined) data.is_collection_hub = toBool(hub);

  const extra = parseExtra(current?.extra);
  for (const [key, value] of Object.entries(body)) {
    if (LOCAL_DERIVED_KEYS.has(key)) continue;
    extra[key] = value;
  }
  data.extra = stringifyExtra(extra);
  return data;
}

// ---------------------------------------------------------------------------
// Pedidos (tabela `orders`)
// ---------------------------------------------------------------------------

const ETAPA_TO_STAGE: Record<string, string> = {
  pendente: 'novo',
  aprovado: 'aprovado',
  coletando: 'a_caminho_da_coleta',
  coletado: 'coletado',
  trocando: 'troca',
  trocado: 'troca',
  retornando: 'em_transito',
  entregando: 'a_caminho_da_entrega',
  entregue: 'entregue',
  finalizado: 'finalizado',
  cancelado: 'cancelado'
};

const STAGE_TO_ETAPA: Record<string, string> = {
  novo: 'pendente',
  aprovado: 'aprovado',
  a_caminho_da_coleta: 'coletando',
  aguardando_carregamento: 'coletado',
  em_transito: 'entregando',
  no_deposito: 'coletado',
  a_caminho_da_entrega: 'entregando',
  coletado: 'coletado',
  troca: 'trocado',
  entregue: 'entregue',
  finalizado: 'finalizado',
  cancelado: 'cancelado'
};

const TIPO_TO_ORDER_TYPE: Record<string, string> = { coleta: 'coleta', entrega: 'entrega', troca: 'coleta_entrega' };
const ORDER_TYPE_TO_TIPO: Record<string, string> = { coleta: 'coleta', entrega: 'entrega', coleta_entrega: 'troca', deposito: 'entrega' };

const VEHICLE_TO_DB: Record<string, string> = { moto: 'moto', carro: 'carro', utilitario: 'pick_up', pick_up: 'pick_up', van: 'van', caminhao: 'caminhao' };
const DB_TO_VEHICLE: Record<string, string> = { moto: 'moto', carro: 'carro', pick_up: 'utilitario', van: 'utilitario', caminhao: 'utilitario' };

const PAYMENT_TO_DB: Record<string, string> = { pago: 'pago', pendente: 'nao_pago', estornado: 'nao_pago', nao_pago: 'nao_pago' };
const DB_TO_PAYMENT: Record<string, string> = { pago: 'pago', nao_pago: 'pendente' };

export function normalizeEtapa(value: unknown): string {
  const etapa = String(value || '').toLowerCase().trim();
  return etapa in ETAPA_TO_STAGE ? etapa : 'pendente';
}

export function etapaToStage(etapa: unknown): string {
  return ETAPA_TO_STAGE[normalizeEtapa(etapa)];
}

type FieldKind = 's' | 'n' | 'i' | 'b' | 'd';

// [chave do app, coluna, tipo]
const ORDER_FIELDS: Array<[string, string, FieldKind]> = [
  ['cliente', 'client_name', 's'],
  ['phone', 'contact_phone', 's'],
  ['detalhes', 'notes', 's'],
  ['clientes_id', 'client_id', 'i'],
  ['users_id', 'creator_id', 'i'],
  ['locais_id', 'origin_location_id', 'i'],
  ['coleta_locais_id', 'pickup_location_id', 'i'],
  ['entrega_locais_id', 'delivery_location_id', 'i'],
  ['coleta_nome', 'orig_name', 's'],
  ['coleta_data', 'orig_date', 's'],
  ['coleta_obs', 'orig_notes', 's'],
  ['coleta_prioridade', 'orig_priority', 's'],
  ['coleta_contato', 'orig_contact', 's'],
  ['coleta_phone', 'orig_phone', 's'],
  ['coleta_cidade', 'orig_city', 's'],
  ['coleta_motoristas', 'orig_drivers', 's'],
  ['coleta_foto', 'orig_foto_path', 's'],
  ['coleta_valor', 'orig_value', 'n'],
  ['coleta_user_id', 'collector_id', 'i'],
  ['coleta_saida_at', 'collected_at', 'd'],
  ['entrega_nome', 'dest_name', 's'],
  ['entrega_data', 'dest_date', 's'],
  ['entrega_obs', 'dest_notes', 's'],
  ['entrega_prioridade', 'dest_priority', 's'],
  ['entrega_contato', 'dest_contact', 's'],
  ['entrega_phone', 'dest_phone', 's'],
  ['entrega_cidade', 'dest_city', 's'],
  ['entrega_motoristas', 'dest_drivers', 's'],
  ['entrega_foto', 'dest_foto_path', 's'],
  ['entrega_valor', 'dest_value', 'n'],
  ['valor_intercidade', 'intercity_value', 'n'],
  ['entrega_saida_at', 'delivered_at', 'd'],
  ['mercadoria_nome', 'item_name', 's'],
  ['mercadoria_altura', 'item_height', 's'],
  ['mercadoria_largura', 'item_width', 's'],
  ['mercadoria_comprimento', 'item_length', 's'],
  ['mercadoria_peso', 'item_weight', 's'],
  ['mercadoria_fragil', 'item_fragile', 'b'],
  ['mercadoria_cobra_por_volume', 'item_charge_by_volume', 'b'],
  ['mercadoria_valor_volume', 'item_volume_rate', 'n'],
  ['mercadoria_quantidade', 'item_qty', 'n'],
  ['mercadoria_foto', 'item_foto_path', 's'],
  ['mercadoria_id', 'merchandise_id', 'i'],
  ['valor', 'base_value', 'n'],
  ['desconto', 'discount', 'n'],
  ['total', 'total', 'n'],
  ['itens_extras', 'extra_items', 's'],
  ['pago_em', 'paid_at', 'd'],
  ['forma_pagamento', 'payment_method', 's'],
  ['comprovante', 'receipt_path', 's'],
  ['recebedor_id', 'payment_receiver_id', 'i'],
  ['recebedor_nome', 'payment_receiver_name', 's'],
  ['aprovado_em', 'approved_at', 'd'],
  ['aprovador_id', 'approver_id', 'i'],
  ['carregamento_inicio_at', 'loading_at', 'd'],
  ['carregamento_fim_at', 'loading_end_at', 'd'],
  ['deposito_inicio_at', 'deposit_start_at', 'd'],
  ['deposito_fim_at', 'deposit_end_at', 'd'],
  ['finalizado_em', 'finalized_at', 'd'],
  ['cancelado_em', 'cancelled_at', 'd'],
  ['motorista_cancel_motivo', 'driver_cancel_reason', 's'],
  ['motorista_cancel_em', 'driver_cancel_at', 'd'],
  ['motorista_cancel_user_id', 'driver_cancel_user_id', 'i'],
  ['public_tracking_token', 'public_tracking_token', 's']
];

// Aliases do app que apontam para a mesma coluna (somente na leitura)
const ORDER_READ_ALIASES: Array<[string, string]> = [
  ['cliente_id', 'clientes_id'],
  ['coleta_local', 'coleta_nome'],
  ['entrega_local', 'entrega_nome'],
  ['entrega_at', 'entrega_saida_at']
];

const ORDER_KNOWN_KEYS = new Set<string>([
  'id', 'data', 'etapa', 'tipo_encomenda', 'tipo_veiculo', 'status_pagamento', 'created_at', 'updated_at',
  'token', 'caller_role', 'userRole', 'user_role', 'pedido_id',
  'observations', 'notes', 'pickupNotes', 'deliveryNotes', 'exchangeNotes',
  'orig_notes', 'dest_notes', 'coleta_observacoes', 'coleta_observacao', 'obs_coleta',
  'entrega_observacoes', 'entrega_observacao', 'obs_entrega',
  ...ORDER_FIELDS.map(([key]) => key),
  ...ORDER_READ_ALIASES.map(([key]) => key),
  'cliente_id'
]);

function readField(value: unknown, kind: FieldKind): unknown {
  if (value === null || value === undefined) return undefined;
  if (kind === 'd') return iso(value as Date);
  if (kind === 'b') return value ? 1 : 0;
  return value;
}

export function pedidoToBackend(row: any, locations?: Map<number, any>): Json {
  const extra = parseExtra(row.extra);
  const app = (extra.__app || {}) as Json;
  const out: Json = { ...extra };
  delete out.__app;

  for (const [key, column, kind] of ORDER_FIELDS) {
    const value = readField(row[column], kind);
    if (value !== undefined) out[key] = value;
  }

  out.id = row.id;
  out.data = row.date;
  out.created_at = iso(row.created_at);
  out.updated_at = iso(row.updated_at);

  out.etapa = app.etapa && etapaToStage(app.etapa) === row.stage ? app.etapa : (STAGE_TO_ETAPA[row.stage] || 'pendente');
  out.tipo_encomenda = app.tipo_encomenda && TIPO_TO_ORDER_TYPE[app.tipo_encomenda] === row.order_type
    ? app.tipo_encomenda
    : (ORDER_TYPE_TO_TIPO[row.order_type] || 'entrega');
  out.tipo_veiculo = app.tipo_veiculo && VEHICLE_TO_DB[app.tipo_veiculo] === row.vehicle_type
    ? app.tipo_veiculo
    : (DB_TO_VEHICLE[row.vehicle_type] || 'moto');
  out.status_pagamento = app.status_pagamento && PAYMENT_TO_DB[app.status_pagamento] === row.payment_status
    ? app.status_pagamento
    : (DB_TO_PAYMENT[row.payment_status] || 'pendente');

  for (const [alias, source] of ORDER_READ_ALIASES) {
    if (out[alias] === undefined && out[source] !== undefined) out[alias] = out[source];
  }
  if (out.coleta_endereco === undefined && out.coleta_nome) out.coleta_endereco = out.coleta_nome;
  if (out.entrega_endereco === undefined && out.entrega_nome) out.entrega_endereco = out.entrega_nome;
  if (!out.cidade) out.cidade = out.coleta_cidade || out.entrega_cidade || undefined;
  if (!out.codigo && !out.orderCode) out.codigo = String(row.id);

  // Garante que todas as propriedades de observações/notas estejam sempre preenchidas
  out.coleta_obs = row.orig_notes ?? out.coleta_obs ?? extra.coleta_obs ?? extra.pickupNotes ?? '';
  out.pickupNotes = out.coleta_obs;
  out.entrega_obs = row.dest_notes ?? out.entrega_obs ?? extra.entrega_obs ?? extra.deliveryNotes ?? '';
  out.deliveryNotes = out.entrega_obs;
  out.detalhes = row.notes ?? out.detalhes ?? extra.detalhes ?? extra.observations ?? '';
  out.notes = out.detalhes;
  out.observations = out.detalhes;
  out.driverNotes = out.detalhes;
  out.troca_obs = extra.troca_obs ?? extra.exchangeNotes ?? out.troca_obs ?? '';
  out.exchangeNotes = out.troca_obs;

  if (locations) {
    const attach = (prefix: string, id: number | null | undefined) => {
      const loc = id ? locations.get(id) : null;
      if (!loc) return;
      out[`${prefix}_name`] = loc.name;
      out[`${prefix}_cidade`] = loc.city || undefined;
      out[`${prefix}_lat`] = loc.lat ?? undefined;
      out[`${prefix}_lng`] = loc.lng ?? undefined;
    };
    attach('locais', row.origin_location_id);
    attach('coleta_locais', row.pickup_location_id);
    attach('entrega_locais', row.delivery_location_id);
    const pickup = row.pickup_location_id ? locations.get(row.pickup_location_id) : null;
    const delivery = row.delivery_location_id ? locations.get(row.delivery_location_id) : null;
    if (pickup && out.coleta_lat === undefined && pickup.lat != null) { out.coleta_lat = pickup.lat; out.coleta_lng = pickup.lng; }
    if (delivery && out.entrega_lat === undefined && delivery.lat != null) { out.entrega_lat = delivery.lat; out.entrega_lng = delivery.lng; }
  }
  return out;
}

export function pedidoLocationIds(rows: any[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    for (const id of [row.origin_location_id, row.pickup_location_id, row.delivery_location_id]) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** Converte o corpo do app em colunas da tabela `orders` (+ `extra`). */
export function pedidoFromBackend(body: Json, current?: any): Json {
  const payload: Json = { ...body };
  const data: Json = {};
  const extra = parseExtra(current?.extra);
  const app: Json = { ...(extra.__app || {}) };

  // Normaliza aliases de observações e notas de coleta, entrega e gerais para persistência garantida no banco
  if (payload.coleta_obs === undefined || payload.coleta_obs === '') {
    const v = payload.pickupNotes ?? payload.orig_notes ?? payload.coleta_observacoes ?? payload.coleta_observacao ?? payload.obs_coleta;
    if (v !== undefined) payload.coleta_obs = v;
  }
  if (payload.entrega_obs === undefined || payload.entrega_obs === '') {
    const v = payload.deliveryNotes ?? payload.dest_notes ?? payload.entrega_observacoes ?? payload.entrega_observacao ?? payload.obs_entrega;
    if (v !== undefined) payload.entrega_obs = v;
  }
  if (payload.troca_obs === undefined || payload.troca_obs === '') {
    const v = payload.exchangeNotes ?? payload.troca_observacoes ?? payload.troca_observacao ?? payload.obs_troca;
    if (v !== undefined) payload.troca_obs = v;
  }
  if (payload.detalhes === undefined || payload.detalhes === '') {
    const v = payload.observations ?? payload.notes ?? payload.observacoes ?? payload.observacao ?? payload.driverNotes;
    if (v !== undefined) payload.detalhes = v;
  }

  for (const [key, column, kind] of ORDER_FIELDS) {
    let value = payload[key];
    if (key === 'clientes_id' && value === undefined) value = payload.cliente_id;
    if (value === undefined) continue;
    switch (kind) {
      case 's': data[column] = toStr(value); break;
      case 'n': data[column] = toNumber(value); break;
      case 'i': data[column] = toInt(value); break;
      case 'b': data[column] = toBool(value); break;
      case 'd': data[column] = toDate(value); break;
    }
  }
  // Colunas NOT NULL não aceitam null
  if ('client_name' in data && !data.client_name) data.client_name = '';
  if ('contact_phone' in data && !data.contact_phone) data.contact_phone = '';
  for (const column of ['orig_priority', 'dest_priority']) {
    if (column in data && !data[column]) data[column] = 'media';
  }
  for (const column of ['orig_value', 'dest_value', 'intercity_value', 'item_volume_rate', 'base_value', 'discount', 'total']) {
    if (column in data && data[column] === null) data[column] = 0;
  }
  if ('item_qty' in data && !data.item_qty) data.item_qty = 1;

  if (payload.data !== undefined && hasValue(payload.data)) data.date = String(payload.data).slice(0, 10);
  if (payload.etapa !== undefined && String(payload.etapa).toLowerCase().trim() in ETAPA_TO_STAGE) {
    app.etapa = normalizeEtapa(payload.etapa);
    data.stage = etapaToStage(payload.etapa);
  }
  if (payload.tipo_encomenda !== undefined && String(payload.tipo_encomenda).toLowerCase() in TIPO_TO_ORDER_TYPE) {
    const tipo = String(payload.tipo_encomenda).toLowerCase();
    app.tipo_encomenda = tipo;
    data.order_type = TIPO_TO_ORDER_TYPE[tipo] || 'entrega';
  }
  if (payload.tipo_veiculo !== undefined) {
    const veiculo = String(payload.tipo_veiculo).toLowerCase();
    app.tipo_veiculo = veiculo;
    data.vehicle_type = VEHICLE_TO_DB[veiculo] || 'moto';
  }
  if (payload.status_pagamento !== undefined) {
    const status = String(payload.status_pagamento).toLowerCase();
    app.status_pagamento = status;
    data.payment_status = PAYMENT_TO_DB[status] || 'nao_pago';
  }

  for (const [key, value] of Object.entries(payload)) {
    if (ORDER_KNOWN_KEYS.has(key)) continue;
    extra[key] = value;
  }
  extra.__app = app;
  data.extra = stringifyExtra(extra);
  if (data.public_tracking_token === null) delete data.public_tracking_token;
  return data;
}

export function cleanPedidoId(rawId: unknown): string {
  if (!hasValue(rawId)) return '';
  return String(rawId).trim().replace(/^pedido-/, '').replace(/-(coleta|entrega|troca|retorno)$/, '').trim();
}

export { toInt, toNumber, toStr, hasValue, toDate, toBool, iso };
