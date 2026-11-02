import React, { useState, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  ShieldCheck, 
  Settings, 
  Save, 
  CheckCircle2, 
  Truck, 
  Bell, 
  LogOut, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Camera,
  X,
  AlertTriangle,
  AlertCircle,
  FileText,
  DollarSign,
  CreditCard,
  Building2,
  PhoneCall,
  Bike
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { api, uploadProfilePhoto } from '../../services/api';
import { formatPhotoUrl } from '../../services/apiAdapters';
import { useBackButton } from '../../hooks/useBackButton';
import { UserAvatar } from '../common/UserAvatar';

type TabType = 'overview' | 'settings';

export const UserProfilePage: React.FC = () => {
  const { 
    user, 
    updateUser, 
    isProfileOpen, 
    setIsProfileOpen, 
    setIsLoginModalOpen,
    logout,
    currentRole,
    isDriverOnline,
    userRequiredFields,
    setIsAdminSettingsOpen
  } = useMapStore();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  useBackButton('user-profile-editing', isEditing && isProfileOpen, () => {
    setIsEditing(false);
  }, 85);

  // Upload de Foto de Perfil
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [avatarToast, setAvatarToast] = useState<string | null>(null);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setAvatarToast('A imagem deve ter no máximo 10MB.');
      setTimeout(() => setAvatarToast(null), 4000);
      return;
    }

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // Exibe prévia imediata no estado da interface
      updateUser({ avatarUrl: dataUrl });

      // Sincroniza com servidor PHP de fotos
      const cleanPhone = (user.phone || '').replace(/\D/g, '');
      const numericUserId = user.id && !String(user.id).includes('usr-') ? String(user.id).replace(/\D/g, '') : '';
      try {
        // 1. Envia a foto em base64 diretamente para o Servidor de Fotos PHP (images.php com tipo perfil)
        const uploadedUrl = await uploadProfilePhoto(dataUrl, numericUserId || undefined, cleanPhone || user.phone);

        // 2. Salva o usuário no backend usando a URL do servidor PHP
        const saveResult = await api.saveUser({
          id: numericUserId || undefined,
          phone: cleanPhone || user.phone,
          name: user.name,
          foto: uploadedUrl,
          avatarUrl: uploadedUrl
        });
        if (!saveResult.success) {
          throw new Error(saveResult.message || 'Não foi possível salvar a foto do perfil.');
        }

        const savedPhoto = saveResult.data?.foto || saveResult.data?.avatarUrl || uploadedUrl;
        const resolvedPhoto = formatPhotoUrl(savedPhoto) || savedPhoto;

        // Atualiza estado do usuário e armazena URL compacta permanente no localStorage
        updateUser({ avatarUrl: resolvedPhoto });
        try {
          localStorage.setItem('encomendaszap_user_avatar', resolvedPhoto);
          const loggedStr = localStorage.getItem('encomendaszap_logged_account');
          if (loggedStr) {
            const acc = JSON.parse(loggedStr);
            acc.avatarUrl = resolvedPhoto;
            localStorage.setItem('encomendaszap_logged_account', JSON.stringify(acc));
          }
        } catch {}

        setAvatarToast('Foto de perfil enviada com sucesso para o servidor PHP!');
      } catch (err) {
        console.warn('Erro ao sincronizar foto de perfil com o servidor:', err);
        setAvatarToast('Aviso: Foto salva localmente com pendência de sincronização.');
      }

      setIsUploadingAvatar(false);
      setTimeout(() => setAvatarToast(null), 3500);
    };
    reader.onerror = () => {
      setIsUploadingAvatar(false);
      setAvatarToast('Erro ao processar imagem.');
      setTimeout(() => setAvatarToast(null), 3500);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Form states com todos os campos cadastrais
  const [formData, setFormData] = useState({
    name: user.name || 'EncomendasZap Operações',
    email: user.email || 'encomendaszap@gmail.com',
    phone: user.phone || '(11) 98765-4321',
    role: user.role || 'Gestor Logístico & Entregas',
    document: user.document || '42.123.456/0001-89',
    company: user.company || 'EncomendasZap Logística Express',
    city: user.city || 'Goiânia - GO',
    address: 'Av. T-10, 1300 - Setor Bueno',
    vehicleType: 'moto',
    vehiclePlate: 'EZP-9A82',
    vehicleModel: 'Honda CG 160 Cargo',
    pixKey: user.phone || '62996157341',
    cnh: '05489123840',
    emergencyContact: '(62) 99123-4567 (Família)'
  });

  // Lista dinâmica de campos obrigatórios pendentes conforme as regras do sistema
  const pendingRequiredFields = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (userRequiredFields.name && !formData.name?.trim()) list.push({ key: 'name', label: 'Nome Completo' });
    if (userRequiredFields.phone && !formData.phone?.trim()) list.push({ key: 'phone', label: 'Telefone com WhatsApp' });
    if (userRequiredFields.email && !formData.email?.trim()) list.push({ key: 'email', label: 'E-mail Principal' });
    if (userRequiredFields.document && !formData.document?.trim()) list.push({ key: 'document', label: 'CPF / CNPJ' });
    if (userRequiredFields.city && !formData.city?.trim()) list.push({ key: 'city', label: 'Cidade Base' });
    if (userRequiredFields.company && !formData.company?.trim()) list.push({ key: 'company', label: 'Empresa / Polo' });
    if (userRequiredFields.address && !formData.address?.trim()) list.push({ key: 'address', label: 'Endereço Completo' });
    if (userRequiredFields.vehicleType && !formData.vehicleType?.trim()) list.push({ key: 'vehicleType', label: 'Tipo de Veículo' });
    if (userRequiredFields.vehiclePlate && !formData.vehiclePlate?.trim()) list.push({ key: 'vehiclePlate', label: 'Placa do Veículo' });
    if (userRequiredFields.vehicleModel && !formData.vehicleModel?.trim()) list.push({ key: 'vehicleModel', label: 'Modelo do Veículo' });
    if (userRequiredFields.pixKey && !formData.pixKey?.trim()) list.push({ key: 'pixKey', label: 'Chave PIX' });
    if (userRequiredFields.cnh && !formData.cnh?.trim()) list.push({ key: 'cnh', label: 'CNH' });
    if (userRequiredFields.emergencyContact && !formData.emergencyContact?.trim()) list.push({ key: 'emergencyContact', label: 'Contato de Emergência' });
    return list;
  }, [userRequiredFields, formData]);

  // Settings switches
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [trafficAlerts, setTrafficAlerts] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [batterySaver, setBatterySaver] = useState(false);

  if (!isProfileOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRequiredFields.length > 0) {
      setFormError(`Preenchimento obrigatório: ${pendingRequiredFields.map(p => p.label).join(', ')}.`);
      return;
    }
    setFormError(null);
    updateUser(formData);
    setIsEditing(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F4F7FB] overflow-y-auto pointer-events-auto flex flex-col animate-in fade-in duration-200">
      {avatarToast && (
        <div className="fixed top-4 right-4 z-[100] bg-emerald-600 text-white text-xs sm:text-sm font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-emerald-400/40 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-5 h-5 text-white stroke-[2.5]" />
          <span>{avatarToast}</span>
        </div>
      )}

      {/* 1. Barra de Navegação Superior (Header Fixo) */}
      <header className="sticky top-0 z-30 bg-[#0B5187] text-white border-b border-[#083D66] shadow-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsProfileOpen(false)}
            aria-label="Voltar para o mapa"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs sm:text-sm font-semibold transition-all border border-white/15"
          >
            <ArrowLeft className="w-4 h-4 text-orange-400 stroke-[2.5]" />
            <span>Voltar ao Mapa</span>
          </button>

          <div className="h-4 w-[1px] bg-white/20 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white p-0.5 shadow-xs flex items-center justify-center">
              <img src="/logo.svg" alt="EncomendasZap" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold tracking-tight leading-tight flex items-center gap-1.5">
                Encomendas<span className="text-[#FF5E00]">Zap</span>
                <span className="text-[11px] font-normal text-white/70 hidden md:inline-block">• Perfil do Usuário</span>
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#083D66] rounded-full text-xs font-semibold text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Operação Online</span>
          </div>

          <button
            onClick={() => setIsProfileOpen(false)}
            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar perfil"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Banner de Destaque / Hero Header */}
      <section className="bg-gradient-to-b from-[#0B5187] via-[#0D5A94] to-[#083D66] text-white pt-8 pb-12 px-4 sm:px-8 border-b border-[#073559] shadow-inner">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
            {/* Avatar & Info */}
            <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
              <div className="relative group">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
                <div 
                  onClick={() => avatarInputRef.current?.click()}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white p-1 shadow-2xl ring-4 ring-white/20 overflow-hidden cursor-pointer relative group-hover:ring-[#FF5E00] transition-all"
                  title="Clique para alterar foto"
                >
                  <UserAvatar
                    src={user.avatarUrl}
                    name={user.name}
                    className="h-full w-full rounded-full"
                    imageClassName="h-full w-full rounded-full object-cover"
                    fallbackClassName="flex h-full w-full items-center justify-center rounded-full bg-[#0B5187]/15 text-2xl font-black text-[#0B5187]"
                  />

                  {/* Overlay ao passar o mouse */}
                  <div className="absolute inset-0 bg-black/45 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-6 h-6 text-white mb-0.5" />
                    <span className="text-[10px] text-white font-bold">Alterar</span>
                  </div>

                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Botão de câmera para mobile / clique direto */}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#FF5E00] hover:bg-[#E05200] text-white border-2 border-white flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition-all z-10"
                  title="Alterar foto de perfil"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                    {user.name}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FF5E00] text-white shadow-xs">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Conta Verificada
                  </span>
                  {currentRole === 'motorista' && isDriverOnline && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500 text-white shadow-xs animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      GPS Sendo Monitorado (Verde)
                    </span>
                  )}
                </div>
                <p className="text-sm text-orange-200/90 font-medium mb-2">
                  {user.role || 'Gestor Logístico & Entregas'} • {user.company || 'EncomendasZap'}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-white/80">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-orange-400" />
                    {user.email}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-orange-400" />
                    {user.phone || '(62) 98765-4321'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-400" />
                    {user.city || 'Goiânia - GO'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white/15 hover:bg-white/25 text-white transition-all shadow-md flex items-center gap-1.5 active:scale-95 cursor-pointer border border-white/20"
              >
                <Camera className="w-4 h-4" />
                <span>Alterar Foto</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('overview');
                  setIsEditing(!isEditing);
                }}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md flex items-center gap-2 active:scale-95 cursor-pointer ${
                  isEditing 
                    ? 'bg-white text-[#0B5187] hover:bg-slate-100'
                    : 'bg-[#FF5E00] text-white hover:bg-[#E05200] shadow-[#FF5E00]/30'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>{isEditing ? 'Cancelar Edição' : 'Editar Informações'}</span>
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* 3. Navegação em Abas */}
      <div className="bg-white border-b border-slate-200 sticky top-[57px] z-20 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto scrollbar-none py-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-3 transition-colors shrink-0 flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'border-[#0B5187] text-[#0B5187]'
                  : 'border-transparent text-slate-500 hover:text-[#0B5187]'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Dados Cadastrais</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-3 transition-colors shrink-0 flex items-center gap-2 ${
                activeTab === 'settings'
                  ? 'border-[#0B5187] text-[#0B5187]'
                  : 'border-transparent text-slate-500 hover:text-[#0B5187]'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Preferências & Segurança</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Conteúdo Principal das Abas */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {saveSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-3 text-emerald-800 text-sm font-bold shadow-sm animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Dados do perfil atualizados com sucesso no sistema!</span>
          </div>
        )}

        {formError && (
          <div className="p-4 bg-red-50 border border-red-300 rounded-2xl flex items-center gap-3 text-red-800 text-sm font-bold shadow-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* ALERTA DE PENDÊNCIA DE CAMPOS OBRIGATÓRIOS DO SISTEMA */}
        {pendingRequiredFields.length > 0 && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-300/80 flex items-start gap-3.5 shadow-sm animate-in fade-in">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs sm:text-sm font-black text-amber-950">
                  Pendências de Cadastro Obrigatório ({pendingRequiredFields.length} campo{pendingRequiredFields.length > 1 ? 's' : ''})
                </h4>
                {userRequiredFields.blockIfIncomplete && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                    Bloqueio Ativo
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-900/90 leading-snug mt-1">
                Conforme as regras do sistema, os campos marcados abaixo são obrigatórios para o funcionamento da sua conta:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {pendingRequiredFields.map((f) => (
                  <span key={f.key} className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                    ⚠️ {f.label}
                  </span>
                ))}
              </div>

              <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] text-amber-800">
                  Preencha os campos abaixo para manter seu cadastro regularizado.
                </span>
                {currentRole !== 'motorista' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsAdminSettingsOpen(true);
                    }}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configurar Campos Obrigatórios (Admin)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA 1: DADOS CADASTRAIS & CONTA */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Coluna da Esquerda: Formulário de Informações */}
            <div className="md:col-span-2 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-[#0B5187]">Dados da Conta e Operação</h3>
                  <p className="text-xs text-slate-500">Mantenha seus dados sempre atualizados para identificação nas entregas.</p>
                </div>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-bold text-[#0B5187] hover:text-[#FF5E00] flex items-center gap-1 cursor-pointer"
                  >
                    Editar
                  </button>
                ) : null}
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nome Completo */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Nome / Razão Social</span>
                        {userRequiredFields.name && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.name ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.name ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.name && !formData.name?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* E-mail Principal */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>E-mail Principal</span>
                        {userRequiredFields.email && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.email ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.email ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="email"
                      disabled={!isEditing}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.email && !formData.email?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* Telefone / WhatsApp */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Telefone / WhatsApp</span>
                        {userRequiredFields.phone && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.phone ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.phone ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.phone && !formData.phone?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* CPF / CNPJ */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>CPF / CNPJ</span>
                        {userRequiredFields.document && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.document ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.document ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.document && !formData.document?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* Cargo / Função */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Cargo / Função</span>
                        {userRequiredFields.role && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.role ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.role ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>

                  {/* Cidade / Região Base */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Cidade / Região</span>
                        {userRequiredFields.city && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.city ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.city ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.city && !formData.city?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* Empresa / Polo */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Empresa / Polo Base</span>
                        {userRequiredFields.company && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.company ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.company ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.company && !formData.company?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* Endereço Completo */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Endereço Completo</span>
                        {userRequiredFields.address && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.address ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.address ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.address && !formData.address?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* Chave PIX */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Chave PIX (Repasses)</span>
                        {userRequiredFields.pixKey && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.pixKey ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.pixKey ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.pixKey}
                      onChange={(e) => setFormData({ ...formData, pixKey: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.pixKey && !formData.pixKey?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* CNH */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>CNH (Habilitação)</span>
                        {userRequiredFields.cnh && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.cnh ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.cnh ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.cnh}
                      onChange={(e) => setFormData({ ...formData, cnh: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.cnh && !formData.cnh?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>

                  {/* Contato de Emergência */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                        <span>Contato de Emergência</span>
                        {userRequiredFields.emergencyContact && <span className="text-red-500 font-black">*</span>}
                      </label>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                        userRequiredFields.emergencyContact ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {userRequiredFields.emergencyContact ? 'Obrigatório' : 'Opcional'}
                      </span>
                    </div>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-semibold text-[#0B5187] focus:outline-none focus:ring-2 focus:ring-[#0B5187] disabled:bg-slate-50 disabled:text-slate-600 ${
                        userRequiredFields.emergencyContact && !formData.emergencyContact?.trim() ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                      }`}
                    />
                  </div>
                </div>

                {isEditing && (
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setFormError(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0B5187] hover:bg-[#083D66] shadow-md shadow-[#0B5187]/25 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4 text-orange-400" />
                      <span>Salvar Alterações</span>
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Coluna da Direita: Card de Veículo & Resumo */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 pb-3 mb-4 border-b border-slate-100">
                  <div className="w-9 h-9 rounded-xl bg-[#0B5187] text-white flex items-center justify-center">
                    <Truck className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#0B5187]">Veículo Cadastrado</h4>
                    <p className="text-[11px] text-slate-400">Frota Express</p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Modelo:</span>
                    <span className="font-bold text-[#0B5187]">Honda CG 160 Cargo</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Placa:</span>
                    <span className="font-bold text-[#0B5187]">EZP-9A82</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Tipo:</span>
                    <span className="font-bold text-[#0B5187]">Duas Rodas / Motocicleta</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-medium">Status de Inspeção:</span>
                    <span className="font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
                    </span>
                  </div>
                </div>
              </div>

              {/* Card de Ajuda Rápida */}
              <div className="bg-gradient-to-br from-[#0B5187] to-[#0E5E99] text-white rounded-3xl p-6 shadow-md">
                <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  Central de Ajuda EncomendasZap
                </h4>
                <p className="text-xs text-white/80 leading-relaxed mb-4">
                  Precisa de suporte em tempo real durante uma entrega ou dúvidas sobre o mapa?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const phone = '5562996157341';
                    const msg = 'Olá, preciso de suporte no EncomendasZap';
                    if (typeof window !== 'undefined' && window.AndroidApp?.openWhatsApp) {
                      window.AndroidApp.openWhatsApp(phone, msg);
                    } else {
                      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-white text-[#0B5187] hover:bg-orange-50 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5 text-[#FF5E00]" />
                  <span>Falar com o Suporte</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: PREFERÊNCIAS & SEGURANÇA */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-extrabold text-[#0B5187]">Preferências de Navegação & Notificações</h3>
              <p className="text-xs text-slate-500">Configure avisos de tráfego em tempo real e privacidade.</p>
            </div>

            <div className="space-y-4">
              {/* Notificações no app */}
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <div>
                  <p className="text-sm font-bold text-[#0B5187]">Notificações de Novas Entregas</p>
                  <p className="text-xs text-slate-500">Receba avisos instantâneos quando houver solicitações na sua região.</p>
                </div>
                <button
                  onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                    notificationsEnabled ? 'bg-[#0B5187]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      notificationsEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Alertas de tráfego */}
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <div>
                  <p className="text-sm font-bold text-[#0B5187]">Alertas de Trânsito em Tempo Real</p>
                  <p className="text-xs text-slate-500">Avisos automáticos de rotas congestionadas e acidentes.</p>
                </div>
                <button
                  onClick={() => setTrafficAlerts(!trafficAlerts)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                    trafficAlerts ? 'bg-[#0B5187]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      trafficAlerts ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Efeitos sonoros */}
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <div>
                  <p className="text-sm font-bold text-[#0B5187]">Alertas Sonoros de Rota</p>
                  <p className="text-xs text-slate-500">Sons de bip e notificações ao aproximar-se do destino.</p>
                </div>
                <button
                  onClick={() => setSoundAlerts(!soundAlerts)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                    soundAlerts ? 'bg-[#0B5187]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      soundAlerts ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Economia de Bateria */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-bold text-[#0B5187]">Modo Economia de Bateria</p>
                  <p className="text-xs text-slate-500">Reduz taxa de atualização do GPS quando a tela estiver inativa.</p>
                </div>
                <button
                  onClick={() => setBatterySaver(!batterySaver)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                    batterySaver ? 'bg-[#0B5187]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      batterySaver ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Bloco de Configurações do Sistema & Campos Obrigatórios (Apenas para não-motoristas) */}
              {currentRole !== 'motorista' && (
                <div className="mt-4 p-4 rounded-2xl bg-[#0B5187]/5 border border-[#0B5187]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0B5187] text-white flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-[#0B5187]">Regras de Cadastro & Campos Obrigatórios</h4>
                      <p className="text-xs text-slate-500">Defina quais campos são obrigatórios para os usuários funcionarem no sistema.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      setIsAdminSettingsOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#0B5187] hover:bg-[#083D66] text-white font-black text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-xs"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Configurações do Usuário</span>
                  </button>
                </div>
              )}
            </div>

            {/* Logout Action */}
            <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  logout();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair / Trocar de Conta (Telefone)</span>
              </button>

              <div className="text-[11px] text-slate-400">
                Perfil: {user.role || 'Usuário'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Footer da Página de Perfil */}
      <footer className="mt-auto bg-[#0B5187] text-white py-4 px-6 border-t border-[#083D66] text-xs text-center flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/logo.svg" alt="EncomendasZap" className="w-4 h-4 object-contain" />
          <span>EncomendasZap Logística & Entregas Inteligentes © 2026</span>
        </div>
        <div className="flex items-center gap-4 text-white/70">
          <a href="#" className="hover:text-white hover:underline">Políticas de Privacidade</a>
          <span>•</span>
          <a href="#" className="hover:text-white hover:underline">Termos de Serviço</a>
          <span>•</span>
          <a href="#" className="hover:text-white hover:underline">Central de Ajuda</a>
        </div>
      </footer>
    </div>
  );
};
