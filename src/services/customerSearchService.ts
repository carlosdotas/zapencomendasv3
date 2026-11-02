import { api } from './api';
import { BackendUser } from './apiTypes';
import { backendUserToCustomer } from './apiAdapters';
import { Customer } from '../types/customer';

import { customerOrderStatsService } from './customerOrderStatsService';

export interface CustomerSearchPage {
  customers: Customer[];
  cursor?: string;
  hasMore: boolean;
}

/**
 * Busca de usuários EXCLUSIVAMENTE no banco de dados central
 * Consulta uma página de usuários com busca por nome, telefone, documento e localização.
 */
export async function searchDatabaseCustomersPage(
  searchTerm: string,
  cursor?: string,
  limit = 30
): Promise<CustomerSearchPage> {
  const clean = searchTerm.trim().toLowerCase();
  if (!clean || clean.length < 2) return { customers: [], hasMore: false };

  try {
    const response = await api.listUsers({ search: clean, cursor, limit });
    if (!response.success || !Array.isArray(response.data)) return { customers: [], hasMore: false };
    const customers = response.data.map((user: BackendUser) => backendUserToCustomer(user));
    return {
      customers: customerOrderStatsService.sortCustomersByOrderCount(customers),
      cursor: response.cursor,
      hasMore: response.hasMore ?? customers.length === limit
    };
  } catch (error) {
    console.warn('Erro ao consultar banco de dados para busca de usuários:', error);
    return { customers: [], hasMore: false };
  }
}

export function subscribeDatabaseCustomersPage(
  searchTerm: string,
  cursor: string | undefined,
  limit: number,
  onUpdate: (page: CustomerSearchPage) => void,
  onError?: (error: Error) => void
): () => void {
  return api.watchUsersPage({ search: searchTerm, cursor, limit }, response => {
    if (!response.success || !Array.isArray(response.data)) {
      onUpdate({ customers: [], hasMore: false });
      return;
    }
    const customers = response.data.map(user => backendUserToCustomer(user));
    onUpdate({
      customers: customerOrderStatsService.sortCustomersByOrderCount(customers),
      cursor: response.cursor,
      hasMore: response.hasMore ?? customers.length === limit
    });
  }, onError);
}

export async function searchDatabaseCustomers(searchTerm: string): Promise<Customer[]> {
  const firstPage = await searchDatabaseCustomersPage(searchTerm);
  return firstPage.customers;
}
