import { Customer, CustomerAddress } from '../types/customer';

export function normalizeCustomerId(id?: string | number | null): string {
  return String(id ?? '').trim().replace(/^db-user-/i, '');
}

export function normalizeCustomerPhone(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

function isTemporaryCustomerId(id: string): boolean {
  return /^(cust|agenda|temp)-/i.test(id);
}

export function customersRepresentSamePerson(left: Partial<Customer>, right: Partial<Customer>): boolean {
  const leftId = normalizeCustomerId(left.id);
  const rightId = normalizeCustomerId(right.id);
  if (leftId && rightId && leftId === rightId) return true;

  if (leftId && rightId && !isTemporaryCustomerId(leftId) && !isTemporaryCustomerId(rightId)) {
    return false;
  }

  const leftPhone = normalizeCustomerPhone(left.phone);
  const rightPhone = normalizeCustomerPhone(right.phone);
  return leftPhone.length >= 8 && leftPhone === rightPhone;
}

function hasValidCoordinates(coordinates?: Customer['coordinates']): boolean {
  return Boolean(
    coordinates
    && Number.isFinite(coordinates.lat)
    && Number.isFinite(coordinates.lng)
    && (coordinates.lat !== 0 || coordinates.lng !== 0)
  );
}

function mergeAdditionalAddresses(primary: CustomerAddress[] = [], fallback: CustomerAddress[] = []): CustomerAddress[] {
  const merged: CustomerAddress[] = [];
  const keys = new Set<string>();

  for (const address of [...primary, ...fallback]) {
    const key = address.id
      ? `id:${address.id.trim().toLowerCase()}`
      : `address:${address.address.trim().toLowerCase()}|${(address.label || '').trim().toLowerCase()}`;
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(address);
  }

  return merged;
}

export function mergeCustomerRecords(primary: Customer, fallback: Customer): Customer {
  const city = primary.city || primary.cidade || fallback.city || fallback.cidade;
  return {
    ...fallback,
    ...primary,
    id: primary.id || fallback.id,
    fullName: primary.fullName?.trim() || fallback.fullName,
    contactName: primary.contactName?.trim() || fallback.contactName,
    phone: primary.phone?.trim() || fallback.phone,
    cpf: primary.cpf?.trim() || fallback.cpf,
    cnpj: primary.cnpj?.trim() || fallback.cnpj,
    address: primary.address?.trim() || fallback.address || '',
    coordinates: hasValidCoordinates(primary.coordinates) ? primary.coordinates : fallback.coordinates,
    city,
    cidade: city,
    additionalAddresses: mergeAdditionalAddresses(primary.additionalAddresses, fallback.additionalAddresses),
    orderCount: Math.max(Number(primary.orderCount) || 0, Number(fallback.orderCount) || 0),
    createdAt: primary.createdAt || fallback.createdAt
  };
}

export function mergeCustomerLists(...lists: Customer[][]): Customer[] {
  const merged: Customer[] = [];
  const indexesById = new Map<string, number>();
  const indexesByPhone = new Map<string, number[]>();

  for (const list of lists) {
    for (const candidate of list) {
      const id = normalizeCustomerId(candidate.id);
      const phone = normalizeCustomerPhone(candidate.phone);
      let matchIndex = id ? indexesById.get(id) : undefined;

      if (matchIndex === undefined && phone.length >= 8) {
        const phoneMatches = (indexesByPhone.get(phone) || []).filter(index =>
          customersRepresentSamePerson(merged[index], candidate)
        );
        if (phoneMatches.length === 1) matchIndex = phoneMatches[0];
      }

      if (matchIndex === undefined) {
        matchIndex = merged.length;
        merged.push(candidate);
      } else {
        merged[matchIndex] = mergeCustomerRecords(merged[matchIndex], candidate);
      }

      const mergedId = normalizeCustomerId(merged[matchIndex].id);
      const mergedPhone = normalizeCustomerPhone(merged[matchIndex].phone);
      if (mergedId) indexesById.set(mergedId, matchIndex);
      if (id) indexesById.set(id, matchIndex);
      if (mergedPhone.length >= 8) {
        const indexes = indexesByPhone.get(mergedPhone) || [];
        if (!indexes.includes(matchIndex)) indexes.push(matchIndex);
        indexesByPhone.set(mergedPhone, indexes);
      }
      if (phone.length >= 8) {
        const indexes = indexesByPhone.get(phone) || [];
        if (!indexes.includes(matchIndex)) indexes.push(matchIndex);
        indexesByPhone.set(phone, indexes);
      }
    }
  }

  return merged;
}