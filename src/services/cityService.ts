import { request } from './httpClient';

export interface CityRecord {
  id: string;
  name: string;
  state?: string;
  createdAt: number;
  updatedAt: number;
}

export function normalizeCityName(value: string): string {
  return value
    .trim()
    .replace(/\s*[-,]\s*[a-z]{2}$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getCityLabel(city: Pick<CityRecord, 'name' | 'state'>): string {
  return city.state ? `${city.name} - ${city.state}` : city.name;
}

class CityService {
  public async listCities(): Promise<CityRecord[]> {
    const res = await request<CityRecord[]>('/cities', 'GET');
    if (!res.success || !Array.isArray(res.data)) {
      throw new Error(res.message || 'Não foi possível carregar as cidades.');
    }
    return res.data
      .filter(city => city.name)
      .sort((a, b) => getCityLabel(a).localeCompare(getCityLabel(b), 'pt-BR'));
  }

  public async saveCity(name: string, state?: string, id?: string): Promise<CityRecord> {
    const cleanName = name.trim();
    const cleanState = state?.trim().toUpperCase() || undefined;
    if (!cleanName) throw new Error('Informe o nome da cidade.');

    const res = await request<CityRecord>('/cities/save', 'POST', { id, name: cleanName, state: cleanState });
    if (!res.success || !res.data) throw new Error(res.message || 'Não foi possível salvar a cidade.');
    return res.data;
  }

  public async deleteCity(id: string): Promise<void> {
    const res = await request('/cities/delete', 'POST', { id });
    if (!res.success) throw new Error(res.message || 'Não foi possível excluir a cidade.');
  }
}

export const cityService = new CityService();
