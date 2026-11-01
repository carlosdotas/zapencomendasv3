import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  ArrowLeft, 
  Users, 
  Search, 
  Phone, 
  ShieldCheck, 
  CheckCircle2, 
  X, 
  Edit3, 
  Save, 
  Mail, 
  Building2, 
  UserCheck, 
  ChevronRight,
  Bike,
  Sparkles,
  Headphones,
  User,
  RefreshCw,
  MapPin,
  AlertCircle,
  Camera,
  FileText
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { ACCOUNTS, AuthAccount, UserRole } from '../../data/authAccounts';
import { api, uploadProfilePhoto } from '../../services/api';
import { BackendUser } from '../../services/apiTypes';
import { formatPhotoUrl } from '../../services/apiAdapters';
import { checkUserCompleteness, formatTaxId } from '../../utils/userCompleteness';
import { useBackButton } from '../../hooks/useBackButton';

export type SystemAccessLevel = 'motorista' | 'atendente' | 'admin' | 'cliente';

export interface SystemUserRecord {
  id: string;
  numericId?: number;
  name: string;
  phone: string;
  cleanPhone: string;
  accessLevel: SystemAccessLevel;
  roleLabel: string;
  badgeColor: string;
  avatarUrl?: string;
  city?: string;
  cpf?: string;
  department?: string;
  description?: string;
  code?: string;
  isDatabase: boolean;
}

const ROLE_CONFIGS: Record<SystemAccessLevel, { label: string; badgeColor: string; icon: any; desc: string }> = {
  motorista: {
    label: 'Motorista Parceiro',
    badgeColor: '#FF5E00',
    icon: Bike,
    desc: 'Recebe rotas e coletas no mapa, atualiza telemetria GPS e finaliza entregas.'
  },
  atendente: {
    label: 'Atendente Operacional',
    badgeColor: '#0284C7',
    icon: Headphones,
    desc: 'Lança pedidos, gerencia status de encomendas e direciona pedidos aos motoristas.'
  },
  admin: {
    label: 'Administrador Geral',
    badgeColor: '#0B5187',
    icon: ShieldCheck,
    desc: 'Acesso irrestrito a configurações, parametrização de campos e gestão de usuários.'
  },
  cliente: {
    label: 'Cliente / Solicitante',
    badgeColor: '#64748B',
    icon: User,
    desc: 'Acompanha o rastreamento em tempo real de suas encomendas e comprovantes.'
  }
};

export const AdminUsersPage: React.FC = () => {
  const { 
    isAdminUsersOpen, 
    setIsAdminUsersOpen,
    setIsAdminSettingsOpen,
    user: currentUser,
    updateUser,
    setCurrentRole,
    currentRole
  } = useMapStore();

  const [usersList, setUsersList] = useState<SystemUserRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<SystemUserRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | SystemAccessLevel>('todos');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form states for editing selected user
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAccessLevel, setEditAccessLevel] = useState<SystemAccessLevel>('motorista');
  const [editCity, setEditCity] = useState('');
  const [editCpf, setEditCpf] = useState('');

  const adminAvatarInputRef = useRef<HTMLInputElement>(null);

  // Intercepta botão Voltar para fechar o modal de detalhes/edição do usuário antes de fechar a tela inteira
  useBackButton('admin-user-detail-modal', !!selectedUser, () => {
    setSelectedUser(null);
    setIsEditing(false);
  }, 85);

  // Busca lista de usuários cadastrados no banco de dados (/users/list)
  const fetchDatabaseUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.listUsers({ limit: 1000 });
      const dbUsers: BackendUser[] = (res.success && Array.isArray(res.data)) ? res.data : [];

      const recordsMap = new Map<string, SystemUserRecord>();

      // 1. Mapeia contas padrão do sistema como base
      Object.values(ACCOUNTS).forEach(acc => {
        const cleanPhone = acc.cleanPhone || acc.phone.replace(/\D/g, '');
        const role = (acc.role === 'admin_geral' || (acc.role as string) === 'admin') ? 'admin' 
          : acc.role === 'atendente' ? 'atendente' 
          : acc.role === 'motorista' ? 'motorista' 
          : 'cliente';

        recordsMap.set(cleanPhone, {
          id: acc.id || `acc-${cleanPhone}`,
          name: acc.name,
          phone: acc.phone,
          cleanPhone,
          accessLevel: role,
          roleLabel: ROLE_CONFIGS[role].label,
          badgeColor: ROLE_CONFIGS[role].badgeColor,
          avatarUrl: acc.avatarUrl,
          department: acc.department,
          description: acc.description,
          code: acc.code,
          isDatabase: false
        });
      });

      // 2. Mescla e prioriza os usuários reais do banco de dados oficial (/users/list)
      dbUsers.forEach(u => {
        const cleanPhone = String(u.phone || '').replace(/\D/g, '');
        const rawAccess = String(u.access_level || '').toLowerCase().trim();
        const role: SystemAccessLevel = 
          rawAccess.includes('admin') ? 'admin'
          : rawAccess.includes('atendente') ? 'atendente'
          : rawAccess.includes('motorista') ? 'motorista'
          : 'cliente';

        const photoUrl = u.foto ? (formatPhotoUrl(u.foto, 'thumb') || u.foto) : undefined;
        const key = cleanPhone || `usr-${u.id}`;

        const existing = recordsMap.get(cleanPhone);
        const taxDoc = u.cpf || (u as any).cnpj || (u as any).cpf_cnpj || existing?.cpf;
        recordsMap.set(key, {
          id: String(u.id),
          numericId: Number(u.id),
          name: u.name || existing?.name || 'Usuário Sem Nome',
          phone: u.phone || existing?.phone || '',
          cleanPhone,
          accessLevel: role,
          roleLabel: ROLE_CONFIGS[role].label,
          badgeColor: ROLE_CONFIGS[role].badgeColor,
          avatarUrl: photoUrl || existing?.avatarUrl,
          city: u.cidade || existing?.city,
          cpf: taxDoc,
          department: existing?.department || (u.cidade ? `Base: ${u.cidade}` : undefined),
          description: existing?.description,
          code: existing?.code,
          isDatabase: true
        });
      });

      setUsersList(Array.from(recordsMap.values()));
    } catch (err: any) {
      console.warn('Erro ao carregar usuários:', err);
      setErrorMsg('Não foi possível sincronizar com o banco de dados. Exibindo dados locais.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Busca ao abrir
  useEffect(() => {
    if (isAdminUsersOpen) {
      fetchDatabaseUsers();
    }
  }, [isAdminUsersOpen, fetchDatabaseUsers]);

  if (!isAdminUsersOpen || currentRole === 'motorista') return null;

  const handleOpenDetail = (userItem: SystemUserRecord) => {
    setSelectedUser(userItem);
    setEditName(userItem.name);
    setEditPhone(userItem.phone);
    setEditAccessLevel(userItem.accessLevel);
    setEditCity(userItem.city || '');
    setEditCpf(userItem.cpf || '');
    setIsEditing(false);
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleAdminAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const targetNumericId = selectedUser.numericId || parseInt(selectedUser.id.replace(/\D/g, ''), 10) || null;
      try {
        let finalUrl = dataUrl;
        try {
          finalUrl = await uploadProfilePhoto(dataUrl, targetNumericId || selectedUser.cleanPhone || selectedUser.phone);
        } catch (upErr) {
          console.warn('[AdminUsersPage] Falha ao enviar foto para servidor PHP diretamente, prosseguindo com saveUser:', upErr);
        }

        const res = await api.saveUser({
          id: targetNumericId || undefined,
          phone: selectedUser.cleanPhone || selectedUser.phone,
          name: selectedUser.name,
          foto: finalUrl
        });
        const savedUrl = (res as any)?.avatarUrl || (res as any)?.foto || (res?.data as any)?.avatarUrl || (res?.data as any)?.foto || finalUrl;
        const resolved = formatPhotoUrl(savedUrl) || savedUrl;
        setSelectedUser(prev => prev ? { ...prev, avatarUrl: resolved } : null);
        setUsersList(prev => prev.map(u => (u.id === selectedUser.id || (u.cleanPhone && u.cleanPhone === selectedUser.cleanPhone)) ? { ...u, avatarUrl: resolved } : u));
        setSuccessMsg('Foto de perfil enviada ao servidor PHP e salva com sucesso!');
        setTimeout(() => setSuccessMsg(''), 3500);
      } catch (err) {
        console.warn('Erro ao atualizar foto do usuário:', err);
        setErrorMsg('Erro ao atualizar foto do usuário.');
        setTimeout(() => setErrorMsg(''), 3500);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStartEdit = () => {
    if (!selectedUser) return;
    setEditName(selectedUser.name);
    setEditPhone(selectedUser.phone);
    setEditAccessLevel(selectedUser.accessLevel);
    setEditCity(selectedUser.city || '');
    setEditCpf(selectedUser.cpf || '');
    setIsEditing(true);
    setSuccessMsg('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const targetNumericId = selectedUser.numericId || parseInt(selectedUser.id.replace(/\D/g, ''), 10) || null;

    try {
      // 1. Persiste no banco de dados Express/MySQL (/users/save)
      if (targetNumericId) {
        await api.saveUser({
          id: targetNumericId,
          name: editName.trim() || selectedUser.name,
          phone: editPhone.trim() || selectedUser.phone,
          access_level: editAccessLevel,
          ...(editCity ? { cidade: editCity.trim() } : {}),
          ...(editCpf ? { cpf: editCpf.trim() } : {})
        });
      }

      // 2. Atualiza registro atualizado em memória
      const updated: SystemUserRecord = {
        ...selectedUser,
        name: editName.trim() || selectedUser.name,
        phone: editPhone.trim() || selectedUser.phone,
        accessLevel: editAccessLevel,
        roleLabel: ROLE_CONFIGS[editAccessLevel].label,
        badgeColor: ROLE_CONFIGS[editAccessLevel].badgeColor,
        city: editCity.trim() || selectedUser.city,
        cpf: editCpf.trim() || selectedUser.cpf
      };

      setSelectedUser(updated);
      setUsersList(prev => prev.map(u => (u.id === updated.id || (u.cleanPhone && u.cleanPhone === updated.cleanPhone)) ? updated : u));
      setIsEditing(false);

      // 3. Se for o usuário atualmente conectado, atualiza seu cargo e permissão no app
      const isCurrent = currentUser?.phone && currentUser.phone.replace(/\D/g, '') === updated.cleanPhone;
      if (isCurrent) {
        const mappedRole: UserRole = 
          editAccessLevel === 'admin' ? 'admin_geral'
          : editAccessLevel === 'atendente' ? 'atendente'
          : editAccessLevel === 'motorista' ? 'motorista'
          : 'atendente';

        setCurrentRole(mappedRole);
        updateUser({
          name: updated.name,
          phone: updated.phone,
          role: updated.roleLabel,
          userRole: mappedRole === 'admin_geral' ? 'admin_geral' : (mappedRole as any)
        });
      }

      setSuccessMsg(`Usuário atualizado no banco de dados para ${ROLE_CONFIGS[editAccessLevel].label}!`);
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err: any) {
      console.error('Erro ao salvar usuário no banco:', err);
      setErrorMsg(err?.message || 'Erro ao persistir no servidor. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = usersList.filter(user => {
    const query = searchTerm.toLowerCase().trim();
    const queryDigits = query.replace(/\D/g, '');
    const userDocDigits = (user.cpf || '').replace(/\D/g, '');
    const userPhoneDigits = user.cleanPhone || user.phone.replace(/\D/g, '');

    const matchesSearch = 
      !query ||
      user.name.toLowerCase().includes(query) ||
      user.phone.includes(query) ||
      user.cleanPhone.includes(query) ||
      (queryDigits && userPhoneDigits.includes(queryDigits)) ||
      (user.city && user.city.toLowerCase().includes(query)) ||
      (user.cpf && user.cpf.toLowerCase().includes(query)) ||
      (queryDigits && userDocDigits.includes(queryDigits)) ||
      user.roleLabel.toLowerCase().includes(query);

    const matchesRole = roleFilter === 'todos' || user.accessLevel === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="fixed inset-0 z-[100] bg-slate-100 flex flex-col overflow-y-auto animate-in fade-in duration-200">
      
      {/* Header Superior da Página Inteira de Usuários */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-[#0B5187] via-[#09436E] to-[#072F4E] text-white px-4 sm:px-8 py-3.5 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsAdminUsersOpen(false);
              setSelectedUser(null);
            }}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center transition-all cursor-pointer text-white"
            title="Voltar ao mapa"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white/20 text-sky-100">
                Painel do Gestor
              </span>
              <span className="text-xs text-sky-200">| Gestão de Contas</span>
            </div>
            <h1 className="text-base sm:text-xl font-black">
              Usuários & Perfis do Sistema
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchDatabaseUsers}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Recarregar usuários do banco de dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsAdminUsersOpen(false);
              setIsAdminSettingsOpen(true);
            }}
            className="px-3.5 py-2 bg-[#FF5E00] hover:bg-[#E05300] active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Configurações & Campos</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-8">
        
        {/* Barra de Filtros e Busca */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80 mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, telefone, base ou cargo..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0B5187] focus:bg-white transition-all"
            />
          </div>

          {/* Filtros por Perfil */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setRoleFilter('todos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                roleFilter === 'todos'
                  ? 'bg-[#0B5187] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({usersList.length})
            </button>

            <button
              type="button"
              onClick={() => setRoleFilter('motorista')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                roleFilter === 'motorista'
                  ? 'bg-[#FF5E00] text-white shadow-xs'
                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Motoristas</span>
            </button>

            <button
              type="button"
              onClick={() => setRoleFilter('atendente')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                roleFilter === 'atendente'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Atendentes</span>
            </button>

            <button
              type="button"
              onClick={() => setRoleFilter('admin')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                roleFilter === 'admin'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Administradores</span>
            </button>

            <button
              type="button"
              onClick={() => setRoleFilter('cliente')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                roleFilter === 'cliente'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Clientes</span>
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {successMsg && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Grid de Cards de Usuários */}
        {isLoading && usersList.length === 0 ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3 bg-white rounded-3xl border border-slate-200">
            <RefreshCw className="w-8 h-8 animate-spin text-[#0B5187]" />
            <p className="text-sm font-bold">Carregando usuários do banco de dados...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2 bg-white rounded-3xl border border-slate-200">
            <Users className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-bold">Nenhum usuário encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((userItem) => {
              const roleConfig = ROLE_CONFIGS[userItem.accessLevel] || ROLE_CONFIGS.cliente;
              const RoleIcon = roleConfig.icon;

              const completeness = checkUserCompleteness({
                name: userItem.name,
                phone: userItem.phone,
                cpf: userItem.cpf
              });

              return (
                <div
                  key={userItem.id}
                  onClick={() => handleOpenDetail(userItem)}
                  className={`rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.99] border ${
                    completeness.isComplete
                      ? 'bg-white border-emerald-300 hover:border-emerald-500 hover:shadow-emerald-500/10'
                      : 'bg-amber-50/20 border-amber-200 hover:border-amber-400 hover:shadow-amber-500/10'
                  }`}
                >
                  <div>
                    {/* Topo do Card com Avatar e Cargo */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {userItem.avatarUrl ? (
                            <img
                              src={userItem.avatarUrl}
                              alt={userItem.name}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.parentElement?.querySelector('.user-card-avatar-fallback') as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                              className={`w-12 h-12 rounded-xl object-cover ring-2 ${
                                completeness.isComplete ? 'ring-emerald-200' : 'ring-amber-200'
                              }`}
                            />
                          ) : null}
                          <div 
                            className="user-card-avatar-fallback w-12 h-12 rounded-xl items-center justify-center text-white font-black text-sm shadow-xs"
                            style={{ 
                              display: userItem.avatarUrl ? 'none' : 'flex',
                              backgroundColor: roleConfig.badgeColor 
                            }}
                          >
                            {userItem.name ? userItem.name.slice(0, 2).toUpperCase() : 'EZ'}
                          </div>
                          {userItem.numericId && (
                            <span className="absolute -bottom-1 -right-1 px-1 py-0.2 bg-slate-900 text-white text-[9px] font-black rounded-md">
                              #{userItem.numericId}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-slate-900 group-hover:text-[#0B5187] transition-colors truncate">
                            {userItem.name}
                          </h3>
                          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{userItem.phone || 'Sem telefone'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Badge do Cargo Atual */}
                      <span 
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black text-white shrink-0 flex items-center gap-1 shadow-2xs"
                        style={{ backgroundColor: roleConfig.badgeColor }}
                      >
                        <RoleIcon className="w-3 h-3 stroke-[2.5]" />
                        <span>{roleConfig.label.split(' ')[0]}</span>
                      </span>
                    </div>

                    {/* Linha Dedicada e Formatada do Documento (CPF / CNPJ) */}
                    {(() => {
                      const docInfo = formatTaxId(userItem.cpf);
                      return (
                        <div className="mb-2">
                          {docInfo.clean ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs">
                              <FileText className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                              <span className="text-[9.5px] uppercase font-black px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 tracking-wider">
                                {docInfo.type}
                              </span>
                              <span className="font-mono font-bold text-slate-900 tracking-tight">
                                {docInfo.formatted}
                              </span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <FileText className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>Sem CPF / CNPJ</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Badge de Cadastro Completo / Incompleto com Cor e Ícone Diferenciados */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                      {completeness.isComplete ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                          <span>Cadastro Completo</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-300">
                          <AlertCircle className="w-3 h-3 text-amber-600 stroke-[2.5]" />
                          <span>Incompleto ({completeness.missingFields.join(', ')})</span>
                        </span>
                      )}
                    </div>

                    {/* Informações Complementares (Cidade / Base) */}
                    {userItem.city && (
                      <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mb-2">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>Base: {userItem.city}</span>
                      </p>
                    )}
                  </div>

                  {/* Rodapé do Card com Ação de Alterar */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[10px] font-bold text-slate-400">
                      {userItem.isDatabase ? 'Banco Oficial' : 'Conta Padrão'}
                    </span>
                    <span className="font-black text-[#0B5187] group-hover:text-[#FF5E00] flex items-center gap-1 transition-colors">
                      <span>Alterar Cargo</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal / Gaveta de Detalhes e Configurações do Usuário Clicado */}
      {selectedUser && (
        <div 
          className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setSelectedUser(null)}
        >
          <div 
            className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Perfil do Usuário */}
            <div 
              className="p-5 sm:p-6 text-white flex items-center justify-between relative overflow-hidden"
              style={{ backgroundColor: ROLE_CONFIGS[selectedUser.accessLevel]?.badgeColor || '#0B5187' }}
            >
              <div className="flex items-center gap-4 relative z-10 min-w-0">
                <input
                  ref={adminAvatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAdminAvatarUpload}
                />
                <div 
                  className="relative group cursor-pointer shrink-0" 
                  onClick={() => adminAvatarInputRef.current?.click()}
                  title="Clique para alterar a foto deste usuário"
                >
                  {selectedUser.avatarUrl ? (
                    <img
                      src={selectedUser.avatarUrl}
                      alt={selectedUser.name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement?.querySelector('.admin-modal-avatar-fallback') as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-white/80 shadow-md group-hover:opacity-85 transition-opacity"
                    />
                  ) : null}
                  <div 
                    className="admin-modal-avatar-fallback w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/80 shadow-md items-center justify-center text-white font-black text-xl group-hover:bg-white/30 transition-colors"
                    style={{ display: selectedUser.avatarUrl ? 'none' : 'flex' }}
                  >
                    {selectedUser.name ? selectedUser.name.slice(0, 2).toUpperCase() : 'EZ'}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="min-w-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider inline-block">
                    {ROLE_CONFIGS[selectedUser.accessLevel]?.label}
                  </span>
                  <h2 className="text-lg sm:text-xl font-black mt-1 truncate">
                    {selectedUser.name}
                  </h2>
                  <p className="text-xs text-white/90 font-medium truncate">
                    Telefone: {selectedUser.phone} {selectedUser.numericId ? `• ID #${selectedUser.numericId}` : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer relative z-10 shrink-0"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Corpo de Detalhes e Configurações */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
              {successMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* SELETOR INTERATIVO DE CARGO (MOTORISTA, ATENDENTE, ADMINISTRADOR, CLIENTE) */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-800 mb-2">
                  Definir Cargo / Função no Sistema
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  Altere abaixo se este usuário deve operar como Motorista, Atendente ou Administrador no banco de dados.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {/* Opção Motorista */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditAccessLevel('motorista');
                      if (!isEditing) handleStartEdit();
                    }}
                    className={`p-3 rounded-xl border-2 flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                      (isEditing ? editAccessLevel === 'motorista' : selectedUser.accessLevel === 'motorista')
                        ? 'border-[#FF5E00] bg-orange-50 text-[#FF5E00] shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      (isEditing ? editAccessLevel === 'motorista' : selectedUser.accessLevel === 'motorista')
                        ? 'bg-[#FF5E00] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Bike className="w-4 h-4 stroke-[2.4]" />
                    </div>
                    <div>
                      <span className="text-xs font-black block">Motorista</span>
                      <span className="text-[10px] text-slate-500 block leading-tight">Rotas & Entregas</span>
                    </div>
                  </button>

                  {/* Opção Atendente */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditAccessLevel('atendente');
                      if (!isEditing) handleStartEdit();
                    }}
                    className={`p-3 rounded-xl border-2 flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                      (isEditing ? editAccessLevel === 'atendente' : selectedUser.accessLevel === 'atendente')
                        ? 'border-sky-600 bg-sky-50 text-sky-700 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      (isEditing ? editAccessLevel === 'atendente' : selectedUser.accessLevel === 'atendente')
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Headphones className="w-4 h-4 stroke-[2.4]" />
                    </div>
                    <div>
                      <span className="text-xs font-black block">Atendente</span>
                      <span className="text-[10px] text-slate-500 block leading-tight">Despacho & Pedidos</span>
                    </div>
                  </button>

                  {/* Opção Administrador */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditAccessLevel('admin');
                      if (!isEditing) handleStartEdit();
                    }}
                    className={`p-3 rounded-xl border-2 flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                      (isEditing ? editAccessLevel === 'admin' : selectedUser.accessLevel === 'admin')
                        ? 'border-[#0B5187] bg-sky-50 text-[#0B5187] shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      (isEditing ? editAccessLevel === 'admin' : selectedUser.accessLevel === 'admin')
                        ? 'bg-[#0B5187] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <ShieldCheck className="w-4 h-4 stroke-[2.4]" />
                    </div>
                    <div>
                      <span className="text-xs font-black block">Administrador</span>
                      <span className="text-[10px] text-slate-500 block leading-tight">Gestão Geral</span>
                    </div>
                  </button>

                  {/* Opção Cliente */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditAccessLevel('cliente');
                      if (!isEditing) handleStartEdit();
                    }}
                    className={`p-3 rounded-xl border-2 flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                      (isEditing ? editAccessLevel === 'cliente' : selectedUser.accessLevel === 'cliente')
                        ? 'border-slate-800 bg-slate-100 text-slate-900 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      (isEditing ? editAccessLevel === 'cliente' : selectedUser.accessLevel === 'cliente')
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      <User className="w-4 h-4 stroke-[2.4]" />
                    </div>
                    <div>
                      <span className="text-xs font-black block">Cliente</span>
                      <span className="text-[10px] text-slate-500 block leading-tight">Rastreio & Envios</span>
                    </div>
                  </button>
                </div>

                <p className="mt-2 text-[10px] text-slate-500 italic">
                  {ROLE_CONFIGS[isEditing ? editAccessLevel : selectedUser.accessLevel]?.desc}
                </p>
              </div>

              {/* Formulário de Dados Básicos */}
              {isEditing ? (
                <form onSubmit={handleSaveUser} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-[#0B5187]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                        Telefone (Login / WhatsApp)
                      </label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-[#0B5187]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                        Cidade / Base Operacional
                      </label>
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        placeholder="Ex: Goiânia, Anápolis, Vianópolis..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-[#0B5187]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                        {editCpf.replace(/\D/g, '').length > 11 ? 'Documento CNPJ' : 'Documento CPF'}
                      </label>
                      <input
                        type="text"
                        value={editCpf}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 14);
                          if (digits.length <= 11) {
                            let val = digits;
                            if (digits.length > 9) val = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
                            else if (digits.length > 6) val = digits.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
                            else if (digits.length > 3) val = digits.replace(/(\d{3})(\d{1,3})/, '$1.$2');
                            setEditCpf(val);
                          } else {
                            const val = digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
                            setEditCpf(val);
                          }
                        }}
                        placeholder="000.000.000-00 ou CNPJ"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-[#0B5187] font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      disabled={isSaving}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-[#0B5187] hover:bg-[#083D66] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 transition-all"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Salvando no Banco...' : 'Salvar no Banco de Dados'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Nome Cadastrado
                      </span>
                      <p className="text-xs font-black text-slate-800 mt-0.5">
                        {selectedUser.name}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Telefone de Login
                      </span>
                      <p className="text-xs font-black text-slate-800 mt-0.5">
                        {selectedUser.phone || 'Não informado'}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Cidade / Base
                      </span>
                      <p className="text-xs font-black text-slate-800 mt-0.5">
                        {selectedUser.city || 'Não informada'}
                      </p>
                    </div>

                    {(() => {
                      const docInfo = formatTaxId(selectedUser.cpf);
                      return (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Documento ({docInfo.type})
                          </span>
                          <p className="text-xs font-black text-slate-800 mt-0.5 font-mono">
                            {docInfo.clean ? docInfo.formatted : 'Não informado'}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="px-5 py-2.5 bg-[#0B5187] hover:bg-[#083D66] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar Dados & Confirmar Cargo</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
