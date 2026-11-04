import React, { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, Save, CheckCircle2, Search, X } from 'lucide-react';
import { settingsService, DefaultOrderLocation } from '../../../services/settingsService';
import { placeService } from '../../../services/placeService';
import type { Place } from '../../../types/map';

interface DefaultLocationSettingsPageProps {
  onBack: () => void;
  defaultLocation: DefaultOrderLocation | null;
  onUpdate: (location: DefaultOrderLocation | null) => void;
}

export const DefaultLocationSettingsPage: React.FC<DefaultLocationSettingsPageProps> = ({
  onBack,
  defaultLocation,
  onUpdate
}) => {
  const [selected, setSelected] = useState<DefaultOrderLocation | null>(defaultLocation);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await placeService.searchPlaces(q, 8);
      if (!cancelled) setResults(found);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handlePick = (place: Place) => {
    setSelected({
      name: place.name,
      address: place.address,
      lat: place.coordinates.lat,
      lng: place.coordinates.lng
    });
    setQuery('');
    setResults([]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      const success = await settingsService.saveSettings({ defaultOrderLocation: selected });
      if (!success) {
        window.alert('Não foi possível salvar o local padrão no servidor. Verifique a conexão e tente novamente.');
        return;
      }
      onUpdate(selected);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="config-settings-page min-h-full pb-20">
      <div className="sticky top-0 z-20 bg-[#F8F9FA]/95 backdrop-blur-md px-4 sm:px-6 py-3 border-b border-slate-200/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full hover:bg-slate-200/80 flex items-center justify-center text-slate-700 cursor-pointer"
            title="Voltar para Configurações"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.3]" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">Local padrão de coleta/entrega</h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Usado ao salvar quando não houver local definido nem cliente com local
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B5187] hover:bg-[#083e68] text-white font-bold text-xs rounded-full shadow-md cursor-pointer"
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[3]" />
              <span>Salvo!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
            </>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs space-y-3">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Local atual</h2>
          {selected ? (
            <div className="flex items-start gap-3 p-3 rounded-2xl border-2 border-[#0B5187] bg-blue-50/50">
              <MapPin className="w-5 h-5 text-[#0B5187] shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 break-words">{selected.name}</p>
                <p className="text-[11px] text-slate-500 break-words">{selected.address}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
                title="Remover local padrão"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Nenhum local padrão definido.</p>
          )}
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs space-y-3">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Buscar local cadastrado</h2>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Nome ou endereço do local"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#0B5187]"
            />
          </div>
          <div className="space-y-1.5">
            {results.map(place => (
              <button
                key={place.id}
                type="button"
                onClick={() => handlePick(place)}
                className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-[#0B5187] hover:bg-blue-50/50 cursor-pointer"
              >
                <p className="text-xs font-black text-slate-900 break-words">{place.name}</p>
                <p className="text-[11px] text-slate-500 break-words">{place.address}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
