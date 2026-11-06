import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Phone, 
  UserCheck, 
  Bike, 
  Lock, 
  KeyRound, 
  Save, 
  Cloud, 
  CheckCircle2, 
  Users, 
  MapPin, 
  FileText, 
  Eye, 
  Search,
  AlertCircle,
  Truck,
  Sparkles,
  UserPlus,
  ChevronRight,
  Filter,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useMapStore } from '../../../context/MapContext';
import { 
  CompanyTransportadora, 
  MASTER_ADMIN_PHONE, 
  MASTER_ADMIN_CLEAN, 
  MASTER_ADMIN_CODE 
} from '../../../types/company';
import { companyService } from '../../../services/companyService';
import { placeService } from '../../../services/placeService';
import { api } from '../../../services/api';
import { BackendLocal, BackendUser } from '../../../services/apiTypes';
import { formatPhotoUrl } from '../../../services/apiAdapters';

export interface SystemUserOption {
  id: string;
  name: string;
  phone: string;
  cleanPhone: string;
  role: 'admin' | 'atendente' | 'motorista' | 'cliente';
  roleLabel: string;
  avatarUrl?: string;
  vehiclePlate?: string;
  department?: string;
}

interface CompanyManagementPageProps {
  onBack: () => void;
}

export const CompanyManagementPage: React.FC<CompanyManagementPageProps> = ({ onBack }) => {
  const { user, drivers } = useMapStore();

  // Verifica se o usuário atual é o Master Admin
  const isCurrentlyMaster = useMemo(() => {
    return companyService.isMasterAdmin(user?.phone);
  }, [user?.phone]);

  // Se não for detectado automaticamente pelo telefone da sessão, permite autenticar via PIN Master
  const [isUnlocked, setIsUnlocked] = useState(isCurrentlyMaster);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Lista de empresas sincronizada periodicamente com o servidor
  const [companies, setCompanies] = useState<CompanyTransportadora[]>(() => companyService.getAll());
  const [search, setSearch] = useState('');
  const [companyLoadError, setCompanyLoadError] = useState('');

  // Usuários do sistema (carregados da API + Contas + Drivers)
  const [systemUsers, setSystemUsers] = useState<SystemUserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Modal de edição / criação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'equipe'>('dados');
  const [editingCompany, setEditingCompany] = useState<CompanyTransportadora | null>(null);

  // Modal seletor de usuários do sistema
  const [userPickerRole, setUserPickerRole] = useState<'admin' | 'atendente' | 'motoboy' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerRoleFilter, setPickerRoleFilter] = useState<'todos' | 'sugeridos' | 'motoristas' | 'atendentes' | 'admins'>('sugeridos');
  const [manualPhoneInput, setManualPhoneInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [locations, setLocations] = useState<BackendLocal[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Carrega lista de empresas do servidor
  useEffect(() => {
    let active = true;
    const unsub = companyService.subscribe((list) => {
      setCompanies(list);
    });
    void companyService.refresh().then(success => {
      if (active) setCompanyLoadError(success ? '' : 'Não foi possível carregar as transportadoras do servidor.');
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Busca e unifica todos os usuários do sistema
  const fetchSystemUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    const usersMap = new Map<string, SystemUserOption>();

    // 1. Motoristas cadastrados no estado da aplicação (drivers)
    drivers.forEach(d => {
      const clean = (d.phone || '').replace(/\D/g, '');
      if (clean) {
        const existing = usersMap.get(clean);
        usersMap.set(clean, {
          id: existing?.id || d.id || `drv-${clean}`,
          name: d.name || existing?.name || 'Motorista Parceiro',
          phone: d.phone || existing?.phone || clean,
          cleanPhone: clean,
          role: 'motorista',
          roleLabel: 'Motoboy / Entregador',
          avatarUrl: d.avatarUrl || existing?.avatarUrl,
          vehiclePlate: d.vehiclePlate
        });
      }
    });

    // 3. Usuários registrados no banco de dados (API / Users)
    try {
      const res = await api.listUsers({ limit: 150 });
      if (res && res.success && Array.isArray(res.data)) {
        res.data.forEach((u: BackendUser) => {
          const clean = String(u.phone || '').replace(/\D/g, '');
          if (!clean) return;

          const rawAccess = String(u.access_level || '').toLowerCase().trim();
          const role = rawAccess.includes('admin') ? 'admin'
            : rawAccess.includes('atendente') ? 'atendente'
            : rawAccess.includes('motorista') ? 'motorista'
            : 'cliente';

          const photoUrl = u.foto ? (formatPhotoUrl(u.foto, 'thumb') || u.foto) : undefined;
          const existing = usersMap.get(clean);

          usersMap.set(clean, {
            id: existing?.id || `usr-${u.id}`,
            name: u.name || existing?.name || 'Usuário do Sistema',
            phone: u.phone || existing?.phone || clean,
            cleanPhone: clean,
            role,
            roleLabel: role === 'admin' ? 'Administrador' : role === 'atendente' ? 'Atendente' : role === 'motorista' ? 'Motoboy' : 'Cliente',
            avatarUrl: photoUrl || existing?.avatarUrl
          });
        });
      }
    } catch (err) {
      console.warn('[CompanyManagement] Aviso ao consultar API de usuários:', err);
    }

    setSystemUsers(Array.from(usersMap.values()));
    setIsLoadingUsers(false);
  }, [drivers]);

  useEffect(() => {
    fetchSystemUsers();
  }, [fetchSystemUsers]);

  useEffect(() => {
    if (!isModalOpen || activeTab !== 'dados') return;
    let cancelled = false;
    setIsLoadingLocations(true);
    setLocationError('');
    const timer = setTimeout(async () => {
      try {
        const result = await placeService.getLocais({ search: locationSearch.trim(), limit: 30 });
        if (cancelled) return;
        if (!result.success || !Array.isArray(result.data)) {
          setLocations([]);
          setLocationError(result.message || 'Não foi possível carregar os locais cadastrados.');
          return;
        }
        setLocations(result.data);
      } catch (error) {
        if (!cancelled) {
          console.error('[CompanyManagement] Erro ao carregar locais:', error);
          setLocations([]);
          setLocationError('Não foi possível carregar os locais cadastrados.');
        }
      } finally {
        if (!cancelled) setIsLoadingLocations(false);
      }
    }, locationSearch.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isModalOpen, activeTab, locationSearch]);

  // Helper para buscar detalhes do usuário pelo telefone
  const getUserByPhone = useCallback((phone: string): SystemUserOption => {
    const clean = phone.replace(/\D/g, '');
    const found = systemUsers.find(u => u.cleanPhone === clean);
    if (found) return found;

    // Formata o telefone básico caso não encontre no mapa
    const formatted = clean.length === 11 
      ? `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
      : clean.length === 10
      ? `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
      : phone;

    return {
      id: `manual-${clean}`,
      name: formatted,
      phone: formatted,
      cleanPhone: clean,
      role: 'cliente',
      roleLabel: 'Usuário'
    };
  }, [systemUsers]);

  const handleUnlockWithPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === MASTER_ADMIN_CODE || pinInput.replace(/\D/g, '') === MASTER_ADMIN_CLEAN) {
      setIsUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const handleOpenCreateModal = () => {
    setLocationSearch('');
    setEditingCompany({
      id: `emp-${Date.now()}`,
      name: '',
      tradeName: '',
      cnpj: '',
      phone: '',
      cleanPhone: '',
      city: 'Goiânia',
      state: 'GO',
      address: '',
      status: 'ativa',
      createdAt: Date.now(),
      adminPhones: [],
      attendantPhones: [],
      motoboyPhones: [],
      pricingModel: 'discriminado'
    });
    setActiveTab('dados');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (comp: CompanyTransportadora) => {
    setLocationSearch('');
    setEditingCompany({ ...comp });
    setActiveTab('dados');
    setIsModalOpen(true);
  };

  const handleDeleteCompany = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir a empresa/transportadora "${name}"?`)) {
      const deleted = await companyService.deleteCompany(id);
      if (!deleted) {
        window.alert('Não foi possível excluir a transportadora. Verifique a conexão e tente novamente.');
        return;
      }
      setSaveToast('Transportadora removida com sucesso.');
      setTimeout(() => setSaveToast(null), 3000);
    }
  };

  const handleSaveCompany = async () => {
    if (!editingCompany || !editingCompany.name?.trim()) {
      alert('Informe a Razão Social ou Nome Fantasia da transportadora.');
      return;
    }

    setIsSaving(true);
    try {
      await companyService.saveCompany(editingCompany);
      setIsModalOpen(false);
      setSaveToast('Dados da transportadora salvos com sucesso!');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a transportadora.');
    } finally {
      setIsSaving(false);
    }
  };

  // Funções para gerenciar vínculo de usuários na empresa
  const handleToggleUserInCompany = (cleanPhone: string, roleType: 'admin' | 'atendente' | 'motoboy') => {
    if (!editingCompany) return;

    if (roleType === 'admin') {
      const current = editingCompany.adminPhones || [];
      const updated = current.includes(cleanPhone)
        ? current.filter(p => p !== cleanPhone)
        : [...current, cleanPhone];
      setEditingCompany({ ...editingCompany, adminPhones: updated });
    } else if (roleType === 'atendente') {
      const current = editingCompany.attendantPhones || [];
      const updated = current.includes(cleanPhone)
        ? current.filter(p => p !== cleanPhone)
        : [...current, cleanPhone];
      setEditingCompany({ ...editingCompany, attendantPhones: updated });
    } else if (roleType === 'motoboy') {
      const current = editingCompany.motoboyPhones || [];
      const updated = current.includes(cleanPhone)
        ? current.filter(p => p !== cleanPhone)
        : [...current, cleanPhone];
      setEditingCompany({ ...editingCompany, motoboyPhones: updated });
    }
  };

  const handleRemoveUserFromCompany = (cleanPhone: string, roleType: 'admin' | 'atendente' | 'motoboy') => {
    if (!editingCompany) return;
    if (roleType === 'admin') {
      setEditingCompany({
        ...editingCompany,
        adminPhones: (editingCompany.adminPhones || []).filter(p => p !== cleanPhone)
      });
    } else if (roleType === 'atendente') {
      setEditingCompany({
        ...editingCompany,
        attendantPhones: (editingCompany.attendantPhones || []).filter(p => p !== cleanPhone)
      });
    } else if (roleType === 'motoboy') {
      setEditingCompany({
        ...editingCompany,
        motoboyPhones: (editingCompany.motoboyPhones || []).filter(p => p !== cleanPhone)
      });
    }
  };

  const handleAddManualPhone = () => {
    const clean = manualPhoneInput.replace(/\D/g, '');
    if (!clean || !userPickerRole || !editingCompany) return;

    handleToggleUserInCompany(clean, userPickerRole);
    setManualPhoneInput('');
    setShowManualInput(false);
  };

  // Filtragem da lista principal de transportadoras
  const filteredCompanies = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return companies;
    return companies.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.tradeName && c.tradeName.toLowerCase().includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }, [companies, search]);

  // Filtragem dos usuários dentro do Modal Seletor
  const filteredPickerUsers = useMemo(() => {
    if (!userPickerRole) return [];
    const q = pickerSearch.toLowerCase().trim();

    return systemUsers.filter(u => {
      // Filtro de busca textual
      const matchesSearch = !q || 
        u.name.toLowerCase().includes(q) || 
        u.cleanPhone.includes(q) || 
        u.phone.includes(q) ||
        (u.vehiclePlate && u.vehiclePlate.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Filtro por abas de função
      if (pickerRoleFilter === 'sugeridos') {
        if (userPickerRole === 'motoboy') return u.role === 'motorista';
        if (userPickerRole === 'atendente') return u.role === 'atendente';
        if (userPickerRole === 'admin') return u.role === 'admin';
        return true;
      }
      if (pickerRoleFilter === 'motoristas') return u.role === 'motorista';
      if (pickerRoleFilter === 'atendentes') return u.role === 'atendente';
      if (pickerRoleFilter === 'admins') return u.role === 'admin';

      return true;
    });
  }, [systemUsers, userPickerRole, pickerSearch, pickerRoleFilter]);

  // SE NÃO ESTIVER AUTENTICADO COMO MASTER ADMIN: TELA DE BLOQUEIO MINIMALISTA
  if (!isUnlocked && !isCurrentlyMaster) {
    return (
      <div className="config-settings-page min-h-full pb-20 animate-in fade-in duration-200">
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md px-4 sm:px-6 py-3.5 border-b border-slate-200/80 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Acesso Restrito
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Painel de Gestão de Transportadoras
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-6 max-w-sm mx-auto pt-14 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-[#0B5187] flex items-center justify-center mx-auto border border-slate-200/70">
            <Lock className="w-7 h-7 stroke-[2]" />
          </div>

          <div>
            <h2 className="text-base font-black text-slate-900">
              Autenticação Master
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Exclusivo para o Administrador Geral da rede:
              <br />
              <strong className="text-slate-800 text-xs font-mono font-bold">
                (62) 99615-7340
              </strong>
            </p>
          </div>

          <form onSubmit={handleUnlockWithPin} className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5 text-left">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                PIN de Segurança ou Telefone Master
              </label>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                placeholder="Código de autorização..."
                className={`w-full text-center tracking-widest text-base font-mono font-black bg-slate-50 border rounded-xl py-2.5 focus:outline-none transition-colors ${
                  pinError ? 'border-red-400 bg-red-50 text-red-900' : 'border-slate-200 focus:border-[#0B5187] focus:bg-white text-slate-900'
                }`}
                autoFocus
              />
              {pinError && (
                <span className="text-[10px] font-bold text-red-600 mt-1 block text-center">
                  Código incorreto. Apenas o Master tem permissão.
                </span>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#0B5187] hover:bg-[#083e68] text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" />
              <span>Desbloquear Painel</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // TELA PRINCIPAL: MINIMALISTA, INTUITIVA E MODERNA
  return (
    <div className="config-settings-page min-h-full pb-20 animate-in fade-in duration-150 bg-slate-50/50">
      
      {/* Top App Bar Minimalista */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3 border-b border-slate-200/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Transportadoras & Empresas
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Servidor Online
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Controle de pedidos, usuários e motoboys isolados por empresa
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B5187] hover:bg-[#083e68] active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nova Transportadora</span>
        </button>
      </div>

      {/* Toast de Confirmação */}
      {saveToast && (
        <div className="fixed top-16 right-4 sm:right-6 z-50 animate-in slide-in-from-top-3 fade-in duration-200 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
          <span>{saveToast}</span>
        </div>
      )}

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
        {companyLoadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{companyLoadError}</p>}
        
        {/* Barra de Busca Minimalista */}
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-200/80 px-3.5 py-2 shadow-2xs">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar transportadora por nome, cidade ou telefone..."
            className="w-full text-xs font-semibold text-slate-800 bg-transparent outline-none placeholder-slate-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Lista de Transportadoras em Cards Limpos */}
        <div className="space-y-3">
          {filteredCompanies.map((comp) => {
            const adminCount = comp.adminPhones?.length || 0;
            const attendantCount = comp.attendantPhones?.length || 0;
            const motoboyCount = comp.motoboyPhones?.length || 0;

            return (
              <div 
                key={comp.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all space-y-3"
              >
                {/* Cabeçalho do Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#0B5187] flex items-center justify-center shrink-0 border border-slate-200/60 mt-0.5">
                      <Truck className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-black text-slate-900">
                          {comp.name}
                        </h2>
                        {comp.tradeName && comp.tradeName !== comp.name && (
                          <span className="text-xs text-slate-500 font-medium">
                            ({comp.tradeName})
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                          comp.status === 'ativa' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80' 
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {comp.status}
                        </span>
                      </div>
                      
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {comp.city || 'Goiânia'}{comp.state ? ` - ${comp.state}` : ''}
                        {comp.phone ? ` • Tel: ${comp.phone}` : ''}
                        {comp.cnpj ? ` • CNPJ: ${comp.cnpj}` : ''}
                      </p>
                      {comp.location && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#0B5187]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span>Local: {comp.location.name}{comp.location.address ? ` — ${comp.location.address}` : ''}</span>
                        </p>
                      )}
                      {comp.locationId && !comp.location && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">
                          Local vinculado não encontrado. Edite a transportadora para selecionar outro.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(comp)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                      <span>Gerenciar & Pessoas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCompany(comp.id, comp.name)}
                      className="w-8 h-8 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                      title="Excluir transportadora"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Resumo de Usuários Vinculados */}
                <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 text-[11px]">
                  {/* Admins */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 border border-purple-200/70 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                    <span>{adminCount} Admin{adminCount !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Atendentes */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-[#0B5187] border border-blue-200/70 font-bold">
                    <UserCheck className="w-3.5 h-3.5 text-[#0B5187]" />
                    <span>{attendantCount} Atendente{attendantCount !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Motoboys */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/70 font-bold">
                    <Bike className="w-3.5 h-3.5 text-amber-600" />
                    <span>{motoboyCount} Motoboy{motoboyCount !== 1 ? 's' : ''} Autorizado{motoboyCount !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Modelo de Frete */}
                  <span className="text-[10px] text-slate-500 font-medium ml-auto">
                    Cobrança: {comp.pricingModel === 'frete_unico' ? 'Frete Único' : 'Discriminado'}
                  </span>
                </div>
              </div>
            );
          })}

          {!companyLoadError && filteredCompanies.length === 0 && (
            <div className="py-12 text-center text-slate-400 space-y-2 bg-white rounded-2xl border border-slate-200/80 p-6">
              <Truck className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-xs font-bold text-slate-600">Nenhuma transportadora encontrada</p>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="text-xs font-bold text-[#0B5187] hover:underline cursor-pointer"
              >
                + Cadastrar nova transportadora
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL PRINCIPAL: CADASTRO / EDIÇÃO DA TRANSPORTADORA */}
      {/* ========================================================= */}
      {isModalOpen && editingCompany && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden my-4 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
          >
            {/* Topo do Modal */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0B5187] text-white flex items-center justify-center">
                  <Truck className="w-4 h-4 stroke-[2]" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    {editingCompany.name || 'Nova Transportadora'}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Persistido no servidor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Abas Minimalistas */}
            <div className="flex border-b border-slate-200 bg-white px-5 shrink-0 gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('dados')}
                className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'dados'
                    ? 'border-[#0B5187] text-[#0B5187]'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Dados da Empresa</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('equipe')}
                className={`py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'equipe'
                    ? 'border-[#0B5187] text-[#0B5187]'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Usuários & Equipe</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                  {(editingCompany.adminPhones?.length || 0) + (editingCompany.attendantPhones?.length || 0) + (editingCompany.motoboyPhones?.length || 0)}
                </span>
              </button>
            </div>

            {/* Conteúdo da Aba */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs text-slate-700">
              
              {/* ABA 1: DADOS DA EMPRESA */}
              {activeTab === 'dados' && (
                <div className="space-y-4 animate-in fade-in duration-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Razão Social / Nome da Transportadora *
                      </label>
                      <input
                        type="text"
                        value={editingCompany.name || ''}
                        onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                        placeholder="Ex: ZapLog Express Logística"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:bg-white focus:border-[#0B5187] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Nome Fantasia / Apelido
                      </label>
                      <input
                        type="text"
                        value={editingCompany.tradeName || ''}
                        onChange={(e) => setEditingCompany({ ...editingCompany, tradeName: e.target.value })}
                        placeholder="Ex: ZapLog"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:bg-white focus:border-[#0B5187] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        CNPJ
                      </label>
                      <input
                        type="text"
                        value={editingCompany.cnpj || ''}
                        onChange={(e) => setEditingCompany({ ...editingCompany, cnpj: e.target.value })}
                        placeholder="00.000.000/0001-00"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:bg-white focus:border-[#0B5187] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Telefone / WhatsApp de Contato
                      </label>
                      <input
                        type="text"
                        value={editingCompany.phone || ''}
                        onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                        placeholder="(62) 99999-9999"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:bg-white focus:border-[#0B5187] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Cidade e Estado
                      </label>
                      <input
                        type="text"
                        value={editingCompany.city || ''}
                        onChange={(e) => setEditingCompany({ ...editingCompany, city: e.target.value })}
                        placeholder="Goiânia - GO"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:bg-white focus:border-[#0B5187] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Status de Operação
                      </label>
                      <select
                        value={editingCompany.status || 'ativa'}
                        onChange={(e) => setEditingCompany({ ...editingCompany, status: e.target.value as 'ativa' | 'inativa' })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:bg-white focus:border-[#0B5187] outline-none cursor-pointer"
                      >
                        <option value="ativa">Ativa (Operando normalmente)</option>
                        <option value="inativa">Inativa (Pausada)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Endereço da Base / Galpão
                    </label>
                    <input
                      type="text"
                      value={editingCompany.address || ''}
                      onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })}
                      placeholder="Av. Exemplo, Qd. 10, Lt. 05, Setor Central"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:bg-white focus:border-[#0B5187] outline-none"
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <label htmlFor="company-location-search" className="block text-[11px] font-bold text-slate-700">
                      Local cadastrado da transportadora
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Vincule um local já cadastrado. O vínculo é opcional e não altera o endereço acima.
                    </p>
                    {editingCompany.locationId && (
                      <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-2">
                        <MapPin className="h-4 w-4 shrink-0 text-[#0B5187]" />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800">
                            {editingCompany.location?.name || `Local #${editingCompany.locationId} não encontrado`}
                          </p>
                          {editingCompany.location?.address && (
                            <p className="text-[11px] text-slate-500">{editingCompany.location.address}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label="Remover local vinculado"
                          onClick={() => setEditingCompany({ ...editingCompany, locationId: null, location: null })}
                          className="rounded p-1 text-slate-500 hover:bg-white hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="company-location-search"
                        type="search"
                        value={locationSearch}
                        onChange={event => setLocationSearch(event.target.value)}
                        placeholder="Buscar local por nome ou endereço"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 font-semibold outline-none focus:border-[#0B5187] focus:bg-white"
                      />
                    </div>
                    {isLoadingLocations && <p className="text-[11px] text-slate-500">Carregando locais...</p>}
                    {locationError && <p role="alert" className="text-[11px] font-semibold text-red-600">{locationError}</p>}
                    {!isLoadingLocations && !locationError && locations.length === 0 && (
                      <p className="text-[11px] text-slate-500">Nenhum local cadastrado encontrado.</p>
                    )}
                    {!isLoadingLocations && !locationError && locations.length > 0 && (
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {locations.map(location => (
                          <button
                            key={location.id}
                            type="button"
                            onClick={() => setEditingCompany({
                              ...editingCompany,
                              locationId: Number(location.id),
                              location: {
                                id: Number(location.id),
                                name: location.name,
                                address: location.endereco || null,
                                city: location.cidade || null,
                                state: location.estado || null
                              }
                            })}
                            aria-pressed={Number(location.id) === editingCompany.locationId}
                            className={`w-full rounded-lg border p-2 text-left hover:border-[#0B5187] ${
                              Number(location.id) === editingCompany.locationId ? 'border-[#0B5187] bg-blue-50' : 'border-slate-200'
                            }`}
                          >
                            <span className="block font-bold text-slate-800">{location.name}</span>
                            <span className="block text-[11px] text-slate-500">
                              {[location.endereco, location.cidade, location.estado].filter(Boolean).join(' • ') || `Local #${location.id}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Modelo de Cobrança de Frete */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Modelo de Cobrança de Frete
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCompany({ ...editingCompany, pricingModel: 'discriminado' })}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          editingCompany.pricingModel !== 'frete_unico'
                            ? 'bg-blue-50/70 border-blue-300 text-blue-950 ring-1 ring-blue-300'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-bold text-xs block">Discriminado</span>
                        <span className="text-[10px] text-slate-500">Tarifa por km, tempo e volume</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingCompany({ ...editingCompany, pricingModel: 'frete_unico' })}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          editingCompany.pricingModel === 'frete_unico'
                            ? 'bg-blue-50/70 border-blue-300 text-blue-950 ring-1 ring-blue-300'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-bold text-xs block">Frete Único</span>
                        <span className="text-[10px] text-slate-500">Valor fixo por entrega</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: USUÁRIOS & EQUIPE (SELEÇÃO DOS USUÁRIOS DO SISTEMA) */}
              {activeTab === 'equipe' && (
                <div className="space-y-6 animate-in fade-in duration-100">
                  
                  {/* SEÇÃO 1: ADMINISTRADORES DA EMPRESA */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs">
                          <ShieldCheck className="w-4 h-4 text-purple-600" />
                          <span>Administradores da Transportadora</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-bold">
                            {(editingCompany.adminPhones || []).length}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Usuários com permissão total de gestão nesta empresa
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUserPickerRole('admin');
                          setPickerRoleFilter('sugeridos');
                          setPickerSearch('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-purple-600" />
                        <span>+ Selecionar Usuário</span>
                      </button>
                    </div>

                    {/* Chips dos Administradores Selecionados */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(editingCompany.adminPhones || []).map((phone) => {
                        const u = getUserByPhone(phone);
                        return (
                          <div 
                            key={phone}
                            className="flex items-center justify-between p-2 rounded-xl bg-purple-50/60 border border-purple-200/80 gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-purple-200 text-purple-800 font-black text-xs flex items-center justify-center shrink-0">
                                  {u.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900 block truncate">
                                  {u.name}
                                </span>
                                <span className="text-[10px] text-slate-500 block truncate">
                                  {u.phone}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveUserFromCompany(phone, 'admin')}
                              className="w-6 h-6 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              title="Remover administrador"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}

                      {(editingCompany.adminPhones || []).length === 0 && (
                        <div className="col-span-full py-3 px-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                          Nenhum administrador vinculado. Clique em <strong>+ Selecionar Usuário</strong>.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SEÇÃO 2: ATENDENTES DA EMPRESA */}
                  <div className="space-y-2.5 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs">
                          <UserCheck className="w-4 h-4 text-[#0B5187]" />
                          <span>Atendentes da Transportadora</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-[#0B5187] font-bold">
                            {(editingCompany.attendantPhones || []).length}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Usuários que criam pedidos e atendem clientes desta empresa
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUserPickerRole('atendente');
                          setPickerRoleFilter('sugeridos');
                          setPickerSearch('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#0B5187] border border-blue-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-[#0B5187]" />
                        <span>+ Selecionar Usuário</span>
                      </button>
                    </div>

                    {/* Chips dos Atendentes Selecionados */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(editingCompany.attendantPhones || []).map((phone) => {
                        const u = getUserByPhone(phone);
                        return (
                          <div 
                            key={phone}
                            className="flex items-center justify-between p-2 rounded-xl bg-blue-50/60 border border-blue-200/80 gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-blue-200 text-[#0B5187] font-black text-xs flex items-center justify-center shrink-0">
                                  {u.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900 block truncate">
                                  {u.name}
                                </span>
                                <span className="text-[10px] text-slate-500 block truncate">
                                  {u.phone}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveUserFromCompany(phone, 'atendente')}
                              className="w-6 h-6 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              title="Remover atendente"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}

                      {(editingCompany.attendantPhones || []).length === 0 && (
                        <div className="col-span-full py-3 px-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                          Nenhum atendente vinculado. Clique em <strong>+ Selecionar Usuário</strong>.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SEÇÃO 3: MOTOBOYS AUTORIZADOS */}
                  <div className="space-y-2.5 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs">
                          <Bike className="w-4 h-4 text-amber-600" />
                          <span>Motoboys / Entregadores Autorizados</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-bold">
                            {(editingCompany.motoboyPhones || []).length}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Apenas os motoboys selecionados poderão ver e aceitar pedidos desta empresa
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUserPickerRole('motoboy');
                          setPickerRoleFilter('sugeridos');
                          setPickerSearch('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-amber-600" />
                        <span>+ Selecionar Motoboy</span>
                      </button>
                    </div>

                    {/* Chips dos Motoboys Selecionados */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(editingCompany.motoboyPhones || []).map((phone) => {
                        const u = getUserByPhone(phone);
                        return (
                          <div 
                            key={phone}
                            className="flex items-center justify-between p-2 rounded-xl bg-amber-50/60 border border-amber-200/80 gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-amber-200 text-amber-900 font-black text-xs flex items-center justify-center shrink-0">
                                  {u.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900 block truncate">
                                  {u.name}
                                </span>
                                <span className="text-[10px] text-slate-500 block truncate">
                                  {u.phone}{u.vehiclePlate ? ` • ${u.vehiclePlate}` : ''}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveUserFromCompany(phone, 'motoboy')}
                              className="w-6 h-6 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              title="Remover motoboy"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}

                      {(editingCompany.motoboyPhones || []).length === 0 && (
                        <div className="col-span-full py-3 px-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                          Nenhum motoboy autorizado ainda. Clique em <strong>+ Selecionar Motoboy</strong>.
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Rodapé do Modal */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveCompany}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4.5 py-2 bg-[#0B5187] hover:bg-[#083e68] text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                <Cloud className="w-4 h-4" />
                <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL SELETOR DE USUÁRIOS DO SISTEMA */}
      {/* ========================================================= */}
      {userPickerRole && editingCompany && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-4 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
          >
            {/* Topo do Seletor */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {userPickerRole === 'admin' && 'Selecionar Administrador'}
                  {userPickerRole === 'atendente' && 'Selecionar Atendente'}
                  {userPickerRole === 'motoboy' && 'Selecionar Motoboy Autorizado'}
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  Selecione os usuários cadastrados no sistema
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserPickerRole(null);
                  setShowManualInput(false);
                }}
                className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Barra de Pesquisa + Filtros */}
            <div className="p-3.5 border-b border-slate-100 bg-white space-y-2.5 shrink-0">
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-1.5">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Pesquisar por nome ou celular..."
                  className="w-full text-xs font-semibold text-slate-800 bg-transparent outline-none placeholder-slate-400"
                  autoFocus
                />
                {pickerSearch && (
                  <button
                    type="button"
                    onClick={() => setPickerSearch('')}
                    className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Pílulas de Filtro */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPickerRoleFilter('sugeridos')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    pickerRoleFilter === 'sugeridos'
                      ? 'bg-[#0B5187] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Sugeridos
                </button>
                <button
                  type="button"
                  onClick={() => setPickerRoleFilter('todos')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    pickerRoleFilter === 'todos'
                      ? 'bg-[#0B5187] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todos ({systemUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPickerRoleFilter('motoristas')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    pickerRoleFilter === 'motoristas'
                      ? 'bg-[#0B5187] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Motoristas
                </button>
                <button
                  type="button"
                  onClick={() => setPickerRoleFilter('atendentes')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    pickerRoleFilter === 'atendentes'
                      ? 'bg-[#0B5187] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Atendentes
                </button>
                <button
                  type="button"
                  onClick={() => setPickerRoleFilter('admins')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    pickerRoleFilter === 'admins'
                      ? 'bg-[#0B5187] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Admins
                </button>
              </div>
            </div>

            {/* Lista Scrollável de Usuários */}
            <div className="p-3.5 overflow-y-auto space-y-1.5 flex-1">
              {filteredPickerUsers.map((u) => {
                const assignedList = 
                  userPickerRole === 'admin' ? (editingCompany.adminPhones || [])
                  : userPickerRole === 'atendente' ? (editingCompany.attendantPhones || [])
                  : (editingCompany.motoboyPhones || []);

                const isSelected = assignedList.includes(u.cleanPhone);

                return (
                  <div
                    key={u.id || u.cleanPhone}
                    onClick={() => handleToggleUserInCompany(u.cleanPhone, userPickerRole)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300'
                        : 'bg-white border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {u.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {u.name}
                          </span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600">
                            {u.roleLabel}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 block truncate">
                          {u.phone}{u.vehiclePlate ? ` • Placa: ${u.vehiclePlate}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px]">
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>Vinculado</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]">
                          <Plus className="w-3 h-3" />
                          <span>Adicionar</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredPickerUsers.length === 0 && (
                <div className="py-8 text-center text-slate-400 space-y-2">
                  <p className="text-xs font-semibold">Nenhum usuário encontrado neste filtro</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerRoleFilter('todos');
                      setPickerSearch('');
                    }}
                    className="text-xs font-bold text-[#0B5187] hover:underline cursor-pointer"
                  >
                    Ver todos os usuários ({systemUsers.length})
                  </button>
                </div>
              )}
            </div>

            {/* Rodapé do Seletor */}
            <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-2 shrink-0">
              {showManualInput ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualPhoneInput}
                    onChange={(e) => setManualPhoneInput(e.target.value)}
                    placeholder="Celular com DDD (ex: 62999998888)..."
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddManualPhone}
                    className="px-3 py-1.5 bg-[#0B5187] text-white rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Adicionar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualInput(false)}
                    className="px-2 py-1.5 text-slate-500 font-bold text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="text-[11px] font-bold text-slate-500 hover:text-[#0B5187] cursor-pointer"
                  >
                    + Não encontrou? Inserir número manual
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserPickerRole(null)}
                    className="px-4 py-1.5 bg-[#0B5187] hover:bg-[#083e68] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Concluir Seleção
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};