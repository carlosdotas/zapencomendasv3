export interface CompanyLocation {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
}

export class CompanyValidationError extends Error {}

export function parseCompanyLocationId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      !/^[1-9]\d*$/.test(String(value))) {
    throw new CompanyValidationError('Selecione um local cadastrado válido.');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id > 2147483647) {
    throw new CompanyValidationError('Selecione um local cadastrado válido.');
  }
  return id;
}

export async function saveCompanyWithLocation(
  input: unknown,
  findLocation: (id: number) => Promise<CompanyLocation | null>,
  saveRecord: (id: string, data: string) => Promise<unknown>
) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CompanyValidationError('Informe o nome da transportadora.');
  }
  const company = input as Record<string, unknown>;
  if (typeof company.name !== 'string' || !company.name.trim()) {
    throw new CompanyValidationError('Informe o nome da transportadora.');
  }
  const locationId = parseCompanyLocationId(company.locationId);
  const location = locationId === null ? null : await findLocation(locationId);
  if (locationId !== null && !location) {
    throw new CompanyValidationError('O local selecionado não foi encontrado. Selecione outro local.');
  }
  const id = String(company.id || `comp-${Date.now()}`);
  const { location: _location, ...companyData } = company;
  const savedCompany = { ...companyData, id, name: company.name.trim(), locationId };
  await saveRecord(id, JSON.stringify(savedCompany));
  return companyWithLocation(savedCompany, location);
}

export function companyWithLocation<T extends Record<string, unknown>>(
  company: T,
  location: CompanyLocation | null
) {
  return {
    ...company,
    location: location ? {
      id: location.id,
      name: location.name,
      address: location.address,
      city: location.city,
      state: location.state
    } : null
  };
}
