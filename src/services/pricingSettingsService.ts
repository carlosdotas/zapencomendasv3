/**
 * Serviço de Gerenciamento das Configurações de Modelo de Preço e Tarifação
 * 
 * Permite definir se o sistema cobra:
 * 1. Preço Discriminado: Coleta, Transporte e Entrega separadamente.
 * 2. Preço do Frete: Preço único consolidado de frete.
 */

export type PricingModelType = 'discriminado' | 'frete_unico';

export interface PricingSettings {
  pricingModel: PricingModelType;
  defaultColetaRate: number;
  defaultEntregaRate: number;
  defaultKmRate: number;
  defaultFreightRate: number;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  pricingModel: 'discriminado', // 'discriminado' (Coleta, Transporte, Entrega) ou 'frete_unico' (Preço do Frete)
  defaultColetaRate: 8.0,
  defaultEntregaRate: 6.0,
  defaultKmRate: 1.8,
  defaultFreightRate: 25.0
};

const STORAGE_KEY = 'geoexplorer_pricing_settings_v1';

/**
 * Obtém as configurações de precificação salvas ou os padrões
 */
export const getPricingSettings = (): PricingSettings => {
  if (typeof window === 'undefined') return DEFAULT_PRICING_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRICING_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PRICING_SETTINGS,
      ...parsed
    };
  } catch {
    return DEFAULT_PRICING_SETTINGS;
  }
};

/**
 * Salva as configurações de precificação e dispara evento global de sincronização
 */
export const savePricingSettings = (settings: PricingSettings): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('pricing_settings_updated', { detail: settings }));
  } catch (e) {
    console.error('Erro ao salvar configurações de tarifação:', e);
  }
};

export interface DefaultPriceItem {
  id: string;
  name: string;
  value: number;
  category?: 'coleta' | 'transporte' | 'entrega' | 'extra';
  isRemovable?: boolean;
}

/**
 * Gera a lista padrão de itens de preço de acordo com o modelo configurado nas configs
 */
export const generateDefaultPriceItems = (
  operationType: string = 'entrega',
  distanceKm: number = 0,
  customSettings?: PricingSettings
): DefaultPriceItem[] => {
  const settings = customSettings || getPricingSettings();
  const km = Math.max(0, Number(distanceKm) || 0);

  if (settings.pricingModel === 'frete_unico') {
    // Modelo 2: Preço Único de Frete
    // Se houver distância calculada, compõe frete base + km
    const dynamicFreight = km > 0 
      ? Math.round((settings.defaultFreightRate + km * settings.defaultKmRate) * 10) / 10
      : settings.defaultFreightRate;

    return [
      {
        id: 'frete',
        name: 'Preço do Frete',
        value: dynamicFreight,
        category: 'extra',
        isRemovable: false
      }
    ];
  }

  // Modelo 1: Preço Discriminado (Coleta, Transporte e Entrega)
  const transpValue = Math.round(km * settings.defaultKmRate * 10) / 10;
  const items: DefaultPriceItem[] = [
    {
      id: 'coleta',
      name: 'Preço de Coleta',
      value: settings.defaultColetaRate,
      category: 'coleta',
      isRemovable: false
    },
    {
      id: 'transporte',
      name: 'Transporte Entre Cidades',
      value: transpValue || 16.5,
      category: 'transporte',
      isRemovable: false
    },
    {
      id: 'entrega',
      name: 'Preço de Entrega',
      value: settings.defaultEntregaRate,
      category: 'entrega',
      isRemovable: false
    }
  ];

  if (operationType === 'troca') {
    items.push({
      id: 'troca',
      name: 'Taxa Ponto de Troca',
      value: 8.0,
      category: 'extra',
      isRemovable: true
    });
  }

  return items;
};
