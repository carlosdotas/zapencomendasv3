import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  UserCheck, 
  Phone, 
  BookUser, 
  Check, 
  Smartphone, 
  User, 
  Sparkles,
  ClipboardPaste
} from 'lucide-react';
import { PhoneAgendaModal } from '../customer/PhoneAgendaModal';
import { useBackButton } from '../../hooks/useBackButton';

interface SellerResponsibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  initialPhone?: string;
  clientName?: string;
  clientPhone?: string;
  onSave: (data: { name: string; phone: string }) => void;
}

// Máscara amigável de telefone brasileiro (XX) XXXXX-XXXX
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export const SellerResponsibleModal: React.FC<SellerResponsibleModalProps> = ({
  isOpen,
  onClose,
  initialName = '',
  initialPhone = '',
  clientName = '',
  clientPhone = '',
  onSave
}) => {
  useBackButton('seller-responsible-modal', isOpen, onClose, 95);

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [isAgendaOpen, setIsAgendaOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setPhone(formatPhoneInput(initialPhone || ''));
      setErrorMsg(null);
      setIsAgendaOpen(false);
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialName, initialPhone]);

  // Retorno da agenda nativa do app Android (evento 'contactSelected')
  useEffect(() => {
    if (!isOpen) return;
    const onSelected = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string; phone?: string }>).detail;
      if (!detail || (!detail.name && !detail.phone)) return;
      if (detail.name) setName(detail.name);
      if (detail.phone) setPhone(formatPhoneInput(detail.phone));
      setIsAgendaOpen(false);
    };
    window.addEventListener('contactSelected', onSelected);
    return () => window.removeEventListener('contactSelected', onSelected);
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneInput(e.target.value));
  };

  const handleSelectFromAgenda = (contact: { name: string; phone: string }) => {
    setName(contact.name || '');
    setPhone(formatPhoneInput(contact.phone || ''));
    setIsAgendaOpen(false);
  };

  const handleCopyFromClient = () => {
    if (!clientName && !clientPhone) return;
    setName(clientName);
    setPhone(formatPhoneInput(clientPhone));
  };

  // Se o dispositivo tiver suporte a navegação nativa de contatos do Android / Chrome
  const handleNativeContactPicker = async () => {
    if (typeof window !== 'undefined' && window.AndroidApp?.pickContact) {
      window.AndroidApp.pickContact();
      return;
    }
    try {
      if ('contacts' in navigator && 'select' in (navigator as any).contacts) {
        const props = ['name', 'tel'];
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts && contacts[0]) {
          const selected = contacts[0];
          const rawName = selected.name?.[0] || '';
          const rawTel = selected.tel?.[0] || '';
          if (rawName) setName(rawName);
          if (rawTel) setPhone(formatPhoneInput(rawTel));
          return;
        }
      }
    } catch {
      // Abre modal de agenda padrão caso cancele ou ocorra erro
    }
    setIsAgendaOpen(true);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName && !cleanPhone) {
      setErrorMsg('Informe ao menos o nome ou telefone do vendedor/responsável.');
      return;
    }

    onSave({
      name: cleanName,
      phone: cleanPhone
    });
    onClose();
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div 
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header com Tema Laranja Vibrante do Vendedor #FF5E00 */}
          <div className="bg-gradient-to-r from-[#FF5E00] to-[#E05200] p-4 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5 text-white stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-white leading-tight truncate">
                  Vendedor (Responsável)
                </h3>
                <p className="text-[11px] text-white/80 leading-tight truncate">
                  Quem atende ou entrega/recebe a mercadoria no local
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/20 active:scale-95 text-white/90 hover:text-white transition-all cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Conteúdo do Formulário */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            
            {/* BOTÃO DE DESTAQUE: BUSCAR NA AGENDA DE CONTATOS */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleNativeContactPicker}
                className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 hover:from-orange-100 hover:to-amber-100 border border-orange-200 text-[#FF5E00] font-black text-xs flex items-center justify-between gap-2 shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-[0.98] group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-[#FF5E00] text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                    <BookUser className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="block text-xs font-black text-[#FF5E00]">
                      Buscar na Agenda de Contatos
                    </span>
                    <span className="block text-[10px] text-slate-500 font-semibold truncate">
                      Selecionar direto do celular / agenda telefônica
                    </span>
                  </div>
                </div>
                <div className="px-2 py-1 rounded-lg bg-white/90 border border-orange-200 text-[10px] font-black text-[#FF5E00] shrink-0">
                  Abrir Agenda
                </div>
              </button>

              {/* Atalho rápido para copiar dados do Cliente caso existam */}
              {(clientName || clientPhone) && (
                <button
                  type="button"
                  onClick={handleCopyFromClient}
                  className="w-full py-1.5 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Preencher com os dados do Cliente ({clientName || 'Cliente'})</span>
                </button>
              )}
            </div>

            {/* DIVISOR SUTIL */}
            <div className="relative flex items-center justify-center my-1">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-2 text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                Ou digite os dados
              </span>
            </div>

            {/* CAMPO NOME */}
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">
                Nome do Vendedor / Responsável
              </label>
              <div className="relative">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Ex: João da Loja ou Balcão"
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-300 focus:border-[#FF5E00] focus:ring-2 focus:ring-[#FF5E00]/20 text-sm font-bold text-slate-800 placeholder:text-slate-400 outline-none transition-all"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* CAMPO TELEFONE */}
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="(62) 99999-9999"
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-300 focus:border-[#FF5E00] focus:ring-2 focus:ring-[#FF5E00]/20 text-sm font-bold text-slate-800 placeholder:text-slate-400 outline-none transition-all"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* MENSAGEM DE ERRO SE HOUVER */}
            {errorMsg && (
              <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold text-center">
                {errorMsg}
              </div>
            )}

            {/* BOTÕES DE AÇÃO INFERIORES */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-2 h-11 rounded-xl bg-[#FF5E00] hover:bg-[#E05200] active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Salvar Vendedor</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* MODAL DA AGENDA DO TELEFONE / CELULAR */}
      <PhoneAgendaModal
        isOpen={isAgendaOpen}
        onClose={() => setIsAgendaOpen(false)}
        targetRoleLabel="Vendedor (Responsável)"
        targetType="coleta"
        onSelectContact={handleSelectFromAgenda}
      />
    </>
  );
};
