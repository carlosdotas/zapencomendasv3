import type { CityPriceOperationRules, CityPriceRule, CityPriceTable, PricingVehicleType } from '../services/settingsService';

export interface PricingCity {
  id: string;
  name: string;
}

export interface TablePriceInput {
  table: CityPriceTable;
  cities: PricingCity[];
  originCity?: string;
  destinationCity?: string;
  vehicle: PricingVehicleType;
  distanceKm: number;
  volumes: number;
}

export interface TablePrices {
  coleta?: number;
  transporte?: number;
  entrega?: number;
}

export const normalizeCity = (value?: string | null): string =>
  String(value ?? '')
    .trim()
    .replace(/\s*[-,]\s*[a-z]{2}$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parse = (value: unknown): number => {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const plain = Number(text);
  if (Number.isFinite(plain)) return plain;
  const localized = Number(text.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(localized) ? localized : 0;
};

const round = (value: number) => Math.round(value * 100) / 100;

const findCityId = (cities: PricingCity[], name?: string): string | undefined => {
  const key = normalizeCity(name);
  return key ? cities.find(c => normalizeCity(c.name) === key)?.id : undefined;
};

const vehicleRule = (rules: CityPriceOperationRules | undefined, vehicle: PricingVehicleType): CityPriceRule | undefined =>
  rules?.vehicles?.[vehicle] ?? (vehicle === 'moto' ? rules?.coletaEntrega || rules?.coleta || rules?.entrega : undefined);

/** Valor de uma regra da tabela; 0 quando a regra não está configurada. */
export function ruleValue(rule: CityPriceRule | undefined, distanceKm: number, volumes: number): number {
  if (!rule) return 0;
  if (rule.mode === 'fixed') return round(parse(rule.fixedPrice));
  if (rule.mode === 'volume') return round(parse(rule.pricePerVolume) * Math.max(1, volumes));
  const perKm = parse(rule.pricePerKm);
  if (perKm <= 0) return 0;
  return round(Math.max(parse(rule.minimum), perKm * Math.max(0, distanceKm)));
}

export function transportPrice(table: CityPriceTable, originId: string, destinationId: string): number {
  const value =
    table.combinations?.[`${originId}>${destinationId}`]?.transport ??
    table.intercity?.[originId]?.[destinationId] ??
    table.combinations?.[`${destinationId}>${originId}`]?.transport ??
    table.intercity?.[destinationId]?.[originId];
  return round(parse(value));
}

/**
 * Preços da tabela por cidade para um pedido. Só devolve as partes configuradas na tabela.
 * Regra por km: coleta usa a distância da rota quando origem e destino são a mesma cidade;
 * a entrega (e qualquer trecho entre cidades) usa o valor mínimo para não cobrar o km duas vezes.
 */
export function calculateTablePrices(input: TablePriceInput): TablePrices {
  const { table, cities, vehicle, distanceKm, volumes } = input;
  const originId = findCityId(cities, input.originCity);
  const destinationId = findCityId(cities, input.destinationCity);
  const prices: TablePrices = {};
  const sameCity = Boolean(originId && originId === destinationId);

  if (originId) {
    const value = ruleValue(vehicleRule(table.local?.[originId], vehicle), sameCity ? distanceKm : 0, volumes);
    if (value > 0) prices.coleta = value;
  }
  if (destinationId) {
    const value = ruleValue(vehicleRule(table.local?.[destinationId], vehicle), 0, volumes);
    if (value > 0) prices.entrega = value;
  }
  if (originId && destinationId) {
    prices.transporte = sameCity ? 0 : transportPrice(table, originId, destinationId);
    if (!sameCity && !prices.transporte) delete prices.transporte;
  }
  return prices;
}
