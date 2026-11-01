import React from 'react';
import { Menu } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { NotificationMenu } from '../notifications/NotificationMenu';
import { ACCOUNTS } from '../../data/authAccounts';

export const TopControls: React.FC = () => {
  const { 
    isSidebarOpen, 
    setIsSidebarOpen, 
    isProfileOpen, 
    setIsProfileOpen, 
    user,
    currentRole,
    isDriverOnline
  } = useMapStore();

  const currentAccount = Object.values(ACCOUNTS).find(a => a.role === currentRole) || ACCOUNTS['62996157341'];

  return (
    <header 
      className="absolute top-0 left-0 right-0 z-20 pointer-events-none flex flex-col pt-3 px-3 sm:px-4 transition-all"
    >
      {/* Barra de Comandos Superior: Menu à Esquerda e Ações à Direita */}
      <div className="w-full flex items-center justify-between">
        {/* Lado Esquerdo Superior: Botão Menu com Alto Contraste */}
        <div className="pointer-events-auto flex items-center">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Abrir menu lateral"
            title="Menu principal"
            className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 bg-white hover:bg-[#0B5187] text-[#0B5187] hover:text-white rounded-xl shadow-lg border-2 border-white/90 transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5E00] cursor-pointer"
          >
            <Menu className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Lado Direito Superior: Notificações e Perfil */}
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-2.5">
          <NotificationMenu />

          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            aria-label="Abrir perfil de usuário"
            title={`Conta: ${user.name}`}
            className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white p-0.5 shadow-lg border-2 border-white/90 transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5E00] group cursor-pointer"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || 'Usuário'}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('.top-avatar-fallback') as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
                className="w-full h-full rounded-lg object-cover ring-2 ring-transparent group-hover:ring-[#0B5187] transition-all"
              />
            ) : null}
            <div 
              className="top-avatar-fallback w-full h-full rounded-lg bg-[#0B5187] items-center justify-center text-white font-black text-xs"
              style={{ display: user.avatarUrl ? 'none' : 'flex' }}
            >
              {user.name ? user.name.slice(0, 2).toUpperCase() : 'EZ'}
            </div>
            {/* Indicador de status/perfil do usuário */}
            <span 
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full shadow-xs flex items-center justify-center"
              style={{ 
                backgroundColor: currentRole === 'motorista' && isDriverOnline ? '#10B981' : currentAccount.badgeColor 
              }}
            >
              <span className={`w-1 h-1 rounded-full bg-white ${currentRole === 'motorista' && isDriverOnline ? 'animate-ping' : ''}`} />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
