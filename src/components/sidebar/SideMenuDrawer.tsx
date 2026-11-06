import React, { useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Settings, 
  Globe2, 
  ShieldCheck, 
  Users,
  Building2,
  Truck,
  Headset,
  Package,
  DollarSign,
  LogOut,
  User,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { usePWAUpdate } from '../../services/pwaUpdateService';
import { UserAvatar } from '../common/UserAvatar';
import { useAppVersion } from '../../hooks/useAppVersion';

interface SideMenuDrawerProps {
  onOpenCompanies: () => void;
  onOpenSettings: () => void;
}

export const SideMenuDrawer: React.FC<SideMenuDrawerProps> = ({ onOpenCompanies, onOpenSettings }) => {
  const appVersion = useAppVersion();
  const { 
    isSidebarOpen, 
    setIsSidebarOpen, 
    setIsAdminUsersOpen,
    setAdminUsersRoleFilter,
    openCustomerList,
    openOrdersModal,
    openFinancialModal,
    currentRole,
    user,
    logout
  } = useMapStore();

  const { needRefresh, isChecking, isUpdating, checkForUpdate, applyUpdate } = usePWAUpdate();
  const [updateFeedback, setUpdateFeedback] = React.useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setUpdateFeedback('Consultando versão no servidor...');
    const hasUpdate = await checkForUpdate();
    if (hasUpdate) {
      setUpdateFeedback('Nova versão pronta! Aplicando...');
      setTimeout(() => applyUpdate(), 600);
    } else {
      setUpdateFeedback('Você já está na versão mais recente!');
      setTimeout(() => setUpdateFeedback(null), 3500);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    if (isSidebarOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, setIsSidebarOpen]);

  if (!isSidebarOpen) return null;

  const handleLogout = () => {
    setIsSidebarOpen(false);
    logout();
  };

  return (
    <div className="fixed inset-0 z-50 flex pointer-events-auto">
      {/* Backdrop */}
      <div
        onClick={() => setIsSidebarOpen(false)}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Drawer Panel */}
      <div className="relative w-80 sm:w-88 max-w-[85vw] h-full bg-white shadow-2xl z-10 flex flex-col animate-in slide-in-from-left duration-200">
        
        {/* Drawer Header com Identidade Visual */}
        <div className="p-4 border-b border-[#0B5187]/20 flex items-center justify-between bg-gradient-to-r from-[#0B5187] to-[#0E5E99] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white p-1 shadow-md flex items-center justify-center shrink-0 border border-white/20">
              <img src="/logo.svg" alt="EncomendasZap" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight leading-tight flex items-center gap-1.5">
                Encomendas<span className="text-[#FF5E00]">Zap</span>
              </h2>
              <p className="text-[11px] text-orange-200/90 font-medium">Navegação e Logística</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Fechar menu"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card do Usuário Logado */}
        {user && (
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <UserAvatar
                src={user.avatarUrl}
                name={user.name}
                className="h-9 w-9 overflow-hidden rounded-full border border-[#0B5187]/30"
                imageClassName="h-full w-full rounded-full object-cover"
                fallbackClassName="flex h-full w-full items-center justify-center rounded-full bg-[#0B5187]/10 text-xs font-black text-[#0B5187]"
              />
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 truncate">{user.name}</p>
                <p className="text-[10px] text-slate-500 font-medium truncate">{user.phone || user.role}</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#0B5187]/10 text-[#0B5187] shrink-0">
              {user.role?.split(' ')[0] || 'Ativo'}
            </span>
          </div>
        )}

        {/* Conteúdo com Rolagem */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 divide-y divide-slate-100">
          
          {/* APK já instalado não deve oferecer instalação do PWA. */}
          {!(window as any).Capacitor?.isNativePlatform?.() && (
            <div>
              <PWAInstallButton variant="sidebar" />
            </div>
          )}

          {/* Acessos de Gestão e Configuração (Oculto para motoristas) */}
          <div className="pt-3 space-y-1.5">
            {/* Configurações do Sistema e Gestão de Usuários (Apenas Administrador e Atendente) */}
            {currentRole !== 'motorista' && (
              <>
                <button 
                  onClick={() => {
                    setIsSidebarOpen(false);
                    openCustomerList();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#FFF9F5] hover:text-[#FF5E00] rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-[#FF5E00]" />
                    <span>Lista de Clientes</span>
                  </div>
                  <span className="text-[10px] bg-orange-100 text-[#FF5E00] font-extrabold px-1.5 py-0.5 rounded">
                    Clientes
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setIsSidebarOpen(false);
                    openOrdersModal();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#F0F6FB] hover:text-[#0B5187] rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-[#0B5187]" />
                    <span>Lista de Pedidos</span>
                  </div>
                  <span className="text-[10px] bg-blue-100 text-[#0B5187] font-extrabold px-1.5 py-0.5 rounded">
                    Pedidos
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setIsSidebarOpen(false);
                    openFinancialModal();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Área Financeira</span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded">
                    Financeiro
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenCompanies();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#F0F6FB] hover:text-[#0B5187] rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-[#0B5187]" />
                    <span>Lista de Transportadoras</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#F0F6FB] hover:text-[#0B5187] rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-4 h-4 text-[#0B5187]" />
                    <span>Configurações do Sistema</span>
                  </div>
                  <span className="text-[10px] bg-sky-100 text-[#0B5187] font-extrabold px-1.5 py-0.5 rounded">
                    Admin
                  </span>
                </button>

                {currentRole === 'admin_geral' && (
                  <>
                    <button 
                      onClick={() => {
                        setIsSidebarOpen(false);
                        setAdminUsersRoleFilter('motorista');
                        setIsAdminUsersOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#FFF9F5] hover:text-[#FF5E00] rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Truck className="w-4 h-4 text-[#FF5E00]" />
                        <span>Lista de Motoristas</span>
                      </div>
                    </button>

                    <button 
                      onClick={() => {
                        setIsSidebarOpen(false);
                        setAdminUsersRoleFilter('atendente');
                        setIsAdminUsersOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#FFF9F5] hover:text-[#FF5E00] rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Headset className="w-4 h-4 text-[#FF5E00]" />
                        <span>Lista de Atendentes</span>
                      </div>
                    </button>
                  </>
                )}

                <button 
                  onClick={() => {
                    setIsSidebarOpen(false);
                    setAdminUsersRoleFilter('todos');
                    setIsAdminUsersOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#FFF9F5] hover:text-[#FF5E00] rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-[#FF5E00]" />
                    <span>Gerenciar Usuários & Perfis</span>
                  </div>
                  <span className="text-[10px] bg-orange-100 text-[#FF5E00] font-extrabold px-1.5 py-0.5 rounded">
                    Gestão
                  </span>
                </button>
              </>
            )}

            {/* Bloco de Atualizações e Versão Inteligente */}
            <div className="pt-2">
              <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-100 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#0B5187]">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF5E00]" />
                    <span>Atualizações Automáticas</span>
                  </div>
                  {needRefresh ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 animate-pulse border border-emerald-300">
                      Disponível!
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-500">
                      Offline & Online
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-600 leading-snug">
                  Funciona offline em campo e detecta atualizações automaticamente assim que uma nova versão é publicada.
                </p>

                {updateFeedback && (
                  <p className="text-[11px] font-bold text-[#0B5187] bg-white px-2.5 py-1.5 rounded-lg border border-sky-200 animate-in fade-in">
                    {updateFeedback}
                  </p>
                )}

                <button
                  onClick={needRefresh ? () => applyUpdate() : handleCheckUpdate}
                  disabled={isChecking || isUpdating}
                  className="w-full mt-0.5 flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-slate-50 text-[#0B5187] border border-sky-200 text-xs font-bold rounded-lg shadow-2xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#FF5E00] ${(isChecking || isUpdating) ? 'animate-spin' : ''}`} />
                  <span>
                    {isUpdating ? 'Aplicando atualização...' : isChecking ? 'Verificando...' : needRefresh ? 'Atualizar Agora' : 'Verificar Atualizações'}
                  </span>
                </button>
              </div>
            </div>

            {/* BOTÃO DE DESLOGAR / SAIR / LOGOUT */}
            <div className="pt-2">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 rounded-xl transition-all cursor-pointer border border-rose-200 active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <LogOut className="w-4 h-4 text-rose-600 stroke-[2.3]" />
                  <span>Sair da Conta (Logout)</span>
                </div>
                <span className="text-[10px] text-rose-400 font-semibold">Desconectar</span>
              </button>
            </div>
          </div>

        </div>

        {/* Rodapé Clean */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between px-4">
          <span className="font-semibold">EncomendasZap {appVersion}</span>
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Globe2 className="w-3.5 h-3.5 text-[#0B5187]" />
            <span>Goiânia - GO</span>
          </div>
        </div>

      </div>
    </div>
  );
};
