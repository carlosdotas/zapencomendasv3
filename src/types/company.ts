/**
 * Tipos e Interfaces para Gestão Multi-Empresa e Transportadoras
 */

export interface CompanyMember {
  phone: string;
  cleanPhone: string;
  name: string;
  role: 'admin' | 'atendente' | 'motoboy';
  addedAt: number;
}

export interface CompanyTransportadora {
  id: string;
  name: string; // Razão Social / Nome Fantasia
  tradeName?: string;
  cnpj?: string;
  phone: string;
  cleanPhone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  locationId?: number | null;
  location?: {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
  } | null;
  status: 'ativa' | 'inativa';
  createdAt: number;
  updatedAt?: number;

  // Telefones dos Administradores da Empresa
  adminPhones: string[];
  
  // Telefones dos Atendentes da Empresa
  attendantPhones: string[];

  // Telefones dos Motoboys Autorizados a ver e transportar pedidos desta empresa
  motoboyPhones: string[];

  // Configurações específicas da transportadora
  pricingModel?: 'discriminado' | 'frete_unico';
  customFreightRate?: number;
  logoUrl?: string;
  notes?: string;
}

export const MASTER_ADMIN_PHONE = '62996157340';
export const MASTER_ADMIN_CLEAN = '62996157340';
export const MASTER_ADMIN_CODE = '821332';
