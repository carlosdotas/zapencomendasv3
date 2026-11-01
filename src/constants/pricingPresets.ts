/**
 * Opções Pré-definidas de Taxas e Descontos Rápidos para Encomendas
 */

export interface FeePreset {
  name: string;
  defaultValue: number;
  description: string;
  iconName: string;
}

export const COMMON_FEE_PRESETS: FeePreset[] = [
  {
    name: 'Taxa de Espera',
    defaultValue: 10.0,
    description: 'Cobrança por tempo excedido aguardando no local',
    iconName: 'Clock'
  },
  {
    name: 'Taxa de Urgência',
    defaultValue: 15.0,
    description: 'Prioridade máxima no despacho e entrega expressa',
    iconName: 'Zap'
  },
  {
    name: 'Taxa de Retorno',
    defaultValue: 12.0,
    description: 'Devolução de mercadoria ou retorno ao ponto de origem',
    iconName: 'RotateCcw'
  },
  {
    name: 'Taxa de Volume Extra',
    defaultValue: 10.0,
    description: 'Pacote adicional ou volume acima do limite padrão',
    iconName: 'Package'
  },
  {
    name: 'Taxa de Subida de Escada / Ajudante',
    defaultValue: 20.0,
    description: 'Carga pesada em escadas ou auxílio de carregador',
    iconName: 'Layers'
  },
  {
    name: 'Pedágio / Estacionamento',
    defaultValue: 8.0,
    description: 'Ressarcimento de tarifas de pedágio ou estacionamento',
    iconName: 'DollarSign'
  },
  {
    name: 'Taxa Personalizada',
    defaultValue: 5.0,
    description: 'Digitar taxa e valor customizado',
    iconName: 'Plus'
  }
];

export interface DiscountPreset {
  name: string;
  defaultValue: number;
  description: string;
  iconName: string;
}

export const COMMON_DISCOUNT_PRESETS: DiscountPreset[] = [
  {
    name: 'Desconto Comercial',
    defaultValue: 5.0,
    description: 'Desconto negociado comercialmente',
    iconName: 'Tag'
  },
  {
    name: 'Desconto de Fidelidade',
    defaultValue: 10.0,
    description: 'Benefício para cliente recorrente ou parceiro',
    iconName: 'Sparkles'
  },
  {
    name: 'Desconto de Pontualidade',
    defaultValue: 5.0,
    description: 'Pagamento antecipado ou pontual',
    iconName: 'CheckCircle2'
  },
  {
    name: 'Desconto Promocional',
    defaultValue: 15.0,
    description: 'Campanha promocional ou cupom especial',
    iconName: 'Percent'
  },
  {
    name: 'Desconto por Volume',
    defaultValue: 10.0,
    description: 'Bonificação por múltiplos envios simultâneos',
    iconName: 'Layers'
  },
  {
    name: 'Desconto Personalizado',
    defaultValue: 5.0,
    description: 'Digitar desconto customizado',
    iconName: 'Plus'
  }
];
