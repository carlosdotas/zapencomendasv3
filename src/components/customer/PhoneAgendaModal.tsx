import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Search, 
  Phone, 
  Smartphone, 
  User, 
  Plus, 
  Check, 
  Sparkles,
  ArrowRight,
  BookUser,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';
import { AgendaContact } from '../../types/customer';
import { useBackButton } from '../../hooks/useBackButton';

interface PhoneAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRoleLabel: string; // Ex: "Responsável na Coleta", "Responsável na Entrega", "Responsável na Troca"
  targetType: 'coleta' | 'entrega' | 'troca';
  onSelectContact: (contact: { name: string; phone: string }) => void;
}

const STORAGE_KEY = 'encomendaszap_phone_agenda_contacts';

// Gera cor de avatar consistente pelo nome
const getAvatarColor = (name: string) => {
  const colors = [
    'bg-blue-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-violet-600',
    'bg-rose-600',
    'bg-cyan-600',
    'bg-indigo-600',
    'bg-teal-600'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const PhoneAgendaModal: React.FC<PhoneAgendaModalProps> = ({
  isOpen,
  onClose,
  targetRoleLabel,
  targetType,
  onSelectContact
}) => {
  useBackButton('phone-agenda-modal', isOpen, onClose, 100);

  const [contacts, setContacts] = useState<AgendaContact[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Foco automático ao abrir
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setIsAddingContact(false);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Salva novos contatos no localStorage
  const saveContacts = (updated: AgendaContact[]) => {
    setContacts(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Erro ao salvar contatos da agenda:', e);
    }
  };

  // Filtragem
  const cleanSearch = searchTerm.trim().toLowerCase();
  const filteredContacts = useMemo(() => {
    const list = contacts.filter(c => {
      if (!cleanSearch) return true;
      const numOnly = cleanSearch.replace(/\D/g, '');
      return (
        c.name.toLowerCase().includes(cleanSearch) ||
        (numOnly && c.phone.replace(/\D/g, '').includes(numOnly)) ||
        (c.notes && c.notes.toLowerCase().includes(cleanSearch))
      );
    });

    // Ordenação alfabética
    return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [contacts, cleanSearch]);

  // Agrupamento alfabético (A, B, C...)
  const groupedContacts = useMemo(() => {
    const groups: Record<string, AgendaContact[]> = {};
    filteredContacts.forEach(contact => {
      const firstLetter = contact.name.trim().charAt(0).toUpperCase() || '#';
      const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
      if (!groups[key]) groups[key] = [];
      groups[key].push(contact);
    });
    return groups;
  }, [filteredContacts]);

  // Suporte à API nativa de contatos do Android (APK e WebView) e PWA
  const hasNativeContacts = (typeof window !== 'undefined' && Boolean(window.AndroidApp?.pickContact)) || 
    (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window);

  // Escuta retorno da seleção de contato nativa do Android (APK)
  useEffect(() => {
    const handleContactSelected = (e: Event) => {
      const customEvent = e as CustomEvent<{ name?: string; phone?: string }>;
      if (customEvent.detail) {
        const { name, phone } = customEvent.detail;
        if (name || phone) {
          onSelectContact({ name: name || 'Contato da Agenda', phone: phone || '' });
          onClose();
        }
      }
    };
    window.addEventListener('contactSelected', handleContactSelected);
    return () => {
      window.removeEventListener('contactSelected', handleContactSelected);
    };
  }, [onSelectContact, onClose]);

  const handleOpenNativePicker = async () => {
    if (typeof window !== 'undefined' && window.AndroidApp && window.AndroidApp.pickContact) {
      window.AndroidApp.pickContact();
      return;
    }
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        const selected = await (navigator as any).contacts.select(props, opts);
        if (selected && selected.length > 0) {
          const picked = selected[0];
          const name = picked.name?.[0] || 'Contato da Agenda';
          const phone = picked.tel?.[0] || '';
          if (phone) {
            onSelectContact({ name, phone });
            onClose();
          }
        }
      } catch (err) {
        console.warn('Seleção nativa cancelada ou indisponível:', err);
      }
    }
  };

  // Adicionar novo contato na agenda
  const handleAddNewContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    const newContact: AgendaContact = {
      id: `agenda-user-${Date.now()}`,
      name: newName.trim(),
      phone: newPhone.trim(),
      notes: newNotes.trim() || undefined,
      source: 'agenda'
    };

    const updated = [newContact, ...contacts];
    saveContacts(updated);
    setNewName('');
    setNewPhone('');
    setNewNotes('');
    setIsAddingContact(false);

    // Preenche imediatamente com o contato recém-criado
    onSelectContact({
      name: newContact.name,
      phone: newContact.phone
    });
    onClose();
  };

  if (!isOpen) return null;

  const themeBorder = {
    coleta: 'border-blue-500',
    entrega: 'border-orange-500',
    troca: 'border-purple-500'
  }[targetType];

  const themeBadge = {
    coleta: 'bg-blue-100 text-[#0B5187]',
    entrega: 'bg-orange-100 text-[#FF5E00]',
    troca: 'bg-purple-100 text-[#7C3AED]'
  }[targetType];

  return (
    <div className="fixed inset-0 z-[130] flex flex-col justify-end sm:justify-center items-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 p-0 sm:p-4">
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* MODAL / DRAWER PRINCIPAL DA AGENDA */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] sm:max-h-[82vh] overflow-hidden z-10 animate-in slide-in-from-bottom duration-200">
        
        {/* CABEÇALHO DA AGENDA */}
        <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 border border-white/15 shadow-xs">
              <BookUser className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-tight">
                  Agenda de Contatos
                </h2>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${themeBadge}`}>
                  {targetRoleLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium">
                Selecione para preencher nome e telefone automaticamente
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BARRA DE AÇÕES: BUSCA + NOVO CONTATO + NATIVO */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
          
          <div className="flex items-center gap-2">
            {/* Campo de Busca na Agenda */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou número..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 focus:border-[#FF5E00] rounded-xl text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Botão Adicionar Contato */}
            <button
              type="button"
              onClick={() => setIsAddingContact(!isAddingContact)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl flex items-center gap-1 shadow-xs transition-all cursor-pointer shrink-0"
              title="Cadastrar contato na agenda"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="hidden sm:inline">Novo</span>
            </button>
          </div>

          {/* Integração Nativa (quando rodando em APK / Android) */}
          {hasNativeContacts && (
            <button
              type="button"
              onClick={handleOpenNativePicker}
              className="w-full py-1.5 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0B5187] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Acessar contatos nativos do aparelho (Android / APK)</span>
            </button>
          )}

          {/* FORMULÁRIO RÁPIDO PARA ADICIONAR NOVO CONTATO NA AGENDA */}
          {isAddingContact && (
            <form onSubmit={handleAddNewContact} className="p-3 bg-white rounded-xl border border-emerald-300 shadow-sm space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-800 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  <span>Cadastrar Novo Contato na Agenda</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingContact(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do contato..."
                  className="px-2.5 py-1.5 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Telefone / WhatsApp..."
                  className="px-2.5 py-1.5 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Observação (Ex: Recepcionista, Gerente, Portaria...)"
                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingContact(false)}
                  className="px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-xs"
                >
                  Salvar e Preencher
                </button>
              </div>
            </form>
          )}

        </div>

        {/* LISTA DE CONTATOS AGRUPADOS EM ORDEM ALFABÉTICA */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {filteredContacts.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <Smartphone className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-bold text-slate-700">Nenhum contato encontrado</p>
              <p className="text-xs text-slate-400">
                Tente buscar por outro nome ou adicione um novo contato acima.
              </p>
            </div>
          ) : (
            Object.entries(groupedContacts).map(([letter, group]) => (
              <div key={letter} className="space-y-1">
                
                {/* Separador de Letra */}
                <div className="sticky top-0 bg-white/95 backdrop-blur-xs py-1 px-2 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 z-5">
                  {letter}
                </div>

                {/* Itens de Contatos */}
                <div className="divide-y divide-slate-100">
                  {group.map((contact) => {
                    const initials = contact.name
                      .split(' ')
                      .map(p => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <div
                        key={contact.id}
                        onClick={() => {
                          onSelectContact({
                            name: contact.name,
                            phone: contact.phone
                          });
                          onClose();
                        }}
                        className="py-2.5 px-2 hover:bg-orange-50/60 active:bg-orange-100 rounded-xl cursor-pointer transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar com Iniciais */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-xs shrink-0 shadow-2xs ${getAvatarColor(contact.name)}`}>
                            {initials}
                          </div>

                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-extrabold text-slate-900 group-hover:text-[#FF5E00] transition-colors truncate">
                              {contact.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {contact.phone}
                              </span>
                              {contact.notes && (
                                <span className="text-[10px] text-slate-400 truncate hidden sm:inline">
                                  • {contact.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Botão de Seleção Rápida */}
                        <div className="shrink-0 pl-2">
                          <button
                            type="button"
                            className="px-2.5 py-1 text-[11px] font-extrabold bg-slate-100 group-hover:bg-[#FF5E00] text-slate-700 group-hover:text-white rounded-lg transition-all flex items-center gap-1"
                          >
                            <span>Preencher</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            ))
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Simulador de Agenda Integrada (Pronto para APK)</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
