import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { registerAndLogin } from './registrationService';

test('registration requires confirmed persistence and a matching authenticated session', async () => {
  const input = {
    name: 'Motorista Teste', full_name: 'Motorista Teste', phone: '62912345678',
    password: 'senha123', access_level: 'motorista' as const, cpf: '12345678901',
    tipo_veiculo: 'carro' as const, modelo_veiculo: 'Modelo', placa: 'ABC-1234'
  };
  let registration: object = { success: false, message: 'Banco indisponível' };
  let login: object = { success: false, message: 'Sessão indisponível' };
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    calls.push(path);
    if (path === '/users/register') {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.cpf, input.cpf);
      assert.equal(body.modelo_veiculo, input.modelo_veiculo);
      assert.equal(body.placa, input.placa);
    }
    return new Response(JSON.stringify(path === '/users/register' ? registration : login));
  });
  try {
    await assert.rejects(registerAndLogin(input), /Banco indisponível/);
    assert.deepEqual(calls, ['/users/register']);
    registration = { success: true, data: { id: 7 } };
    await assert.rejects(registerAndLogin(input), /Cadastro salvo.*tela de login/);
    login = { success: true, data: { user_id: 8, access_level: 'motorista', token: 'test-token' } };
    await assert.rejects(registerAndLogin(input), /não corresponde/);
    login = { success: true, data: { user_id: 7, access_level: 'motorista', token: 'test-token' } };
    assert.equal((await registerAndLogin(input)).user_id, 7);
  } finally {
    fetchMock.mock.restore();
  }
});
