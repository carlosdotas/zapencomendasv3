import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Check, ChevronRight, Loader2, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../../services/api';
import { cityService, CityRecord, getCityLabel, normalizeCityName } from '../../../services/cityService';
import { placeService } from '../../../services/placeService';
import { LocationCoordinates } from '../../../types/map';
import { MapLocationPickerModal } from '../../map/MapLocationPickerModal';
import { useBackButton } from '../../../hooks/useBackButton';

interface CityManagementPageProps {
  onBack: () => void;
}

interface CentralLocation {
  address: string;
  coordinates: LocationCoordinates;
}

function parseCity(value: string): { name: string; state?: string } {
  const match = value.trim().match(/^(.*?)\s*[-,]\s*([A-Z]{2})$/i);
  return match
    ? { name: match[1].trim(), state: match[2].toUpperCase() }
    : { name: value.trim() };
}

export const CityManagementPage: React.FC<CityManagementPageProps> = ({ onBack }) => {
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [selectedCity, setSelectedCity] = useState<CityRecord | null>(null);
  const [centrals, setCentrals] = useState<Array<{ id: string | number; name: string; endereco?: string; lat: number | string; lng: number | string }>>([]);
  const [centralsByCity, setCentralsByCity] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [cityName, setCityName] = useState('');
  const [cityState, setCityState] = useState('');
  const [isCityFormOpen, setIsCityFormOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [editingCentralId, setEditingCentralId] = useState<string | number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [cityToDelete, setCityToDelete] = useState<CityRecord | null>(null);
  const [editingCity, setEditingCity] = useState<CityRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCities = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const savedCities = await cityService.listCities();
      const legacyResponse = await api.getCidades().catch(() => ({ success: false, data: [] }));
      let candidates: Array<{ name: string; state?: string }> = legacyResponse.success && Array.isArray(legacyResponse.data)
        ? legacyResponse.data.map(city => ({ name: city.name, state: city.estado }))
        : [];

      if (candidates.length === 0) {
        const placesResponse = await api.getLocais({ limit: 4000 }).catch(() => ({ success: false, data: [] }));
        candidates = (placesResponse.success && Array.isArray(placesResponse.data) ? placesResponse.data : [])
          .map(place => parseCity(String(place.cidade || '')))
          .filter(city => city.name);
      }

      const uniqueCities = new Map<string, CityRecord>();
      savedCities.forEach(city => {
        uniqueCities.set(normalizeCityName(city.name), city);
      });
      candidates.forEach(city => {
        const record = { name: String(city.name || '').trim(), state: city.state ? String(city.state).trim().toUpperCase() : undefined };
        if (!record.name) return;
        const key = normalizeCityName(record.name);
        if (!uniqueCities.has(key)) {
          uniqueCities.set(key, {
            id: `legacy-${key.replace(/[^a-z0-9-]+/g, '-')}`,
            ...record,
            createdAt: 0,
            updatedAt: 0
          });
        }
      });

      setCities(Array.from(uniqueCities.values()).sort((a, b) => getCityLabel(a).localeCompare(getCityLabel(b), 'pt-BR')));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as cidades.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCentrals = useCallback(async (city: CityRecord) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await placeService.getCentraisByCidade(city.name, city.state);
      if (!response.success) throw new Error(response.message || 'Falha ao carregar centrais.');
      setCentrals(response.data || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as centrais.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  // Recarrega as centrais de todas as cidades ao voltar para a lista
  useEffect(() => {
    if (selectedCity) return;
    let cancelled = false;
    placeService.getLocais({ central_coletas: true, limit: 1000 }).then(response => {
      if (cancelled || !response.success || !Array.isArray(response.data)) return;
      const grouped: Record<string, string[]> = {};
      response.data.forEach(local => {
        const key = normalizeCityName(String(local.cidade || ''));
        if (!key) return;
        (grouped[key] ||= []).push(local.name);
      });
      setCentralsByCity(grouped);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedCity]);

  useEffect(() => {
    if (selectedCity) void loadCentrals(selectedCity);
  }, [selectedCity, loadCentrals]);

  useBackButton('city-centrals-page', Boolean(selectedCity), () => {
    setSelectedCity(null);
  }, 95);

  const filteredCities = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return cities;
    return cities.filter(city => getCityLabel(city).toLowerCase().includes(query));
  }, [cities, search]);

  const openCityForm = (city?: CityRecord) => {
    setEditingCity(city && !city.id.startsWith('legacy-') ? city : null);
    setCityName(city?.name || '');
    setCityState(city?.state || '');
    setIsCityFormOpen(true);
  };

  const closeCityForm = () => {
    setIsCityFormOpen(false);
    setEditingCity(null);
    setCityName('');
    setCityState('');
  };

  const handleSaveCity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cityName.trim()) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const savedCity = await cityService.saveCity(cityName, cityState, editingCity?.id);

      // Centrais são vinculadas pelo texto da cidade, então acompanham o novo nome
      if (editingCity && getCityLabel(editingCity) !== getCityLabel(savedCity)) {
        const linked = await placeService.getCentraisByCidade(editingCity.name, editingCity.state);
        if (linked.success && Array.isArray(linked.data)) {
          await Promise.all(linked.data.map(central => api.updateLocal(central.id, { cidade: getCityLabel(savedCity) })));
        }
      }

      setCities(current => [...current.filter(city => city.id !== savedCity.id && city.id !== editingCity?.id), savedCity]
        .sort((a, b) => getCityLabel(a).localeCompare(getCityLabel(b), 'pt-BR')));
      const wasEditing = Boolean(editingCity);
      closeCityForm();
      if (wasEditing) {
        if (selectedCity) setSelectedCity(savedCity);
      } else {
        setSelectedCity(savedCity);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível salvar a cidade.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenCity = async (city: CityRecord) => {
    setErrorMessage(null);
    try {
      const savedCity = city.id.startsWith('legacy-')
        ? await cityService.saveCity(city.name, city.state)
        : city;
      setCities(current => [...current.filter(item => item.id !== savedCity.id), savedCity]
        .sort((a, b) => getCityLabel(a).localeCompare(getCityLabel(b), 'pt-BR')));
      setSelectedCity(savedCity);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível abrir esta cidade.');
    }
  };

  const handleSaveCentral = async (location: CentralLocation & { name?: string }) => {
    if (!selectedCity) return;

    setErrorMessage(null);
    const payload = {
      name: location.name || location.address.split(',')[0].trim() || selectedCity.name,
      cidade: getCityLabel(selectedCity),
      endereco: location.address,
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
      central_coletas: true,
      status: 'ativo'
    };
    const response = editingCentralId !== null
      ? await api.updateLocal(editingCentralId, payload)
      : await api.saveLocal(payload);
    if (!response.success) throw new Error(response.message || 'Não foi possível salvar a central.');
    await loadCentrals(selectedCity);
  };

  const handleDeleteCity = async () => {
    if (!cityToDelete) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (!cityToDelete.id.startsWith('legacy-')) await cityService.deleteCity(cityToDelete.id);
      setCities(current => current.filter(city => city.id !== cityToDelete.id));
      if (selectedCity?.id === cityToDelete.id) setSelectedCity(null);
      setCityToDelete(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível excluir a cidade.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveCentral = async (centralId: string | number) => {
    if (!selectedCity) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const response = await api.updateLocal(centralId, { central_coletas: false });
      if (!response.success) throw new Error(response.message || 'Não foi possível remover a central.');
      await loadCentrals(selectedCity);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível remover a central.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="config-settings-page fixed inset-0 z-50 overflow-y-auto bg-[#F8F9FA]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => selectedCity ? setSelectedCity(null) : onBack()}
            aria-label={selectedCity ? 'Voltar para cidades' : 'Voltar para configurações'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-slate-900">
              {selectedCity ? getCityLabel(selectedCity) : 'Cadastro de cidades'}
            </h1>
            <p className="text-xs text-slate-500">
              {selectedCity ? 'Centrais de coleta desta cidade' : 'Organize cidades e pontos de coleta'}
            </p>
          </div>
          {selectedCity && (
            <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#0B5187] sm:inline-flex">
              {centrals.length} {centrals.length === 1 ? 'central' : 'centrais'}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-12 sm:px-6">
        {errorMessage && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {errorMessage}
          </div>
        )}

        {!selectedCity ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Cidades</h2>
                <p className="text-xs text-slate-500">Abra uma cidade para cadastrar suas centrais.</p>
              </div>
              <button
                type="button"
                onClick={() => (isCityFormOpen ? closeCityForm() : openCityForm())}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#0B5187] px-3.5 text-sm font-bold text-white transition-colors hover:bg-[#083D66]"
              >
                <Plus className="h-4 w-4" />
                Nova cidade
              </button>
            </div>

            {isCityFormOpen && (
              <form onSubmit={handleSaveCity} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700">Nome da cidade</span>
                    <input
                      autoFocus
                      required
                      value={cityName}
                      onChange={event => setCityName(event.target.value)}
                      placeholder="Ex.: Goiânia"
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/15"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700">UF</span>
                    <input
                      maxLength={2}
                      value={cityState}
                      onChange={event => setCityState(event.target.value.toUpperCase())}
                      placeholder="GO"
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm uppercase outline-none focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/15"
                    />
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeCityForm} className="min-h-10 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isSaving || !cityName.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingCity ? 'Salvar alterações' : 'Salvar cidade'}
                  </button>
                </div>
              </form>
            )}

            {cities.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar cidade..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-[#0B5187] focus:ring-2 focus:ring-[#0B5187]/15"
                />
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-[#0B5187]" /></div>
            ) : filteredCities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                <MapPin className="mx-auto h-9 w-9 text-slate-300" />
                <h3 className="mt-3 text-sm font-black text-slate-800">Nenhuma cidade cadastrada</h3>
                <p className="mt-1 text-xs text-slate-500">Cadastre uma cidade para começar a adicionar centrais de coleta.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {filteredCities.map(city => (
                  <div key={city.id} className="group flex min-h-16 w-full items-center transition-colors hover:bg-slate-50">
                    <button
                      type="button"
                      onClick={() => void handleOpenCity(city)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0B5187]">
                        <MapPin className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{getCityLabel(city)}</span>
                        {(centralsByCity[normalizeCityName(city.name)] || []).length > 0 ? (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {centralsByCity[normalizeCityName(city.name)].join(' • ')}
                          </span>
                        ) : (
                          <span className="mt-0.5 block truncate text-xs font-semibold text-red-600">
                            Nenhuma central cadastrada
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openCityForm(city)}
                      aria-label={`Editar ${getCityLabel(city)}`}
                      title="Editar cidade"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#0B5187] transition-colors hover:bg-blue-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCityToDelete(city)}
                      aria-label={`Excluir ${getCityLabel(city)}`}
                      title="Excluir cidade"
                      className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0B5187] text-white">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-900">Centrais de coleta</h2>
                  <p className="truncate text-xs text-slate-600">{getCityLabel(selectedCity)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { const city = selectedCity; setSelectedCity(null); openCityForm(city); }}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-sm font-bold text-[#0B5187] transition-colors hover:bg-blue-50"
              >
                <Pencil className="h-4 w-4" />
                Editar cidade
              </button>
              <button
                type="button"
                onClick={() => setCityToDelete(selectedCity)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" />
                Excluir cidade
              </button>
              <button
                type="button"
                onClick={() => { setEditingCentralId(null); setIsLocationPickerOpen(true); }}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0B5187] px-3.5 text-sm font-bold text-white transition-colors hover:bg-[#083D66]"
              >
                <Plus className="h-4 w-4" />
                Nova central
              </button>
              </div>
            </section>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#0B5187]" /></div>
            ) : centrals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                <Building2 className="mx-auto h-9 w-9 text-slate-300" />
                <h3 className="mt-3 text-sm font-black text-slate-800">Nenhuma central nesta cidade</h3>
                <p className="mt-1 text-xs text-slate-500">Cadastre o primeiro ponto de coleta para {getCityLabel(selectedCity)}.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {centrals.map(central => (
                  <div key={central.id} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{central.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{central.endereco || `${central.lat}, ${central.lng}`}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => { setEditingCentralId(central.id); setIsLocationPickerOpen(true); }}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold text-[#0B5187] transition-colors hover:bg-blue-50 disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void handleRemoveCentral(central.id)}
                      className="min-h-10 rounded-lg px-3 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {cityToDelete && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => !isSaving && setCityToDelete(null)}>
          <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900">Excluir cidade?</h3>
            <p className="mt-2 text-sm text-slate-600">
              <strong>{getCityLabel(cityToDelete)}</strong> será removida da lista de cidades. Os locais e pedidos já cadastrados não são apagados.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={isSaving} onClick={() => setCityToDelete(null)} className="min-h-10 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button type="button" disabled={isSaving} onClick={() => void handleDeleteCity()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCity && (
        <MapLocationPickerModal
          isOpen={isLocationPickerOpen}
          onClose={() => { setIsLocationPickerOpen(false); setEditingCentralId(null); }}
          targetType="coleta"
          initialAddress={centrals.find(c => c.id === editingCentralId)?.endereco || getCityLabel(selectedCity)}
          hideTypeBadge
          confirmLabel="Salvar"
          onConfirm={handleSaveCentral}
        />
      )}
    </div>
  );
};