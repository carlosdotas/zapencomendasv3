import assert from 'node:assert/strict';
import { test } from 'node:test';
import { companyWithLocation, parseCompanyLocationId, saveCompanyWithLocation } from './companyLocations';

test('accepts a single persisted location ID or an optional empty selection', () => {
  assert.equal(parseCompanyLocationId('42'), 42);
  assert.equal(parseCompanyLocationId(42), 42);
  assert.equal(parseCompanyLocationId(null), null);
  assert.equal(parseCompanyLocationId(undefined), null);
  assert.equal(parseCompanyLocationId(''), null);
  for (const invalid of ['0', '-1', '12abc', '1.5', '01', 1.5, {}, [], '2147483648']) {
    assert.throws(() => parseCompanyLocationId(invalid), /local cadastrado válido/);
  }
});

test('attaches current location data without changing existing company fields', () => {
  const company = { id: 'emp-1', name: 'Transporte', locationId: 42, adminPhones: ['123'] };
  const location = { id: 42, name: 'Depósito', address: 'Rua A', city: 'Goiânia', state: 'GO' };
  assert.deepEqual(companyWithLocation(company, location), { ...company, location });
  assert.deepEqual(companyWithLocation(company, null), { ...company, location: null });
  assert.deepEqual(companyWithLocation({ id: 'antiga', name: 'Sem local' }, null), {
    id: 'antiga', name: 'Sem local', location: null
  });
});

test('persists and updates the location ID and resolves current location details', async () => {
  const records = new Map<string, string>();
  const location = { id: 42, name: 'Depósito', address: 'Rua A', city: 'Goiânia', state: 'GO' };
  const findLocation = async (id: number) => id === location.id ? location : null;
  const save = async (id: string, data: string) => { records.set(id, data); };
  const input = {
    id: 'emp-1', name: ' Transporte ', phone: '123', locationId: '42',
    location: { id: 42, name: 'Nome desatualizado' }
  };
  const created = await saveCompanyWithLocation(input, findLocation, save);
  assert.equal(created.name, 'Transporte');
  assert.deepEqual(created.location, location);
  const stored = JSON.parse(records.get('emp-1')!);
  assert.equal(stored.locationId, 42);
  assert.equal(stored.phone, '123');
  assert.equal('location' in stored, false);
  assert.deepEqual(companyWithLocation(stored, await findLocation(stored.locationId)), created);

  await saveCompanyWithLocation({ ...stored, locationId: null }, findLocation, save);
  assert.equal(JSON.parse(records.get('emp-1')!).locationId, null);
});

test('rejects missing locations and propagates database failures without saving', async () => {
  let saved = false;
  await assert.rejects(
    saveCompanyWithLocation({ name: 'Empresa', locationId: 99 }, async () => null, async () => { saved = true; }),
    /local selecionado não foi encontrado/
  );
  assert.equal(saved, false);
  await assert.rejects(
    saveCompanyWithLocation({ name: 'Empresa' }, async () => null, async () => { throw new Error('banco indisponível'); }),
    /banco indisponível/
  );
});
