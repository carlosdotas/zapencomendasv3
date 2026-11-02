import React, { useRef } from 'react';

interface CurrencyCentsInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  prefix?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}

/**
 * Campo de Entrada Monetária estilo Caixa Eletrônico / Bancário
 * O usuário digita os dígitos e o preenchimento se inicia pelos centavos:
 * Digitar 1 -> R$ 0,01
 * Digitar 5 -> R$ 0,15
 * Digitar 0 -> R$ 1,50
 * Digitar 0 -> R$ 15,00
 * Backspace remove o último centavo.
 */
export const CurrencyCentsInput: React.FC<CurrencyCentsInputProps> = ({
  value,
  onChange,
  className = '',
  placeholder = '0,00',
  disabled = false,
  prefix = 'R$',
  autoFocus = false,
  ariaLabel
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Formata o número como representação em Real sem o R$
  const formatDisplay = (num: number): string => {
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      onChange(0);
      return;
    }

    // Limita a 10 dígitos para evitar overflow
    const trimmedDigits = rawDigits.slice(-10);
    const cents = parseInt(trimmedDigits, 10);
    const floatVal = isNaN(cents) ? 0 : cents / 100;
    onChange(floatVal);
  };

  const handleFocus = () => {
    // Ao focar, posiciona o cursor no fim
    if (inputRef.current) {
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  };

  const displayStr = value === 0 && placeholder ? '' : formatDisplay(value);

  return (
    <div className="inline-flex items-center gap-1 w-full">
      {prefix && (
        <span className="text-[11px] font-bold text-slate-400 select-none shrink-0">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={displayStr}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={`focus:outline-none bg-transparent ${className}`}
      />
    </div>
  );
};
