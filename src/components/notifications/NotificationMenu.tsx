import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  Check, 
  MapPin, 
  AlertCircle, 
  Info, 
  Sparkles, 
  X, 
  Package, 
  Truck, 
  Clock, 
  CheckCheck,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { useBackButton } from '../../hooks/useBackButton';
import { notificationService, type ServerNotification } from '../../services/notificationService';
import { startPolling } from '../../services/httpClient';

export interface NotificationItem {
  id: string;
  serverId?: number;
  title: string;
  description: string;
  time: string;
  type: 'delivery' | 'traffic' | 'saved' | 'system' | 'tip';
  read: boolean;
  actionText?: string;
  coordinates?: { lat: number; lng: number };
}

const relativeTime = (iso: string) => {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Agora';
  if (min < 60) return `Há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Há ${h} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

const toItem = (n: ServerNotification): NotificationItem => ({
  id: `srv-${n.id}`,
  serverId: n.id,
  title: n.title,
  description: n.message,
  time: relativeTime(n.createdAt),
  type: 'delivery',
  read: n.read
});

export const NotificationMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Busca a cada 5 s: novas notificações disparam o alerta nativo e entram na lista
  useEffect(() => {
    notificationService.requestWebPermission();
    return startPolling(async () => {
      const fresh = await notificationService.pull();
      fresh.forEach(n => notificationService.alert(n));
      if (fresh.length > 0) window.dispatchEvent(new Event('zap:refresh-orders'));
      const all = await notificationService.list();
      setNotifications(all.map(toItem));
    }, 5000);
  }, []);

  useBackButton('notification-menu-dropdown', isOpen, () => {
    setIsOpen(false);
  }, 55);

  const { flyToLocation } = useMapStore();

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    void notificationService.markRead();
  };

  const markAsRead = (id: string) => {
    const serverId = notifications.find(n => n.id === id)?.serverId;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (serverId) void notificationService.markRead([serverId]);
  };

  const clearNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const serverId = notifications.find(n => n.id === id)?.serverId;
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (serverId) void notificationService.clear([serverId]);
  };

  const clearAll = () => {
    setNotifications([]);
    void notificationService.clear();
  };

  const handleNotificationClick = (item: NotificationItem) => {
    markAsRead(item.id);
    if (item.coordinates) {
      flyToLocation(item.coordinates, 16);
      setIsOpen(false);
    }
  };

  const getTypeBadge = (type: NotificationItem['type']) => {
    switch (type) {
      case 'delivery':
        return {
          icon: <Package className="w-4 h-4 text-white" />,
          bg: 'bg-[#FF5E00]',
          border: 'border-[#FF5E00]/30',
          label: 'Entrega'
        };
      case 'traffic':
        return {
          icon: <Truck className="w-4 h-4 text-white" />,
          bg: 'bg-emerald-600',
          border: 'border-emerald-600/30',
          label: 'Trânsito'
        };
      case 'saved':
        return {
          icon: <MapPin className="w-4 h-4 text-white" />,
          bg: 'bg-[#0B5187]',
          border: 'border-[#0B5187]/30',
          label: 'Local'
        };
      case 'tip':
        return {
          icon: <Sparkles className="w-4 h-4 text-white" />,
          bg: 'bg-amber-500',
          border: 'border-amber-500/30',
          label: 'Dica'
        };
      default:
        return {
          icon: <Info className="w-4 h-4 text-white" />,
          bg: 'bg-slate-600',
          border: 'border-slate-600/30',
          label: 'Sistema'
        };
    }
  };

  return (
    <div className="relative pointer-events-auto" ref={dropdownRef}>
      {/* Botão de Notificações com Visual Premium Harmonizado */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir notificações"
        title={unreadCount > 0 ? `${unreadCount} notificações não lidas` : 'Notificações'}
        className={`relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-lg transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B5187] group ${
          isOpen
            ? 'bg-[#0B5187] text-white shadow-lg ring-2 ring-[#0B5187]/30 border border-[#0B5187]'
            : 'bg-white text-[#0B5187] hover:bg-[#F0F6FB] hover:text-[#0B5187] hover:border-[#0B5187] shadow-md hover:shadow-lg border border-[#0B5187]/25'
        }`}
      >
        <Bell className={`w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.3] transition-transform duration-200 ${
          isOpen ? 'text-white scale-105' : 'text-[#0B5187] group-hover:scale-110 group-hover:rotate-6'
        }`} />

        {/* Badge vibrante com contador de não lidas */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md bg-[#FF5E00] text-white text-[11px] font-extrabold border-2 border-white shadow-md animate-in zoom-in-75 duration-200">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Janelinha / Popover Flutuante de Notificações */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-[330px] sm:w-[410px] bg-white rounded-lg shadow-2xl border border-[#0B5187]/20 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
          {/* Header Superior Corporativo com Gradiente Azul Marinho Claro */}
          <div className="bg-gradient-to-r from-[#0B5187] via-[#0E5E99] to-[#0B5187] px-4 sm:px-5 py-4 text-white border-b border-[#083D66] shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center border border-white/15">
                  <Bell className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
                    Notificações
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-[#FF5E00] text-white text-[10px] font-black rounded-md shadow-xs">
                        {unreadCount} novas
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-white/70">
                    Avisos de rotas, coletas e operação
                  </p>
                </div>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-orange-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-white/10 active:scale-95"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-orange-400" />
                  <span className="hidden sm:inline">Marcar lidas</span>
                </button>
              )}
            </div>

            {/* Barra de Filtros Rápidos (Todas / Não lidas) */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10 text-xs">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-md font-bold transition-all ${
                  filter === 'all'
                    ? 'bg-white text-[#0B5187] shadow-xs'
                    : 'text-white/75 hover:text-white hover:bg-white/10'
                }`}
              >
                Todas ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                  filter === 'unread'
                    ? 'bg-white text-[#0B5187] shadow-xs'
                    : 'text-white/75 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>Não lidas</span>
                {unreadCount > 0 && (
                  <span className={`w-4 h-4 rounded-xs text-[10px] flex items-center justify-center font-black ${
                    filter === 'unread' ? 'bg-[#FF5E00] text-white' : 'bg-white/20 text-white'
                  }`}>
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Lista de Notificações */}
          <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100 bg-[#F9FBFC]">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <div className="w-12 h-12 rounded-lg bg-[#0B5187]/10 mx-auto mb-2 flex items-center justify-center text-[#0B5187]">
                  <Check className="w-6 h-6 stroke-[2.5]" />
                </div>
                <p className="text-sm font-bold text-[#0B5187]">Tudo limpo por aqui!</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {filter === 'unread'
                    ? 'Você leu todas as notificações recentes.'
                    : 'Nenhuma notificação no histórico no momento.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map(item => {
                const badge = getTypeBadge(item.type);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 sm:p-4 flex items-start gap-3.5 cursor-pointer transition-all relative group ${
                      !item.read
                        ? 'bg-white hover:bg-[#F0F6FB] border-l-4 border-l-[#FF5E00] shadow-xs'
                        : 'bg-[#F9FBFC] hover:bg-slate-100/80 opacity-85'
                    }`}
                  >
                    {/* Ícone com Cor de Categoria */}
                    <div className={`w-9 h-9 rounded-md shrink-0 mt-0.5 flex items-center justify-center shadow-xs ${badge.bg}`}>
                      {badge.icon}
                    </div>

                    {/* Conteúdo da Notificação */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                          !item.read ? 'bg-[#0B5187]/10 text-[#0B5187]' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {badge.label}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{item.time}</span>
                        </div>
                      </div>

                      <p className={`text-xs sm:text-sm leading-snug font-bold ${
                        !item.read ? 'text-[#0B5187]' : 'text-slate-700'
                      }`}>
                        {item.title}
                      </p>

                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Botão de Ação Rápida caso tenha coordenada */}
                      {item.coordinates && (
                        <div className="mt-2 flex items-center gap-1 text-xs font-bold text-[#FF5E00] group-hover:text-[#E05200]">
                          <span>{item.actionText || 'Ver no mapa'}</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      )}
                    </div>

                    {/* Botão de Remover Individual */}
                    <button
                      onClick={(e) => clearNotification(item.id, e)}
                      className="absolute top-3.5 right-3.5 text-slate-300 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Excluir notificação"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer da Janela */}
          <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs px-4">
            <span className="text-[11px] font-medium text-slate-500">
              Notificações em tempo real
            </span>

            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 text-slate-400 hover:text-rose-600 font-semibold transition-colors py-1 px-2 rounded-lg hover:bg-rose-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar tudo</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
