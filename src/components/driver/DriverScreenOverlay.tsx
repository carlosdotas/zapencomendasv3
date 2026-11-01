import React, { useState, useRef, useEffect } from 'react';
import { 
  Bike, 
  Power, 
  MapPin, 
  Navigation, 
  Clock, 
  ChevronRight, 
  Lock, 
  AlertTriangle,
  X,
  CheckCircle2,
  LogOut
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';

export const DriverScreenOverlay: React.FC = () => {
  const { 
    currentRole, 
    isDriverOnline, 
    setIsDriverOnline, 
    driverActiveSeconds,
    userLocation,
    flyToLocation,
    locateUser,
    stopUserTracking,
    user,
    startBackgroundGps,
    stopBackgroundGps,
    backgroundTrackingStatus
  } = useMapStore();

  const [dragProgress, setDragProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Somente exibe para o perfil de motorista
  if (currentRole !== 'motorista') {
    return null;
  }

  // Formata o tempo ativo (HH:MM:SS)
  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Formata tempo por extenso amigável para a modal
  const formatTimeExtenso = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}min`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
  };

  // Se arrastar o slider estilo Uber
  const handleTouchStart = () => {
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const relativeX = clientX - rect.left;
    const width = rect.width - 64; // subtrai a largura do botão deslizante
    const progress = Math.min(Math.max(relativeX / width, 0), 1);
    setDragProgress(progress);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragProgress > 0.75) {
      // Ativa e fica online com rastreamento em segundo plano (tela desligada)
      setIsDriverOnline(true);
      startBackgroundGps();
      setDragProgress(0);
      locateUser();
      if (userLocation) {
        flyToLocation(userLocation, 17);
      }
    } else {
      setDragProgress(0);
    }
  };

  // Confirmação para finalizar sessão e desconectar do GPS
  const handleConfirmEndSession = () => {
    stopBackgroundGps();
    stopUserTracking();
    setIsDriverOnline(false);
    setShowEndSessionModal(false);
  };

  return (
    <>
      {/* 1. SE OFFLINE: TELA DE BLOQUEIO DO MOTORISTA */}
      {!isDriverOnline && (
        <div className="absolute inset-0 z-40 bg-slate-900/85 backdrop-blur-md flex flex-col justify-between p-4 sm:p-8 animate-in fade-in duration-300">
          
          {/* Header da Tela de Bloqueio */}
          <div 
            className="flex items-center justify-between text-white"
            style={{ paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 8px)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FF5E00] flex items-center justify-center shadow-lg shadow-[#FF5E00]/30">
                <Bike className="w-6 h-6 stroke-[2.3]" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-orange-200">
                  Modo Motorista • EncomendasZap
                </span>
                <h1 className="text-lg sm:text-xl font-black">
                  {user.name || 'Marcos Silva'}
                </h1>
              </div>
            </div>

            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-black">
              Offline
            </span>
          </div>

          {/* Centro explicativo */}
          <div className="max-w-md mx-auto text-center text-white my-auto px-4">
            <div className="w-20 h-20 rounded-3xl bg-white/10 mx-auto flex items-center justify-center mb-5 border border-white/20 shadow-2xl">
              <Lock className="w-10 h-10 text-[#FF5E00]" />
            </div>

            <h2 className="text-2xl font-black mb-2">
              Você está desconectado
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
              Deslize o botão abaixo para <strong className="text-white">Ficar Online</strong>. O sistema monitora sua localização em tempo real para a central e para os clientes, <strong className="text-orange-300">mesmo com a tela desligada ou bloqueada no bolso ou suporte</strong>.
            </p>
          </div>

          {/* Slider Estilo Uber ("Deslize para Iniciar / Rodar") */}
          <div className="max-w-md mx-auto w-full pb-4">
            <div
              ref={trackRef}
              onMouseMove={handleTouchMove}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="relative h-18 bg-slate-800/90 border-2 border-[#FF5E00]/60 rounded-3xl p-1.5 flex items-center select-none overflow-hidden shadow-2xl"
            >
              {/* Texto pulsante no fundo do trilho */}
              <div className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-black text-white/80 pointer-events-none tracking-wide">
                <span>DESLIZE PARA FICAR ONLINE ➔</span>
              </div>

              {/* Barra de progresso preenchida */}
              <div 
                className="absolute left-0 top-0 bottom-0 bg-[#FF5E00]/40 transition-all rounded-3xl pointer-events-none"
                style={{ width: `${Math.max(dragProgress * 100, 10)}%` }}
              />

              {/* Botão deslizante (Puck estilo Uber) */}
              <div
                onMouseDown={handleTouchStart}
                onTouchStart={handleTouchStart}
                style={{
                  transform: `translateX(${dragProgress * (trackRef.current ? trackRef.current.clientWidth - 70 : 260)}px)`
                }}
                className="w-15 h-15 rounded-2xl bg-gradient-to-br from-[#FF7A29] to-[#FF5E00] text-white flex items-center justify-center shadow-xl cursor-grab active:cursor-grabbing z-10 transition-transform active:scale-95 touch-none"
              >
                <Power className="w-6 h-6 stroke-[2.5]" />
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-400 mt-2 font-medium">
              Arrastar até o final para abrir o mapa e liberar o rastreamento
            </p>
          </div>

        </div>
      )}

      {/* 2. SE ONLINE: BOTÃO FLUTUANTE EMBAIXO DO LADO DIREITO PARA FINALIZAR A SESSÃO */}
      {isDriverOnline && (
        <div className="absolute bottom-6 right-4 sm:right-6 z-30 pointer-events-auto animate-in slide-in-from-bottom-3 duration-200">
          <button
            type="button"
            onClick={() => setShowEndSessionModal(true)}
            aria-label="Finalizar sessão"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-white/80 bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-xl transition-all hover:from-rose-500 hover:to-rose-600 hover:shadow-2xl active:scale-95"
            title="Finalizar Sessão"
          >
            <Power className="h-5 w-5 stroke-[2.5]" />
          </button>
        </div>
      )}

      {/* 3. MODAL CONFIRMAÇÃO DE FINALIZAR SESSÃO */}
      {showEndSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Topo do Diálogo */}
            <div className="p-5 pb-3 flex items-start justify-between border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Power className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Finalizar Sessão
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Modo Motorista • EncomendasZap
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEndSessionModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo Central */}
            <div className="p-5 space-y-4">
              {/* Card com o tempo que ficou online */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  <Clock className="w-4 h-4 text-[#FF5E00]" />
                  <span>Tempo que você esteve online</span>
                </div>
                <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900">
                  {formatTime(driverActiveSeconds)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                  Duração total da sessão: <strong className="text-slate-700">{formatTimeExtenso(driverActiveSeconds)}</strong>
                </p>
              </div>

              {/* Mensagem e aviso do GPS */}
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-900">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs font-medium leading-relaxed">
                  Deseja realmente terminar essa sessão? Ao finalizar, o <strong>GPS será desconectado</strong>, o rastreamento em tempo real será pausado e a tela de bloqueio será reativada.
                </p>
              </div>
            </div>

            {/* Rodapé com Botões de Ação */}
            <div className="p-4 pt-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowEndSessionModal(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer"
              >
                Continuar Online
              </button>

              <button
                type="button"
                onClick={handleConfirmEndSession}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>Sim, Desconectar</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
