import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  LogOut,
  Zap,
  Radio,
  ShieldCheck,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { useAppVersion } from '../../hooks/useAppVersion';
import { getDriverPermanentColor } from '../../utils/driverColorUtils';
import { androidBridge } from '../../services/androidBridge';

export const DriverScreenOverlay: React.FC = () => {
  const appVersion = useAppVersion();
  const { 
    currentRole, 
    isAuthenticated,
    isDriverOnline, 
    setIsDriverOnline, 
    driverActiveSeconds,
    userLocation,
    flyToLocation,
    locateUser,
    focusDriverLocation,
    stopUserTracking,
    user,
    startBackgroundGps,
    stopBackgroundGps,
    backgroundTrackingStatus
  } = useMapStore();

  const [dragProgress, setDragProgress] = useState(0); // 0.0 to 1.0
  const [isDragging, setIsDragging] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef<number>(0);
  const startProgressRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const dragProgressRef = useRef<number>(0);

  dragProgressRef.current = dragProgress;
  isDraggingRef.current = isDragging;

  useEffect(() => {
    if (!isAuthenticated || currentRole !== 'motorista' || !isDriverOnline) return;
    window.AndroidApp?.requireUrgentFullScreenPermission?.();
    return () => window.AndroidApp?.clearUrgentFullScreenRequirement?.();
  }, [isAuthenticated, currentRole, isDriverOnline]);

  // Cor permanente do motorista para a identidade visual
  const driverColor = getDriverPermanentColor(user.id || user.phone || user.name);

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

  // Ativação da sessão com animação suave e feedback tátil
  const triggerActivation = useCallback(() => {
    if (isActivating) return;
    if (!androidBridge.prepareDriverAlerts()) {
      setDragProgress(0);
      return;
    }
    setIsActivating(true);
    setDragProgress(1);

    // Feedback háptico em celulares / PWA
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([40, 30, 80]); } catch {}
    }
    if (typeof window !== 'undefined' && (window as any).AndroidApp?.vibrate) {
      try { (window as any).AndroidApp.vibrate(120); } catch {}
    }

    setTimeout(() => {
      setIsDriverOnline(true);
      startBackgroundGps();
      locateUser();
      focusDriverLocation();
      setIsActivating(false);
      setDragProgress(0);
    }, 380);
  }, [isActivating, setIsDriverOnline, startBackgroundGps, locateUser, focusDriverLocation]);

  // Manipuladores de Pointer Events (suporte nativo e infalível em Touch, Mouse e Caneta)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isActivating) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Se o motorista tocar diretamente no lado direito do trilho (> 65%), ativa automaticamente
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / (rect.width || 1);
    if (clickRatio > 0.65) {
      triggerActivation();
      return;
    }

    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startProgressRef.current = dragProgressRef.current;
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId || !isDraggingRef.current || isActivating) return;
    if (!trackRef.current) return;

    const trackWidth = trackRef.current.clientWidth;
    const puckSize = 56;
    const padding = 12;
    const maxTravel = Math.max(1, trackWidth - puckSize - padding);

    const deltaX = e.clientX - startXRef.current;
    const newProgress = Math.min(1, Math.max(0, startProgressRef.current + (deltaX / maxTravel)));
    setDragProgress(newProgress);

    // Se arrastou além de 75%, completa e ativa imediatamente sem precisar soltar
    if (newProgress >= 0.75) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      pointerIdRef.current = null;
      setIsDragging(false);
      triggerActivation();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    pointerIdRef.current = null;
    setIsDragging(false);

    if (dragProgressRef.current >= 0.55) {
      triggerActivation();
    } else {
      setDragProgress(0);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    pointerIdRef.current = null;
    setIsDragging(false);
    setDragProgress(0);
  };

  // Confirmação para finalizar sessão e desconectar do GPS
  const handleConfirmEndSession = () => {
    stopBackgroundGps();
    stopUserTracking();
    setIsDriverOnline(false);
    setShowEndSessionModal(false);
  };

  // Cálculo da translação do botão deslizante
  const trackWidth = trackRef.current ? trackRef.current.clientWidth : 320;
  const puckSize = 54;
  const padding = 10;
  const maxTravel = Math.max(1, trackWidth - puckSize - padding);
  const puckOffset = dragProgress * maxTravel;

  // Somente exibe para o perfil de motorista
  if (currentRole !== 'motorista') {
    return null;
  }

  return (
    <>
      {/* 1. SE OFFLINE: TELA DE BLOQUEIO DO MOTORISTA */}
      {!isDriverOnline && (
        <div className="absolute inset-0 z-40 bg-gradient-to-b from-[#090D16] via-[#0F172A] to-[#070A12] flex flex-col justify-between p-4 sm:p-7 select-none overflow-hidden animate-in fade-in duration-300">
          
          {/* Luzes de fundo ambiente */}
          <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-[#FF5E00]/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-[#007AFF]/15 blur-3xl pointer-events-none" />

          {/* Header da Tela de Bloqueio */}
          <div 
            className="relative z-10 flex items-center justify-between text-white"
            style={{ paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 6px)' }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-lg border border-white/20 shrink-0"
                style={{ backgroundColor: driverColor }}
              >
                {user.name ? user.name.slice(0, 2).toUpperCase() : 'MT'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-orange-200 border border-white/10">
                    Motorista
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {(user as any).cidade || 'Goiânia / Anápolis'}
                  </span>
                </div>
                <h1 className="text-base sm:text-lg font-black truncate max-w-[200px] sm:max-w-xs mt-0.5">
                  {user.name || 'Motorista'}
                </h1>
              </div>
            </div>

            {/* Pill Indicador de Status Offline */}
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-black shadow-inner shrink-0">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              Offline
            </span>
          </div>

          {/* Card Central Estilizado (Visual mais bonitinho e profissional) */}
          <div className="relative z-10 max-w-md w-full mx-auto my-auto py-2">
            <div className="bg-slate-900/75 border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl text-center">
              
              {/* Ícone com pulso e visual premium */}
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="absolute inset-0 rounded-3xl bg-[#FF5E00]/25 animate-ping opacity-60" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FF7A29] to-[#FF5E00] flex items-center justify-center shadow-xl shadow-[#FF5E00]/30 border border-white/30 text-white">
                  <Bike className="w-10 h-10 stroke-[2.3]" />
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md border-2 border-slate-900">
                    <Zap className="w-4 h-4 fill-current text-slate-950" />
                  </div>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
                Pronto para rodar?
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium mb-5 px-2">
                Deslize o botão abaixo para <strong className="text-white">Ficar Online</strong>. Seu GPS transmitirá suas rotas em tempo real para a central e clientes, mesmo com o celular no bolso ou suporte.
              </p>

              {/* Badges de recursos / segurança */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/10 text-[11px] font-bold text-slate-300">
                <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center gap-1">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span>GPS 2º Plano</span>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center gap-1">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Coleta & Entrega</span>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>Conexão Segura</span>
                </div>
              </div>

            </div>
          </div>

          {/* Slider Estilo Uber/iFood Aprimorado com Pointer Events e Fallback */}
          <div className="relative z-10 max-w-md mx-auto w-full pb-2">
            
            {/* Trilho Deslizante */}
            <div
              ref={trackRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              className="relative h-16 sm:h-[68px] bg-slate-950/90 border-2 border-white/15 hover:border-[#FF5E00]/50 rounded-full p-1.5 flex items-center select-none overflow-hidden shadow-2xl touch-none cursor-pointer group transition-colors"
            >
              {/* Barra de preenchimento progressivo com gradiente */}
              <div 
                className="absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r from-[#FF5E00] via-[#FF8A00] to-emerald-500 pointer-events-none transition-all"
                style={{ 
                  width: `${Math.max(dragProgress * 100, 4)}%`,
                  opacity: Math.max(dragProgress * 0.9, 0.2)
                }}
              />

              {/* Texto pulsante no centro do trilho com chevrons */}
              <div 
                className="absolute inset-0 flex items-center justify-center gap-1 text-xs sm:text-sm font-black text-white/90 pointer-events-none tracking-wider transition-opacity duration-150 pl-10"
                style={{ opacity: Math.max(0, 1 - dragProgress * 1.6) }}
              >
                <span>DESLIZE PARA FICAR ONLINE</span>
                <span className="flex items-center text-amber-300 animate-pulse">
                  <ChevronRight className="w-4 h-4 stroke-[3] -mr-1" />
                  <ChevronRight className="w-4 h-4 stroke-[3] -mr-1" />
                  <ChevronRight className="w-4 h-4 stroke-[3]" />
                </span>
              </div>

              {/* Botão deslizante (Puck / Manípulo tátil) */}
              <div
                style={{
                  transform: `translateX(${puckOffset}px)`,
                  transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)'
                }}
                className={`w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-full text-white flex items-center justify-center shadow-2xl cursor-grab active:cursor-grabbing z-20 transition-all duration-150 border-2 ${
                  dragProgress >= 0.70 || isActivating
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-white shadow-emerald-500/50'
                    : 'bg-gradient-to-br from-[#FF7A29] via-[#FF5E00] to-[#E05300] border-white/60 shadow-[#FF5E00]/50 hover:scale-105 active:scale-95'
                }`}
              >
                {isActivating ? (
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                ) : dragProgress >= 0.70 ? (
                  <CheckCircle2 className="w-7 h-7 text-white stroke-[2.5]" />
                ) : (
                  <Power className="w-6 h-6 stroke-[2.5] transition-transform group-hover:rotate-12" />
                )}
              </div>
            </div>

            {/* Atalho alternativo: botão direto para toque (ótimo para luvas de moto) */}
            <button
              type="button"
              onClick={triggerActivation}
              disabled={isActivating}
              className="w-full mt-2 text-center text-xs font-bold text-orange-300/80 hover:text-orange-200 py-1.5 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current text-[#FF5E00]" />
              <span>Ou toque aqui para iniciar direto</span>
            </button>

            <div className="mt-1 text-center">
              <span className="inline-block text-[10px] text-slate-400 font-medium tracking-tight bg-slate-900/60 px-3 py-0.5 rounded-full border border-slate-800 shadow-2xs select-none">
                Criado por: Carlos Dottas {appVersion}
              </span>
            </div>

          </div>

        </div>
      )}

      {/* 2. SE ONLINE: VERSÃO DO APP CENTRALIZADA NO RODAPÉ */}
      {isDriverOnline && (
        <div className="absolute bottom-2.5 sm:bottom-3.5 left-0 right-0 z-20 px-3 pointer-events-none flex justify-center animate-in fade-in duration-200">
          <div className="text-[10px] text-slate-500/90 font-medium tracking-tight text-center select-none pointer-events-none drop-shadow-xs bg-white/80 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-slate-200/70 shadow-2xs">
            Criado por: Carlos Dottas {appVersion}
          </div>
        </div>
      )}

      {/* 3. SE ONLINE: BOTÃO FLUTUANTE EMBAIXO DO LADO DIREITO PARA FINALIZAR A SESSÃO */}
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

      {/* 4. MODAL CONFIRMAÇÃO DE FINALIZAR SESSÃO */}
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
                    Modo Motorista • EncomendasZap {appVersion}
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
