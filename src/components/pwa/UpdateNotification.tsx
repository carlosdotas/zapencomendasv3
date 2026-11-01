import React, { useState } from 'react';
import { usePWAUpdate } from '../../services/pwaUpdateService';
import { RefreshCw, Sparkles, X, CheckCircle2 } from 'lucide-react';

export const UpdateNotification: React.FC = () => {
  const { needRefresh, isUpdating, applyUpdate } = usePWAUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[5000] w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#002B49]/95 text-white p-4 rounded-2xl shadow-2xl backdrop-blur-md border border-sky-400/30 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-[#FF5E00] flex items-center justify-center shrink-0 border border-orange-500/30">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-extrabold text-white tracking-tight">
              Nova versão disponível!
            </h4>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Atualização
            </span>
          </div>

          <p className="text-xs text-slate-300 mt-1 leading-snug">
            O aplicativo recebeu novidades e correções. Toque abaixo para carregar a versão mais recente.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => applyUpdate()}
              disabled={isUpdating}
              className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 bg-[#FF5E00] hover:bg-[#FF5E00]/90 active:scale-[0.98] text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? 'Atualizando...' : 'Atualizar Agora'}</span>
            </button>

            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Depois
            </button>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-white transition-colors p-1 -mr-1 -mt-1 cursor-pointer"
          title="Fechar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
