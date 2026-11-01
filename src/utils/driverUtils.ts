import { Driver } from '../types/map';

/**
 * Retorna o texto formatado e o status de sinal de 'Última vez visto'
 */
export function formatLastSeen(timestamp?: number): {
  text: string;
  status: 'online' | 'warning' | 'offline';
  badgeColor: string;
  dotColor: string;
} {
  if (!timestamp) {
    return {
      text: 'Visto agora',
      status: 'online',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
      dotColor: '#10B981'
    };
  }

  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSec < 15) {
    return {
      text: 'Visto agora',
      status: 'online',
      badgeColor: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
      dotColor: '#10B981'
    };
  } else if (diffSec < 60) {
    return {
      text: `Visto há ${diffSec}s`,
      status: 'online',
      badgeColor: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
      dotColor: '#10B981'
    };
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    const isWarning = mins >= 3;
    return {
      text: `Visto há ${mins} min`,
      status: isWarning ? 'warning' : 'online',
      badgeColor: isWarning 
        ? 'bg-amber-500/30 text-amber-200 border-amber-400/60' 
        : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
      dotColor: isWarning ? '#F59E0B' : '#10B981'
    };
  } else {
    const hours = Math.floor(diffSec / 3600);
    return {
      text: `Visto há ${hours}h`,
      status: 'offline',
      badgeColor: 'bg-rose-500/30 text-rose-200 border-rose-400/60',
      dotColor: '#EF4444'
    };
  }
}

/**
 * Retorna o rótulo de qualidade de sinal GPS
 */
export function getGpsSignalLabel(driver: Driver): {
  label: string;
  color: string;
  iconType: 'strong' | 'medium' | 'weak';
} {
  const lastSeen = formatLastSeen(driver.lastSeenTimestamp);

  if (lastSeen.status === 'offline') {
    return { label: 'Sinal Perdido (Offline)', color: '#EF4444', iconType: 'weak' };
  } else if (lastSeen.status === 'warning') {
    return { label: 'Sinal Instável (Atraso)', color: '#F59E0B', iconType: 'medium' };
  } else {
    return { label: 'GPS Conectado (Em tempo real)', color: '#10B981', iconType: 'strong' };
  }
}
