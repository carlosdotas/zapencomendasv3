export interface CustomerAddress {
  id: string;
  label?: string; // Ex: 'Principal', 'Casa', 'Trabalho', 'Filial', 'Depósito', 'Outro'
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  cpf: string;
  cnpj?: string;
  personType?: 'fisica' | 'juridica' | string;
  address: string; // Endereço principal
  coordinates?: {
    lat: number;
    lng: number;
  };
  city?: string;
  cidade?: string;
  additionalAddresses?: CustomerAddress[]; // Múltiplas localizações aceitas
  email?: string;
  notes?: string;
  createdAt: number;
  companyId?: string;
  orderCount?: number;
}

export interface AgendaContact {
  id: string;
  name: string;
  phone: string;
  cpf?: string;
  email?: string;
  address?: string;
  notes?: string;
  source: 'agenda';
  orderCount?: number;
}

export type TargetFieldType = 'customer' | 'responsible';
