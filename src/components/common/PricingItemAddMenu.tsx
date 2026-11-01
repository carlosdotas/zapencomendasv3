import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Clock, 
  Zap, 
  RotateCcw, 
  Package, 
  Layers, 
  DollarSign, 
  Tag, 
  Sparkles, 
  CheckCircle2, 
  Percent, 
  ChevronDown,
  X
} from 'lucide-react';
import { 
  COMMON_FEE_PRESETS, 
  COMMON_DISCOUNT_PRESETS, 
  FeePreset, 
  DiscountPreset 
} from '../../constants/pricingPresets';
import { formatCurrency } from '../../services/paymentSettingsService';

interface PricingItemAddMenuProps {
  type: 'fee' | 'discount';
  onSelect: (preset: { name: string; value: number }) => void;
  className?: string;
}

export const PricingItemAddMenu: React.FC<PricingItemAddMenuProps> = ({
  type,
  onSelect,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isFee = type === 'fee';
  const presets = isFee ? COMMON_FEE_PRESETS : COMMON_DISCOUNT_PRESETS;
  const buttonLabel = isFee ? 'Adicionar mais preço ou taxa' : 'Adicionar outro desconto';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'Clock': return <Clock className="w-3.5 h-3.5" />;
      case 'Zap': return <Zap className="w-3.5 h-3.5" />;
      case 'RotateCcw': return <RotateCcw className="w-3.5 h-3.5" />;
      case 'Package': return <Package className="w-3.5 h-3.5" />;
      case 'Layers': return <Layers className="w-3.5 h-3.5" />;
      case 'DollarSign': return <DollarSign className="w-3.5 h-3.5" />;
      case 'Tag': return <Tag className="w-3.5 h-3.5" />;
      case 'Sparkles': return <Sparkles className="w-3.5 h-3.5" />;
      case 'CheckCircle2': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'Percent': return <Percent className="w-3.5 h-3.5" />;
      default: return <Plus className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-full py-1.5 px-3 border border-dashed rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-[0.99] ${
          isFee
            ? 'border-[#0B5187]/40 hover:border-[#0B5187] text-[#0B5187] hover:bg-blue-50/60'
            : 'border-emerald-600/40 hover:border-emerald-600 text-emerald-700 hover:bg-emerald-50/60'
        }`}
      >
        <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
        <span>{buttonLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* MENU DROPDOWN DE PRESETS */}
      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-72 overflow-y-auto"
        >
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              {isFee ? 'Escolha uma taxa para adicionar:' : 'Escolha um desconto para adicionar:'}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          <div className="p-1 space-y-0.5">
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onSelect({ name: preset.name, value: preset.defaultValue });
                  setIsOpen(false);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-50 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    isFee 
                      ? 'bg-blue-50 text-[#0B5187] group-hover:bg-[#0B5187] group-hover:text-white' 
                      : 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
                  } transition-colors`}>
                    {renderIcon(preset.iconName)}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 block truncate group-hover:text-[#0B5187] transition-colors leading-tight">
                      {preset.name}
                    </span>
                    <span className="text-[9.5px] text-slate-400 block truncate">
                      {preset.description}
                    </span>
                  </div>
                </div>

                <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                  isFee 
                    ? 'bg-blue-50 text-[#0B5187] border border-blue-200' 
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                  {isFee ? `+ ${formatCurrency(preset.defaultValue)}` : `- ${formatCurrency(preset.defaultValue)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
