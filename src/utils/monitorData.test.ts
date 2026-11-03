import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Driver, Place } from '../types/map';
import { filterDriversByCities, filterPlacesByCities, getMonitorCities, getMonitorPlaces } from './monitorData';

const goiania = { lat: -16.68, lng: -49.25 };
const senador = { lat: -16.62, lng: -49.09 };

function makePlace(id: string, city: string, coordinates = goiania, overrides: Partial<Place> = {}): Place {
  return { id, name: id, address: id, coordinates, originCity: city, destinationCity: city, operationType: 'coleta', ...overrides };
}

function makeDriver(id: string, coordinates: { lat: number; lng: number }): Driver {
  return {
    id, name: id, vehicleType: 'moto', vehicleModel: '', vehiclePlate: '', color: '#000',
    coordinates, status: 'disponivel', phone: ''
  } as Driver;
}

const places = [
  makePlace('a', 'Goiânia - GO', goiania),
  makePlace('b', 'Senador Canedo - GO', senador),
  makePlace('c', 'Goiânia - GO', goiania, { orderStage: 'concluido' })
];

test('ignora pedidos concluídos e lista as cidades dos pontos', () => {
  const visible = getMonitorPlaces(places);
  assert.deepEqual(visible.map(p => p.id), ['a', 'b']);
  assert.deepEqual(getMonitorCities(visible).map(c => c.key), ['goiania', 'senador canedo']);
});

test('mostra somente pedidos das cidades selecionadas', () => {
  assert.deepEqual(filterPlacesByCities(places, ['senador canedo']).map(p => p.id), ['b']);
  assert.equal(filterPlacesByCities(places, null).length, 3);
  assert.equal(filterPlacesByCities(places, []).length, 0);
});

test('mostra somente motoristas próximos das cidades selecionadas', () => {
  const drivers = [makeDriver('d1', { lat: -16.681, lng: -49.251 }), makeDriver('d2', { lat: -16.621, lng: -49.091 }), makeDriver('d3', { lat: -10, lng: -40 })];
  assert.deepEqual(filterDriversByCities(drivers, places, ['goiania']).map(d => d.id), ['d1']);
  assert.deepEqual(filterDriversByCities(drivers, places, ['goiania', 'senador canedo']).map(d => d.id), ['d1', 'd2']);
  assert.equal(filterDriversByCities(drivers, places, null).length, 3);
});
