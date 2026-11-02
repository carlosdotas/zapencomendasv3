import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backendPedidoToPlaces, backendUserToCustomer, formatPhotoUrl } from './apiAdapters';
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

test('preserves customer email, notes and company on reload from the backend', () => {
  const customer = backendUserToCustomer({
    id: '84',
    name: 'Contato',
    full_name: 'Cliente Teste',
    phone: '62999990000',
    access_level: 'cliente',
    email: 'cliente@example.com',
    notes: 'Entregar pela portaria',
    companyId: 'company-7'
  });

  assert.equal(customer.email, 'cliente@example.com');
  assert.equal(customer.notes, 'Entregar pela portaria');
  assert.equal(customer.companyId, 'company-7');
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

test('maps per-stop visibility, assignment, seller and comments from saved order metadata', () => {
  const [pickup] = backendPedidoToPlaces({
    id: 321,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    cliente: 'Cliente Rota',
    coleta_endereco: 'Rua de Coleta, Goiânia',
    coleta_lat: -16.7,
    coleta_lng: -49.2,
    coleta_obs: '',
    detalhes: 'Observação geral legada',
    entrega_endereco: 'Rua de Entrega, Goiânia',
    entrega_lat: -16.71,
    entrega_lng: -49.21,
    itens_extras: JSON.stringify({
      pickupVisibility: 'privado',
      pickupAssignedDriverId: '44',
      pickupAssignedDriverName: 'Motorista Coleta',
      pickupSellerName: 'Vendedor Coleta',
      deliveryVisibility: 'publico',
      deliverySellerName: 'Vendedor Entrega'
    })
  });

  assert.equal(pickup.operationType, 'coleta');
  assert.equal(pickup.pickupVisibility, 'privado');
  assert.equal(pickup.pickupAssignedDriverId, '44');
  assert.equal(pickup.pickupAssignedDriverName, 'Motorista Coleta');
  assert.equal(pickup.pickupSellerName, 'Vendedor Coleta');
  assert.equal(pickup.deliveryVisibility, 'publico');
  assert.equal(pickup.deliverySellerName, 'Vendedor Entrega');
  assert.equal(pickup.pickupNotes, '');
  assert.equal(pickup.observations, undefined);
});

test('uses the active delivery stop metadata after the pickup is completed', () => {
  const [delivery] = backendPedidoToPlaces({
    id: 322,
    etapa: 'coletado',
    tipo_encomenda: 'entrega',
    cliente: 'Cliente Rota',
    coleta_endereco: 'Rua de Coleta, Goiânia',
    coleta_lat: -16.7,
    coleta_lng: -49.2,
    entrega_endereco: 'Rua de Entrega, Goiânia',
    entrega_lat: -16.71,
    entrega_lng: -49.21,
    entrega_obs: 'Instruções da entrega',
    itens_extras: JSON.stringify({
      pickupVisibility: 'privado',
      pickupAssignedDriverId: '44',
      deliveryVisibility: 'privado',
      deliveryAssignedDriverId: '55',
      deliveryAssignedDriverName: 'Motorista Entrega',
      deliverySellerName: 'Vendedor Entrega',
      deliverySellerPhone: '(62) 99999-1234'
    })
  });

  assert.equal(delivery.operationType, 'entrega');
  assert.equal(delivery.orderVisibility, 'privado');
  assert.equal(delivery.assignedDriverId, '55');
  assert.equal(delivery.assignedDriverName, 'Motorista Entrega');
  assert.equal(delivery.sellerName, 'Vendedor Entrega');
  assert.equal(delivery.sellerPhone, '(62) 99999-1234');
  assert.equal(delivery.observations, 'Instruções da entrega');
});

test('preserves independent pickup and delivery settings on each active route point', () => {
  const pickupOrder = {
    id: 323,
    etapa: 'pendente',
    tipo_encomenda: 'entrega',
    cliente: 'Cliente Rota',
    coleta_endereco: 'Rua de Coleta, Goiânia',
    coleta_lat: -16.7,
    coleta_lng: -49.2,
    coleta_obs: 'Retirar na recepção',
    entrega_endereco: 'Rua de Entrega, Goiânia',
    entrega_lat: -16.71,
    entrega_lng: -49.21,
    entrega_obs: 'Entregar ao cliente',
    itens_extras: JSON.stringify({
      pickupVisibility: 'privado',
      pickupAssignedDriverId: '44',
      pickupAssignedDriverName: 'Motorista Coleta',
      pickupSellerName: 'Responsável da coleta',
      pickupSellerPhone: '62911111111',
      deliveryVisibility: 'publico',
      deliveryAssignedDriverId: '55',
      deliveryAssignedDriverName: 'Motorista Entrega',
      deliverySellerName: 'Responsável da entrega',
      deliverySellerPhone: '62922222222'
    })
  };
  const [pickup] = backendPedidoToPlaces(pickupOrder);
  const [delivery] = backendPedidoToPlaces({ ...pickupOrder, etapa: 'coletado' });

  assert.equal(pickup.operationType, 'coleta');
  assert.equal(pickup.pickupVisibility, 'privado');
  assert.equal(pickup.pickupAssignedDriverId, '44');
  assert.equal(pickup.pickupSellerName, 'Responsável da coleta');
  assert.equal(pickup.pickupSellerPhone, '62911111111');
  assert.equal(pickup.pickupNotes, 'Retirar na recepção');
  assert.equal(pickup.deliveryVisibility, 'publico');
  assert.equal(pickup.deliveryAssignedDriverId, undefined);
  assert.equal(pickup.deliverySellerName, 'Responsável da entrega');
  assert.equal(pickup.deliverySellerPhone, '62922222222');
  assert.equal(pickup.deliveryNotes, 'Entregar ao cliente');
  assert.equal(delivery.operationType, 'entrega');
  assert.equal(delivery.deliveryVisibility, 'publico');
  assert.equal(delivery.deliveryAssignedDriverId, undefined);
  assert.equal(delivery.sellerName, 'Responsável da entrega');
  assert.equal(delivery.sellerPhone, '62922222222');
  assert.equal(delivery.deliveryNotes, 'Entregar ao cliente');
});

test('keeps the exchange seller responsible at the exchange stop', () => {
  const [exchange] = backendPedidoToPlaces({
    id: 324,
    etapa: 'coletado',
    tipo_encomenda: 'troca',
    cliente: 'Cliente Troca',
    coleta_endereco: 'Rua de Coleta, Goiânia',
    coleta_lat: -16.7,
    coleta_lng: -49.2,
    entrega_endereco: 'Rua de Entrega, Goiânia',
    entrega_lat: -16.71,
    entrega_lng: -49.21,
    troca_nome: 'Ponto de Troca',
    troca_endereco: 'Avenida Central, Goiânia',
    troca_lat: -16.72,
    troca_lng: -49.22,
    itens_extras: JSON.stringify({
      pickupSellerName: 'Responsável da coleta',
      exchangeSellerName: 'Responsável da troca',
      exchangeSellerPhone: '62933333333',
      deliverySellerName: 'Responsável da entrega'
    })
  });

  assert.equal(exchange.operationType, 'troca');
  assert.equal(exchange.exchangeAddress, 'Avenida Central, Goiânia');
  assert.equal(exchange.sellerName, 'Responsável da troca');
  assert.equal(exchange.sellerPhone, '62933333333');
  assert.equal(exchange.pickupSellerName, 'Responsável da coleta');
  assert.equal(exchange.exchangeSellerName, 'Responsável da troca');
  assert.equal(exchange.deliverySellerName, 'Responsável da entrega');
});