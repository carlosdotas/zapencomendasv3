import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Server, 
  Database, 
  Cloud, 
  Wifi, 
  CheckCircle2, 
  RefreshCw, 
  Save, 
  ShieldCheck, 
  Layers 
} from 'lucide-react';
import { firebaseSettingsService } from '../../../services/firebaseSettingsService';
import { realtimeAssignmentService } from '../../../services/realtimeAssignmentService';

interface ServerSyncSettingsPageProps {
  onBack: () => void;
  apiBaseUrl: string;
  onUpdateApiBaseUrl: (url: string) => void;
  serverStatus: 'connected' | 'online' | 'offline' | 'checking' | 'error';
  serverMessage: string;
  serverLatencyMs: number | null;
  onRefreshServerData: () => Promise<void>;
  isSyncingServer: boolean;
}

export const ServerSyncSettingsPage: React.FC<ServerSyncSettingsPageProps> = ({
  onBack,
  apiBaseUrl,
  onUpdateApiBaseUrl,
  serverStatus,
  serverMessage,
  serverLatencyMs,
  onRefreshServerData,
  isSyncingServer
}) => {
  const [tempApiUrl, setTempApiUrl] = useState(apiBaseUrl);
  const [firebaseRtdbUrl, setFirebaseRtdbUrl] = useState(() => realtimeAssignmentService.getFirebaseRtdbUrl());
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    onUpdateApiBaseUrl(tempApiUrl);
    realtimeAssignmentService.setFirebaseRtdbUrl(firebaseRtdbUrl);

    await firebaseSettingsService.saveSettings({
      server: {
        apiBaseUrl: tempApiUrl,
        firebaseRtdbUrl
      }
    });

    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="min-h-full pb-20 animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Top App Bar Estilo Android */}
      <div className="sticky top-0 z-20 bg-[#F8F9FA]/95 backdrop-blur-md px-4 sm:px-6 py-3 border-b border-slate-200/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full hover:bg-slate-200/80 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
            title="Voltar para Configurações"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.3]" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
              Servidores & Nuvem
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Conexão com Firebase Firestore, Realtime Database e API
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B5187] hover:bg-[#083e68] active:scale-95 text-white font-bold text-xs rounded-full shadow-md shadow-[#0B5187]/20 transition-all cursor-pointer"
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[3]" />
              <span>Salvo na Nuvem!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Salvar no Firebase'}</span>
            </>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {/* Card 1: Status do Firebase Firestore */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#0B5187] flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Firebase Firestore (Banco Oficial)
                </h2>
                <span className="text-[11px] text-slate-500 font-medium">
                  Projeto: <code>zapencomendas-507212</code> • Banco: <code>(default)</code>
                </span>
              </div>
            </div>

            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Ativo em Tempo Real</span>
            </span>
          </div>

          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Todos os 3.636 locais e histórico de pedidos são mantidos com sincronização bi-direcional contínua na nuvem com suporte a funcionamento offline automático via IndexedDB.
          </p>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onRefreshServerData}
              disabled={isSyncingServer}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingServer ? 'animate-spin' : ''}`} />
              <span>{isSyncingServer ? 'Sincronizando...' : 'Forçar Sincronização Geral'}</span>
            </button>
            {serverLatencyMs !== null && (
              <span className="text-xs text-slate-400 font-semibold">
                Latência: {serverLatencyMs}ms
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Parâmetros da API e RTDB */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Endpoints de Conexão
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                URL Base da API Backend (Node.js / Express)
              </label>
              <input
                type="url"
                value={tempApiUrl}
                onChange={(e) => setTempApiUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full text-xs font-bold bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0B5187] rounded-xl px-3.5 py-2.5 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                URL do Firebase Realtime Database (RTDB)
              </label>
              <input
                type="url"
                value={firebaseRtdbUrl}
                onChange={(e) => setFirebaseRtdbUrl(e.target.value)}
                placeholder="https://zapencomendas-507212-default-rtdb.firebaseio.com"
                className="w-full text-xs font-bold bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0B5187] rounded-xl px-3.5 py-2.5 focus:outline-none transition-colors"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Utilizado para o streaming instantâneo de atribuição de motoristas e telemetria de GPS.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
