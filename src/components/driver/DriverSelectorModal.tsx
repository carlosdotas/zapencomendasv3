import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  X, 
  Search, 
  Bike, 
  Car, 
  Truck, 
  UserCheck, 
  Check, 
  Phone, 
  Navigation, 
  Clock, 
  RotateCcw,
  Database,
  RefreshCw,
  MapPin,
  Sparkles,
  Globe,
  Lock
} from 'lucide-react';
import { Place, Driver, VehicleCollectionType } from '../../types/map';
import { api } from '../../services/api';
import { BackendUser } from '../../services/apiTypes';
import { formatDriverLastSeen } from '../../services/driverTrackingClient';
import { formatPhotoUrl } from '../../services/apiAdapters';

export interface DriverOption {
  id: string;
  databaseId?: number;
  name: string;
  phone: string;
  cleanPhone: string;
  vehicleType: VehicleCollectionType;
  vehicleModel?: string;
  vehiclePlate?: string;
  isOnline: boolean;
  status: 'em_rota' | 'disponivel' | 'em_pausa' | 'offline';
  speedKmH?: number;
  lastSeenTimestamp?: number;
  lastUpdatedStr?: string;
  avatarUrl?: string;
  city?: string;
  source: 'database' | 'telemetry' | 'account';
}

interface DriverSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  place: Place;
  onSelectDriver: (driver: DriverOption) => void;
  onRemoveDriver?: () => void;
  multiCount?: number;
  activeTelemetryDrivers: Driver[];
  visibility?: 'publico' | 'privado';
  onVisibilityChange?: (visibility: 'publico' | 'privado') => void;
}

export const DriverSelectorModal: React.FC<DriverSelectorModalProps> = ({
  isOpen,
  onClose,
  place,
  onSelectDriver,
  onRemoveDriver,
  multiCount,
  activeTelemetryDrivers,
  visibility,
  onVisibilityChange
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<'todos' | VehicleCollectionType>('todos');
  const [databaseUsers, setDatabaseUsers] = useState<BackendUser[]>([]);
  const [backendMotoristas, setBackendMotoristas] = useState<any[]>([]);
  const [isLoadingBackend, setIsLoadingBackend] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  // Busca motoristas reais cadastrados diretamente no banco de dados (/users/list & /motoristas/list)
  const fetchDatabaseDrivers = useCallback(async () => {
    setIsLoadingBackend(true);
    try {
      const [usersRes, motoristasRes] = await Promise.allSettled([
        api.listUsers({ access_level: 'motorista', limit: 100 }),
        api.listMotoristas({ status: 'ativo' })
      ]);

      if (usersRes.status === 'fulfilled' && usersRes.value?.success && Array.isArray(usersRes.value.data)) {
        setDatabaseUsers(usersRes.value.data);
      }

      if (motoristasRes.status === 'fulfilled' && motoristasRes.value?.success && Array.isArray(motoristasRes.value.data)) {
        setBackendMotoristas(motoristasRes.value.data);
      }

      setLastFetchedAt(new Date());
    } catch (err) {
      console.warn('Erro ao carregar motoristas do banco de dados:', err);
    } finally {
      setIsLoadingBackend(false);
    }
  }, []);

  // Busca ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      fetchDatabaseDrivers();
    }
  }, [isOpen, fetchDatabaseDrivers]);

  // Mescla e desduplica motoristas:
  // 1. Motoristas cadastrados no banco de dados oficial (/users/list com access_level: "motorista")
  // 2. Registros da tabela de motoristas (/motoristas/list com placas e veículos)
  // 3. Telemetria em tempo real (GPS, velocidade, online)
  // 4. Contas de frota padrão do sistema (fallback)
  const mergedDrivers: DriverOption[] = useMemo(() => {
    const map = new Map<string, DriverOption>();

    // 1. Usuários do banco de dados oficial cadastrados como motorista
    databaseUsers.forEach(u => {
      const cleanPhone = String(u.phone || '').replace(/\D/g, '');
      const key = `user-${u.id}`;
      const nameLower = u.name.toLowerCase();
      const vType: VehicleCollectionType = 
        nameLower.includes('carro') ? 'carro' 
        : nameLower.includes('utilitario') || nameLower.includes('van') ? 'utilitario' 
        : 'moto';

      const photoUrl = u.foto ? (formatPhotoUrl(u.foto, 'thumb') || u.foto) : undefined;

      map.set(key, {
        id: String(u.id),
        databaseId: Number(u.id),
        name: u.name,
        phone: u.phone || '',
        cleanPhone,
        vehicleType: vType,
        vehicleModel: u.cidade ? `Base: ${u.cidade}` : undefined,
        isOnline: false,
        status: 'disponivel',
        avatarUrl: photoUrl,
        city: u.cidade || undefined,
        source: 'database'
      });
    });

    // 2. Enriquece com dados da tabela /motoristas/list (placa, modelo, tipo de veículo)
    backendMotoristas.forEach(b => {
      const cleanPhone = String(b.telefone || '').replace(/\D/g, '');
      const bName = b.nome || '';
      
      // Tenta cruzar pelo telefone limpo ou pelo nome idêntico
      const existing = Array.from(map.values()).find(
        d => (cleanPhone && d.cleanPhone === cleanPhone) || (bName && d.name.trim().toLowerCase() === bName.trim().toLowerCase())
      );

      const vType: VehicleCollectionType = 
        b.tipo_veiculo === 'carro' ? 'carro' 
        : b.tipo_veiculo === 'utilitario' ? 'utilitario' 
        : 'moto';

      if (existing) {
        if (b.tipo_veiculo) existing.vehicleType = vType;
        if (b.modelo_veiculo) existing.vehicleModel = b.modelo_veiculo;
        if (b.placa_veiculo) existing.vehiclePlate = b.placa_veiculo;
      } else {
        const key = `mot-${b.id}`;
        map.set(key, {
          id: String(b.id),
          databaseId: Number(b.id),
          name: b.nome || 'Motorista Parceiro',
          phone: b.telefone || '',
          cleanPhone,
          vehicleType: vType,
          vehicleModel: b.modelo_veiculo || undefined,
          vehiclePlate: b.placa_veiculo || undefined,
          isOnline: false,
          status: 'disponivel',
          source: 'database'
        });
      }
    });

    // 3. Atualiza com a telemetria ao vivo dos motoristas conectados via WebSocket
    activeTelemetryDrivers.forEach(t => {
      const cleanPhone = (t.phone || '').replace(/\D/g, '');
      const tIdDigits = String(t.id).replace(/\D/g, '');

      const existing = Array.from(map.values()).find(
        d => (cleanPhone && d.cleanPhone === cleanPhone) || (tIdDigits && d.id.replace(/\D/g, '') === tIdDigits)
      );

      if (existing) {
        existing.isOnline = t.isOnline !== false;
        existing.status = t.status || 'em_rota';
        existing.speedKmH = t.speedKmH;
        existing.lastSeenTimestamp = t.lastSeenTimestamp;
        existing.lastUpdatedStr = t.lastUpdatedStr;
        if (t.vehicleType) existing.vehicleType = t.vehicleType;
        if (t.vehicleModel) existing.vehicleModel = t.vehicleModel;
        if (t.vehiclePlate) existing.vehiclePlate = t.vehiclePlate;
        if (t.avatarUrl && !existing.avatarUrl) existing.avatarUrl = t.avatarUrl;
      } else {
        map.set(`live-${t.id}`, {
          id: t.id,
          name: t.name,
          phone: t.phone || '',
          cleanPhone,
          vehicleType: t.vehicleType || 'moto',
          vehicleModel: t.vehicleModel,
          vehiclePlate: t.vehiclePlate,
          isOnline: t.isOnline !== false,
          status: t.status || 'em_rota',
          speedKmH: t.speedKmH,
          lastSeenTimestamp: t.lastSeenTimestamp,
          lastUpdatedStr: t.lastUpdatedStr,
          avatarUrl: t.avatarUrl,
          source: 'telemetry'
        });
      }
    });

    return Array.from(map.values());
  }, [databaseUsers, backendMotoristas, activeTelemetryDrivers]);

  // Filtragem por busca e por tipo de veículo
  const filteredDrivers = useMemo(() => {
    return mergedDrivers.filter(driver => {
      if (vehicleFilter !== 'todos' && driver.vehicleType !== vehicleFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = driver.name.toLowerCase().includes(query);
        const matchesPhone = driver.phone.toLowerCase().includes(query) || driver.cleanPhone.includes(query);
        const matchesCity = (driver.city || '').toLowerCase().includes(query);
        const matchesVehicle = (driver.vehicleModel || '').toLowerCase().includes(query) || (driver.vehiclePlate || '').toLowerCase().includes(query);
        if (!matchesName && !matchesPhone && !matchesVehicle && !matchesCity) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Prioriza motoristas online / com sinal recente
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [mergedDrivers, vehicleFilter, searchQuery]);

  // Verifica se um motorista é o atualmente atribuído ao local
  const isDriverAssigned = (driver: DriverOption): boolean => {
    const cleanUserPhone = driver.cleanPhone;
    const cleanAssignedPhone = (place.assignedDriverPhone || '').replace(/\D/g, '');
    const assignedId = String(place.assignedDriverId || '').toLowerCase().replace(/\D/g, '');
    const driverId = String(driver.id || '').toLowerCase().replace(/\D/g, '');

    if (assignedId && driverId && assignedId === driverId) {
      return true;
    }

    if (cleanUserPhone && cleanAssignedPhone && cleanUserPhone === cleanAssignedPhone) {
      return true;
    }

    return false;
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO COM TEMA ENCOMENDASZAP */}
        <div className="px-3 py-2 bg-gradient-to-r from-[#0B5187] via-[#09426D] to-[#062D4A] text-white shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="w-7 h-7 shrink-0 rounded-lg bg-[#FF5E00] text-white flex items-center justify-center shadow-md">
                <Navigation className="w-3.5 h-3.5 fill-current stroke-[2]" />
              </div>
              <h3 className="shrink-0 text-sm font-black leading-tight">Motorista</h3>
              <span className="truncate text-[11px] font-medium text-blue-100">
                {multiCount ? `${multiCount} ${multiCount === 1 ? 'local' : 'locais'}` : `${place.name}${place.orderCode ? ` • ${place.orderCode}` : ''}`}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {/* Botão de Atualizar do Banco de Dados */}
              <button
                type="button"
                onClick={fetchDatabaseDrivers}
                disabled={isLoadingBackend}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Atualizar lista de motoristas do banco de dados"
              >
                <RefreshCw className={`w-3.5 h-3.5 stroke-[2.5] ${isLoadingBackend ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

        </div>

        {onVisibilityChange && visibility && (
          <div className="border-b border-slate-100 bg-slate-50/70 p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-slate-800">Visibilidade do pedido</p>
                <p className="text-[10px] font-medium text-slate-500">Defina quem pode visualizar esta encomenda no mapa.</p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black ${
                visibility === 'publico'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-blue-100 text-[#0B5187]'
              }`}>
                {visibility === 'publico' ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {visibility === 'publico' ? 'Público' : 'Privado'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onVisibilityChange('publico')}
                className={`rounded-xl border p-2 text-left transition-colors ${
                  visibility === 'publico'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-400'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-black">
                  <Globe className="h-3.5 w-3.5" />
                  Público
                </span>
                <span className="mt-1 block text-[9px] font-medium leading-tight">Todos os motoristas podem ver e assumir.</span>
              </button>
              <button
                type="button"
                onClick={() => onVisibilityChange('privado')}
                className={`rounded-xl border p-2 text-left transition-colors ${
                  visibility === 'privado'
                    ? 'border-[#0B5187] bg-blue-50 text-[#083D66] ring-1 ring-blue-400'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-black">
                  <Lock className="h-3.5 w-3.5" />
                  Privado
                </span>
                <span className="mt-1 block text-[9px] font-medium leading-tight">Direcione para um motorista específico.</span>
              </button>
            </div>
          </div>
        )}

        {/* CAMPO DE BUSCA & FILTRO POR VEÍCULO */}
        <div className="p-3 sm:p-4 border-b border-slate-100 space-y-2.5 bg-slate-50/70 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, telefone, cidade ou placa..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5187] focus:border-[#0B5187] transition-all"
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>

          {/* Chips de filtro por tipo de veículo e indicador de motoristas encontrados */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {[
                { id: 'todos', label: 'Todos', emoji: '👥' },
                { id: 'moto', label: 'Motos', emoji: '🏍️' },
                { id: 'carro', label: 'Carros', emoji: '🚗' },
                { id: 'utilitario', label: 'Utilitários', emoji: '🚚' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setVehicleFilter(tab.id as any)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
                    vehicleFilter === tab.id
                      ? 'bg-[#0B5187] text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">
              {filteredDrivers.length} {filteredDrivers.length === 1 ? 'motorista' : 'motoristas'} no banco
            </span>
          </div>
        </div>

        {/* LISTAGEM DE MOTORISTAS BUSCADOS NO BANCO DE DADOS */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 divide-y divide-slate-100 scrollbar-thin">
          {isLoadingBackend && mergedDrivers.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <RefreshCw className="w-8 h-8 text-[#0B5187] animate-spin mx-auto" />
              <p className="text-xs font-black text-slate-700">
                Consultando motoristas no banco de dados...
              </p>
              <p className="text-[11px] text-slate-400">
                Buscando cadastros em tempo real
              </p>
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                <Bike className="w-6 h-6 stroke-[1.8]" />
              </div>
              <p className="text-xs sm:text-sm font-black text-slate-700">
                Nenhum motorista encontrado
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {searchQuery ? 'Tente buscar com outro termo ou limpe o filtro' : 'Nenhum motorista com status ativo retornado'}
              </p>
            </div>
          ) : (
            filteredDrivers.map(driver => {
              const isAssigned = isDriverAssigned(driver);
              const vehicleEmoji = driver.vehicleType === 'moto' ? '🏍️' : driver.vehicleType === 'utilitario' ? '🚚' : '🚗';
              const lastSeenText = driver.lastSeenTimestamp 
                ? formatDriverLastSeen(driver.lastSeenTimestamp, driver.lastUpdatedStr)
                : driver.isOnline ? 'Online' : 'Cadastrado no Banco';

              return (
                <div
                  key={driver.id || driver.cleanPhone}
                  className={`pt-2 first:pt-0 flex items-center justify-between gap-3 p-2.5 rounded-2xl transition-all ${
                    isAssigned 
                      ? 'bg-emerald-50/90 border border-emerald-300 ring-1 ring-emerald-300 shadow-2xs' 
                      : 'hover:bg-blue-50/40 border border-slate-100/80 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Foto do Motorista ou Ícone do Veículo */}
                    <div className="relative shrink-0">
                      {driver.avatarUrl ? (
                        <img 
                          src={driver.avatarUrl} 
                          alt={driver.name} 
                          className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shadow-xs"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.parentElement) {
                              const fallback = document.createElement('div');
                              fallback.className = 'w-11 h-11 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center text-xl shadow-xs';
                              fallback.innerText = vehicleEmoji;
                              e.currentTarget.parentElement.appendChild(fallback);
                            }
                          }}
                        />
                      ) : (
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-xs ${
                          isAssigned ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {vehicleEmoji}
                        </div>
                      )}

                      {/* Ponto indicador de status online/offline */}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                        driver.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                      }`} />
                    </div>

                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs sm:text-[13px] font-black text-slate-900 truncate">
                          {driver.name}
                        </p>
                        {/* Badge de ID no Banco de Dados */}
                        {driver.databaseId && (
                          <span className="text-[9px] font-black bg-blue-100 text-[#0B5187] px-1.5 py-0.2 rounded-md">
                            ID: #{driver.databaseId}
                          </span>
                        )}
                        {isAssigned && (
                          <span className="text-[9px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded-md">
                            Atribuído Agora
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium truncate mt-0.5">
                        {driver.city && (
                          <span className="flex items-center gap-0.5 text-slate-600 font-bold">
                            <MapPin className="w-2.5 h-2.5 text-orange-500" />
                            {driver.city}
                          </span>
                        )}
                        {driver.vehicleModel && (
                          <>
                            {driver.city && <span>•</span>}
                            <span>{driver.vehicleModel}</span>
                          </>
                        )}
                        {driver.vehiclePlate && (
                          <>
                            <span>•</span>
                            <span className="font-bold text-slate-700">{driver.vehiclePlate}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[10px]">
                        {driver.phone && (
                          <span className="text-slate-600 font-semibold flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5 text-emerald-600" />
                            {driver.phone}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.2 rounded font-bold ${
                          driver.isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {driver.isOnline ? `🕒 ${lastSeenText}` : 'Banco de Dados'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Ação: Direcionar ou Já Atribuído */}
                  <div className="shrink-0">
                    {isAssigned ? (
                      <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Atribuído</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectDriver(driver);
                          onClose();
                        }}
                        className="px-3 py-2 rounded-xl bg-[#0B5187] hover:bg-[#083D66] active:bg-[#072F4E] text-white text-xs font-black flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
                        title={`Direcionar encomenda para ${driver.name}`}
                      >
                        <UserCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Direcionar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* FOOTER DO MODAL */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          {place.assignedDriverId || place.assignedDriverPhone ? (
            <button
              type="button"
              onClick={() => {
                if (onRemoveDriver) onRemoveDriver();
                onClose();
              }}
              className="px-3 py-2 text-xs font-black text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Desvincular Motorista</span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-500 font-medium">
              Selecione o motorista para atribuir a rota
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
