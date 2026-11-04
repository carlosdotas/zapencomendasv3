import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  Lock, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  AlertCircle,
  X
} from 'lucide-react';
import { AuthAccount, UserRole } from '../../types/auth';
import { api } from '../../services/api';
import { formatPhotoUrl } from '../../services/apiAdapters';
import { useMapStore } from '../../context/MapContext';

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (account: AuthAccount) => void;
}

interface AppVersionManifest {
  version: string;
  apkHash: string;
}

function formatPhone(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onLoginSuccess }) => {
  const { setIsRegisterModalOpen, setIsLoginModalOpen } = useMapStore();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appVersion, setAppVersion] = useState<AppVersionManifest>({ version: 'V.3.0.0', apkHash: '' });


  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    fetch('/app-version.json', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((manifest) => {
        if (typeof manifest?.version === 'string') {
          setAppVersion({
            version: manifest.version,
            apkHash: typeof manifest.apkHash === 'string' ? manifest.apkHash : ''
          });
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanPhone = phone.replace(/\D/g, '');
    const cleanPassword = password.trim();

    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg('Digite um número de telefone celular válido com DDD.');
      return;
    }

    if (!cleanPassword) {
      setErrorMsg('Informe sua senha ou código de acesso.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Tenta autenticar na API do servidor Express (/login/login)
      const res = await api.login(cleanPhone, cleanPassword);
      if (res.success && res.data) {
        const u = res.data;
        const mappedRole: UserRole = 
          u.access_level === 'admin' || u.access_level === 'admin_geral' ? 'admin_geral'
          : u.access_level === 'motorista' ? 'motorista'
          : u.access_level === 'terminal' ? 'terminal'
          : 'atendente';

        const rawPhoto = u.foto || u.avatarUrl || u.photo;
        const serverPhoto = rawPhoto ? (formatPhotoUrl(rawPhoto) || rawPhoto) : undefined;
        const serverAccount: AuthAccount = {
          id: String(u.user_id),
          phone: u.phone,
          cleanPhone: u.phone.replace(/\D/g, ''),
          code: cleanPassword,
          role: mappedRole,
          roleLabel: mappedRole === 'admin_geral' ? 'Administrador Geral' : mappedRole === 'motorista' ? 'Motorista Parceiro' : mappedRole === 'terminal' ? 'Operador de Terminal' : 'Atendente',
          name: u.name,
          description: `Usuário autenticado no Servidor Central`,
          badgeColor: mappedRole === 'admin_geral' ? '#0B5187' : mappedRole === 'motorista' ? '#FF5E00' : '#10B981',
          avatarUrl: serverPhoto || '',
          status: 'ativo'
        };

        setIsLoading(false);
        onLoginSuccess(serverAccount);
        return;
      } else {
        setIsLoading(false);
        setErrorMsg(
          typeof res.message === 'string' && res.message.trim()
            ? res.message
            : 'Telefone ou senha incorretos.'
        );
        return;
      }
    } catch {
      setIsLoading(false);
      setErrorMsg('Erro de conexão com o servidor. Tente novamente.');
      return;
    }
  };

  const handleOpenRegister = () => {
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      
      {/* Card Minimalista de Login Estilo Aplicativo */}
      <div className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">

        {/* TOPO: Logo e Boas-Vindas */}
        <div className="pt-8 pb-4 px-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0B5187]/5 border border-[#0B5187]/15 p-2.5 shadow-xs mb-3">
            <img src="/logo.svg" alt="EncomendasZap" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">
            Encomendas<span className="text-[#FF5E00]">Zap</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Entre com seu telefone e senha para acessar
          </p>
        </div>

        {/* FORMULÁRIO SIMPLES */}
        <form onSubmit={handleLoginSubmit} className="px-6 py-2 space-y-4">
          
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Campo Telefone */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Telefone Celular
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4 text-[#0B5187]" />
              </div>
              <input
                type="tel"
                required
                autoFocus
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(62) 99999-9999"
                className="w-full pl-10 pr-3.5 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-bold text-sm sm:text-base focus:outline-none focus:border-[#0B5187] focus:bg-white transition-all placeholder-slate-400"
              />
            </div>
          </div>

          {/* Campo Senha */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                Senha
              </label>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4 text-[#0B5187]" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full pl-10 pr-10 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-bold text-sm sm:text-base focus:outline-none focus:border-[#0B5187] focus:bg-white transition-all placeholder-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Botão Entrar */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-[#0B5187] hover:bg-[#083D66] active:scale-[0.98] disabled:opacity-70 text-white font-black text-sm sm:text-base rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Entrando...</span>
              </div>
            ) : (
              <>
                <span>Entrar no Sistema</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Link para Cadastro */}
          <div className="pt-2 pb-4 text-center">
            <span className="text-xs text-slate-500">Quer se cadastrar? </span>
            <button
              type="button"
              onClick={handleOpenRegister}
              className="text-xs font-black text-[#FF5E00] hover:underline cursor-pointer"
            >
              Cadastrar
            </button>
          </div>

          {!(window as any).Capacitor?.isNativePlatform?.() && (
            <div className="pb-4 text-center">
              <a
                href={`/download/zap-encomendas.apk${appVersion.apkHash ? `?v=${appVersion.apkHash}` : ''}`}
                download="zap-encomendas.apk"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-[#0B5187] hover:bg-slate-50"
              >
                📱 Baixar aplicativo Android {appVersion.version} (APK)
              </a>
            </div>
          )}
        </form>

        <footer className="border-t border-slate-100 px-6 py-3 text-center text-[11px] font-semibold text-slate-400">
          Criado por: Carlos Dottas {appVersion.version}
        </footer>

      </div>
    </div>
  );
};
