import assert from 'node:assert/strict';
import test from 'node:test';
import { getSuggestedOrderPlaceName } from './orderPlaceName';

test('requires a name when the result is a placeholder or street address', () => {
  for (const name of ['', 'Localizando endereço...', 'Local sem nome', 'Ponto Marcado no Mapa', 'Ponto de Coleta']) {
    assert.equal(getSuggestedOrderPlaceName({ name }), '');
  }
  assert.equal(getSuggestedOrderPlaceName({ name: 'Rua 10', address: 'Rua 10, 123' }), '');
  assert.equal(getSuggestedOrderPlaceName({ name: 'Alfa', address: 'Alfa, 123', category: 'Via pública / Endereço' }), '');
  assert.equal(getSuggestedOrderPlaceName({ name: 'Loja Sol', isUnnamed: true }), '');
});

test('retains a named commercial location', () => {
  assert.equal(getSuggestedOrderPlaceName({ name: 'Loja Sol', address: 'Rua 10, 123', category: 'Ponto Comercial' }), 'Loja Sol');
  assert.equal(getSuggestedOrderPlaceName({ name: 'Via Brasil', address: 'Rua 10, 123', category: 'Ponto Comercial' }), 'Via Brasil');
});
