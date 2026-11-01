import React, { useState } from 'react';
import { 
  Download, 
  Smartphone, 
  Share, 
  PlusSquare, 
  X, 
  CheckCircle2, 
  ExternalLink, 
  Copy, 
  Laptop, 
  MoreVertical,
  Check
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar' | 'floating';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { isInstalled, isIOS, isAndroid, showGuide, setShowGuide, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);

  // If already running in standalone mode, hide button
  if (isInstalled) {
    return null;
  }

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleOpenDirect = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <>
      {variant === 'header' && (
        <button
          onClick={install}
          title="Instalar aplicativo EncomendasZap no dispositivo"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-sm hover:shadow transition-all duration-200 active:scale-95 cursor-pointer shrink-0 border border-orange-400/30 ${className}`}
        >
          <Download className="w-3.5 h-3.5 animate-bounce" />
          <span className="hidden sm:inline">Instalar App</span>
          <span className="sm:hidden">Instalar</span>
        </button>
      )}

      {variant === 'sidebar' && (
        <button
          onClick={install}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-orange-50 hover:bg-orange-100 text-[#FF5E00] border border-orange-200 transition-all cursor-pointer ${className}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#FF5E00] text-white flex items-center justify-center shadow-xs shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-black text-slate-800 leading-tight">Instalar Aplicativo</div>
              <div className="text-[10px] text-slate-500 font-medium leading-tight">Instale no celular ou computador</div>
            </div>
          </div>
          <span className="text-[10px] bg-[#FF5E00] text-white px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
            App
          </span>
        </button>
      )}

      {variant === 'floating' && (
        <button
          onClick={install}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full shadow-lg bg-slate-900/95 text-white text-xs font-semibold border border-white/10 hover:scale-105 active:scale-95 transition-all cursor-pointer ${className}`}
        >
          <Download className="w-4 h-4 text-orange-400" />
          <span>Instalar no celular</span>
        </button>
      )}

      {/* Modal Interativo e Completo de Instalação do Aplicativo */}
      {showGuide && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            
            {/* Topo do Modal */}
            <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#0B5187]/10 text-[#0B5187] flex items-center justify-center p-2 shrink-0 border border-[#0B5187]/20">
                  <img src="/logo.svg" alt="EncomendasZap" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base leading-tight">
                    Instalar EncomendasZap
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Aplicativo leve, rápido e com GPS integrado
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Fechar guia"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com Instruções Passo a Passo */}
            <div className="space-y-3.5 text-xs text-slate-700">

              {/* Se for iPhone / iPad */}
              {isIOS && (
                <div className="space-y-2 p-3 bg-amber-50/70 border border-amber-200 rounded-2xl">
                  <p className="font-black text-amber-950 flex items-center gap-1.5 text-xs">
                    <Smartphone className="w-4 h-4 text-amber-600" />
                    <span>Instalação no iPhone / iPad (Safari)</span>
                  </p>
                  <div className="space-y-1.5 text-slate-700 text-xs">
                    <div className="flex items-center gap-2">
                      <Share className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>1. Toque no botão <strong>Compartilhar</strong> na barra do Safari.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PlusSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>2. Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>3. Toque em <strong>Adicionar</strong> no canto superior direito.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Se for Android */}
              {isAndroid && (
                <div className="space-y-2 p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                  <p className="font-black text-emerald-950 flex items-center gap-1.5 text-xs">
                    <Smartphone className="w-4 h-4 text-emerald-700" />
                    <span>Instalação no Android (Chrome)</span>
                  </p>
                  <div className="space-y-1.5 text-slate-700 text-xs">
                    <div className="flex items-center gap-2">
                      <MoreVertical className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span>1. Toque nos <strong>3 pontinhos (⋮)</strong> no topo do navegador.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>2. Toque em <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>3. Confirme e o ícone aparecerá junto aos seus apps!</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Se for Computador / Desktop */}
              {!isIOS && !isAndroid && (
                <div className="space-y-2 p-3 bg-blue-50/70 border border-blue-200 rounded-2xl">
                  <p className="font-black text-[#0B5187] flex items-center gap-1.5 text-xs">
                    <Laptop className="w-4 h-4 text-[#0B5187]" />
                    <span>Instalação no Computador (Chrome / Edge)</span>
                  </p>
                  <div className="space-y-1.5 text-slate-700 text-xs">
                    <div className="flex items-center gap-2">
                      <Download className="w-3.5 h-3.5 text-[#0B5187] shrink-0" />
                      <span>1. Clique no ícone de instalar <strong>⊕</strong> na barra de endereço (ao lado da URL).</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MoreVertical className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span>2. Ou clique nos <strong>3 pontinhos (⋮)</strong> e selecione <strong>"Instalar EncomendasZap"</strong>.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Botões de Ação Rápida */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleOpenDirect}
                  className="w-full py-2.5 px-3 bg-[#0B5187] hover:bg-[#083D66] active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir em Nova Aba / Navegador Nativo</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                      <span className="text-emerald-700 font-black">Link Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500" />
                      <span>Copiar Link do Aplicativo</span>
                    </>
                  )}
                </button>
              </div>

            </div>

            {/* Rodapé do Modal */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-medium">PWA 100% Nativo</span>
              <button
                onClick={() => setShowGuide(false)}
                className="py-1.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
