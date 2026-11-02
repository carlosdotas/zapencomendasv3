import React, { useState } from 'react';
import { 
  ArrowLeft, 
  DollarSign, 
  Package, 
  Truck, 
  MapPin, 
  Check, 
  Sparkles, 
  Info, 
  Save, 
  Cloud,
  CheckCircle2
} from 'lucide-react';
import { CurrencyCentsInput } from '../../common/CurrencyCentsInput';
import { PricingSettings, PricingModelType } from '../../../services/pricingSettingsService';
import { settingsService } from '../../../services/settingsService';

interface PricingSettingsPageProps {
  onBack: () => void;
  pricingSettings: PricingSettings;
  onUpdate: (newSettings: PricingSettings) => void;
}

export const PricingSettingsPage: React.FC<PricingSettingsPageProps> = ({
  onBack,
  pricingSettings,
  onUpdate
}) => {
  const [model, setModel] = useState<PricingModelType>(pricingSettings.pricingModel);
  const [coletaRate, setColetaRate] = useState(pricingSettings.defaultColetaRate || 8.0);
  const [entregaRate, setEntregaRate] = useState(pricingSettings.defaultEntregaRate || 6.0);
  const [freightRate, setFreightRate] = useState(pricingSettings.defaultFreightRate || 25.0);
  const [kmRate, setKmRate] = useState(pricingSettings.defaultKmRate || 1.8);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const updated: PricingSettings = {
      pricingModel: model,
      defaultColetaRate: coletaRate,
      defaultEntregaRate: entregaRate,
      defaultFreightRate: freightRate,
      defaultKmRate: kmRate
    };

    onUpdate(updated);
    await settingsService.saveSettings({ pricing: updated });
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
              Preços e Modelo de Frete
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Cobrança discriminada ou taxa única de entrega
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
              <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
            </>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {/* Banner de Sincronização Android */}
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-blue-50 border border-blue-200/70 text-blue-900 text-xs">
          <Cloud className="w-4 h-4 text-[#0B5187] shrink-0 stroke-[2.4]" />
          <span className="font-semibold">
            As alterações são salvas no <strong>servidor</strong> e sincronizadas automaticamente em todos os aparelhos conectados.
          </span>
        </div>

        {/* Card 1: Escolha do Modelo de Cobrança */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              1. Selecione o Modelo de Cobrança
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolha como o valor das encomendas será apresentado e calculado para os clientes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Opção 1: Discriminado */}
            <div
              onClick={() => setModel('discriminado')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                model === 'discriminado'
                  ? 'border-[#0B5187] bg-blue-50/40 ring-4 ring-[#0B5187]/10'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-900">
                  Preço Discriminado
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  model === 'discriminado' ? 'border-[#0B5187] bg-[#0B5187]' : 'border-slate-300'
                }`}>
                  {model === 'discriminado' && <Check className="w-3 h-3 text-white stroke-[3.5]" />}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-[#0B5187]">
                <Package className="w-3.5 h-3.5" />
                <span>Coleta + Transporte + Entrega</span>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Ideal para transportes entre cidades e hubs onde cada etapa (coleta no cliente, translado rodoviário e entrega final) tem seu custo discriminado na fatura.
              </p>
            </div>

            {/* Opção 2: Frete Único */}
            <div
              onClick={() => setModel('frete_unico')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                model === 'frete_unico'
                  ? 'border-[#0B5187] bg-blue-50/40 ring-4 ring-[#0B5187]/10'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-900">
                  Preço do Frete Único
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  model === 'frete_unico' ? 'border-[#0B5187] bg-[#0B5187]' : 'border-slate-300'
                }`}>
                  {model === 'frete_unico' && <Check className="w-3 h-3 text-white stroke-[3.5]" />}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-amber-700">
                <Truck className="w-3.5 h-3.5" />
                <span>Valor Fechado por Pedido</span>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Cobrança unificada. Mostra diretamente o valor consolidado do frete, ideal para entregas urbanas diretas ou tabelas fixas.
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Valores Padrão Sugeridos */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              2. Valores Padrão Sugeridos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Valores pré-preenchidos ao abrir uma nova encomenda (editáveis por pedido)
            </p>
          </div>

          {model === 'discriminado' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Coleta */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#0B5187] flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Taxa de Coleta</span>
                </div>
                <CurrencyCentsInput
                  value={coletaRate}
                  onChange={setColetaRate}
                  prefix="R$"
                  className="w-full text-base font-black text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200 focus:border-[#0B5187] focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Sugerido por coleta</span>
              </div>

              {/* Entrega */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Taxa de Entrega</span>
                </div>
                <CurrencyCentsInput
                  value={entregaRate}
                  onChange={setEntregaRate}
                  prefix="R$"
                  className="w-full text-base font-black text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200 focus:border-[#0B5187] focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Sugerido por entrega</span>
              </div>

              {/* Tarifa por Km */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center">
                    <Truck className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Translado / Km</span>
                </div>
                <CurrencyCentsInput
                  value={kmRate}
                  onChange={setKmRate}
                  prefix="R$"
                  className="w-full text-base font-black text-slate-900 bg-white px-3 py-2 rounded-xl border border-slate-200 focus:border-[#0B5187] focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Cálculo de rota rodoviária</span>
              </div>
            </div>
          ) : (
            <div className="max-w-md">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#FF5E00] flex items-center justify-center">
                    <Truck className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Valor Padrão do Frete</span>
                </div>
                <CurrencyCentsInput
                  value={freightRate}
                  onChange={setFreightRate}
                  prefix="R$"
                  className="w-full text-lg font-black text-slate-900 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#0B5187] focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Valor único pré-preenchido por pedido</span>
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Informação Adicional Android */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-start gap-3">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 leading-relaxed font-medium">
            O botão <strong>Adicionar mais preço ou taxa</strong> no formulário de pedidos permite incluir itens adicionais (Taxa de Espera, Taxa de Urgência, etc.) sobre qualquer um dos modelos selecionados.
          </div>
        </div>
      </div>
    </div>
  );
};
