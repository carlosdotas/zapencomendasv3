import React, { useEffect, useRef } from 'react';
import { 
  User, 
  Bookmark, 
  Settings, 
  Clock, 
  Shield, 
  LogOut, 
  Share2, 
  X, 
  ChevronRight,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { UserAvatar } from '../common/UserAvatar';

export const UserProfileMenu: React.FC = () => {
  const { 
    user, 
    isProfileOpen, 
    setIsProfileOpen, 
    savedPlaces, 
    flyToLocation, 
    setSelectedPlace,
    setIsAdminSettingsOpen,
    currentRole,
    logout 
  } = useMapStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsProfileOpen(false);
    };

    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isProfileOpen, setIsProfileOpen]);

  if (!isProfileOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6 pointer-events-auto bg-slate-900/20 backdrop-blur-2xs transition-all">
      <div
        ref={menuRef}
        className="w-full max-w-sm bg-white rounded-lg shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200 mt-12 sm:mt-14"
      >
        {/* Header with Close */}
        <div className="px-5 pt-5 pb-4 border-b border-[#0B5187]/20 flex items-center justify-between bg-gradient-to-r from-[#0B5187] to-[#0E5E99] text-white">
          <span className="text-xs font-bold uppercase tracking-wider text-white/90">
            Perfil do Usuário
          </span>
          <button
            onClick={() => setIsProfileOpen(false)}
            aria-label="Fechar perfil"
            className="w-8 h-8 rounded-md flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-5 flex flex-col items-center text-center border-b border-[#0B5187]/10 bg-linear-to-b from-[#F0F6FB] to-white">
          <div className="relative mb-3">
            <UserAvatar
              src={user.avatarUrl}
              name={user.name}
              className="h-20 w-20 overflow-hidden rounded-lg ring-4 ring-[#0B5187]/30 shadow-md"
              imageClassName="h-full w-full rounded-lg object-cover"
              fallbackClassName="flex h-full w-full items-center justify-center rounded-lg bg-[#0B5187]/15 text-xl font-black text-[#0B5187]"
            />
            <div className="absolute bottom-0 right-0 w-6 h-6 rounded-md bg-[#0B5187] border-2 border-white flex items-center justify-center text-white" title="Online">
              <span className="w-2 h-2 rounded-xs bg-[#FF5E00] animate-pulse" />
            </div>
          </div>

          <h3 className="text-base font-bold text-[#0B5187]">{user.name}</h3>
          <p className="text-xs text-slate-500 font-medium">{user.email}</p>

          <button className="mt-4 px-4 py-2 rounded-md text-xs font-bold text-white bg-[#0B5187] hover:bg-[#083D66] shadow-md shadow-[#0B5187]/25 transition-all flex items-center gap-1.5 active:scale-95">
            <span>Gerenciar sua Conta</span>
            <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 divide-x divide-slate-100 py-3 bg-[#F0F6FB] border-b border-[#0B5187]/10 text-center">
          <div className="px-4">
            <p className="text-lg font-extrabold text-[#0B5187]">{savedPlaces.length}</p>
            <p className="text-[11px] font-semibold text-[#0B5187]/80">Locais Salvos</p>
          </div>
          <div className="px-4">
            <p className="text-lg font-extrabold text-[#0B5187]">{user.contributionsCount}</p>
            <p className="text-[11px] font-semibold text-[#0B5187]/80">Contribuições</p>
          </div>
        </div>

        {/* Menu Navigation List */}
        <div className="py-2 max-h-[280px] overflow-y-auto">
          {/* Saved Places */}
          <div className="px-4 py-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B5187]/80 px-2 py-1">
              Acesso rápido
            </p>
            {savedPlaces.slice(0, 2).map((place) => (
              <button
                key={place.id}
                onClick={() => {
                  setSelectedPlace(place);
                  flyToLocation(place.coordinates, 16);
                  setIsProfileOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-left rounded-md hover:bg-[#F0F6FB] transition-colors group"
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="w-7 h-7 rounded-md bg-[#0B5187] text-white flex items-center justify-center shrink-0">
                    <Bookmark className="w-3.5 h-3.5 text-orange-400" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-[#0B5187] truncate">
                      {place.name}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate font-medium">
                      {place.category || place.address}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#0B5187]/40 group-hover:text-[#0B5187] shrink-0 transition-colors" />
              </button>
            ))}
          </div>

          <div className="h-[1px] bg-slate-100 my-1 mx-4" />

          {/* Settings & Preferences */}
          <div className="px-2">
            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-[#0B5187] hover:bg-[#F0F6FB] rounded-md transition-colors">
              <Clock className="w-4 h-4 text-[#0B5187]/60" />
              <span>Sua linha do tempo no mapa</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-[#0B5187] hover:bg-[#F0F6FB] rounded-md transition-colors">
              <Share2 className="w-4 h-4 text-[#0B5187]/60" />
              <span>Compartilhamento de local</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-[#0B5187] hover:bg-[#F0F6FB] rounded-md transition-colors">
              <Shield className="w-4 h-4 text-[#0B5187]/60" />
              <span>Seus dados de navegação</span>
            </button>
            {currentRole !== 'motorista' && (
              <button 
                onClick={() => {
                  setIsProfileOpen(false);
                  setIsAdminSettingsOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-[#0B5187] hover:bg-[#F0F6FB] rounded-md transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4 text-[#0B5187]" />
                <span>Configurações & Campos Obrigatórios</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#F0F6FB] border-t border-[#0B5187]/15 flex items-center justify-between text-xs text-slate-500 px-5">
          <button 
            onClick={() => {
              setIsProfileOpen(false);
              logout();
            }}
            className="flex items-center gap-2 text-[#0B5187] hover:text-[#FF5E00] font-bold py-1 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-orange-500" />
            <span>Sair da conta</span>
          </button>
          <div className="flex items-center gap-3 text-[11px] text-[#0B5187]/70">
            <a href="#" className="hover:text-[#0B5187] hover:underline">Privacidade</a>
            <span>•</span>
            <a href="#" className="hover:text-[#0B5187] hover:underline">Termos</a>
          </div>
        </div>
      </div>
    </div>
  );
};
