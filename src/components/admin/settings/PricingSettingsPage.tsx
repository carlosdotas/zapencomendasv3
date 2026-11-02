import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bike, Car, CheckCircle2, Copy, Save, Truck, X } from 'lucide-react';
import { CurrencyCentsInput } from '../../common/CurrencyCentsInput';
import { PricingSettings } from '../../../services/pricingSettingsService';
import {
  CityPriceOperationRules,
  CityPriceRule,
  CityPriceTable,
  DEFAULT_CITY_PRICE_TABLE,
  PricingVehicleType,
  settingsService
} from '../../../services/settingsService';
import { CityRecord, cityService, getCityLabel, normalizeCityName } from '../../../services/cityService';
import { api } from '../../../services/api';

interface PricingSettingsPageProps {
  onBack: () => void;
  pricingSettings: PricingSettings;
  onUpdate: (newSettings: PricingSettings) => void;
}

const EMPTY_CITY_RULE: CityPriceRule = {
  mode: 'fixed',
  fixedPrice: '',
  pricePerKm: '',
  pricePerVolume: '',
  minimum: ''
};

const EMPTY_CITY_PRICES: CityPriceOperationRules = {
  coletaEntrega: EMPTY_CITY_RULE
};

const getCombinationKey = (originId: string, destinationId: string) => `${originId}>${destinationId}`;

const parsePrice = (value: string): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const localized = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(localized) ? localized : 0;
};

const serializePrice = (value: number): string => value.toFixed(2);

const VEHICLES: Array<{ id: PricingVehicleType; label: string }> = [
  { id: 'moto', label: 'Moto' },
  { id: 'carro', label: 'Carro' },
  { id: 'utilitario', label: 'Utilitário' }
];

const isRuleConfigured = (rule?: CityPriceRule) => {
  if (!rule) return false;
  if (rule.mode === 'fixed') return parsePrice(rule.fixedPrice) > 0;
  if (rule.mode === 'volume') return parsePrice(rule.pricePerVolume) > 0;
  return parsePrice(rule.pricePerKm) > 0 && rule.minimum.trim() !== '';
};

const formatPrice = (value: string) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(parsePrice(value));

const getCityRuleSummaries = (rules?: CityPriceOperationRules) =>
  VEHICLES.flatMap(vehicle => {
    const rule = rules?.vehicles?.[vehicle.id];
    if (!rule || !isRuleConfigured(rule)) return [];
    if (rule.mode === 'fixed') return [`${vehicle.label}: ${formatPrice(rule.fixedPrice)}`];
    if (rule.mode === 'km') {
      return [`${vehicle.label}: ${formatPrice(rule.pricePerKm)}/km · mín. ${formatPrice(rule.minimum)}`];
    }
    return [`${vehicle.label}: ${formatPrice(rule.pricePerVolume)}/volume`];
  });

const getCityVehicleRules = (
  table: CityPriceTable,
  cityId: string
): Partial<Record<PricingVehicleType, CityPriceRule>> => {
  const localRule = table.local?.[cityId];
  const vehicles = { ...(localRule?.vehicles || {}) };
  const localLegacyRule = localRule?.coletaEntrega || localRule?.coleta || localRule?.entrega;
  if (!vehicles.moto && localLegacyRule && isRuleConfigured(localLegacyRule)) {
    vehicles.moto = localLegacyRule;
  }

  for (const [key, combination] of Object.entries(table.combinations || {})) {
    const side = key.startsWith(`${cityId}>`)
      ? combination.origin
      : key.endsWith(`>${cityId}`)
        ? combination.destination
        : undefined;
    if (!side) continue;

    for (const vehicle of VEHICLES) {
      const rule = side.vehicles?.[vehicle.id];
      if (!vehicles[vehicle.id] && rule && isRuleConfigured(rule)) {
        vehicles[vehicle.id] = rule;
      }
    }

    const legacyRule = side.coletaEntrega || side.coleta || side.entrega ||
      (key.startsWith(`${cityId}>`) ? combination.coleta : combination.entrega);
    if (!vehicles.moto && legacyRule && isRuleConfigured(legacyRule)) vehicles.moto = legacyRule;
  }
  return vehicles;
};

export const PricingSettingsPage: React.FC<PricingSettingsPageProps> = ({ onBack }) => {
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [cityPriceTable, setCityPriceTable] = useState<CityPriceTable>(DEFAULT_CITY_PRICE_TABLE);
  const [activeTab, setActiveTab] = useState<'transport' | 'pickupDelivery'>('transport');
  const [cityLoadError, setCityLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [cloneSourceCityId, setCloneSourceCityId] = useState<string | null>(null);
  const [cloneTargetCityId, setCloneTargetCityId] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [, cityRows] = await Promise.all([
          settingsService.refreshFromServer(),
          cityService.listCities()
        ]);
        if (!active) return;
        setCities(cityRows);

        const savedTable = settingsService.getSettings().cityPriceTable || DEFAULT_CITY_PRICE_TABLE;
        const intercity = { ...savedTable.intercity };
        const legacyPrices = await api.getPrecosEntreCidades();
        if (!active) return;

        if (legacyPrices.success) {
          for (const rule of legacyPrices.data?.lista || []) {
            const originName = normalizeCityName(String(rule.origem || ''));
            const destinationName = normalizeCityName(String(rule.destino || ''));
            const origin = cityRows.find(city => normalizeCityName(city.name) === originName);
            const destination = cityRows.find(city => normalizeCityName(city.name) === destinationName);
            if (!origin || !destination || origin.id === destination.id || rule.valor == null) continue;

            const value = String(rule.valor);
            intercity[origin.id] = {
              ...intercity[origin.id],
              [destination.id]: intercity[origin.id]?.[destination.id] ?? value
            };
            intercity[destination.id] = {
              ...intercity[destination.id],
              [origin.id]: intercity[destination.id]?.[origin.id] ?? value
            };
          }
        } else {
          console.warn('[PricingSettings] Não foi possível carregar a tabela legada entre cidades:', legacyPrices.message);
        }

        const local = { ...savedTable.local };
        for (const city of cityRows) {
          local[city.id] = {
            ...(local[city.id] || EMPTY_CITY_PRICES),
            vehicles: getCityVehicleRules(savedTable, city.id)
          };
        }

        setCityPriceTable({ ...savedTable, intercity, local });
      } catch (error) {
        if (active) {
          setCityLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as cidades e os preços.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, []);

  const cityPairs = useMemo(
    () => cities.flatMap((origin, index) =>
      cities.slice(index + 1).map(destination => ({ origin, destination }))
    ),
    [cities]
  );

  const updateCityVehicleRule = (
    cityId: string,
    vehicle: PricingVehicleType,
    update: Partial<CityPriceRule>
  ) => {
    setCityPriceTable(previous => {
      const current = previous.local?.[cityId] || EMPTY_CITY_PRICES;
      return {
        ...previous,
        local: {
          ...previous.local,
          [cityId]: {
            ...current,
            vehicles: {
              ...(current.vehicles || {}),
              [vehicle]: { ...(current.vehicles?.[vehicle] || EMPTY_CITY_RULE), ...update }
            }
          }
        }
      };
    });
  };

  const updateCombinationTransport = (
    originId: string,
    destinationId: string,
    value: string
  ) => {
    const forwardKey = getCombinationKey(originId, destinationId);
    const reverseKey = getCombinationKey(destinationId, originId);
    setCityPriceTable(previous => {
      const emptyCombination = {
        transport: '',
        origin: EMPTY_CITY_PRICES,
        destination: EMPTY_CITY_PRICES
      };
      const forwardCombination = previous.combinations?.[forwardKey] || emptyCombination;
      const reverseCombination = previous.combinations?.[reverseKey] || {
        ...emptyCombination,
        origin: EMPTY_CITY_PRICES,
        destination: EMPTY_CITY_PRICES
      };
      return {
        ...previous,
        combinations: {
          ...(previous.combinations || {}),
          [forwardKey]: { ...forwardCombination, transport: value },
          [reverseKey]: { ...reverseCombination, transport: value }
        },
        intercity: {
          ...previous.intercity,
          [originId]: { ...previous.intercity[originId], [destinationId]: value },
          [destinationId]: { ...previous.intercity[destinationId], [originId]: value }
        }
      };
    });
  };

  const isTransportConfigured = (value: string) => parsePrice(value) > 0;
  const cloneCityPrices = () => {
    if (!cloneSourceCityId || !cloneTargetCityId || cloneSourceCityId === cloneTargetCityId) return;

    setCityPriceTable(previous => {
      const source = previous.local?.[cloneSourceCityId];
      if (!source) return previous;
      const target = previous.local?.[cloneTargetCityId] || EMPTY_CITY_PRICES;
      return {
        ...previous,
        local: {
          ...previous.local,
          [cloneTargetCityId]: {
            ...target,
            vehicles: Object.fromEntries(
              VEHICLES.map(({ id }) => [id, { ...(source.vehicles?.[id] || EMPTY_CITY_RULE) }])
            )
          }
        }
      };
    });
    setCloneSourceCityId(null);
    setCloneTargetCityId('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const success = await settingsService.saveSettings({ cityPriceTable });
      if (!success) {
        window.alert('Não foi possível salvar a tabela de preços no servidor.');
        return;
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const renderCityVehicleRule = (
    cityId: string,
    vehicle: PricingVehicleType,
    rule: CityPriceRule,
  ) => {
    const inputClassName = 'min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:border-[#0B5187]';
    const vehicleDetails = VEHICLES.find(item => item.id === vehicle);

    return (
      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <h3 className="flex shrink-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-700">
            {vehicle === 'moto' ? <Bike className="h-3.5 w-3.5" /> : vehicle === 'carro' ? <Car className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
            {vehicleDetails?.label}
          </h3>
          <div className="flex gap-0.5">
            {(['fixed', 'km', 'volume'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => updateCityVehicleRule(cityId, vehicle, { mode })}
                className={`rounded-md px-2 py-1 text-[9px] font-bold ${
                  rule.mode === mode
                    ? 'bg-[#0B5187] text-white'
                    : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {mode === 'fixed' ? 'Fixo' : mode === 'km' ? 'Por km' : 'Por volume'}
              </button>
            ))}
          </div>
        </div>
        {rule.mode === 'fixed' ? (
          <label className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-slate-600">
            <span className="shrink-0">Fixo</span>
            <CurrencyCentsInput
              value={parsePrice(rule.fixedPrice)}
              onChange={value => updateCityVehicleRule(cityId, vehicle, { fixedPrice: serializePrice(value) })}
              prefix="R$"
              placeholder="0,00"
              className={inputClassName}
            />
          </label>
        ) : rule.mode === 'km' ? (
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex min-w-0 items-center gap-1 text-[9px] font-semibold text-slate-600">
              <span className="shrink-0">/km</span>
              <CurrencyCentsInput
                value={parsePrice(rule.pricePerKm)}
                onChange={value => updateCityVehicleRule(cityId, vehicle, { pricePerKm: serializePrice(value) })}
                prefix="R$"
                placeholder="0,00"
                className={inputClassName}
              />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-[9px] font-semibold text-slate-600">
              <span className="shrink-0">Mín.</span>
              <CurrencyCentsInput
                value={parsePrice(rule.minimum)}
                onChange={value => updateCityVehicleRule(cityId, vehicle, { minimum: serializePrice(value) })}
                prefix="R$"
                placeholder="0,00"
                className={inputClassName}
              />
            </label>
          </div>
        ) : (
          <label className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-slate-600">
            <span className="shrink-0">/volume</span>
            <CurrencyCentsInput
              value={parsePrice(rule.pricePerVolume)}
              onChange={value => updateCityVehicleRule(cityId, vehicle, { pricePerVolume: serializePrice(value) })}
              prefix="R$"
              placeholder="0,00"
              className={inputClassName}
            />
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="config-settings-page min-h-full pb-20 animate-in fade-in slide-in-from-right-4 duration-200">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-[#F8F9FA]/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-200/80"
            title="Voltar para Configurações"
          >
            <ArrowLeft className="h-5 w-5 stroke-[2.3]" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black leading-tight tracking-tight text-slate-900 sm:text-xl">
              Tabela de preços por cidade
            </h1>
            <p className="text-[11px] font-semibold text-slate-500">Coletas, entregas e transporte entre cidades</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isLoading || cities.length === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0B5187] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#0B5187]/20 transition-all hover:bg-[#083e68] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savedSuccess ? (
            <><CheckCircle2 className="h-4 w-4 text-emerald-300" /><span>Salvo</span></>
          ) : (
            <><Save className="h-4 w-4" /><span>{isSaving ? 'Salvando...' : 'Salvar'}</span></>
          )}
        </button>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {cityLoadError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {cityLoadError}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Carregando cidades e preços...
          </div>
        ) : cities.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            Nenhuma cidade cadastrada. Cadastre cidades em Configurações para montar a tabela de preços.
          </div>
        ) : (
          <section className="space-y-4">
            <div role="tablist" aria-label="Tipo de preço" className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'transport'}
                onClick={() => setActiveTab('transport')}
                className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-black transition-colors ${activeTab === 'transport' ? 'bg-[#0B5187] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Truck className="h-4 w-4" />
                Transporte entre cidades
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'pickupDelivery'}
                onClick={() => setActiveTab('pickupDelivery')}
                className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-black transition-colors ${activeTab === 'pickupDelivery' ? 'bg-[#0B5187] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Bike className="h-4 w-4" />
                Coleta/entrega por cidade
              </button>
            </div>

            {activeTab === 'transport' ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Transporte entre cidades</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Configure um preço para cada par de cidades. O mesmo valor vale nos dois sentidos: {cityPairs.length} combinações.
                  </p>
                </div>
                <div className="space-y-1.5">
                  {cityPairs.map(({ origin, destination }) => {
                    const combinationKey = getCombinationKey(origin.id, destination.id);
                    const transport = cityPriceTable.combinations?.[combinationKey]?.transport
                      ?? cityPriceTable.intercity[origin.id]?.[destination.id]
                      ?? cityPriceTable.combinations?.[getCombinationKey(destination.id, origin.id)]?.transport
                      ?? cityPriceTable.intercity[destination.id]?.[origin.id]
                      ?? '';
                    const configured = isTransportConfigured(transport);
                    return (
                      <div key={combinationKey} className={`rounded-xl border bg-white ${configured ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200'}`}>
                        <div className="space-y-1.5 px-3 py-2">
                          <span className="block min-w-0 truncate text-xs font-bold text-slate-800">
                            {getCityLabel(origin)} <span className="px-1 text-[#0B5187]">↔</span> {getCityLabel(destination)}
                          </span>
                          <label className="flex min-w-0 items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#0B5187]">
                            {configured && <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-1 text-[10px] font-black normal-case text-emerald-800">{formatPrice(transport)}</span>}
                            <span className="shrink-0">Transporte</span>
                            <CurrencyCentsInput
                              ariaLabel={`Transporte entre ${getCityLabel(origin)} e ${getCityLabel(destination)}, válido nos dois sentidos`}
                              value={parsePrice(transport)}
                              onChange={value => updateCombinationTransport(origin.id, destination.id, serializePrice(value))}
                              prefix="R$"
                              placeholder="0,00"
                              className="min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-800 outline-none focus:border-[#0B5187]"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Coleta/entrega por cidade</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Configure um único conjunto de preços para cada cidade, separado por moto, carro e utilitário.
                  </p>
                </div>
                <div className="space-y-1.5">
                  {cities.map(city => {
                    const rules = cityPriceTable.local?.[city.id] || EMPTY_CITY_PRICES;
                    const summaries = getCityRuleSummaries(rules);
                    return (
                      <div key={city.id} className={`rounded-xl border bg-white ${summaries.length > 0 ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200'}`}>
                        <div className="flex min-h-9 items-center justify-between gap-2 px-3 py-1.5">
                          <span className="min-w-0 truncate text-xs font-bold text-slate-800">{getCityLabel(city)}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={event => {
                                setCloneSourceCityId(city.id);
                                setCloneTargetCityId('');
                              }}
                              aria-label={`Clonar preços de coleta/entrega de ${getCityLabel(city)} para outra cidade`}
                              title="Clonar os preços desta cidade para outra cidade"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 hover:border-[#0B5187] hover:text-[#0B5187]"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Clonar
                            </button>
                          </div>
                        </div>
                        {summaries.length > 0 && (
                          <div className="flex flex-wrap gap-1 border-t border-slate-100 px-3 py-1">
                            {summaries.map(summary => (
                              <span key={summary} className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">
                                {summary}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="border-t border-slate-100 p-2">
                          <div className="grid gap-1.5 md:grid-cols-3">
                            {VEHICLES.map(vehicle => (
                              <section key={vehicle.id} className="min-w-0">
                                {renderCityVehicleRule(city.id, vehicle.id, rules.vehicles?.[vehicle.id] || EMPTY_CITY_RULE)}
                              </section>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {cloneSourceCityId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clone-city-prices-title"
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="clone-city-prices-title" className="text-sm font-black text-slate-900">Clonar preços da cidade</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Copiar preços de moto, carro e utilitário de {getCityLabel(cities.find(city => city.id === cloneSourceCityId) || cities[0])}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloneSourceCityId(null)}
                aria-label="Fechar"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Cidade que receberá a cópia
              <select
                value={cloneTargetCityId}
                onChange={event => setCloneTargetCityId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
              >
                <option value="">Selecione uma cidade</option>
                {cities
                  .filter(city => city.id !== cloneSourceCityId)
                  .map(city => <option key={city.id} value={city.id}>{getCityLabel(city)}</option>)}
              </select>
            </label>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Os preços e modos de cobrança de moto, carro e utilitário serão copiados para a cidade selecionada.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloneSourceCityId(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={cloneCityPrices}
                disabled={!cloneTargetCityId}
                className="rounded-xl bg-[#0B5187] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Clonar preços
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
