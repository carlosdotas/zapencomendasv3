/**
 * Serviço de Configurações Globais Sincronizadas via Firebase Firestore
 * 
 * Sincroniza todas as configurações do sistema para todos os dispositivos em tempo real:
 * - Modelo de Tarifação e Preços (Discriminado ou Frete Único)
 * - Condições de Pagamento (Descontos e Acréscimos)
 * - Servidor de Imagens PHP (URL e Senha)
 * - Campos Obrigatórios de Cadastro e Bloqueio
 * - GPS e Navegação Padrão
 * - Servidores e Operação
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  Firestore,
  Unsubscribe 
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebaseClient';
import { sanitizeForFirestore } from './firestoreUtils';
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
import { 
  getImageServerUrl, 
  setImageServerUrl, 
  getImageServerPassword, 
  setImageServerPassword 
} from './api';

export interface GlobalAppSettings {
  pricing: PricingSettings;
  payments: PaymentConditionRule[];
  imageServer: {
    url: string;
    password: string;
  };
  userRequiredFields: UserRequiredFieldsConfig;
  navigation: {
    defaultNavApp: 'google_maps' | 'waze' | null;
    saveAsDefault: boolean;
  };
  server: {
    apiBaseUrl?: string;
    firebaseRtdbUrl?: string;
  };
  operation: {
    proximityRadiusKm: number;
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

const SETTINGS_COLLECTION = 'app_settings';
const SETTINGS_DOC_ID = 'global_config';
const LOCAL_STORAGE_CACHE_KEY = 'encomendaszap_firebase_settings_cache_v2';

export const DEFAULT_GLOBAL_SETTINGS: GlobalAppSettings = {
  pricing: DEFAULT_PRICING_SETTINGS,
  payments: DEFAULT_PAYMENT_RULES,
  imageServer: {
    url: 'http://localhost/imagens/images.php',
    password: 'zap123'
  },
  userRequiredFields: DEFAULT_USER_REQUIRED_FIELDS,
  navigation: {
    defaultNavApp: 'google_maps',
    saveAsDefault: true
  },
  server: {
    apiBaseUrl: 'http://localhost:3000',
    firebaseRtdbUrl: 'https://zapencomendas-507212-default-rtdb.firebaseio.com'
  },
  operation: {
    proximityRadiusKm: 5,
    requirePhotoOnFinish: true,
    autoAssignDrivers: false
  },
  system: {
    systemName: 'ZapEncomendas Pro',
    systemMode: 'producao'
  },
  updatedAt: Date.now()
};

class FirebaseSettingsService {
  private currentSettings: GlobalAppSettings = { ...DEFAULT_GLOBAL_SETTINGS };
  private listeners: Set<(settings: GlobalAppSettings) => void> = new Set();
  private isSubscribed: boolean = false;
  private unsubscribeFn: Unsubscribe | null = null;
  private isCloudConnected: boolean = false;
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
      // 1. Lê cache consolidado
      const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.currentSettings = {
          ...DEFAULT_GLOBAL_SETTINGS,
          ...parsed,
          pricing: { ...DEFAULT_PRICING_SETTINGS, ...(parsed.pricing || {}) },
          payments: Array.isArray(parsed.payments) && parsed.payments.length > 0 ? parsed.payments : DEFAULT_PAYMENT_RULES,
          imageServer: { ...DEFAULT_GLOBAL_SETTINGS.imageServer, ...(parsed.imageServer || {}) },
          userRequiredFields: { ...DEFAULT_USER_REQUIRED_FIELDS, ...(parsed.userRequiredFields || {}) }
        };

        if (this.currentSettings.imageServer?.url) {
          setImageServerUrl(this.currentSettings.imageServer.url);
        }
        if (this.currentSettings.imageServer?.password) {
          setImageServerPassword(this.currentSettings.imageServer.password);
        }
      } else {
        // 2. Ou recompõe dos armazenamentos locais existentes
        this.currentSettings.pricing = getPricingSettings();
        this.currentSettings.payments = getPaymentRules();
        this.currentSettings.imageServer = {
          url: getImageServerUrl() || DEFAULT_GLOBAL_SETTINGS.imageServer.url,
          password: getImageServerPassword() || DEFAULT_GLOBAL_SETTINGS.imageServer.password
        };
      }
    } catch (e) {
      console.warn('[Firebase Settings] Erro ao ler cache local de configurações:', e);
    }
  }

  /**
   * Salva no cache local e dispara eventos para sincronizar módulos legados
   */
  private saveToLocalCache(settings: GlobalAppSettings) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(settings));

      // Sincroniza serviços individuais locais
      if (settings.pricing) {
        savePricingSettings(settings.pricing);
      }
      if (settings.payments) {
        savePaymentRules(settings.payments);
      }
      if (settings.imageServer) {
        setImageServerUrl(settings.imageServer.url);
        setImageServerPassword(settings.imageServer.password);
      }
      if (settings.userRequiredFields) {
        localStorage.setItem('encomendaszap_user_required_fields', JSON.stringify(settings.userRequiredFields));
      }
      if (settings.navigation?.defaultNavApp) {
        localStorage.setItem('encomendaszap_default_nav_app', settings.navigation.defaultNavApp);
      }
    } catch (e) {
      console.warn('[Firebase Settings] Erro ao salvar cache local de configurações:', e);
    }
  }

  /**
   * Inicia o monitoramento em tempo real do documento no Firestore
   */
  public initRealtimeSync(): void {
    if (this.isSubscribed) return;

    try {
      const firestore = getFirebaseFirestore();
      if (!firestore) {
        console.warn('[Firebase Settings] Firestore indisponível para configurações em tempo real');
        return;
      }

      const settingsDocRef = doc(firestore, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
      this.isSubscribed = true;

      this.unsubscribeFn = onSnapshot(settingsDocRef, (snapshot) => {
        if (snapshot.exists()) {
          const remoteData = snapshot.data() as Partial<GlobalAppSettings>;
          this.isCloudConnected = true;
          this.lastSyncTimestamp = Date.now();

          const merged: GlobalAppSettings = {
            ...this.currentSettings,
            ...remoteData,
            pricing: {
              ...this.currentSettings.pricing,
              ...(remoteData.pricing || {})
            },
            payments: Array.isArray(remoteData.payments) && remoteData.payments.length > 0
              ? remoteData.payments
              : this.currentSettings.payments,
            imageServer: {
              ...this.currentSettings.imageServer,
              ...(remoteData.imageServer || {})
            },
            userRequiredFields: {
              ...this.currentSettings.userRequiredFields,
              ...(remoteData.userRequiredFields || {})
            },
            navigation: {
              ...this.currentSettings.navigation,
              ...(remoteData.navigation || {})
            },
            updatedAt: remoteData.updatedAt || Date.now()
          };

          this.currentSettings = merged;
          this.saveToLocalCache(merged);
          this.notifyListeners();
          console.log('[Firebase Settings] Configurações sincronizadas da nuvem:', merged.updatedAt);
        } else {
          // Documento ainda não existe na nuvem: sobe os padrões
          this.saveSettingsToCloud(this.currentSettings).catch(console.error);
        }
      }, (error) => {
        console.warn('[Firebase Settings] Erro na escuta em tempo real:', error);
        this.isCloudConnected = false;
      });
    } catch (e) {
      console.warn('[Firebase Settings] Falha ao iniciar sincronização Firebase:', e);
    }
  }

  /**
   * Notifica todos os componentes inscritos
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentSettings);
      } catch (e) {
        console.error('[Firebase Settings] Erro ao notificar listener:', e);
      }
    }
  }

  /**
   * Inscreve um componente para receber atualizações instantâneas
   */
  public subscribe(callback: (settings: GlobalAppSettings) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentSettings);
    this.initRealtimeSync();

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Retorna as configurações atuais
   */
  public getSettings(): GlobalAppSettings {
    return { ...this.currentSettings };
  }

  /**
   * Salva configurações atualizadas tanto localmente quanto no Firebase Firestore para todos os aparelhos
   */
  public async saveSettings(updates: Partial<GlobalAppSettings>, author: string = 'admin'): Promise<boolean> {
    const updated: GlobalAppSettings = {
      ...this.currentSettings,
      ...updates,
      pricing: updates.pricing ? { ...this.currentSettings.pricing, ...updates.pricing } : this.currentSettings.pricing,
      payments: updates.payments ? [...updates.payments] : this.currentSettings.payments,
      imageServer: updates.imageServer ? { ...this.currentSettings.imageServer, ...updates.imageServer } : this.currentSettings.imageServer,
      userRequiredFields: updates.userRequiredFields ? { ...this.currentSettings.userRequiredFields, ...updates.userRequiredFields } : this.currentSettings.userRequiredFields,
      navigation: updates.navigation ? { ...this.currentSettings.navigation, ...updates.navigation } : this.currentSettings.navigation,
      server: updates.server ? { ...this.currentSettings.server, ...updates.server } : this.currentSettings.server,
      operation: updates.operation ? { ...this.currentSettings.operation, ...updates.operation } : this.currentSettings.operation,
      system: updates.system ? { ...this.currentSettings.system, ...updates.system } : this.currentSettings.system,
      updatedAt: Date.now(),
      updatedBy: author
    };

    // 1. Atualiza estado em memória e cache local de imediato
    this.currentSettings = updated;
    this.saveToLocalCache(updated);
    this.notifyListeners();

    // 2. Persiste no Firestore para todos os dispositivos
    return this.saveSettingsToCloud(updated);
  }

  /**
   * Salva no Firestore
   */
  private async saveSettingsToCloud(settings: GlobalAppSettings): Promise<boolean> {
    try {
      const firestore = getFirebaseFirestore();
      if (!firestore) return false;

      const settingsDocRef = doc(firestore, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
      const sanitized = sanitizeForFirestore(settings);

      await setDoc(settingsDocRef, sanitized, { merge: true });
      this.isCloudConnected = true;
      this.lastSyncTimestamp = Date.now();
      console.log('[Firebase Settings] Configurações salvas no Firestore com sucesso.');
      return true;
    } catch (e) {
      console.error('[Firebase Settings] Erro ao salvar configurações no Firestore:', e);
      return false;
    }
  }

  public getStatus() {
    return {
      isCloudConnected: this.isCloudConnected,
      lastSyncTimestamp: this.lastSyncTimestamp,
      hasCachedSettings: true
    };
  }
}

export const firebaseSettingsService = new FirebaseSettingsService();
