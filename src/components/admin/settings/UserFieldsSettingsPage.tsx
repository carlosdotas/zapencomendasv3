import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Users, 
  ShieldAlert, 
  Check, 
  Save, 
  Cloud, 
  CheckCircle2, 
  User, 
  Phone, 
  FileText, 
  MapPin, 
  Mail, 
  Search,
  AlertCircle
} from 'lucide-react';
import { UserRequiredFieldsConfig } from '../../../types/map';
import { firebaseSettingsService } from '../../../services/firebaseSettingsService';

interface UserFieldsSettingsPageProps {
  onBack: () => void;
  config: UserRequiredFieldsConfig;
  onUpdate: (newConfig: UserRequiredFieldsConfig) => void;
}

// Switch no Estilo Android Material 3
const AndroidSwitch: React.FC<{
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    } ${checked ? 'bg-[#0B5187]' : 'bg-slate-300 hover:bg-slate-400'}`}
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

export const UserFieldsSettingsPage: React.FC<UserFieldsSettingsPageProps> = ({
  onBack,
  config: initialConfig,
  onUpdate
}) => {
  const [config, setConfig] = useState<UserRequiredFieldsConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [search, setSearch] = useState('');

  const fields = [
    { key: 'fullName' as const, label: 'Nome Completo / Razão Social', desc: 'Identificação principal do cliente ou destinatário', icon: User, locked: true },
    { key: 'phone' as const, label: 'Celular com WhatsApp', desc: 'Contato indispensável para atualizações da entrega', icon: Phone, locked: true },
    { key: 'cpf' as const, label: 'CPF ou CNPJ', desc: 'Documento fiscal para emissão e validação jurídica', icon: FileText },
    { key: 'address' as const, label: 'Endereço Completo com Número', desc: 'Logradouro, número, bairro e cidade', icon: MapPin },
    { key: 'coordinates' as const, label: 'Localização Georreferenciada (GPS)', desc: 'Pino com latitude/longitude exata confirmada no mapa', icon: MapPin },
    { key: 'email' as const, label: 'Endereço de E-mail', desc: 'Envio de comprovantes fiscais e resumos por e-mail', icon: Mail },
    { key: 'birthDate' as const, label: 'Data de Nascimento / Fundação', desc: 'Verificação etária e conformidade fiscal', icon: FileText }
  ];

  const filteredFields = fields.filter(f => 
    f.label.toLowerCase().includes(search.toLowerCase()) || 
    f.desc.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = Object.entries(config).filter(([k, v]) => k !== 'blockIfIncomplete' && Boolean(v)).length;

  const handleToggle = (key: keyof UserRequiredFieldsConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    onUpdate(config);
    await firebaseSettingsService.saveSettings({ userRequiredFields: config });
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
              Cadastro e Campos Obrigatórios
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              {activeCount} de {fields.length} campos ativados • Regras de validação
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
        {/* Banner de Bloqueio Estilo Card Android */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              config.blockIfIncomplete ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
            }`}>
              <ShieldAlert className="w-5 h-5 stroke-[2.3]" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 leading-tight">
                Bloquear Pedidos com Cadastro Incompleto
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                Impede o avanço de novos pedidos caso o cliente selecionado não possua todos os campos marcados como obrigatórios.
              </p>
            </div>
          </div>

          <AndroidSwitch
            checked={Boolean(config.blockIfIncomplete)}
            onChange={(val) => setConfig(prev => ({ ...prev, blockIfIncomplete: val }))}
          />
        </div>

        {/* Lista de Campos com Switches */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Campos Exigidos no Formulário
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ative os dados que não podem faltar no cadastro de novos clientes
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredFields.map((field) => {
              const Icon = field.icon;
              const isChecked = Boolean(config[field.key as keyof UserRequiredFieldsConfig]);

              return (
                <div 
                  key={field.key}
                  onClick={() => !field.locked && handleToggle(field.key as keyof UserRequiredFieldsConfig)}
                  className={`py-3.5 flex items-center justify-between gap-3 transition-colors ${
                    field.locked ? 'opacity-85 cursor-default' : 'hover:bg-slate-50/70 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isChecked ? 'bg-blue-50 text-[#0B5187]' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 truncate">
                          {field.label}
                        </span>
                        {field.locked && (
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                            Essencial
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium truncate">
                        {field.desc}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    <AndroidSwitch
                      checked={isChecked}
                      disabled={field.locked}
                      onChange={() => handleToggle(field.key as keyof UserRequiredFieldsConfig)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
