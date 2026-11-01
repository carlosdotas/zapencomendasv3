import React from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { useMapStore } from '../../context/MapContext';

export const GpsStatusBanner: React.FC = () => {
  const { gpsError, clearGpsError, retryGps, isLocating } = useMapStore();

  if (!gpsError) return null;

  const handleOpenStandalone = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  const isIframeBlocked = gpsError.type === 'iframe_blocked' || gpsError.canOpenStandalone;

  return (
    <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-xl animate-in fade-in slide-from-top-3 duration-200 pointer-events-auto">
      <div className="bg-amber-900/95 text-amber-50 backdrop-blur-md border border-amber-600/70 rounded-xl p-3 sm:p-4 shadow-2xl flex items-start gap-3">
        <div className="p-2 bg-amber-800/80 rounded-lg text-amber-300 shrink-0 mt-0.5">
          {isIframeBlocked ? (
            <ShieldAlert className="w-5 h-5 text-amber-300" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-bold text-white tracking-wide">
              {isIframeBlocked
                ? 'Permissão de GPS no Site'
                : gpsError.type === 'insecure_context'
                ? 'Conexão HTTPS Necessária'
                : 'Aviso de GPS e Localização'}
            </h4>
          </div>
          <p className="text-xs text-amber-100/90 leading-relaxed mb-3">
            {gpsError.message}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {isIframeBlocked && (
              <button
                type="button"
                onClick={handleOpenStandalone}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir com GPS Nativo</span>
              </button>
            )}

            <button
              type="button"
              onClick={retryGps}
              disabled={isLocating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-lg transition-colors active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'Obtendo GPS...' : 'Tentar Novamente'}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={clearGpsError}
          title="Fechar aviso"
          className="p-1 text-amber-300/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
