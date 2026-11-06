import React, { useState } from 'react';
import { 
  User, 
  Phone, 
  Lock, 
  FileText,
  Eye, 
  EyeOff, 
  ArrowRight, 
  ArrowLeft,
  Bike, 
  Car, 
  Truck, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';
import { AuthAccount } from '../../types/auth';
import { registerAndLogin } from '../../services/registrationService';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (account: AuthAccount) => void;
  onSwitchToLogin: () => void;
  canDismiss?: boolean;
}

function formatCpf(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function formatPlate(val: string): string {
  const clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7);
  if (clean.length > 3) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return clean;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToLogin,
  canDismiss = false
}) => {
  const [accountType, setAccountType] = useState<'motorista' | 'atendente' | null>(null);
  const isAtendente = accountType === 'atendente';
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<'moto' | 'carro' | 'utilitario'>('moto');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [password, setPassword] = useState('133200');
  const [showPassword, setShowPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanCpf = cpf.replace(/\D/g, '');
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanName = fullName.trim();
    const cleanPassword = password.trim();

    if (!cleanName) {
      setErrorMsg('Informe o nome completo do contato para o cadastro.');
      return;
    }

    if (!isAtendente && (!cleanCpf || cleanCpf.length !== 11)) {
      setErrorMsg('Por favor, informe um CPF válido com 11 dígitos.');
      return;
    }

    if (cleanPhone.length < 10) {
      setErrorMsg('Informe um telefone celular válido com DDD.');
      return;
    }

    if (!cleanPassword || cleanPassword.length < 6) {
      setErrorMsg('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    const vehicleLabels = {
      moto: 'Moto',
      carro: 'Carro',
      utilitario: 'Van / Furgão'
    };

    const finalModel = vehicleModel.trim() || (vehicleType === 'moto' ? 'Moto' : vehicleType === 'carro' ? 'Carro' : 'Furgão');
    const finalPlate = vehiclePlate.trim() ? vehiclePlate.toUpperCase() : '';

    try {
      const session = await registerAndLogin({
        name: cleanName,
        full_name: cleanName,
        name_completo: cleanName,
        phone: cleanPhone,
        password: cleanPassword,
        access_level: isAtendente ? 'atendente' : 'motorista',
        cidade: 'Goiânia',
        ...(!isAtendente ? {
          cpf: cleanCpf,
          tipo_veiculo: vehicleType,
          modelo_veiculo: finalModel,
          placa: finalPlate
        } : {})
      });

      const newDriverAccount: AuthAccount = isAtendente ? {
        id: String(session.user_id),
        phone: formatPhone(cleanPhone),
        cleanPhone: cleanPhone,
        code: cleanPassword,
        role: 'atendente',
        roleLabel: 'Atendente',
        name: cleanName,
        description: 'Atendimento • Pedidos',
        badgeColor: '#0B5187',
        avatarUrl: '',
        department: 'Atendimento',
        status: 'ativo',
        lastAccess: 'Agora',
        permissions: ['Pedidos', 'Clientes']
      } : {
        id: String(session.user_id),
        phone: formatPhone(cleanPhone),
        cleanPhone: cleanPhone,
        code: cleanPassword,
        role: 'motorista',
        roleLabel: `Motorista Parceiro (${vehicleLabels[vehicleType]})`,
        name: cleanName,
        document: formatCpf(cleanCpf),
        description: finalPlate ? `${finalModel} • Placa ${finalPlate}` : `${finalModel} • Entregas`,
        badgeColor: '#FF5E00',
        avatarUrl: vehicleType === 'moto'
          ? 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=256&h=256&q=80'
          : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
        department: 'Frota de Entregas',
        status: 'ativo',
        lastAccess: 'Agora',
        vehicle: finalModel,
        vehicleType,
        plate: finalPlate || undefined,
        permissions: ['Itinerário do Motorista', 'Navegação GPS', 'Baixa de Encomendas']
      };

      setIsSuccess(true);
      setTimeout(() => {
        onSuccess(newDriverAccount);
      }, 600);
    } catch (error) {
      console.error('[Cadastro] Falha ao cadastrar ou autenticar:', error);
      setErrorMsg(error instanceof Error ? error.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150">
      
      {/* Card Minimalista de Cadastro no mesmo estilo do Login */}
      <div className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">

        {/* Botão Voltar para o Login (Garante que nunca abra o sistema sem autenticação) */}
        <button
          onClick={accountType && !isLoading && !isSuccess ? () => { setAccountType(null); setErrorMsg(''); } : onSwitchToLogin}
          type="button"
          aria-label="Voltar para o Login"
          className="absolute top-4 left-4 z-10 p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          title="Voltar para a tela de login"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        {/* TOPO: Apenas a Logo Centralizada e o Nome Embaixo ("fica filé") */}
        <div className="pt-8 pb-3 px-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0B5187]/5 border border-[#0B5187]/15 p-2.5 shadow-xs mb-2.5">
            <img src="/logo.svg" alt="EncomendasZap" className="w-full h-full object-contain" />
          </div>

          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">
            Encomendas<span className="text-[#FF5E00]">Zap</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {accountType === null ? 'Como você quer se cadastrar?' : isAtendente ? 'Cadastro de Atendente' : 'Cadastro de Motorista Parceiro'}
          </p>
        </div>

        {accountType === null ? (
          <div className="px-6 pb-6 pt-1 space-y-3">
            {[
              { id: 'motorista' as const, label: 'Motorista', desc: 'Faço coletas e entregas', icon: Bike },
              { id: 'atendente' as const, label: 'Atendente', desc: 'Gerencio pedidos e clientes', icon: User }
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAccountType(opt.id)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-200 bg-slate-50 hover:border-[#FF5E00] hover:bg-orange-50 active:scale-[0.98] transition-all cursor-pointer text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-[#FF5E00]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-black text-slate-800">{opt.label}</div>
                    <div className="text-xs text-slate-500 font-medium">{opt.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              );
            })}
            <div className="pt-1 text-center">
              <span className="text-xs text-slate-500">Já tem conta? </span>
              <button type="button" onClick={onSwitchToLogin} className="text-xs font-black text-[#0B5187] hover:underline cursor-pointer">
                Fazer Login
              </button>
            </div>
          </div>
        ) : null}

        {accountType === null ? null : isSuccess ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 animate-bounce" />
            <h3 className="text-lg font-black text-slate-800">Cadastro Concluído!</h3>
            <p className="text-xs text-slate-500 font-semibold">
              Conectando com o servidor e iniciando sessão...
            </p>
          </div>
        ) : (
          /* FORMULÁRIO MINIMALISTA */
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-1 space-y-3">
            
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Nome do Contato (obrigatório) */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Nome do Contato <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4 text-[#0B5187]" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome e sobrenome do contato"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-bold text-sm focus:outline-none focus:border-[#FF5E00] focus:bg-white transition-all placeholder-slate-400"
                />
              </div>
            </div>

            {/* CPF do Motorista */}
            {!isAtendente && (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                CPF do Motorista
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <FileText className="w-4 h-4 text-[#0B5187]" />
                </div>
                <input
                  type="tel"
                  required
                  maxLength={14}
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-bold text-sm focus:outline-none focus:border-[#FF5E00] focus:bg-white transition-all placeholder-slate-400"
                />
              </div>
            </div>
            )}

            {/* WhatsApp / Telefone */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Telefone Celular / WhatsApp
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4 text-[#FF5E00]" />
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(62) 99999-9999"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-bold text-sm focus:outline-none focus:border-[#FF5E00] focus:bg-white transition-all placeholder-slate-400"
                />
              </div>
            </div>

            {!isAtendente && (<>
            {/* Tipo de Veículo */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Veículo de Entrega
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'moto' as const, label: 'Moto', icon: Bike },
                  { id: 'carro' as const, label: 'Carro', icon: Car },
                  { id: 'utilitario' as const, label: 'Furgão', icon: Truck }
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = vehicleType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVehicleType(item.id)}
                      className={`py-2 px-2.5 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50 border-[#FF5E00] text-[#FF5E00] shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detalhes do Veículo (Modelo e Placa em 2 colunas compactas) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                  Modelo (opcional)
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder={vehicleType === 'moto' ? 'Ex: CG 160' : vehicleType === 'carro' ? 'Ex: Onix' : 'Ex: Fiorino'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-xs focus:outline-none focus:border-[#FF5E00] focus:bg-white transition-all placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                  Placa (opcional)
                </label>
                <input
                  type="text"
                  maxLength={8}
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(formatPlate(e.target.value))}
                  placeholder="ABC-1234"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-xs uppercase focus:outline-none focus:border-[#FF5E00] focus:bg-white transition-all placeholder-slate-400"
                />
              </div>
            </div>

            </>)}

            {/* Senha */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                  Senha de Acesso (mínimo 6 dígitos)
                </label>
                <span className="text-[10px] text-slate-400 font-semibold">
                  Padrão: 133200
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4 text-[#FF5E00]" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-bold text-sm focus:outline-none focus:border-[#FF5E00] focus:bg-white transition-all placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão de Envio */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-[#FF5E00] hover:bg-[#EA580C] active:scale-[0.98] disabled:opacity-70 text-white font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Cadastrando no Servidor...</span>
                </div>
              ) : (
                <>
                  <span>{isAtendente ? 'Concluir Cadastro de Atendente' : 'Concluir Cadastro de Motorista'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Alternar para Login */}
            <div className="pt-1 text-center">
              <span className="text-xs text-slate-500">Já tem uma conta? </span>
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-xs font-black text-[#0B5187] hover:underline cursor-pointer"
              >
                Fazer Login
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
