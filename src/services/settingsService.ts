/**
 * Serviço de Configurações Globais sincronizadas com o servidor (/settings)
 *
 * Sincroniza as configurações do sistema entre os dispositivos:
 * - Modelo de Tarifação e Preços (Discriminado ou Frete Único)
 * - Condições de Pagamento (Descontos e Acréscimos)
 * - Campos Obrigatórios de Cadastro e Bloqueio
 * - GPS e Navegação Padrão
 * - Servidores e Operação
 */

import {
  PricingSettings,
  DEFAULT_PRICING_SETTINGS,
  getPricingSettings,
  savePricingSettings
} from './pricingSettingsService';
import {
  PaymentConditionRule,
  DEFAULT_PAYMENT_RULES,
  getPaymentRules,
  savePaymentRules
} from './paymentSettingsService';
import {
  UserRequiredFieldsConfig,
  DEFAULT_USER_REQUIRED_FIELDS
} from '../types/map';
import { request, startPolling } from './httpClient';

export interface DefaultOrderLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface GlobalAppSettings {
  pricing: PricingSettings;
  cityPriceTable: CityPriceTable;
  payments: PaymentConditionRule[];
  userRequiredFields: UserRequiredFieldsConfig;
  navigation: {
    defaultNavApp: 'google_maps' | 'waze' | null;
    saveAsDefault: boolean;
  };
  defaultOrderLocation?: DefaultOrderLocation | null;
  server: {
    apiBaseUrl?: string;
  };
  operation: {
    proximityRadiusKm: number;
    urgentNotificationRadiusKm: number;
    requirePhotoOnFinish: boolean;
    autoAssignDrivers: boolean;
  };
  system: {
    systemName: string;
    systemMode: 'producao' | 'homologacao';
  };
  updatedAt?: number;
  updatedBy?: string;
}

export interface CityPriceRule {
  mode: 'fixed' | 'km' | 'volume';
  fixedPrice: string;
  pricePerKm: string;
  pricePerVolume: string;
  minimum: string;
}

export interface CityPriceTable {
  intercity: Record<string, Record<string, string>>;
  local: Record<string, CityPriceOperationRules>;
  combinations?: Record<string, CityPriceCombination>;
}

export type PricingVehicleType = 'moto' | 'carro' | 'utilitario';

export interface CityPriceOperationRules {
  coletaEntrega?: CityPriceRule;
  vehicles?: Partial<Record<PricingVehicleType, CityPriceRule>>;
  coleta?: CityPriceRule;
  entrega?: CityPriceRule;
}

export interface CityPriceCombination {
  transport: string;
  origin: CityPriceOperationRules;
  destination: CityPriceOperationRules;
  coleta?: CityPriceRule;
  entrega?: CityPriceRule;
}

export const DEFAULT_CITY_PRICE_TABLE: CityPriceTable = {
  intercity: {},
  local: {},
  combinations: {}
};

const LOCAL_STORAGE_CACHE_KEY = 'encomendaszap_settings_cache_v3';
const POLL_INTERVAL_MS = 30000;

export const DEFAULT_GLOBAL_SETTINGS: GlobalAppSettings = {
  pricing: DEFAULT_PRICING_SETTINGS,
  cityPriceTable: DEFAULT_CITY_PRICE_TABLE,
  payments: DEFAULT_PAYMENT_RULES,
  userRequiredFields: DEFAULT_USER_REQUIRED_FIELDS,
  navigation: {
    defaultNavApp: 'google_maps',
    saveAsDefault: true
  },
  server: {
    apiBaseUrl: 'http://localhost:3000'
  },
  operation: {
    proximityRadiusKm: 5,
    urgentNotificationRadiusKm: 5,
    requirePhotoOnFinish: true,
    autoAssignDrivers: false
  },
  system: {
    systemName: 'ZapEncomendas Pro',
    systemMode: 'producao'
  },
  updatedAt: Date.now()
};

class SettingsService {
  private currentSettings: GlobalAppSettings = { ...DEFAULT_GLOBAL_SETTINGS };
  private listeners: Set<(settings: GlobalAppSettings) => void> = new Set();
  private stopPolling: (() => void) | null = null;
  private isServerConnected: boolean = false;
  private lastSyncTimestamp: number = 0;

  constructor() {
    this.loadFromLocalCache();
  }

  /**
   * Carrega do cache local imediato para inicialização instantânea
   */
  private loadFromLocalCache() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
      if (raw) {
        const cachedSettings = JSON.parse(raw);
        this.currentSettings = {
          ...DEFAULT_GLOBAL_SETTINGS,
          ...cachedSettings,
          pricing: { ...DEFAULT_PRICING_SETTINGS, ...(cachedSettings.pricing || {}) },
          cityPriceTable: cachedSettings.cityPriceTable || DEFAULT_CITY_PRICE_TABLE,
          payments: Array.isArray(cachedSettings.payments) && cachedSettings.payments.length > 0 ? cachedSettings.payments : DEFAULT_PAYMENT_RULES,
          userRequiredFields: { ...DEFAULT_USER_REQUIRED_FIELDS, ...(cachedSettings.userRequiredFields || {}) },
          operation: { ...DEFAULT_GLOBAL_SETTINGS.operation, ...(cachedSettings.operation || {}) }
        };
      } else {
        this.currentSettings.pricing = getPricingSettings();
        this.currentSettings.payments = getPaymentRules();
      }
    } catch (e) {
      console.warn('[Settings] Erro ao ler cache local de configurações:', e);
    }
  }

  /**
   * Salva no cache local e sincroniza módulos legados
   */
  private saveToLocalCache(settings: GlobalAppSettings) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(settings));

      if (settings.pricing) {
        savePricingSettings(settings.pricing);
      }
      if (settings.payments) {
        savePaymentRules(settings.payments);
      }
      if (settings.userRequiredFields) {
        localStorage.setItem('encomendaszap_user_required_fields', JSON.stringify(settings.userRequiredFields));
      }
      if (settings.navigation?.defaultNavApp) {
        localStorage.setItem('encomendaszap_default_nav_app', settings.navigation.defaultNavApp);
      }
    } catch (e) {
      console.warn('[Settings] Erro ao salvar cache local de configurações:', e);
    }
  }

  private async fetchRemote(): Promise<void> {
    const res = await request<Partial<GlobalAppSettings> | null>('/settings', 'GET');
    if (!res.success) {
      this.isServerConnected = false;
      return;
    }

    this.isServerConnected = true;
    this.lastSyncTimestamp = Date.now();
    const remoteData = res.data;

    if (!remoteData) {
      await this.saveSettingsToServer(this.currentSettings);
      return;
    }

    const merged: GlobalAppSettings = {
      ...this.currentSettings,
      ...remoteData,
      pricing: {
        ...this.currentSettings.pricing,
        ...(remoteData.pricing || {})
      },
      cityPriceTable: remoteData.cityPriceTable || this.currentSettings.cityPriceTable,
      payments: Array.isArray(remoteData.payments) && remoteData.payments.length > 0
        ? remoteData.payments
        : this.currentSettings.payments,
      userRequiredFields: {
        ...this.currentSettings.userRequiredFields,
        ...(remoteData.userRequiredFields || {})
      },
      navigation: {
        ...this.currentSettings.navigation,
        ...(remoteData.navigation || {})
      },
      operation: {
        ...this.currentSettings.operation,
        ...(remoteData.operation || {})
      },
      updatedAt: remoteData.updatedAt || Date.now()
    };

    this.currentSettings = merged;
    this.saveToLocalCache(merged);
    this.notifyListeners();
  }

  /**
   * Inicia a consulta periódica das configurações no servidor
   */
  public initRealtimeSync(): void {
    if (this.stopPolling) return;
    this.stopPolling = startPolling(() => this.fetchRemote(), POLL_INTERVAL_MS);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentSettings);
      } catch (e) {
        console.error('[Settings] Erro ao notificar listener:', e);
      }
    }
  }

  /**
   * Inscreve um componente para receber atualizações
   */
  public subscribe(callback: (settings: GlobalAppSettings) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentSettings);
    this.initRealtimeSync();

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0 && this.stopPolling) {
        this.stopPolling();
        this.stopPolling = null;
      }
    };
  }

  /**
   * Retorna as configurações atuais
   */
  public getSettings(): GlobalAppSettings {
    return { ...this.currentSettings };
  }

  public async refreshFromServer(): Promise<void> {
    await this.fetchRemote();
  }

  /**
   * Salva configurações atualizadas localmente e no servidor
   */
  public async saveSettings(updates: Partial<GlobalAppSettings>, author: string = 'admin'): Promise<boolean> {
    const updated: GlobalAppSettings = {
      ...this.currentSettings,
      ...updates,
      pricing: updates.pricing ? { ...this.currentSettings.pricing, ...updates.pricing } : this.currentSettings.pricing,
      cityPriceTable: updates.cityPriceTable || this.currentSettings.cityPriceTable,
      payments: updates.payments ? [...updates.payments] : this.currentSettings.payments,
      userRequiredFields: updates.userRequiredFields ? { ...this.currentSettings.userRequiredFields, ...updates.userRequiredFields } : this.currentSettings.userRequiredFields,
      navigation: updates.navigation ? { ...this.currentSettings.navigation, ...updates.navigation } : this.currentSettings.navigation,
      server: updates.server ? { ...this.currentSettings.server, ...updates.server } : this.currentSettings.server,
      operation: updates.operation ? { ...this.currentSettings.operation, ...updates.operation } : this.currentSettings.operation,
      system: updates.system ? { ...this.currentSettings.system, ...updates.system } : this.currentSettings.system,
      updatedAt: Date.now(),
      updatedBy: author
    };

    this.currentSettings = updated;
    this.saveToLocalCache(updated);
    this.notifyListeners();

    return this.saveSettingsToServer(updated);
  }

  private async saveSettingsToServer(settings: GlobalAppSettings): Promise<boolean> {
    const res = await request('/settings/save', 'POST', { settings });
    this.isServerConnected = res.success;
    if (res.success) this.lastSyncTimestamp = Date.now();
    else console.error('[Settings] Erro ao salvar configurações no servidor:', res.message);
    return res.success;
  }

  public getStatus() {
    return {
      isServerConnected: this.isServerConnected,
      lastSyncTimestamp: this.lastSyncTimestamp,
      hasCachedSettings: true
    };
  }
}

export const settingsService = new SettingsService();
