/**
 * Serviço de Gerenciamento de Direcionamento em Tempo Real (API REST /api/realtime com polling)
 * 
 * Permite direcionar coletas, entregas e trocas para motoristas específicos, mantendo
 * todos os clientes conectados (incluindo o motorista logado) atualizados periodicamente.
 */

import { Place, UserProfile, OperationType } from '../types/map';
import { request, startPolling } from './httpClient';

const POLL_INTERVAL_MS = 10000;

export interface OrderAssignment {
  orderId: string;
  driverId: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  assignedAt: number;
  enRoute?: boolean;
  acceptedByDriver?: boolean;
}

type AssignmentListener = (assignments: Record<string, OrderAssignment>) => void;

class RealtimeAssignmentService {
  private assignments: Record<string, OrderAssignment> = {};
  private listeners: Set<AssignmentListener> = new Set();
  private stopPolling: (() => void) | null = null;

  constructor() {
    this.stopPolling = startPolling(async () => {
      await this.fetchServerAssignments();
    }, POLL_INTERVAL_MS);
  }

  private notifyListeners() {
    const copy = { ...this.assignments };
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.warn('[Realtime Assignments] Erro no listener:', err);
      }
    });
  }

  public async fetchServerAssignments(): Promise<Record<string, OrderAssignment>> {
    const res = await request<Record<string, OrderAssignment>>('/api/realtime/assignments', 'GET');
    if (res.success && res.data) {
      const nextData = res.data;
      const prevKeys = Object.keys(this.assignments);
      const nextKeys = Object.keys(nextData);
      let changed = prevKeys.length !== nextKeys.length;
      if (!changed) {
        for (const k of nextKeys) {
          const a = this.assignments[k];
          const b = nextData[k];
          if (!a || a.driverId !== b.driverId || a.driverName !== b.driverName || Boolean(a.enRoute) !== Boolean(b.enRoute) || Boolean(a.acceptedByDriver) !== Boolean(b.acceptedByDriver)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        this.assignments = nextData;
        this.notifyListeners();
      }
    } else if (!res.success) {
      console.warn('[Realtime Assignments] Falha ao consultar atribuições:', res.message);
    }
    return this.assignments;
  }

  /**
   * Retorna todas as atribuições atuais
   */
  public getAllAssignments(): Record<string, OrderAssignment> {
    return { ...this.assignments };
  }

  /**
   * Retorna a atribuição de uma encomenda pelo ID (específico da maker ou numérico)
   */
  public getAssignmentForOrder(orderId: string, operationType?: string): OrderAssignment | null {
    if (operationType) {
      const numId = orderId.match(/\d+/)?.[0];
      const byOp = this.assignments[`${orderId}_${operationType}`] || 
                   this.assignments[`pedido-${numId}-${operationType}`] || 
                   (numId ? this.assignments[`${numId}_${operationType}`] : null);
      if (byOp) return byOp;
    }

    return this.assignments[orderId] || null;
  }

  /**
   * Direciona um marcador específico (coleta ou entrega) para um motorista em tempo real
   */
  public async assignOrder(
    rawPlaceId: string, 
    driver: { id: string; name?: string; phone?: string; vehicleType?: string },
    operationType?: string,
    acceptedByDriver = false
  ): Promise<OrderAssignment> {
    const numId = rawPlaceId.match(/\d+/)?.[0] || rawPlaceId;
    const cleanDriverId = driver.id.replace(/\D/g, '') || driver.id;
    const confirmedClaim = this.getAssignmentForOrder(rawPlaceId, operationType);
    if (
      acceptedByDriver &&
      confirmedClaim?.acceptedByDriver &&
      confirmedClaim.driverId === String(cleanDriverId)
    ) {
      return confirmedClaim;
    }

    const assignment: OrderAssignment = {
      orderId: rawPlaceId,
      driverId: String(cleanDriverId),
      driverName: driver.name,
      driverPhone: driver.phone,
      vehicleType: driver.vehicleType,
      assignedAt: Date.now(),
      acceptedByDriver
    };

    // Atualiza o estado em memória e grava as chaves do pedido no servidor.
    this.assignments[rawPlaceId] = assignment;
    const assignmentKeys = [rawPlaceId];
    if (operationType) {
      const byOperationKey = `${numId}_${operationType}`;
      const legacyOperationKey = `pedido-${numId}-${operationType}`;
      this.assignments[byOperationKey] = assignment;
      this.assignments[legacyOperationKey] = assignment;
      assignmentKeys.push(byOperationKey, legacyOperationKey);
    }
    this.notifyListeners();
    const results = await Promise.all(assignmentKeys.map(key =>
      request('/api/realtime/assign-driver', 'POST', {
        orderId: key,
        driverId: assignment.driverId,
        driverName: assignment.driverName,
        driverPhone: assignment.driverPhone,
        vehicleType: assignment.vehicleType,
        claim: acceptedByDriver
      })
    ));
    const failed = results.find(r => !r.success);
    if (failed) throw new Error(failed.message || 'Não foi possível direcionar o pedido ao motorista.');

    return assignment;
  }

  /**
   * Aceite de pedido público: o servidor recusa se outro motorista já aceitou.
   * Retorna false (e ressincroniza as atribuições) quando perdeu a disputa.
   */
  public async claimOrder(
    rawPlaceId: string,
    driver: { id: string; name?: string; phone?: string; vehicleType?: string },
    operationType?: string
  ): Promise<boolean> {
    const numId = rawPlaceId.match(/\d+/)?.[0] || rawPlaceId;
    const cleanDriverId = driver.id.replace(/\D/g, '') || driver.id;
    const keys = [operationType ? `${numId}_${operationType}` : rawPlaceId];

    const results = await Promise.all(keys.map(key =>
      request('/api/realtime/assign-driver', 'POST', {
        orderId: key,
        driverId: String(cleanDriverId),
        driverName: driver.name,
        driverPhone: driver.phone,
        vehicleType: driver.vehicleType,
        claim: true
      })
    ));
    if (results.some(r => !r.success)) {
      await this.fetchServerAssignments().catch(() => {});
      return false;
    }
    const key = keys[0];
    this.assignments[key] = {
      orderId: key,
      driverId: String(cleanDriverId),
      driverName: driver.name,
      driverPhone: driver.phone,
      vehicleType: driver.vehicleType,
      assignedAt: Date.now(),
      acceptedByDriver: true
    };
    this.notifyListeners();
    return true;
  }

  /**
   * Marca que o motorista iniciou o deslocamento (clicou no GPS) até o local do pedido
   */
  public async markEnRoute(rawPlaceId: string, operationType?: string, enRoute = true): Promise<void> {
    const numId = rawPlaceId.match(/\d+/)?.[0];
    const keys = [rawPlaceId];
    if (operationType && numId) keys.push(`${numId}_${operationType}`, `pedido-${numId}-${operationType}`);

    let changed = false;
    keys.forEach(key => {
      const current = this.assignments[key];
      if (current && Boolean(current.enRoute) !== enRoute) {
        this.assignments[key] = { ...current, enRoute };
        changed = true;
      }
    });
    if (changed) this.notifyListeners();
    await request('/api/realtime/en-route', 'POST', { orderIds: keys, enRoute });
  }

  /**
   * Desvincula um marcador específico de um motorista em tempo real
   */
  public async unassignOrder(rawPlaceId: string, operationType?: string): Promise<void> {
    const numId = rawPlaceId.match(/\d+/)?.[0];

    const assignmentKeys = [rawPlaceId];
    delete this.assignments[rawPlaceId];
    if (operationType && numId) {
      const byOperationKey = `${numId}_${operationType}`;
      const legacyOperationKey = `pedido-${numId}-${operationType}`;
      delete this.assignments[byOperationKey];
      delete this.assignments[legacyOperationKey];
      assignmentKeys.push(byOperationKey, legacyOperationKey);
    }
    this.notifyListeners();
    await Promise.all(assignmentKeys.map(key =>
      request('/api/realtime/unassign-driver', 'POST', { orderId: key })
    ));
  }

  public async declineClaimedOrder(
    orderId: string | number,
    operation: OperationType,
    reason: string
  ): Promise<{ success: boolean; message?: string }> {
    const res = await request('/api/realtime/decline-order', 'POST', {
      orderId: String(orderId),
      operation,
      reason
    });
    if (!res.success) return { success: false, message: res.message };

    const numericId = String(orderId).replace(/\D/g, '');
    for (const key of Object.keys(this.assignments)) {
      const keyId = key.match(/\d+/)?.[0];
      const keyOperation = key.match(/(?:^|[-_])(coleta|troca|entrega|retorno)$/i)?.[1]?.toLowerCase();
      if (keyId === numericId && keyOperation === operation) delete this.assignments[key];
    }
    this.notifyListeners();
    return { success: true };
  }

  /**
   * Assina atualizações em tempo real
   */
  public subscribe(listener: AssignmentListener): () => void {
    this.listeners.add(listener);
    // Dispara estado inicial
    listener({ ...this.assignments });
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Verifica se um pedido é PÚBLICO (aberto para qualquer motorista confirmar e assumir)
   * Um pedido é público se:
   * 1. Está explicitamente marcado como 'publico' E ainda não tem motorista atribuído; OU
   * 2. Não possui motorista atribuído e não está marcado como 'privado'.
   */
  public isPublicOrder(place: Place): boolean {
    if (place.collectionRestricted) return false;
    if (place.orderVisibility === 'privado') {
      return false;
    }
    const op = place.operationType || 'entrega';
    if (op === 'coleta' && place.pickupVisibility === 'privado') return false;
    if (op === 'entrega' && place.deliveryVisibility === 'privado') return false;
    if (op === 'troca' && place.exchangeVisibility === 'privado') return false;
    if (place.acceptedByDriver) return false;

    const numOrderId = place.id.match(/\d+/)?.[0] || (place.orderCode ? place.orderCode.match(/\d+/)?.[0] : null);
    const rt = this.getAssignmentForOrder(place.id, place.operationType) || 
      (numOrderId ? this.getAssignmentForOrder(numOrderId, place.operationType) : null);

    const hasDriver = Boolean(
      place.assignedDriverId || 
      place.assignedDriverPhone || 
      place.assignedDriverName ||
      (op === 'coleta' && (place.pickupAssignedDriverId || place.pickupAssignedDriverPhone || place.pickupAssignedDriverName)) ||
      (op === 'entrega' && (place.deliveryAssignedDriverId || place.deliveryAssignedDriverPhone || place.deliveryAssignedDriverName)) ||
      (op === 'troca' && (place.exchangeAssignedDriverId || place.exchangeAssignedDriverPhone || place.exchangeAssignedDriverName)) ||
      rt?.driverId ||
      rt?.driverName ||
      rt?.acceptedByDriver
    );

    if (hasDriver) {
      return false;
    }

    return true;
  }

  /**
   * Verifica se um ponto foi atribuído diretamente ao motorista informado
   */
  public isDirectlyAssignedToUser(place: Place, user?: UserProfile | null): boolean {
    if (!user) return false;
    if (place.collectionRestricted) {
      return Boolean(place.collectionOwnerId && String(user.id || '').trim() === place.collectionOwnerId);
    }

    const op = place.operationType || 'entrega';
    const pointDriverId = op === 'coleta' ? place.pickupAssignedDriverId : op === 'troca' ? place.exchangeAssignedDriverId : place.deliveryAssignedDriverId;
    const pointDriverPhone = op === 'coleta' ? place.pickupAssignedDriverPhone : op === 'troca' ? place.exchangeAssignedDriverPhone : place.deliveryAssignedDriverPhone;
    const pointDriverName = op === 'coleta' ? place.pickupAssignedDriverName : op === 'troca' ? place.exchangeAssignedDriverName : place.deliveryAssignedDriverName;

    // Normaliza dados do usuário logado
    const userPhoneClean = (user.phone || '').replace(/\D/g, '');
    const userIdStr = String(user.id || '').toLowerCase().trim();
    const userIdClean = userIdStr.replace(/\D/g, '');
    const userNameClean = (user.name || '').toLowerCase().trim();

    // 1. Verifica dados de atribuição gravados no Place
    const assignedIdStr = String(pointDriverId || place.assignedDriverId || '').toLowerCase().trim();
    const assignedIdClean = assignedIdStr.replace(/\D/g, '');
    const assignedPhoneClean = (pointDriverPhone || place.assignedDriverPhone || '').replace(/\D/g, '');
    const assignedNameClean = (pointDriverName || place.assignedDriverName || '').toLowerCase().trim();

    // 2. Verifica dados gravados no Realtime Assignments Store
    const numOrderId = place.id.match(/\d+/)?.[0] || (place.orderCode ? place.orderCode.match(/\d+/)?.[0] : null);
    const realtimeAssignment = this.getAssignmentForOrder(place.id, place.operationType) || 
      (numOrderId ? this.getAssignmentForOrder(numOrderId, place.operationType) : null);

    const rtDriverIdStr = String(realtimeAssignment?.driverId || '').toLowerCase().trim();
    const rtDriverIdClean = rtDriverIdStr.replace(/\D/g, '');
    const rtPhoneClean = (realtimeAssignment?.driverPhone || '').replace(/\D/g, '');
    const rtNameClean = (realtimeAssignment?.driverName || '').toLowerCase().trim();

    const candidateIds = [assignedIdClean, assignedIdStr, rtDriverIdClean, rtDriverIdStr].filter(Boolean);
    const candidatePhones = [assignedPhoneClean, rtPhoneClean].filter(Boolean);
    const candidateNames = [assignedNameClean, rtNameClean].filter(Boolean);

    // Se não há nenhum motorista atribuído, não é diretamente atribuído a este usuário
    if (candidateIds.length === 0 && candidatePhones.length === 0 && candidateNames.length === 0) {
      return false;
    }

    // Comparação estrita: ID exato, telefone (últimos 8 dígitos) ou nome completo idêntico
    if (userIdClean && candidateIds.some(id => id === userIdClean)) {
      return true;
    }

    if (userIdStr && candidateIds.some(id => id === userIdStr || id === `usr-mot-${userIdStr}`)) {
      return true;
    }

    if (userPhoneClean.length >= 8) {
      const userPhoneSuffix = userPhoneClean.slice(-8);
      if (candidatePhones.some(phone => phone.length >= 8 && phone.slice(-8) === userPhoneSuffix)) {
        return true;
      }
    }

    // Nome só vale quando o pedido não traz ID nem telefone do motorista
    if (candidateIds.length === 0 && candidatePhones.length === 0 && userNameClean.length >= 3) {
      return candidateNames.some(name => name === userNameClean);
    }

    return false;
  }

  /**
   * Verifica com precisão se um ponto deve ser visível para o motorista atualmente logado:
   * 1. Se for público: SIM (visível para todos os motoristas pegarem)
   * 2. Se for privado/atribuído: SOMENTE se for atribuído a este motorista
   */
  public isPlaceAssignedToUser(place: Place, user?: UserProfile | null): boolean {
    if (!user) return false;

    // Se o pedido for público (aberto a todos), o motorista PODE ver
    if (this.isPublicOrder(place)) {
      return true;
    }

    // Se já tiver motorista atribuído ou for privado, só vê se for para ele
    return this.isDirectlyAssignedToUser(place, user);
  }
}

export const realtimeAssignmentService = new RealtimeAssignmentService();
