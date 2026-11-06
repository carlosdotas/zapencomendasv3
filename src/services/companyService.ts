/**
 * Serviço de Gerenciamento de Empresas e Transportadoras (via API do servidor)
 *
 * Regras:
 * - Somente o Administrador Master (62996157340) tem acesso de gestão.
 * - Empresas enxergam apenas seus próprios dados (pedidos e clientes).
 * - Locais / Pontos de mapa são públicos e disponíveis para todos.
 * - Motoboys têm acesso restrito apenas aos pedidos das empresas que os autorizarem.
 */

import {
  CompanyTransportadora,
  MASTER_ADMIN_CLEAN
} from '../types/company';
import { Place } from '../types/map';
import { Customer } from '../types/customer';
import { request, startPolling } from './httpClient';

const POLL_INTERVAL_MS = 30000;

class CompanyService {
  private companies: Map<string, CompanyTransportadora> = new Map();
  private listeners: Set<(companies: CompanyTransportadora[]) => void> = new Set();
  private stopPolling: (() => void) | null = null;

  constructor() {
    void this.refresh();
  }

  /**
   * Verifica se o telefone informado é do Administrador Master (62996157340)
   */
  public isMasterAdmin(rawPhone?: string | null): boolean {
    if (!rawPhone) return false;
    const clean = rawPhone.replace(/\D/g, '');
    return clean === MASTER_ADMIN_CLEAN || clean.endsWith('62996157340') || clean === '62996157340';
  }

  /**
   * Recarrega a lista de empresas do servidor
   */
  public async refresh(): Promise<boolean> {
    const res = await request<CompanyTransportadora[]>('/companies', 'GET');
    if (!res.success || !Array.isArray(res.data)) {
      console.error('[Companies] Erro ao carregar transportadoras:', res.message);
      return false;
    }
    this.companies.clear();
    for (const company of res.data) {
      if (company?.id) this.companies.set(String(company.id), company);
    }
    this.notifyListeners();
    return true;
  }

  private notifyListeners() {
    const list = Array.from(this.companies.values());
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (e) {
        console.error(e);
      }
    }
  }

  public subscribe(callback: (companies: CompanyTransportadora[]) => void): () => void {
    this.listeners.add(callback);
    callback(Array.from(this.companies.values()));

    if (!this.stopPolling) {
      this.stopPolling = startPolling(async () => { await this.refresh(); }, POLL_INTERVAL_MS);
    }

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0 && this.stopPolling) {
        this.stopPolling();
        this.stopPolling = null;
      }
    };
  }

  public getAll(): CompanyTransportadora[] {
    return Array.from(this.companies.values());
  }

  public getById(id: string): CompanyTransportadora | undefined {
    return this.companies.get(id);
  }

  /**
   * Salva ou atualiza empresa
   */
  public async saveCompany(company: CompanyTransportadora): Promise<void> {
    const cleanId = company.id || `emp-${Date.now()}`;
    const toSave: CompanyTransportadora = {
      ...company,
      id: cleanId,
      cleanPhone: (company.phone || '').replace(/\D/g, ''),
      adminPhones: (company.adminPhones || []).map(p => p.replace(/\D/g, '')),
      attendantPhones: (company.attendantPhones || []).map(p => p.replace(/\D/g, '')),
      motoboyPhones: (company.motoboyPhones || []).map(p => p.replace(/\D/g, '')),
      updatedAt: Date.now()
    };

    const res = await request<CompanyTransportadora>('/companies/save', 'POST', { company: toSave });
    if (!res.success || !res.data) {
      console.error('[Companies] Erro ao salvar empresa:', res.message);
      throw new Error(res.message || 'Não foi possível salvar a transportadora.');
    }
    this.companies.set(cleanId, res.data);
    this.notifyListeners();
  }

  /**
   * Remove empresa
   */
  public async deleteCompany(id: string): Promise<boolean> {
    const res = await request('/companies/delete', 'POST', { id });
    if (!res.success) {
      console.error('[Companies] Erro ao deletar empresa:', res.message);
      return false;
    }
    this.companies.delete(id);
    this.notifyListeners();
    return true;
  }

  /**
   * Retorna a empresa onde o usuário atua como Admin ou Atendente
   */
  public getUserCompany(rawPhone?: string): CompanyTransportadora | null {
    if (!rawPhone) return null;
    const clean = rawPhone.replace(/\D/g, '');
    for (const comp of this.companies.values()) {
      if (comp.adminPhones?.includes(clean) || comp.attendantPhones?.includes(clean) || comp.cleanPhone === clean) {
        return comp;
      }
    }
    return null;
  }

  /**
   * Retorna as empresas das quais o motoboy pode receber pedidos
   */
  public getCompaniesForMotoboy(rawPhone?: string): CompanyTransportadora[] {
    if (!rawPhone) return [];
    const clean = rawPhone.replace(/\D/g, '');
    return Array.from(this.companies.values()).filter(c => c.motoboyPhones?.includes(clean));
  }

  /**
   * Filtro de Acesso aos Pedidos (Ordens)
   * Regras:
   * 1. Master Admin (62996157340) enxerga tudo.
   * 2. Locais físicos (POIs do mapa sem operação de frete) estão disponíveis para TODOS.
   * 3. Se for motoboy: enxerga pedidos das empresas que o autorizaram.
   * 4. Se for admin de transportadora ou atendente: enxerga somente pedidos da sua empresa.
   */
  public canUserAccessPlace(place: Place, userPhone?: string, userRole?: string): boolean {
    if (!place.operationType) {
      return true;
    }

    if (this.isMasterAdmin(userPhone)) {
      return true;
    }

    if (!userPhone) return true;
    const clean = userPhone.replace(/\D/g, '');

    // Se o pedido não tem empresa associada, fica visível como geral/aberto
    if (!place.companyId) {
      return true;
    }

    if (userRole === 'motorista') {
      if (place.orderVisibility === 'publico') {
        return true;
      }
      const allowedCompanies = this.getCompaniesForMotoboy(clean);
      // Sem empresas restritas cadastradas, o motoboy tem acesso geral
      if (allowedCompanies.length === 0) {
        return true;
      }
      return allowedCompanies.some(c => c.id === place.companyId);
    }

    const userCompany = this.getUserCompany(clean);
    if (userCompany) {
      return userCompany.id === place.companyId;
    }

    return true;
  }

  /**
   * Filtro de Acesso aos Clientes
   * Regras:
   * 1. Master Admin enxerga todos os clientes.
   * 2. Clientes sem empresa vinculada são globais.
   * 3. Empresa enxerga apenas seus próprios clientes cadastrados.
   */
  public canUserAccessCustomer(customer: Customer, userPhone?: string): boolean {
    if (this.isMasterAdmin(userPhone)) {
      return true;
    }

    if (!customer.companyId) {
      return true;
    }

    if (!userPhone) return true;
    const clean = userPhone.replace(/\D/g, '');
    const userCompany = this.getUserCompany(clean);

    if (userCompany) {
      return userCompany.id === customer.companyId;
    }

    return false;
  }
}

export const companyService = new CompanyService();
