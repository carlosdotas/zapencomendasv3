import test from 'node:test';
import assert from 'node:assert/strict';
import { getDriverPermanentColor, DRIVER_PERMANENT_PALETTE } from './driverColorUtils';
import {
  detectCityFromCoordinates,
  getDriverCurrentCity,
  isPlaceInCity,
  filterPlacesByDriverCity
} from './driverCityUtils';
import { Place } from '../types/map';

test('getDriverPermanentColor generates stable, permanent color per driver', () => {
  const color1 = getDriverPermanentColor('driver-1');
  const color1Again = getDriverPermanentColor('driver-1');
  assert.equal(color1, color1Again, 'Same driver id must always get the exact same color');
  assert.match(color1, /^#[0-9a-f]{6}$/i, 'Color must be a valid hex');

  const color2 = getDriverPermanentColor('driver-2');
  assert.equal(color2, getDriverPermanentColor('driver-2'));

  const colorPhone1 = getDriverPermanentColor('62999998888');
  const colorPhone2 = getDriverPermanentColor('62998000714');
  assert.notEqual(colorPhone1, colorPhone2, 'Different drivers should get different colors');

  assert.ok(DRIVER_PERMANENT_PALETTE.includes(colorPhone1 as any));
});

test('detectCityFromCoordinates identifies Goiânia and Anápolis correctly', () => {
  // Centro de Goiânia
  const goianiaCoords = { lat: -16.6869, lng: -49.2648 };
  const detectedGoi = detectCityFromCoordinates(goianiaCoords);
  assert.equal(detectedGoi?.name, 'Goiânia');

  // Centro de Anápolis
  const anapolisCoords = { lat: -16.3285, lng: -48.9534 };
  const detectedAna = detectCityFromCoordinates(anapolisCoords);
  assert.equal(detectedAna?.name, 'Anápolis');
});

test('getDriverCurrentCity resolves city from GPS and fallbacks to profile', () => {
  // Com GPS em Anápolis
  const cityGpsAna = getDriverCurrentCity({ lat: -16.3285, lng: -48.9534 }, null);
  assert.equal(cityGpsAna, 'Anápolis');

  // Com GPS em Goiânia
  const cityGpsGoi = getDriverCurrentCity({ lat: -16.6869, lng: -49.2648 }, null);
  assert.equal(cityGpsGoi, 'Goiânia');

  // Sem GPS, mas com perfil do usuário
  const cityProfile = getDriverCurrentCity(null, { cidade: 'Anápolis - GO' });
  assert.equal(cityProfile, 'Anápolis');

  // Sem nada, fallback para Goiânia
  const cityDefault = getDriverCurrentCity(null, null);
  assert.equal(cityDefault, 'Goiânia');
});

test('isPlaceInCity filters places accurately between Goiânia and Anápolis', () => {
  const placeGoiania: Place = {
    id: 'p-1',
    name: 'Loja Centro Goiânia',
    address: 'Av. Goiás, 100 - Central, Goiânia - GO',
    originCity: 'Goiânia - GO',
    coordinates: { lat: -16.68, lng: -49.26 }
  };

  const placeAnapolis: Place = {
    id: 'p-2',
    name: 'Loja Brasil Anápolis',
    address: 'Av. Brasil, 500 - Centro, Anápolis - GO',
    originCity: 'Anápolis - GO',
    coordinates: { lat: -16.32, lng: -48.95 }
  };

  assert.equal(isPlaceInCity(placeGoiania, 'Goiânia'), true);
  assert.equal(isPlaceInCity(placeGoiania, 'Anápolis'), false);

  assert.equal(isPlaceInCity(placeAnapolis, 'Anápolis'), true);
  assert.equal(isPlaceInCity(placeAnapolis, 'Goiânia'), false);

  const places = [placeGoiania, placeAnapolis];
  const inGoiania = filterPlacesByDriverCity(places, 'Goiânia');
  assert.equal(inGoiania.length, 1);
  assert.equal(inGoiania[0].id, 'p-1');

  const inAnapolis = filterPlacesByDriverCity(places, 'Anápolis');
  assert.equal(inAnapolis.length, 1);
  assert.equal(inAnapolis[0].id, 'p-2');
});
