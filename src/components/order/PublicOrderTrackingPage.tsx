import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, MapPin, PackageCheck, RefreshCw, Truck } from 'lucide-react';

interface TrackingEvent {
  label: string;
  at: string;
}

interface PublicTrackingData {
  code: string;
  stage: string;
  operation: string;
  scheduledDate: string;
  updatedAt: string;
  originCity: string;
  destinationCity: string;
  events: TrackingEvent[];
}

const statusLabels: Record<string, string> = {
  pendente: 'Aguardando confirmação',
  aprovado: 'Pedido confirmado',
  coletando: 'Coleta em andamento',
  coletado: 'Pedido coletado',
  trocando: 'Troca em andamento',
  trocado: 'Troca concluída',
  entregando: 'Saiu para entrega',
  entregue: 'Pedido entregue',
  finalizado: 'Pedido finalizado',
  cancelado: 'Pedido cancelado'
};

const progressStages: Record<string, number> = {
  pendente: 0,
  aprovado: 0,
  coletando: 1,
  coletado: 2,
  trocando: 2,
  trocado: 2,
  entregando: 2,
  entregue: 3,
  finalizado: 3
};

const progressLabels = ['Pedido recebido', 'Em operação', 'Em rota', 'Concluído'];

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: value.length > 10 ? '2-digit' : undefined,
    minute: value.length > 10 ? '2-digit' : undefined
  }).format(date);
}

export const PublicOrderTrackingPage: React.FC<{ token: string }> = ({ token }) => {
  const [tracking, setTracking] = useState<PublicTrackingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  useEffect(() => {
    let active = true;
    let hasLoadedSuccessfully = false;
    const loadTracking = async () => {
      try {
        const response = await fetch(`/api/public/tracking/${encodeURIComponent(token)}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });
        const result = await response.json();
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.message || 'Não encontramos esse rastreio. Confira o link recebido.');
        }
        if (active) {
          hasLoadedSuccessfully = true;
          setTracking(result.data as PublicTrackingData);
          setErrorMessage('');
          setLastRefresh(Date.now());
        }
      } catch (error) {
        if (active && !hasLoadedSuccessfully) {
          setErrorMessage(error instanceof Error ? error.message : 'Rastreio temporariamente indisponível.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadTracking();
    const interval = window.setInterval(loadTracking, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  const stage = (tracking?.stage || '').toLowerCase();
  const isCancelled = stage === 'cancelado';
  const currentProgress = progressStages[stage] ?? 0;
  const operationLabel = tracking?.operation === 'coleta'
    ? 'Coleta'
    : tracking?.operation === 'troca'
      ? 'Troca'
      : 'Entrega';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b-4 border-[#FF5E00] bg-[#0B5187] text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-5 sm:px-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <PackageCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase">EncomendasZap</p>
            <h1 className="text-lg font-extrabold leading-tight">Rastreamento do pedido</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
        {isLoading && !tracking ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin text-[#0B5187]" />
            <p className="text-sm font-semibold">Consultando o pedido...</p>
          </div>
        ) : errorMessage && !tracking ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-14 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold">Rastreio indisponível</h2>
            <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
          </div>
        ) : tracking ? (
          <div className="space-y-7">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Código do pedido</p>
                <p className="mt-1 font-mono text-xl font-extrabold">{tracking.code}</p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${isCancelled ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-[#0B5187]'}`}>
                {isCancelled ? <AlertCircle className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                {statusLabels[stage] || 'Status atualizado'}
              </span>
            </div>

            <div className="grid gap-3 border-b border-slate-200 pb-6 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <PackageCheck className="h-4 w-4 shrink-0 text-[#0B5187]" />
                <span>{operationLabel}</span>
                {tracking.scheduledDate && <span className="text-slate-500">· {formatDate(tracking.scheduledDate)}</span>}
              </div>
              {(tracking.originCity || tracking.destinationCity) && (
                <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                  <MapPin className="h-4 w-4 shrink-0 text-[#FF5E00]" />
                  <span className="truncate">
                    {tracking.originCity || tracking.destinationCity}
                    {tracking.originCity && tracking.destinationCity && tracking.originCity !== tracking.destinationCity
                      ? ` → ${tracking.destinationCity}`
                      : ''}
                  </span>
                </div>
              )}
            </div>

            {!isCancelled && (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-sm font-extrabold">Etapas</h2>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <RefreshCw className="h-3 w-3" /> Atualização automática
                  </span>
                </div>
                <ol className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
                  {progressLabels.map((label, index) => {
                    const complete = index <= currentProgress;
                    return (
                      <li key={label} className="flex items-center gap-2 text-xs font-semibold">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                          {complete ? <CheckCircle2 className="h-4 w-4" /> : <span>{index + 1}</span>}
                        </span>
                        <span className={complete ? 'text-slate-800' : 'text-slate-500'}>{label}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {tracking.events.length > 0 && (
              <div className="border-t border-slate-200 pt-5">
                <h2 className="mb-4 text-sm font-extrabold">Atualizações</h2>
                <ol className="space-y-4">
                  {tracking.events.map((event, index) => (
                    <li key={`${event.label}-${event.at}-${index}`} className="flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{event.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{formatDate(event.at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <p className="border-t border-slate-200 pt-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> Atualizado {formatDate(tracking.updatedAt) || 'recentemente'}</span>
              <span className="ml-2">· Consulta renovada às {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(lastRefresh)}</span>
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
};
