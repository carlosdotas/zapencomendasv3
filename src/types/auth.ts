export type UserRole = 'admin_geral' | 'atendente' | 'terminal' | 'motorista';

export interface AuthAccount {
  id?: string;
  phone: string;
  cleanPhone: string;
  code: string;
  role: UserRole;
  roleLabel: string;
  name: string;
  description: string;
  badgeColor: string;
  avatarUrl: string;
  email?: string;
  document?: string;
  department?: string;
  status?: 'ativo' | 'inativo' | 'bloqueado';
  lastAccess?: string;
  permissions?: string[];
  vehicle?: string;
  vehicleType?: 'moto' | 'carro' | 'utilitario';
  plate?: string;
  isTestAccount?: boolean;
}
