import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  Settings, 
  Users, 
  ShieldCheck, 
  KeyRound, 
  Bell, 
  Sliders, 
  CheckCircle2, 
  ChevronRight, 
  Globe, 
  Building2, 
  PhoneCall, 
  UserCheck, 
  FileText, 
  Check, 
  Plus,
  AlertCircle, 
  Bike, 
  DollarSign, 
  MapPin, 
  CreditCard, 
  Camera, 
  Mail, 
  Phone, 
  User,
  MoreVertical,
  Search,
  X,
  Info,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Lock,
  Save,
  ShieldAlert,
  Smartphone,
  Server,
  Wifi,
  RefreshCw,
  Link2,
  Database,
  Image as ImageIcon,
  ExternalLink,
  Package,
  Truck,
  Cloud,
  Navigation,
  MapPin as DefaultLocationIcon,
  Compass
} from 'lucide-react';
import { useMapStore } from '../../context/MapContext';
import { 
  DEFAULT_USER_REQUIRED_FIELDS, 
  UserRequiredFieldsConfig,
  PaymentConditionType 
} from '../../types/map';
import { 
  PaymentConditionRule, 
  formatCurrency 
} from '../../services/paymentSettingsService';
import { realtimeAssignmentService } from '../../services/realtimeAssignmentService';
import { useBackButton } from '../../hooks/useBackButton';
import { 
  PricingSettings, 
  PricingModelType 
} from '../../services/pricingSettingsService';
import { 
  settingsService, 
  GlobalAppSettings 
} from '../../services/settingsService';

// Subpáginas Competentes Dedicadas Estilo Android
import { PricingSettingsPage } from './settings/PricingSettingsPage';
import { PaymentSettingsPage } from './settings/PaymentSettingsPage';
import { ImageServerSettingsPage } from './settings/ImageServerSettingsPage';
import { UserFieldsSettingsPage } from './settings/UserFieldsSettingsPage';
import { ServerSyncSettingsPage } from './settings/ServerSyncSettingsPage';
import { NavigationSettingsPage } from './settings/NavigationSettingsPage';
import { DefaultLocationSettingsPage } from './settings/DefaultLocationSettingsPage';
import { SecurityOperationSettingsPage } from './settings/SecurityOperationSettingsPage';
import { CompanyManagementPage } from './settings/CompanyManagementPage';
import { CityManagementPage } from './settings/CityManagementPage';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onClose: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class SettingsErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Settings error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[100] bg-[#F8F9FA] flex flex-col items-center justify-center p-6 text-slate-800">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <AlertCircle className="w-8 h-8 stroke-[2.2]" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Configurações</h2>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Ocorreu uma instabilidade ao inicializar as configurações. As opções foram restauradas para os valores seguros padrão.
            </p>
            <div className="flex items-center gap-3 justify-center">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('encomendaszap_settings_cache_v3');
                  } catch {}
                  this.setState({ hasError: false });
                }}
                className="px-4 py-2.5 rounded-full bg-[#0B5187] text-white text-xs font-bold hover:bg-[#083D66] transition-colors shadow-sm cursor-pointer"
              >
                Restaurar e Recarregar
              </button>
              <button
                type="button"
                onClick={this.props.onClose}
                className="px-4 py-2.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Voltar ao Mapa
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type SubpageKey = 'pricing' | 'payments' | 'image_server' | 'user_fields' | 'server' | 'navigation' | 'default_location' | 'security' | 'companies' | 'cities';

interface AdminSettingsPageProps {
  initialSubpage?: 'companies' | null;
}

const AdminSettingsContent: React.FC<AdminSettingsPageProps> = ({ initialSubpage = null }) => {
  const { 
    isAdminSettingsOpen, 
    setIsAdminSettingsOpen,
    userRequiredFields,
    updateUserRequiredFields,
    serverStatus,
    serverMessage,
    serverLatencyMs,
    apiBaseUrl,
    updateApiBaseUrl,
    refreshServerData,
    isSyncingServer
  } = useMapStore();

  // Subpágina ativa no estilo Android (null = tela inicial de categorias)
  const [currentSubpage, setCurrentSubpage] = useState<SubpageKey | null>(initialSubpage);

  // Botão voltar do Android (Hardware/Swipe)
  useBackButton('admin-settings-subpage', !!currentSubpage, () => {
    setCurrentSubpage(null);
  }, 90);

  useBackButton('admin-settings-main', isAdminSettingsOpen && !currentSubpage, () => {
    setIsAdminSettingsOpen(false);
  }, 80);

  // Configurações sincronizadas periodicamente com o servidor
  const [globalSettings, setGlobalSettings] = useState<GlobalAppSettings>(() => settingsService.getSettings());
  const [searchQuery, setSearchQuery] = useState('');

  // Escuta alterações na nuvem em tempo real
  useEffect(() => {
    const unsub = settingsService.subscribe((settings) => {
      setGlobalSettings(settings);
    });
    return () => unsub();
  }, []);

  // Itens de Configuração no Estilo Android (Categorias Agrupadas)
  const settingSections = useMemo(() => [
    {
      group: 'Finanças & Tarifas',
      items: [
        {
          id: 'pricing' as SubpageKey,
          title: 'Preços e Modelo de Frete',
          subtitle: globalSettings.pricing.pricingModel === 'discriminado' 
            ? 'Cobrança discriminada: Coleta, Transporte e Entrega' 
            : `Preço do Frete Único (${formatCurrency(globalSettings.pricing.defaultFreightRate || 25)})`,
          icon: DollarSign,
          iconBg: 'bg-amber-500 text-white',
          badge: globalSettings.pricing.pricingModel === 'discriminado' ? 'Discriminado' : 'Frete Único',
          badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
        },
        {
          id: 'payments' as SubpageKey,
          title: 'Condições de Pagamento',
          subtitle: 'Descontos à vista (antes da entrega) e taxas quinzenal / mensal',
          icon: CreditCard,
          iconBg: 'bg-emerald-600 text-white',
          badge: `${globalSettings.payments.length} Regras Ativas`,
          badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }
      ]
    },
    {
      group: 'Mídia & Conectividade',
      items: [
        {
          id: 'image_server' as SubpageKey,
          title: 'Servidor de Imagens PHP',
          subtitle: 'URL e senha gerenciadas no .env do backend',
          icon: ImageIcon,
          iconBg: 'bg-purple-600 text-white',
          badge: 'Backend',
          badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200'
        },
        {
          id: 'server' as SubpageKey,
          title: 'Servidor & Banco de Dados',
          subtitle: 'API conectada • Banco MySQL • Sincronização periódica',
          icon: Server,
          iconBg: 'bg-[#0B5187] text-white',
          badge: 'Nuvem Conectada',
          badgeColor: 'bg-blue-50 text-[#0B5187] border-blue-200'
        }
      ]
    },
    {
      group: 'Operação & Usuários',
      items: [
        {
          id: 'user_fields' as SubpageKey,
          title: 'Cadastro e Campos Obrigatórios',
          subtitle: `${Object.entries(globalSettings.userRequiredFields).filter(([k,v]) => k !== 'blockIfIncomplete' && v).length} campos exigidos • ${globalSettings.userRequiredFields.blockIfIncomplete ? 'Bloqueio de pedidos ativo' : 'Sem bloqueio'}`,
          icon: Users,
          iconBg: 'bg-indigo-600 text-white',
          badge: globalSettings.userRequiredFields.blockIfIncomplete ? 'Bloqueio Ativo' : 'Flexível',
          badgeColor: globalSettings.userRequiredFields.blockIfIncomplete ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-700 border-slate-200'
        },
        {
          id: 'navigation' as SubpageKey,
          title: 'Navegação GPS Padrão',
          subtitle: globalSettings.navigation?.defaultNavApp === 'google_maps' 
            ? 'Abrir direto pelo Google Maps' 
            : globalSettings.navigation?.defaultNavApp === 'waze' 
            ? 'Abrir direto pelo Waze' 
            : 'Perguntar qual aplicativo abrir a cada pedido',
          icon: Navigation,
          iconBg: 'bg-cyan-600 text-white',
          badge: globalSettings.navigation?.defaultNavApp === 'google_maps' ? 'Google Maps' : globalSettings.navigation?.defaultNavApp === 'waze' ? 'Waze' : 'Perguntar',
          badgeColor: 'bg-cyan-50 text-cyan-800 border-cyan-200'
        },
        {
          id: 'default_location' as SubpageKey,
          title: 'Local padrão de coleta/entrega',
          subtitle: globalSettings.defaultOrderLocation?.name || 'Usado quando o pedido não tem cliente com local',
          icon: DefaultLocationIcon,
          iconBg: 'bg-emerald-600 text-white',
          badge: globalSettings.defaultOrderLocation ? 'Definido' : 'Não definido',
          badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200'
        },
        {
          id: 'security' as SubpageKey,
          title: 'Segurança e Operação',
          subtitle: `Raio de ${globalSettings.operation.proximityRadiusKm || 5} km • ${globalSettings.operation.requirePhotoOnFinish ? 'Fotos obrigatórias na baixa' : 'Fotos opcionais'}`,
          icon: ShieldCheck,
          iconBg: 'bg-rose-600 text-white',
          badge: `${globalSettings.operation.proximityRadiusKm || 5} km`,
          badgeColor: 'bg-rose-50 text-rose-800 border-rose-200'
        }
      ]
    },
    {
      group: 'Multi-Empresa & Transportadoras',
      items: [
        {
          id: 'companies' as SubpageKey,
          title: 'Lista de Transportadoras',
          subtitle: 'Cadastre transportadoras, vincule um local e gerencie suas equipes',
          icon: Building2,
          iconBg: 'bg-slate-900 text-amber-400',
          badge: 'Master 62996157340',
          badgeColor: 'bg-amber-50 text-amber-900 border-amber-300'
        }
      ]
    },
    {
      group: 'Cadastros Logísticos',
      items: [
        {
          id: 'cities' as SubpageKey,
          title: 'Cidades e Centrais de Coleta',
          subtitle: 'Cadastre cidades e organize as centrais de coleta por cidade',
          icon: MapPin,
          iconBg: 'bg-teal-600 text-white',
          badge: 'Locais',
          badgeColor: 'bg-teal-50 text-teal-800 border-teal-200'
        }
      ]
    }
  ], [globalSettings]);

  // Filtragem da busca estilo Android
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return settingSections;
    const query = searchQuery.toLowerCase();

    return settingSections.map(section => ({
      ...section,
      items: section.items.filter(item => 
        item.title.toLowerCase().includes(query) || 
        item.subtitle.toLowerCase().includes(query)
      )
    })).filter(section => section.items.length > 0);
  }, [settingSections, searchQuery]);

  // ==========================================
  // RENDERIZAÇÃO DE SUBPÁGINA DEDICADA
  // ==========================================
  if (currentSubpage === 'pricing') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <PricingSettingsPage
          onBack={() => setCurrentSubpage(null)}
          pricingSettings={globalSettings.pricing}
          onUpdate={(newPricing) => {
            setGlobalSettings(prev => ({ ...prev, pricing: newPricing }));
          }}
        />
      </div>
    );
  }

  if (currentSubpage === 'payments') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <PaymentSettingsPage
          onBack={() => setCurrentSubpage(null)}
          rules={globalSettings.payments}
          onUpdate={(newRules) => {
            setGlobalSettings(prev => ({ ...prev, payments: newRules }));
          }}
        />
      </div>
    );
  }

  if (currentSubpage === 'image_server') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <ImageServerSettingsPage
          onBack={() => setCurrentSubpage(null)}
        />
      </div>
    );
  }

  if (currentSubpage === 'user_fields') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <UserFieldsSettingsPage
          onBack={() => setCurrentSubpage(null)}
          config={globalSettings.userRequiredFields}
          onUpdate={(newConfig) => {
            updateUserRequiredFields(newConfig);
            setGlobalSettings(prev => ({ ...prev, userRequiredFields: newConfig }));
          }}
        />
      </div>
    );
  }

  if (currentSubpage === 'server') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <ServerSyncSettingsPage
          onBack={() => setCurrentSubpage(null)}
          apiBaseUrl={apiBaseUrl}
          onUpdateApiBaseUrl={updateApiBaseUrl}
          serverStatus={serverStatus}
          serverMessage={serverMessage}
          serverLatencyMs={serverLatencyMs}
          onRefreshServerData={refreshServerData}
          isSyncingServer={isSyncingServer}
        />
      </div>
    );
  }

  if (currentSubpage === 'navigation') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <NavigationSettingsPage
          onBack={() => setCurrentSubpage(null)}
          defaultNavApp={globalSettings.navigation?.defaultNavApp || null}
          onUpdate={(app) => {
            setGlobalSettings(prev => ({
              ...prev,
              navigation: { defaultNavApp: app, saveAsDefault: app !== null }
            }));
          }}
        />
      </div>
    );
  }

  if (currentSubpage === 'default_location') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <DefaultLocationSettingsPage
          onBack={() => setCurrentSubpage(null)}
          defaultLocation={globalSettings.defaultOrderLocation || null}
          onUpdate={(location) => {
            setGlobalSettings(prev => ({ ...prev, defaultOrderLocation: location }));
          }}
        />
      </div>
    );
  }

  if (currentSubpage === 'security') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <SecurityOperationSettingsPage
          onBack={() => setCurrentSubpage(null)}
          systemName={globalSettings.system.systemName}
          systemMode={globalSettings.system.systemMode}
          proximityRadiusKm={globalSettings.operation.proximityRadiusKm}
          urgentNotificationRadiusKm={globalSettings.operation.urgentNotificationRadiusKm}
          requirePhotoOnFinish={globalSettings.operation.requirePhotoOnFinish}
          autoAssignDrivers={globalSettings.operation.autoAssignDrivers}
          onUpdate={(data) => {
            setGlobalSettings(prev => ({
              ...prev,
              system: { systemName: data.systemName, systemMode: data.systemMode },
              operation: {
                proximityRadiusKm: data.proximityRadiusKm,
                urgentNotificationRadiusKm: data.urgentNotificationRadiusKm,
                requirePhotoOnFinish: data.requirePhotoOnFinish,
                autoAssignDrivers: data.autoAssignDrivers
              }
            }));
          }}
        />
      </div>
    );
  }

  if (currentSubpage === 'companies') {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto">
        <CompanyManagementPage
          onBack={() => setCurrentSubpage(null)}
        />
      </div>
    );
  }

  if (currentSubpage === 'cities') {
    return (
      <CityManagementPage onBack={() => setCurrentSubpage(null)} />
    );
  }

  // ==========================================
  // TELA PRINCIPAL DE CONFIGURAÇÕES ESTILO ANDROID
  // ==========================================
  return (
    <div className="fixed inset-0 z-50 bg-[#F8F9FA] overflow-y-auto select-none animate-in fade-in duration-150">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 pb-24 space-y-5">
        
        {/* Topo Estilo Android Material Design 3 */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setIsAdminSettingsOpen(false)}
            className="w-10 h-10 rounded-full hover:bg-slate-200/80 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
            title="Voltar ao Mapa"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.3]" />
          </button>

          {/* Badge de Sincronização na Nuvem */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200/80 rounded-full text-[11px] font-bold text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Cloud className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sincronizado com o servidor</span>
          </div>
        </div>

        {/* Título Grande Estilo Android */}
        <div className="px-1">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Configurações
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Preferências sincronizadas em todos os dispositivos
          </p>
        </div>

        {/* Barra de Pesquisa Estilo Android 14 */}
        <div className="relative">
          <div className="w-full h-12 bg-white rounded-full border border-slate-200/90 shadow-2xs hover:shadow-xs focus-within:shadow-md focus-within:border-[#0B5187] flex items-center px-4 gap-3 transition-all">
            <Search className="w-4.5 h-4.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar configurações..."
              className="w-full text-xs font-bold text-slate-800 placeholder-slate-400 bg-transparent outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Grupos de Cards Estilo Android */}
        <div className="space-y-4">
          {filteredSections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-3">
                {section.group}
              </span>

              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setCurrentSubpage(item.id)}
                      className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 active:bg-slate-100/90 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Ícone Squircle Estilo Android */}
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform ${item.iconBg}`}>
                          <Icon className="w-5 h-5 stroke-[2.2]" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-black text-slate-900 truncate group-hover:text-[#0B5187] transition-colors">
                              {item.title}
                            </span>
                            {item.badge && (
                              <span className={`hidden xs:inline text-[9px] font-black px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredSections.length === 0 && (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Search className="w-8 h-8 mx-auto stroke-[1.5]" />
              <p className="text-xs font-bold text-slate-600">Nenhuma configuração encontrada</p>
              <p className="text-[11px]">Tente buscar por termos como "preço", "imagem", "gps" ou "campos".</p>
            </div>
          )}
        </div>

        {/* Rodapé Informativo Android */}
        <div className="pt-4 text-center space-y-1">
          <span className="text-[11px] font-bold text-slate-400 block">
            {globalSettings.system.systemName} • Versão 2.4.0 (Build 507212)
          </span>
          <span className="text-[10px] text-slate-400 block">
            Banco MySQL • Sincronização multi-dispositivo ativa
          </span>
        </div>

      </div>
    </div>
  );
};

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ initialSubpage = null }) => {
  const { isAdminSettingsOpen, setIsAdminSettingsOpen, currentRole } = useMapStore();
  if (!isAdminSettingsOpen || currentRole === 'motorista') return null;

  return (
    <SettingsErrorBoundary onClose={() => setIsAdminSettingsOpen(false)}>
      <AdminSettingsContent initialSubpage={initialSubpage} />
    </SettingsErrorBoundary>
  );
};
