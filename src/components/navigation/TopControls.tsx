import React from 'react';
import { Menu } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { NotificationMenu } from '../notifications/NotificationMenu';
import { UserAvatar } from '../common/UserAvatar';

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

  const badgeColor = currentRole === 'admin_geral' ? '#0B5187' : currentRole === 'motorista' ? '#FF5E00' : '#10B981';

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
            <UserAvatar
              src={user.avatarUrl}
              name={user.name}
              className="h-full w-full overflow-hidden rounded-lg"
              imageClassName="h-full w-full rounded-lg object-cover ring-2 ring-transparent transition-all group-hover:ring-[#0B5187]"
              fallbackClassName="flex h-full w-full items-center justify-center rounded-lg bg-[#0B5187] text-xs font-black text-white"
            />
            {/* Indicador de status/perfil do usuário */}
            <span 
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full shadow-xs flex items-center justify-center"
              style={{ 
                backgroundColor: currentRole === 'motorista' && isDriverOnline ? '#10B981' : badgeColor 
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
