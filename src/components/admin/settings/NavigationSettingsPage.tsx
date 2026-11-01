import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Navigation, 
  Check, 
  Save, 
  Cloud, 
  CheckCircle2, 
  Compass, 
  ExternalLink 
} from 'lucide-react';
import { firebaseSettingsService } from '../../../services/firebaseSettingsService';

interface NavigationSettingsPageProps {
  onBack: () => void;
  defaultNavApp: 'google_maps' | 'waze' | null;
  onUpdate: (app: 'google_maps' | 'waze' | null) => void;
}

export const NavigationSettingsPage: React.FC<NavigationSettingsPageProps> = ({
  onBack,
  defaultNavApp: initialApp,
  onUpdate
}) => {
  const [selectedApp, setSelectedApp] = useState<'google_maps' | 'waze' | null>(initialApp);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    onUpdate(selectedApp);
    await firebaseSettingsService.saveSettings({
      navigation: {
        defaultNavApp: selectedApp,
        saveAsDefault: selectedApp !== null
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
              Navegação GPS Padrão
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Aplicativo preferido para traçar rotas e guiar entregas
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
        {/* Banner de Sincronização Android */}
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-cyan-50 border border-cyan-200/70 text-cyan-950 text-xs">
          <Cloud className="w-4 h-4 text-cyan-700 shrink-0 stroke-[2.4]" />
          <span className="font-semibold">
            Ao clicar no botão <strong>Navegar</strong> nos detalhes do pedido, o aplicativo selecionado abrirá imediatamente com a rota pronta.
          </span>
        </div>

        {/* Card Seletor Estilo Android */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-3.5">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Escolha o Aplicativo Padrão
          </h2>

          <div className="space-y-3">
            {/* Google Maps */}
            <div
              onClick={() => setSelectedApp('google_maps')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                selectedApp === 'google_maps'
                  ? 'border-[#0B5187] bg-blue-50/50 ring-4 ring-[#0B5187]/10'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                  <Compass className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900 block">Google Maps</span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Traça rota direta de condução com tráfego e estimativa do Google
                  </span>
                </div>
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                selectedApp === 'google_maps' ? 'border-[#0B5187] bg-[#0B5187]' : 'border-slate-300'
              }`}>
                {selectedApp === 'google_maps' && <Check className="w-3 h-3 text-white stroke-[3.5]" />}
              </div>
            </div>

            {/* Waze */}
            <div
              onClick={() => setSelectedApp('waze')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                selectedApp === 'waze'
                  ? 'border-[#0B5187] bg-blue-50/50 ring-4 ring-[#0B5187]/10'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-700 shrink-0">
                  <Navigation className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900 block">Waze</span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Alertas da comunidade em tempo real, radares e desvios de trânsito
                  </span>
                </div>
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                selectedApp === 'waze' ? 'border-[#0B5187] bg-[#0B5187]' : 'border-slate-300'
              }`}>
                {selectedApp === 'waze' && <Check className="w-3 h-3 text-white stroke-[3.5]" />}
              </div>
            </div>

            {/* Perguntar Sempre */}
            <div
              onClick={() => setSelectedApp(null)}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                selectedApp === null
                  ? 'border-[#0B5187] bg-blue-50/50 ring-4 ring-[#0B5187]/10'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                  <Navigation className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900 block">Perguntar Sempre</span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Exibe a janela de escolha entre Google Maps e Waze a cada clique
                  </span>
                </div>
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                selectedApp === null ? 'border-[#0B5187] bg-[#0B5187]' : 'border-slate-300'
              }`}>
                {selectedApp === null && <Check className="w-3 h-3 text-white stroke-[3.5]" />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
