import { Customer, AgendaContact } from '../types/customer';
import { normalizeCustomerId, normalizeCustomerPhone } from '../utils/customerIdentity';

/**
 * Normaliza texto para correspondência insensível a acentos e maiúsculas
 */
function normalizeName(text: string = ''): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Limpa dígitos de telefone
 */
function cleanPhoneDigits(phone?: string): string {
  return normalizeCustomerPhone(phone);
}

class CustomerOrderStatsService {
  private counts: Map<string, number> = new Map();


  /**
   * Registra um pedido em tempo real incrementando o contador do cliente
   */
  public registerOrder(customer: { fullName?: string; name?: string; phone?: string; id?: string; orderCount?: number; pedidos_count?: number }): number {
    const current = this.getOrderCount(customer);
    const next = current + 1;

    // Atualiza diretamente no objeto do cliente
    customer.orderCount = next;
    if ('pedidos_count' in customer) {
      (customer as any).pedidos_count = next;
    }

    const nameNorm = normalizeName(customer.fullName || customer.name || '');
    const phone = cleanPhoneDigits(customer.phone);
    const id = customer.id ? `id_${normalizeCustomerId(customer.id)}` : '';

    if (nameNorm) this.counts.set(nameNorm, next);
    if (phone && phone.length >= 8) this.counts.set(phone, next);
    if (id) this.counts.set(id, next);

    return next;
  }

  /**
   * Obtém a quantidade total de pedidos já realizados pelo cliente em O(1)
   */
  public getOrderCount(customer?: { fullName?: string; name?: string; phone?: string; id?: string; orderCount?: number; pedidos_count?: number } | null): number {
    if (!customer) return 0;

    // Se já gravado diretamente no objeto do cliente, retorna instantaneamente em O(1)
    if (typeof customer.orderCount === 'number' && !isNaN(customer.orderCount)) {
      return customer.orderCount;
    }
    if (typeof customer.pedidos_count === 'number' && !isNaN(customer.pedidos_count)) {
      return customer.pedidos_count;
    }

    // Busca rápida em O(1) por ID, Telefone ou Nome exato no hash map
    const id = customer.id ? `id_${normalizeCustomerId(customer.id)}` : '';
    if (id && this.counts.has(id)) {
      const val = this.counts.get(id)!;
      customer.orderCount = val;
      return val;
    }

    const phone = cleanPhoneDigits(customer.phone);
    if (phone && phone.length >= 8 && this.counts.has(phone)) {
      const val = this.counts.get(phone)!;
      customer.orderCount = val;
      return val;
    }

    const nameNorm = normalizeName(customer.fullName || customer.name || '');
    if (nameNorm && this.counts.has(nameNorm)) {
      const val = this.counts.get(nameNorm)!;
      customer.orderCount = val;
      return val;
    }

    // Sem loops caros: se não possui histórico prévio, são 0 pedidos
    customer.orderCount = 0;
    return 0;
  }

  /**
   * Ordena uma lista de clientes por quem tem mais pedidos (decrescente).
   * Em caso de empate, ordena alfabeticamente pelo nome.
   * Executa em microssegundos com comparações numéricas diretas.
   */
  public sortCustomersByOrderCount<T extends { fullName?: string; name?: string; phone?: string; id?: string; orderCount?: number; pedidos_count?: number }>(customers: T[]): T[] {
    return [...customers].sort((a, b) => {
      const countA = this.getOrderCount(a);
      const countB = this.getOrderCount(b);

      if (countB !== countA) {
        return countB - countA;
      }

      const nameA = a.fullName || a.name || '';
      const nameB = b.fullName || b.name || '';
      return nameA.localeCompare(nameB)
        || normalizeCustomerId(a.id).localeCompare(normalizeCustomerId(b.id), undefined, { numeric: true })
        || normalizeCustomerPhone(a.phone).localeCompare(normalizeCustomerPhone(b.phone));
    });
  }

  /**
   * Anexa a propriedade orderCount no cliente
   */
  public enrichWithOrderCount<T extends { fullName?: string; name?: string; phone?: string; id?: string; orderCount?: number }>(customer: T): T {
    return {
      ...customer,
      orderCount: this.getOrderCount(customer)
    };
  }
}

export const customerOrderStatsService = new CustomerOrderStatsService();
