/**
 * Tipos e interfaces estáticas do servidor Express EncomendasZap
 * Conforme contratos documentados em src/routes
 */

export interface ApiResponse<T = any> {
  success: boolean;
  logged?: boolean;
  message?: string;
  data?: T;
  path?: string;
  total?: number;
  hasMore?: boolean;
  cursor?: string;
  page?: number;
  limit?: number;
  id?: string | number;
  error?: string;
  errors?: any[];
}

export interface BackendLoginData {
  user_id: number | string;
  token: string;
  name: string;
  phone: string;
  access_level: string;
  foto?: string;
  avatarUrl?: string;
  photo?: string;
}

export interface BackendUser {
  id: number | string;
  name: string;
  phone: string;
  access_level: string;
  full_name?: string;
  name_completo?: string;
  cpf?: string;
  address?: string;
  endereco?: string;
  coordinates?: { lat: number; lng: number } | null;
  additionalAddresses?: Array<{
    id: string;
    label?: string;
    address: string;
    city?: string;
    cidade?: string;
    coordinates?: { lat: number; lng: number };
  }>;
  additional_addresses?: BackendUser['additionalAddresses'];
  city?: string;
  cidade?: string;
  cliente_especial?: boolean | number;
  paga_semanal?: boolean | number;
  locais_id?: number | string | null;
  foto?: string;
  avatarUrl?: string;
  created_at?: string;
  pendencias?: number;
  local_name?: string;
  pedidos_count?: number;
  order_count?: number;
  orderCount?: number;
  cnpj?: string;
  person_type?: string;
}

export interface BackendLocal {
  id: number | string;
  name: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  rua?: string;
  setor?: string;
  numero?: string;
  lat: number | string;
  lng: number | string;
  telefone?: string;
  horario?: string;
  site?: string;
  place_id?: string;
  icon?: string;
  color?: string;
  link?: string;
  status?: string;
  central_coletas?: boolean | number;
  isento_taxas?: boolean | number;
  created_at?: string;
  pedidos_count?: number;
  clientes_count?: number;
  central_mais_proxima?: string;
  distancia_central_km?: number;
}

export interface BackendPedido {
  id: number | string;
  codigo?: string;
  orderCode?: string;
  data?: string;
  etapa?: 'pendente' | 'aprovado' | 'coletando' | 'coletado' | 'trocando' | 'trocado' | 'entregando' | 'entregue' | 'finalizado' | 'cancelado' | string;
  tipo_encomenda?: 'coleta' | 'entrega' | 'troca' | string;
  tipo_veiculo?: 'moto' | 'carro' | 'utilitario' | string;
  cliente?: string;
  phone?: string;
  cidade?: string;
  detalhes?: string;
  setor?: string;
  local?: string;
  valor?: number | string;
  desconto?: number | string;
  total?: number | string;
  status_pagamento?: 'pendente' | 'pago' | 'estornado' | string;
  users_id?: number | string;
  clientes_id?: number | string;
  locais_id?: number | string;
  locais_name?: string;
  locais_cidade?: string;
  locais_lat?: number | string;
  locais_lng?: number | string;
  motorista_id?: number | string;
  motorista_nome?: string;
  motorista_telefone?: string;
  coleta_motoristas?: string;
  entrega_motoristas?: string;
  coleta_user_id?: number | string | null;
  coleta_user_nome?: string | null;
  entrega_user_id?: number | string | null;
  entrega_user_nome?: string | null;
  
  // Coleta
  coleta_local?: string;
  coleta_locais_id?: number | string;
  coleta_locais_name?: string;
  coleta_locais_cidade?: string;
  coleta_locais_lat?: number | string;
  coleta_locais_lng?: number | string;
  coleta_nome?: string;
  coleta_endereco?: string;
  coleta_cidade?: string;
  coleta_lat?: number | string;
  coleta_lng?: number | string;
  coleta_contato?: string;
  coleta_phone?: string;
  coleta_responsavel?: string;
  coleta_responsavel_phone?: string;
  coleta_obs?: string;
  coleta_foto?: string;
  coleta_chegada_at?: string;
  coleta_saida_at?: string;

  // Troca (se houver)
  troca_locais_id?: number | string;
  troca_nome?: string;
  troca_endereco?: string;
  troca_lat?: number | string;
  troca_lng?: number | string;
  troca_contato?: string;
  troca_phone?: string;
  troca_responsavel?: string;
  troca_responsavel_phone?: string;
  troca_obs?: string;
  troca_foto?: string;
  troca_at?: string;
  troca_chegada_at?: string;
  troca_saida_at?: string;
  troca_user_id?: number | string;
  troca_user_nome?: string;

  // Entrega
  entrega_local?: string;
  entrega_locais_id?: number | string;
  entrega_locais_name?: string;
  entrega_locais_cidade?: string;
  entrega_locais_lat?: number | string;
  entrega_locais_lng?: number | string;
  entrega_nome?: string;
  entrega_endereco?: string;
  entrega_cidade?: string;
  entrega_lat?: number | string;
  entrega_lng?: number | string;
  entrega_contato?: string;
  entrega_phone?: string;
  entrega_responsavel?: string;
  entrega_responsavel_phone?: string;
  entrega_obs?: string;
  entrega_foto?: string;
  entrega_at?: string;
  entrega_chegada_at?: string;
  entrega_saida_at?: string;

  // Mercadoria
  mercadoria_nome?: string;
  mercadoria_altura?: number | string;
  mercadoria_largura?: number | string;
  mercadoria_comprimento?: number | string;
  mercadoria_peso?: number | string;
  mercadoria_fragil?: boolean | number;
  mercadoria_tipo_veiculo?: string;
  mercadoria_cobra_por_volume?: boolean | number;
  mercadoria_valor_volume?: number | string;
  mercadoria_quantidade?: number | string;
  mercadoria_foto?: string;

  created_at?: string;
  updated_at?: string;
  public_tracking_token?: string;
}

export interface BackendMotorista {
  id: number | string;
  nome: string;
  telefone: string;
  cpf?: string;
  cnh?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  tipo_veiculo?: 'moto' | 'carro' | 'utilitario' | string;
  placa?: string;
  modelo_veiculo?: string;
  status?: 'ativo' | 'inativo' | 'bloqueado' | string;
  foto?: string;
  avatarUrl?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BackendLiveLocation {
  user_id: number | string;
  user_nome?: string;
  user_foto?: string;
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  updated_at?: string;
}

export interface BackendCidade {
  id: number | string;
  name: string;
  estado: string;
  pedidos_count?: number;
}

export interface BackendOrderMarker {
  pedido_id: number | string;
  etapa: 'pendente' | 'aprovado' | 'coletando' | 'coletado' | 'trocando' | 'trocado' | 'entregando' | 'entregue' | 'finalizado' | 'cancelado' | string;
  cliente: string;
  tipo: 'coleta' | 'entrega' | 'troca' | string;
  local_id?: number | string;
  local_name?: string;
  lat: number;
  lng: number;
}
