import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSharedMapQuery, readShareParams } from './sharedMapLink';

test('extrai o link do Google Maps de uma mensagem do WhatsApp', () => {
  const text = 'Oi, o endereço é esse aqui:\nhttps://maps.app.goo.gl/AbC123xyz?g_st=iw\nObrigado!';
  assert.equal(extractSharedMapQuery({ text }), 'https://maps.app.goo.gl/AbC123xyz?g_st=iw');
});

test('prefere o link de mapas quando há outros links na mensagem', () => {
  const text = 'Veja https://exemplo.com/loja e https://www.google.com/maps/place/Loja/@-16.6,-49.2,17z.';
  assert.equal(extractSharedMapQuery({ text }), 'https://www.google.com/maps/place/Loja/@-16.6,-49.2,17z');
});

test('usa a localização enviada pelo WhatsApp como coordenadas', () => {
  assert.equal(extractSharedMapQuery({ text: 'Localização: https://maps.google.com/?q=-16.615549,-48.754600' }), 'https://maps.google.com/?q=-16.615549,-48.754600');
  assert.equal(extractSharedMapQuery({ text: 'estou em -16.615549, -48.754600 agora' }), '-16.615549, -48.754600');
});

test('retorna nulo sem link nem coordenadas e lê parâmetros do share target', () => {
  assert.equal(extractSharedMapQuery({ text: 'sem nada útil' }), null);
  assert.deepEqual(readShareParams('?text=oi&url=https%3A%2F%2Fmaps.app.goo.gl%2Fx'), { text: 'oi', url: 'https://maps.app.goo.gl/x', title: null });
  assert.equal(readShareParams('?foo=1'), null);
});
