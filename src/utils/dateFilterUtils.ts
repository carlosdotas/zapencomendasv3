import { Place, DateRangeFilter, DateFilterPreset } from '../types/map';

/**
 * Converte Date para string ISO local 'YYYY-MM-DD'
 */
export function toLocalISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converte 'YYYY-MM-DD' para 'DD/MM/YYYY' ou 'DD/MM'
 */
export function formatISODateToBR(iso?: string | null, short = false): string {
  if (!iso || typeof iso !== 'string') return '';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts;
  if (short) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

/**
 * Resolve a data exata (YYYY-MM-DD) de uma Place
 */
export function getPlaceCalendarDate(place: Place): string {
  if (place.scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(place.scheduledDate)) {
    return place.scheduledDate;
  }
  const anyPlace = place as any;
  if (anyPlace.orderDate && /^\d{4}-\d{2}-\d{2}$/.test(anyPlace.orderDate)) {
    return anyPlace.orderDate;
  }
  if (anyPlace.data && /^\d{4}-\d{2}-\d{2}$/.test(String(anyPlace.data).slice(0, 10))) {
    return String(anyPlace.data).slice(0, 10);
  }

  const now = new Date();
  const todayStr = toLocalISODate(now);
  const badge = place.orderDateBadge;

  if (!badge || badge === 'hoje') return todayStr;
  if (badge === 'amanha') {
    const tom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return toLocalISODate(tom);
  }
  if (badge === 'ontem') {
    const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return toLocalISODate(yest);
  }
  if (badge === '2_dias_atras') {
    const d2 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    return toLocalISODate(d2);
  }
  if (badge === '3_dias_atras') {
    const d3 = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    return toLocalISODate(d3);
  }

  // Se o badge contiver formato 'DD/MM'
  if (/^\d{1,2}\/\d{1,2}$/.test(badge)) {
    const [d, m] = badge.split('/');
    const year = now.getFullYear();
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return todayStr;
}

/**
 * Retorna as datas de início e fim para cada preset rápido
 */
export function getPresetDateRange(preset: DateFilterPreset): { startDate: string; endDate: string } {
  const now = new Date();
  const todayStr = toLocalISODate(now);

  switch (preset) {
    case 'hoje':
      return { startDate: todayStr, endDate: todayStr };

    case 'amanha': {
      const tom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomStr = toLocalISODate(tom);
      return { startDate: tomStr, endDate: tomStr };
    }

    case 'ontem': {
      const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yestStr = toLocalISODate(yest);
      return { startDate: yestStr, endDate: yestStr };
    }

    case 'essa_semana': {
      // Domingo a Sábado da semana atual
      const currentDay = now.getDay(); // 0 = Domingo
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - currentDay);

      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);

      return {
        startDate: toLocalISODate(sunday),
        endDate: toLocalISODate(saturday)
      };
    }

    case 'este_mes': {
      // 1º dia do mês atual ao último dia do mês atual
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: toLocalISODate(firstDay),
        endDate: toLocalISODate(lastDay)
      };
    }

    case 'mes_passado': {
      // 1º dia do mês anterior ao último dia do mês anterior
      const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: toLocalISODate(firstDayPrev),
        endDate: toLocalISODate(lastDayPrev)
      };
    }

    default:
      return { startDate: todayStr, endDate: todayStr };
  }
}

/**
 * Verifica se uma data específica (YYYY-MM-DD) está dentro do intervalo
 */
export function isDateInInterval(dateStr: string, start?: string | null, end?: string | null): boolean {
  if (!start && !end) return true;
  const cleanDate = dateStr.slice(0, 10);
  if (start && end) {
    return cleanDate >= start && cleanDate <= end;
  }
  if (start) {
    return cleanDate >= start;
  }
  if (end) {
    return cleanDate <= end;
  }
  return true;
}

/**
 * Rótulo amigável para o filtro de datas selecionado
 */
export function getDateFilterDisplayLabel(filter: DateRangeFilter): string {
  if (!filter.startDate && !filter.endDate) {
    return 'Filtrar por data e período';
  }

  if (filter.preset === 'hoje') return 'Hoje';
  if (filter.preset === 'amanha') return 'Amanhã';
  if (filter.preset === 'ontem') return 'Ontem';
  if (filter.preset === 'essa_semana') return 'Essa semana';
  if (filter.preset === 'este_mes') return 'Esse mês';
  if (filter.preset === 'mes_passado') return 'Mês passado';

  if (filter.startDate === filter.endDate && filter.startDate) {
    return formatISODateToBR(filter.startDate);
  }

  return `${formatISODateToBR(filter.startDate, true)} até ${formatISODateToBR(filter.endDate, true)}`;
}
