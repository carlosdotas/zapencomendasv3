/**
 * financialService.ts
 * Serviço de comunicação da Área Financeira para Contas a Pagar e Contas a Receber.
 */

import { PayableAccount, ReceivableAccount } from '../utils/financialUtils';

export interface FetchPayableParams {
  driver_id?: string;
  paid?: boolean | 'all';
  from?: string;
  to?: string;
  busca?: string;
}

export interface FetchReceivableParams {
  client_id?: number | string;
  client_name?: string;
  status?: 'unpaid' | 'paid' | 'all';
  from?: string;
  to?: string;
  busca?: string;
}

export interface FinancialApiResponse<T> {
  success: boolean;
  data: T[];
  subtotal_unpaid?: number;
  subtotal_paid?: number;
  total_count?: number;
  message?: string;
}

class FinancialService {
  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    try {
      const isAuth = localStorage.getItem('encomendaszap_is_authenticated') === 'true';
      const saved = localStorage.getItem('encomendaszap_logged_account');
      if (isAuth && saved) {
        const acc = JSON.parse(saved);
        if (acc.phone) headers['X-User-Phone'] = acc.phone;
        if (acc.id) headers['X-User-Id'] = String(acc.id);
        if (acc.role) headers['X-User-Role'] = acc.role;
      }
    } catch {
      // ignore
    }
    return headers;
  }

  // 1. Contas a Pagar (Motoristas)
  async getPayableAccounts(params: FetchPayableParams = {}): Promise<FinancialApiResponse<PayableAccount>> {
    try {
      const res = await fetch('/api/financial/payable/list', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn('[FinancialService] Falha ao carregar Contas a Pagar:', err);
      return { success: false, data: [], subtotal_unpaid: 0, subtotal_paid: 0, total_count: 0 };
    }
  }

  async settlePayableAccount(ids: number | number[], paid: boolean = true): Promise<boolean> {
    try {
      const payload = Array.isArray(ids) ? { ids, paid } : { id: ids, paid };
      const res = await fetch('/api/financial/payable/settle', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.warn('[FinancialService] Falha ao dar baixa em Conta a Pagar:', err);
      return false;
    }
  }

  // 2. Contas a Receber (Pedidos de Clientes)
  async getReceivableAccounts(params: FetchReceivableParams = {}): Promise<FinancialApiResponse<ReceivableAccount>> {
    try {
      const res = await fetch('/api/financial/receivable/list', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn('[FinancialService] Falha ao carregar Contas a Receber:', err);
      return { success: false, data: [], subtotal_unpaid: 0, subtotal_paid: 0, total_count: 0 };
    }
  }

  async settleReceivableAccount(ids: number | number[], paid: boolean = true, paymentMethod?: string): Promise<boolean> {
    try {
      const payload = Array.isArray(ids)
        ? { ids, paid, payment_method: paymentMethod }
        : { id: ids, paid, payment_method: paymentMethod };

      const res = await fetch('/api/financial/receivable/settle', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.warn('[FinancialService] Falha ao dar baixa em Conta a Receber:', err);
      return false;
    }
  }
}

export const financialService = new FinancialService();
