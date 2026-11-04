import { isStreetOrAddress } from './placeUtils';

type PlaceNameSource = {
  name?: string;
  address?: string;
  category?: string;
  isUnnamed?: boolean;
};

export function getSuggestedOrderPlaceName(place: PlaceNameSource): string {
  const name = place.name?.trim() || '';
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const normalizedName = normalize(name);
  const addressStart = normalize((place.address || '').split(',')[0]);
  const placeholders = [
    'localizando endereco...', 'local sem nome', 'ponto no mapa',
    'ponto marcado no mapa', 'ponto selecionado', 'local no mapa',
    'endereco selecionado', 'ponto de coleta', 'ponto de entrega', 'ponto de troca'
  ];
  const category = normalize(place.category || '');
  const namedEstablishment = /^(ponto comercial|ponto de interesse|loja comercial|shopping center|supermercado|restaurante|farmacia)\b/.test(category);
  if (!name || place.isUnnamed || placeholders.includes(normalizedName) ||
      (addressStart && normalizedName === addressStart) || (!namedEstablishment && isStreetOrAddress(place))) {
    return '';
  }
  return name;
}
