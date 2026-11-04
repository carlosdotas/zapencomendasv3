import test from 'node:test';
import assert from 'node:assert/strict';
import { placeService } from './placeService';

test('placeService: searchPlaces returns exact and strong matches from memory database', async () => {
  // Clear and seed test places
  placeService.remember({
    id: 9991,
    name: 'Supermercado Bretas',
    endereco: 'Av. T-63, 1200, Setor Nova Suíça, Goiânia',
    rua: 'Av. T-63',
    numero: '1200',
    setor: 'Setor Nova Suíça',
    cidade: 'Goiânia',
    lat: -16.7155,
    lng: -49.2785
  });

  placeService.remember({
    id: 9992,
    name: 'Drogaria Raia',
    endereco: 'Rua 9, 350, Setor Oeste, Goiânia',
    rua: 'Rua 9',
    numero: '350',
    setor: 'Setor Oeste',
    cidade: 'Goiânia',
    lat: -16.6855,
    lng: -49.2625
  });

  // 1. Exact / strong search by place name
  const bretasMatches = await placeService.searchPlaces('bretas');
  assert.equal(bretasMatches.length, 1);
  assert.equal(bretasMatches[0].name, 'Supermercado Bretas');
  assert.equal(bretasMatches[0].fromDatabase, true);

  // 2. Search by pharmacy name
  const raiaMatches = await placeService.searchPlaces('drogaria raia');
  assert.equal(raiaMatches.length, 1);
  assert.equal(raiaMatches[0].name, 'Drogaria Raia');

  // 3. Search for a name NOT in the database (e.g. "Padaria Cristal")
  // Must NOT return random places just because words like "rua" or "setor" are in other places!
  const notFound = await placeService.searchPlaces('padaria cristal');
  assert.equal(notFound.length, 0);

  // 4. Searching for generic street stop words alone without specific number or street name
  // Must NOT match unrelated places
  const genericRua = await placeService.searchPlaces('rua avenida setor');
  assert.equal(genericRua.length, 0);
});
