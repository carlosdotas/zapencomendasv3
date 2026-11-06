import { api, setAuthToken } from './api';

type Registration = Parameters<typeof api.registerUser>[0] & {
  password: string;
  access_level: 'motorista' | 'atendente';
};

export async function registerAndLogin(input: Registration) {
  const registered = await api.registerUser(input);
  if (!registered.success || !registered.data?.id) {
    throw new Error(registered.message || 'Não foi possível confirmar o cadastro. Se ele já tiver sido salvo, entre pela tela de login.');
  }

  const login = await api.login(input.phone, input.password);
  if (!login.success || !login.data?.token || !login.data.user_id) {
    setAuthToken(null);
    throw new Error(`Cadastro salvo, mas não foi possível entrar. Use a tela de login. ${login.message || ''}`.trim());
  }
  if (String(login.data.user_id) !== String(registered.data.id) || login.data.access_level !== input.access_level) {
    setAuthToken(null);
    throw new Error('Cadastro salvo, mas a sessão retornada não corresponde à conta cadastrada. Entre pela tela de login.');
  }
  return login.data;
}
