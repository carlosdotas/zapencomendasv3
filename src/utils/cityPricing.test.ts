import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTablePrices } from './cityPricing';

const cities = [
  { id: 'a', name: 'Goiânia' },
  { id: 'b', name: 'Anápolis' }
];
const rule = (mode: 'fixed' | 'km' | 'volume', v: Record<string, string>) =>
  ({ mode, fixedPrice: '', pricePerKm: '', pricePerVolume: '', minimum: '', ...v });
const table: any = {
  intercity: { a: { b: '30.00' } },
  local: {
    a: { vehicles: { moto: rule('fixed', { fixedPrice: '8.00' }), carro: rule('volume', { pricePerVolume: '5' }) } },
    b: { vehicles: { moto: rule('km', { pricePerKm: '2', minimum: '10' }) } }
  },
  combinations: {}
};
const base = { table, cities, vehicle: 'moto' as const, distanceKm: 3, volumes: 1 };

test('soma coleta, transporte entre cidades e entrega pela tabela', () => {
  const p = calculateTablePrices({ ...base, originCity: 'Goiânia - GO', destinationCity: 'Anápolis - GO' });
  assert.deepEqual(p, { coleta: 8, transporte: 30, entrega: 10 });
});

test('o transporte vale nos dois sentidos', () => {
  const p = calculateTablePrices({ ...base, originCity: 'Anápolis - GO', destinationCity: 'Goiânia - GO' });
  assert.equal(p.transporte, 30);
});

test('mesma cidade: sem transporte e km só na coleta', () => {
  const p = calculateTablePrices({ ...base, distanceKm: 12, originCity: 'Anápolis', destinationCity: 'Anápolis - GO' });
  assert.deepEqual(p, { coleta: 24, transporte: 0, entrega: 10 });
});

test('preço por volume multiplica pela quantidade', () => {
  const p = calculateTablePrices({ ...base, vehicle: 'carro', volumes: 3, originCity: 'Goiânia', destinationCity: 'Goiânia' });
  assert.equal(p.coleta, 15);
});

test('cidade fora da tabela não devolve preço', () => {
  assert.deepEqual(calculateTablePrices({ ...base, originCity: 'Inhumas - GO', destinationCity: 'Goiânia' }), { entrega: 8 });
});
