import { api } from './api';
import { BackendUser } from './apiTypes';
import { Customer } from '../types/customer';

// Cache em memória para buscas rápidas e sem overhead de rede repetido
import { customerOrderStatsService } from './customerOrderStatsService';

const searchCache = new Map<string, Customer[]>();

/**
 * Converte um usuário retornado do banco de dados oficial em formato Customer do app
 */
function convertBackendUserToCustomer(user: BackendUser): Customer {
  const fullName = (user.name_completo && user.name_completo.trim()) || user.name || 'Usuário Sem Nome';
  const cleanPhone = (user.phone || '').trim();
  const rawCpf = (user.cpf || (user as any).cnpj || '').trim();
  const rawCity = user.cidade || (user as any).city;
  const address = rawCity 
    ? `${rawCity} - GO` 
    : (user.local_name ? `${user.local_name}, Goiânia - GO` : 'Goiânia - GO');

  return {
    id: `db-user-${user.id}`,
    fullName,
    phone: cleanPhone,
    cpf: rawCpf,
    cnpj: (user as any).cnpj,
    personType: (user as any).person_type,
    city: rawCity,
    cidade: rawCity,
    address,
    notes: user.access_level ? `Banco de Dados (${user.access_level})` : 'Banco de Dados Oficial',
    orderCount: Number(user.orderCount ?? user.order_count ?? user.pedidos_count ?? 0),
    createdAt: user.created_at ? new Date(user.created_at).getTime() : Date.now()
  };
}

/**
 * Busca de usuários EXCLUSIVAMENTE no banco de dados central
 * Consulta os endpoints oficiais /users/list e /pedidos/list_users
 * com busca simultânea por nome, telefone ou CPF e cacheamento instantâneo.
 */
export async function searchDatabaseCustomers(searchTerm: string): Promise<Customer[]> {
  const clean = searchTerm.trim().toLowerCase();
  if (!clean || clean.length < 2) {
    return [];
  }

  // Verifica cache em memória
  if (searchCache.has(clean)) {
    return searchCache.get(clean)!;
  }

  try {
    // Executa buscas concorrentes no banco para cobrir tanto busca textual quanto por telefone ou id
    const [usersRes, compactUsersRes] = await Promise.allSettled([
      api.listUsers({ search: clean, limit: 30 }),
      api.listUsersCompact(clean)
    ]);

    const resultsMap = new Map<string, Customer>();

    // 1. Processa /users/list
    if (usersRes.status === 'fulfilled' && usersRes.value?.success && Array.isArray(usersRes.value.data)) {
      usersRes.value.data.forEach((u: BackendUser) => {
        const cust = convertBackendUserToCustomer(u);
        const dedupeKey = (cust.phone ? cust.phone.replace(/\D/g, '') : '') || `id-${u.id}` || cust.fullName.toLowerCase();
        if (dedupeKey && !resultsMap.has(dedupeKey)) {
          resultsMap.set(dedupeKey, cust);
        }
      });
    }

    // 2. Processa /pedidos/list_users (fornece campos como name_completo e cpf)
    if (compactUsersRes.status === 'fulfilled' && compactUsersRes.value?.success && Array.isArray(compactUsersRes.value.data)) {
      compactUsersRes.value.data.forEach((u: BackendUser) => {
        const cust = convertBackendUserToCustomer(u);
        const dedupeKey = (cust.phone ? cust.phone.replace(/\D/g, '') : '') || `id-${u.id}` || cust.fullName.toLowerCase();
        if (!resultsMap.has(dedupeKey)) {
          resultsMap.set(dedupeKey, cust);
        } else {
          // Complementa dados se a lista compacta tiver mais dados (ex: CPF completo ou nome completo)
          const existing = resultsMap.get(dedupeKey)!;
          if (!existing.cpf && cust.cpf) existing.cpf = cust.cpf;
          if (cust.fullName.length > existing.fullName.length) existing.fullName = cust.fullName;
        }
      });
    }

    const sortedResults = customerOrderStatsService.sortCustomersByOrderCount(Array.from(resultsMap.values()));

    // Salva no cache (limita em 100 termos)
    if (searchCache.size > 100) {
      const firstKey = searchCache.keys().next().value;
      if (firstKey) searchCache.delete(firstKey);
    }
    searchCache.set(clean, sortedResults);

    return sortedResults;
  } catch (error) {
    console.warn('Erro ao consultar banco de dados para busca de usuários:', error);
    return [];
  }
}
