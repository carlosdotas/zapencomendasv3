import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Database, 
  CheckCircle2, 
  RefreshCw, 
  Save
} from 'lucide-react';
import { settingsService } from '../../../services/settingsService';

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
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isOnline = serverStatus === 'connected' || serverStatus === 'online';

  const handleSave = async () => {
    setIsSaving(true);
    onUpdateApiBaseUrl(tempApiUrl);

    await settingsService.saveSettings({
      server: {
        apiBaseUrl: tempApiUrl
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
              Servidor & Banco de Dados
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Status da conexão com a API e o banco de dados
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
              <span>Salvo!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
            </>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {/* Card 1: Status do servidor e banco de dados */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#0B5187] flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Banco de Dados MySQL
                </h2>
                <span className="text-[11px] text-slate-500 font-medium">
                  Acessado pelo backend via Prisma
                </span>
              </div>
            </div>

            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 border ${isOnline ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{isOnline ? 'Conectado' : serverStatus === 'checking' ? 'Verificando...' : 'Indisponível'}</span>
            </span>
          </div>

          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            {serverMessage || 'Pedidos, usuários, locais e configurações são lidos e gravados diretamente pela API. Os dados são atualizados periodicamente.'}
          </p>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onRefreshServerData}
              disabled={isSyncingServer}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingServer ? 'animate-spin' : ''}`} />
              <span>{isSyncingServer ? 'Atualizando...' : 'Atualizar Dados do Servidor'}</span>
            </button>
            {serverLatencyMs !== null && (
              <span className="text-xs text-slate-400 font-semibold">
                Latência: {serverLatencyMs}ms
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Parâmetros da API */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Endpoint de Conexão
          </h2>

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
            <span className="text-[10px] text-slate-400 mt-1 block">
              Deixe em branco para usar a mesma origem do aplicativo.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
