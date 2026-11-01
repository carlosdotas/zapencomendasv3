import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ShieldCheck, 
  Camera, 
  MapPin, 
  Sliders, 
  Save, 
  Cloud, 
  CheckCircle2, 
  Check, 
  Building2 
} from 'lucide-react';
import { firebaseSettingsService } from '../../../services/firebaseSettingsService';

interface SecurityOperationSettingsPageProps {
  onBack: () => void;
  systemName: string;
  systemMode: 'producao' | 'homologacao';
  proximityRadiusKm: number;
  requirePhotoOnFinish: boolean;
  autoAssignDrivers: boolean;
  onUpdate: (data: {
    systemName: string;
    systemMode: 'producao' | 'homologacao';
    proximityRadiusKm: number;
    requirePhotoOnFinish: boolean;
    autoAssignDrivers: boolean;
  }) => void;
}

const AndroidSwitch: React.FC<{
  checked: boolean;
  onChange: (val: boolean) => void;
}> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!checked);
    }}
    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
      checked ? 'bg-[#0B5187]' : 'bg-slate-300 hover:bg-slate-400'
    }`}
  >
    <span
      className={`pointer-events-none inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    >
      {checked && <Check className="w-3 h-3 text-[#0B5187] stroke-[3.5]" />}
    </span>
  </button>
);

export const SecurityOperationSettingsPage: React.FC<SecurityOperationSettingsPageProps> = ({
  onBack,
  systemName: initialName,
  systemMode: initialMode,
  proximityRadiusKm: initialRadius,
  requirePhotoOnFinish: initialPhoto,
  autoAssignDrivers: initialAutoAssign,
  onUpdate
}) => {
  const [systemName, setSystemName] = useState(initialName);
  const [systemMode, setSystemMode] = useState(initialMode);
  const [radiusKm, setRadiusKm] = useState(initialRadius);
  const [requirePhoto, setRequirePhoto] = useState(initialPhoto);
  const [autoAssign, setAutoAssign] = useState(initialAutoAssign);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    onUpdate({
      systemName,
      systemMode,
      proximityRadiusKm: radiusKm,
      requirePhotoOnFinish: requirePhoto,
      autoAssignDrivers: autoAssign
    });

    await firebaseSettingsService.saveSettings({
      system: {
        systemName,
        systemMode
      },
      operation: {
        proximityRadiusKm: radiusKm,
        requirePhotoOnFinish: requirePhoto,
        autoAssignDrivers: autoAssign
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
              Segurança e Operação
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Regras de despacho, raio de atendimento e exigência de fotos
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
        {/* Card 1: Identidade do Sistema */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Identidade do Sistema
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nome da Frota / Aplicação
              </label>
              <input
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                className="w-full text-xs font-bold bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0B5187] rounded-xl px-3.5 py-2.5 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Ambiente de Execução
              </label>
              <select
                value={systemMode}
                onChange={(e) => setSystemMode(e.target.value as any)}
                className="w-full text-xs font-bold bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0B5187] rounded-xl px-3.5 py-2.5 focus:outline-none transition-colors"
              >
                <option value="producao">Produção Oficial</option>
                <option value="homologacao">Homologação & Testes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 2: Regras Operacionais */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
            Regras de Baixa e Despacho
          </h2>

          <div className="space-y-4 divide-y divide-slate-100">
            {/* Exigir Foto na Baixa */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#FF5E00] flex items-center justify-center shrink-0">
                  <Camera className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900 block">
                    Exigir Foto Comprovante na Baixa
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Obriga o motorista a capturar foto da mercadoria entregue/coletada
                  </span>
                </div>
              </div>
              <AndroidSwitch
                checked={requirePhoto}
                onChange={setRequirePhoto}
              />
            </div>

            {/* Atribuição Automática */}
            <div className="pt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0B5187] flex items-center justify-center shrink-0">
                  <Sliders className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-xs font-black text-slate-900 block">
                    Atribuição Automática por Proximidade
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Sugerir automaticamente o motorista mais próximo do local de coleta
                  </span>
                </div>
              </div>
              <AndroidSwitch
                checked={autoAssign}
                onChange={setAutoAssign}
              />
            </div>

            {/* Raio Máximo */}
            <div className="pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Raio Máximo de Despacho (km): <span className="text-[#0B5187] font-black">{radiusKm} km</span>
                </label>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={radiusKm}
                onChange={(e) => setRadiusKm(parseInt(e.target.value) || 5)}
                className="w-full accent-[#0B5187] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-semibold">
                <span>1 km (Urbano denso)</span>
                <span>25 km (Regional)</span>
                <span>50 km (Metropolitano)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
