/** Shared normalization for city names stored on customer records. */
export function normalizeCityName(value?: string | null): string | undefined {
  const cleanValue = value?.trim().replace(/\s+/g, ' ');
  if (!cleanValue) return undefined;

  const match = cleanValue.match(/^(.*?)\s*[-,]\s*([a-z]{2})$/i);
  if (!match) return cleanValue;

  const city = match[1].trim().replace(/\s*[-,]\s*[a-z]{2}$/i, '').trim();
  return city ? `${city} - ${match[2].toUpperCase()}` : undefined;
}

function extractCityOrUndefined(address?: string | null): string | undefined {
  if (!address || typeof address !== 'string') return undefined;

  const addressMatch = address.match(/(?:^|[,;])\s*([^,;]+?)\s*[-,]\s*([a-z]{2})\b/i);
  if (addressMatch?.[1] && addressMatch[2]) {
    return normalizeCityName(`${addressMatch[1]} - ${addressMatch[2]}`);
  }

  const normalizedAddress = address.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const stateSuffix = address.match(/[-,]\s*([a-z]{2})\b/i)?.[1]?.toUpperCase() || 'GO';
  const knownCities = [
    { match: 'aparecida de goiania', name: 'Aparecida de Goiânia' },
    { match: 'senador canedo', name: 'Senador Canedo' },
    { match: 'anapolis', name: 'Anápolis' },
    { match: 'brasilia', name: 'Brasília', state: 'DF' },
    { match: 'goiania', name: 'Goiânia' },
    { match: 'trindade', name: 'Trindade' }
  ];
  const knownCity = knownCities.find(city => normalizedAddress.includes(city.match));
  if (knownCity) return `${knownCity.name} - ${knownCity.state || stateSuffix}`;

  const parts = address.split('-');
  if (parts.length >= 2) {
    const citySegment = parts[parts.length - 2].split(',').pop()?.trim();
    if (citySegment && !/^\d/.test(citySegment)) {
      return normalizeCityName(`${citySegment} - ${stateSuffix}`);
    }
  }

  return undefined;
}

export interface CustomerCitySource {
  city?: string | null;
  cidade?: string | null;
  destinationCity?: string | null;
  originCity?: string | null;
  address?: string | null;
}

export function resolveCustomerCity(source: CustomerCitySource): string | undefined {
  const city = normalizeCityName(source.city) ||
    normalizeCityName(source.cidade) ||
    normalizeCityName(source.destinationCity) ||
    normalizeCityName(source.originCity);
  return city || extractCityOrUndefined(source.address);
}

export const extractCityFromAddress = (address: string): string =>
  extractCityOrUndefined(address) || 'Goiânia - GO';
