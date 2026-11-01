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

export const ACCOUNTS: Record<string, AuthAccount> = {
  // 1. ADMINISTRADOR GERAL (PRODUÇÃO)
  '62996157340': {
    id: 'usr-admin-01',
    phone: '(62) 99615-7340',
    cleanPhone: '62996157340',
    code: '821332',
    role: 'admin_geral',
    roleLabel: 'Administrador Geral',
    name: 'Administrador Geral',
    description: 'Gestão completa do sistema, parâmetros, usuários, frota e relatórios gerais.',
    badgeColor: '#0B5187',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&h=256&q=80',
    email: 'encomendaszap@gmail.com',
    document: '048.291.831-90',
    department: 'Diretoria Executiva & TI',
    status: 'ativo',
    lastAccess: 'Agora',
    permissions: ['Acesso Total', 'Gerenciar Usuários', 'Configurar Sistema', 'Financeiro & Taxas', 'Auditoria Geral', 'Monitoramento da Frota']
  },

  // 4. ATENDENTE (MAPA & OPERAÇÕES)
  '62996157341': {
    id: 'usr-atend-02',
    phone: '(62) 99615-7341',
    cleanPhone: '62996157341',
    code: '1332',
    role: 'atendente',
    roleLabel: 'Atendente (Operações)',
    name: 'Juliana Costa (Atendimento)',
    description: 'Visualização completa do mapa, monitoramento de entregas, rotas e suporte a clientes.',
    badgeColor: '#10B981',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80',
    email: 'juliana.atendimento@encomendaszap.com.br',
    document: '712.433.011-25',
    department: 'Central de Operações & Rastreamento',
    status: 'ativo',
    lastAccess: 'Hoje, 12:45',
    permissions: ['Visualizar Mapa', 'Consultar Rotas', 'Suporte ao Cliente', 'Histórico de Entregas']
  },

  // 5. TERMINAL DE CARGAS & HUB
  '62996157342': {
    id: 'usr-term-03',
    phone: '(62) 99615-7342',
    cleanPhone: '62996157342',
    code: '1332',
    role: 'terminal',
    roleLabel: 'Terminal de Cargas & Hub',
    name: 'Hub Central Goiânia (Terminal)',
    description: 'Recepção, triagem de pacotes, despacho para rotas e conferência de volumes.',
    badgeColor: '#7C3AED',
    avatarUrl: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=256&h=256&q=80',
    email: 'terminal.goiania@encomendaszap.com.br',
    document: '42.123.456/0001-89 (CNPJ)',
    department: 'Galpão de Distribuição & Triagem',
    status: 'ativo',
    lastAccess: 'Hoje, 13:00',
    permissions: ['Bipar Cargas', 'Despacho de Romaneio', 'Conferência de Volumes', 'Gestão de Gaiolas']
  },

  // 6. MOTORISTA MOTO
  '62996157343': {
    id: 'usr-mot-04',
    phone: '(62) 99615-7343',
    cleanPhone: '62996157343',
    code: '1332',
    role: 'motorista',
    roleLabel: 'Motorista (Moto)',
    name: 'Marcos Silva (Moto)',
    description: 'Aplicativo do motorista com itinerário, lista de coletas/entregas e comprovantes.',
    badgeColor: '#FF5E00',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
    email: 'marcos.silva@encomendaszap.com.br',
    document: '629.814.991-03',
    department: 'Frota Externa - Motofrete',
    status: 'ativo',
    vehicle: 'Honda CG 160 Fan - Preta',
    vehicleType: 'moto',
    plate: 'RBT-4E89',
    lastAccess: 'Hoje, 13:10',
    permissions: ['Ver Itinerário Próprio', 'Confirmar Entregas', 'Coletar Assinatura Digital', 'Navegação GPS']
  },

  // 7. MOTORISTA CARRO / UTILITÁRIO
  '62996157344': {
    id: 'usr-mot-05',
    phone: '(62) 99615-7344',
    cleanPhone: '62996157344',
    code: '1332',
    role: 'motorista',
    roleLabel: 'Motorista (Carro)',
    name: 'Roberto Andrade (Carro)',
    description: 'Entregas de médio e grande porte, caixas, móveis e romaneios volumosos.',
    badgeColor: '#EA580C',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    email: 'roberto.carro@encomendaszap.com.br',
    document: '821.503.712-44',
    department: 'Frota Externa - Utilitários',
    status: 'ativo',
    vehicle: 'Fiat Fiorino 1.4 Branca',
    vehicleType: 'utilitario',
    plate: 'NWX-9921',
    lastAccess: 'Hoje, 11:20',
    permissions: ['Ver Itinerário Cargas Maiores', 'Confirmar Entregas', 'Assinatura Digital', 'Navegação GPS']
  }
};
