import React, { useState } from 'react';
import { 
  ArrowLeft, 
  CreditCard, 
  Check, 
  Plus, 
  Trash2, 
  Save, 
  Cloud, 
  CheckCircle2, 
  Percent, 
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { PaymentConditionRule, formatCurrency } from '../../../services/paymentSettingsService';
import { settingsService } from '../../../services/settingsService';

interface PaymentSettingsPageProps {
  onBack: () => void;
  rules: PaymentConditionRule[];
  onUpdate: (newRules: PaymentConditionRule[]) => void;
}

export const PaymentSettingsPage: React.FC<PaymentSettingsPageProps> = ({
  onBack,
  rules,
  onUpdate
}) => {
  const [localRules, setLocalRules] = useState<PaymentConditionRule[]>(rules);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleUpdateRule = (id: string, updates: Partial<PaymentConditionRule>) => {
    setLocalRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleSave = async () => {
    setIsSaving(true);
    onUpdate(localRules);
    await settingsService.saveSettings({ payments: localRules });
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="config-settings-page min-h-full pb-20 animate-in fade-in slide-in-from-right-4 duration-200">
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
              Condições de Pagamento
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Descontos antecipados e taxas por faturamento a prazo
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
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200/70 text-emerald-900 text-xs">
          <Cloud className="w-4 h-4 text-emerald-600 shrink-0 stroke-[2.4]" />
          <span className="font-semibold">
            Ao salvar, todos os dispositivos conectados aplicarão estas regras nos cálculos de detalhes do pedido.
          </span>
        </div>

        {/* Lista de Condições Estilo Android */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Regras por Forma de Pagamento
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Defina se a condição concede desconto comercial ou aplica acréscimo de taxa
            </p>
          </div>

          <div className="space-y-3">
            {localRules.map((rule) => {
              const hasDiscount = rule.adjustmentType === 'desconto';
              const hasSurcharge = rule.adjustmentType === 'acrescimo';

              return (
                <div 
                  key={rule.id}
                  className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 transition-colors space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-[#0B5187] shrink-0" />
                        <span className="text-xs font-black text-slate-900">{rule.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 pl-6 font-medium">
                        {rule.description}
                      </p>
                    </div>

                    {/* Badge de Impacto */}
                    <div className="pl-6 sm:pl-0 shrink-0">
                      {hasDiscount ? (
                        <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full">
                          🏷️ Desconto de {rule.adjustmentMode === 'percent' ? `${rule.adjustmentValue}%` : formatCurrency(rule.adjustmentValue)}
                        </span>
                      ) : hasSurcharge ? (
                        <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">
                          📈 Taxa de +{rule.adjustmentMode === 'percent' ? `${rule.adjustmentValue}%` : formatCurrency(rule.adjustmentValue)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                          Preço Padrão (Sem ajuste)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Controles de Configuração da Regra */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/60 pl-6 sm:pl-0">
                    {/* Tipo de Ajuste */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Efeito no Valor
                      </label>
                      <select
                        value={rule.adjustmentType}
                        onChange={(e) => handleUpdateRule(rule.id, { adjustmentType: e.target.value as any })}
                        className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:border-[#0B5187] focus:outline-none"
                      >
                        <option value="nenhum">Nenhum (Preço base)</option>
                        <option value="desconto">Desconto (Subtrai)</option>
                        <option value="acrescimo">Acréscimo de Taxa (Soma)</option>
                      </select>
                    </div>

                    {/* Modo: Porcentagem ou Valor Fixo */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Formato do Ajuste
                      </label>
                      <select
                        disabled={rule.adjustmentType === 'nenhum'}
                        value={rule.adjustmentMode}
                        onChange={(e) => handleUpdateRule(rule.id, { adjustmentMode: e.target.value as any })}
                        className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:border-[#0B5187] focus:outline-none disabled:opacity-50"
                      >
                        <option value="percent">Porcentagem (%)</option>
                        <option value="fixed">Valor Fixo (R$)</option>
                      </select>
                    </div>

                    {/* Valor numérico */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Valor ({rule.adjustmentMode === 'percent' ? '%' : 'R$'})
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        disabled={rule.adjustmentType === 'nenhum'}
                        value={rule.adjustmentValue}
                        onChange={(e) => handleUpdateRule(rule.id, { adjustmentValue: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="w-full text-xs font-black bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:border-[#0B5187] focus:outline-none disabled:opacity-50"
                      />
                    </div>
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
