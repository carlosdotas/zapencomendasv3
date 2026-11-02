import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backendUserToCustomer, formatPhotoUrl } from './apiAdapters';
import { mergeCustomerLists, normalizeCustomerId, normalizeCustomerPhone } from '../utils/customerIdentity';

test('preserves the PHP image host returned by the upload server', () => {
  const resolvedUrl = formatPhotoUrl(
    'https://images.example.com/images.php?f=1762000000_perfil_ab12cd34.jpg'
  );

  assert.equal(
    resolvedUrl,
    'https://images.example.com/images.php?f=1762000000_perfil_ab12cd34.jpg&w=480'
  );
});

test('keeps local profile uploads on the app origin', () => {
  assert.equal(
    formatPhotoUrl('/uploads/users/avatar.jpg'),
    '/uploads/users/avatar.jpg'
  );
});

test('keeps customer city and address separate and normalizes duplicate state suffixes', () => {
  const customer = backendUserToCustomer({
    id: '42',
    name: 'Cliente Teste',
    phone: '62999990000',
    access_level: 'cliente',
    cidade: 'Goiânia - GO - GO',
    address: 'Av. T-10, 1300'
  });

  assert.equal(customer.city, 'Goiânia - GO');
  assert.equal(customer.cidade, 'Goiânia - GO');
  assert.equal(customer.address, 'Av. T-10, 1300');
});

test('keeps city separate when no stored street address exists', () => {
  const customer = backendUserToCustomer({
    id: '43',
    name: 'Cliente Legado',
    phone: '62999990001',
    access_level: 'cliente',
    cidade: 'Goiânia - GO - GO'
  });

  assert.equal(customer.city, 'Goiânia - GO');
  assert.equal(customer.address, '');
});

test('preserves saved customer address, coordinates and additional addresses', () => {
  const customer = backendUserToCustomer({
    id: '44',
    name: 'Cliente Com Local',
    phone: '62999990002',
    access_level: 'cliente',
    address: 'Av. T-10, 1300',
    city: 'Goiânia',
    coordinates: { lat: -16.7, lng: -49.2 },
    additionalAddresses: [{
      id: 'address-1',
      label: 'Filial',
      address: 'Rua 10, 200',
      city: 'Anápolis',
      coordinates: { lat: -16.3, lng: -48.9 }
    }]
  });

  assert.equal(customer.address, 'Av. T-10, 1300');
  assert.deepEqual(customer.coordinates, { lat: -16.7, lng: -49.2 });
  assert.equal(customer.additionalAddresses?.[0].label, 'Filial');
  assert.equal(customer.additionalAddresses?.[0].address, 'Rua 10, 200');
});

test('normalizes database ids and Brazilian phone country codes', () => {
  assert.equal(normalizeCustomerId('db-user-42'), '42');
  assert.equal(normalizeCustomerPhone('+55 (62) 99999-0000'), '62999990000');
});

test('merges database and local records while keeping distinct ids with shared phone separate', () => {
  const databaseCustomer = {
    id: '42', fullName: 'Cliente A', phone: '62999990000', cpf: '',
    address: 'Rua 10, 200', city: 'Goiânia', createdAt: 1
  };
  const localCustomer = {
    id: 'db-user-42', fullName: 'Cliente A', phone: '+55 (62) 99999-0000', cpf: '',
    address: '', coordinates: { lat: -16.7, lng: -49.2 }, createdAt: 1
  };
  const otherCustomer = {
    id: '43', fullName: 'Cliente B', phone: '62999990000', cpf: '',
    address: '', createdAt: 1
  };

  const merged = mergeCustomerLists([databaseCustomer], [localCustomer, otherCustomer]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].address, 'Rua 10, 200');
  assert.deepEqual(merged[0].coordinates, { lat: -16.7, lng: -49.2 });
  assert.equal(merged[1].id, '43');
});