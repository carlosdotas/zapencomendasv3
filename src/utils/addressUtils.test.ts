import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCityName, resolveCustomerCity } from './addressUtils';

test('normalizes city names with state and removes duplicated state suffix', () => {
  assert.equal(normalizeCityName('  Goiânia - go - GO  '), 'Goiânia - GO');
});

test('uses geocoded city metadata before parsing the address', () => {
  assert.equal(resolveCustomerCity({
    destinationCity: 'São Paulo - sp',
    address: 'Rua A, Goiânia - GO, Brasil'
  }), 'São Paulo - SP');
});

test('extracts city and state from the selected address', () => {
  assert.equal(resolveCustomerCity({ address: 'Av. T-10, 1300, Goiânia - GO, Brasil' }), 'Goiânia - GO');
});

test('does not invent a city when the address has no city metadata', () => {
  assert.equal(resolveCustomerCity({ address: 'Rua sem município definido' }), undefined);
});