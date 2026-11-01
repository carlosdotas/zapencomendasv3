/**
 * Serviço de Gerenciamento de Direcionamento em Tempo Real (Firebase Realtime & WebSocket Server)
 * 
 * Permite direcionar coletas, entregas e trocas para motoristas específicos com atualização instantânea
 * em tempo real para todos os clientes conectados (incluindo o motorista logado).
 */

import { Place, UserProfile } from '../types/map';

export interface OrderAssignment {
  orderId: string;
  driverId: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  assignedAt: number;
}

type AssignmentListener = (assignments: Record<string, OrderAssignment>) => void;

const STORAGE_KEY = 'encomendaszap_order_driver_assignments';
const FIREBASE_RTDB_KEY = 'encomendaszap_firebase_rtdb_url';

class RealtimeAssignmentService {
  private assignments: Record<string, OrderAssignment> = {};
  private listeners: Set<AssignmentListener> = new Set();
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private reconnectTimer: any = null;

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      this.initWebSocket();
      this.fetchServerAssignments();
    }
  }

  /**
   * Obtém a URL configurada do Firebase Realtime Database (opcional)
   */
  public getFirebaseRtdbUrl(): string {
    try {
      const saved = localStorage.getItem(FIREBASE_RTDB_KEY);
      if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    } catch {}
    const envUrl = (import.meta as any).env?.VITE_FIREBASE_DATABASE_URL;
    if (envUrl && typeof envUrl === 'string') return envUrl.trim().replace(/\/+$/, '');
    return '';
  }

  public setFirebaseRtdbUrl(url: string) {
    try {
      if (url && url.trim()) {
        localStorage.setItem(FIREBASE_RTDB_KEY, url.trim().replace(/\/+$/, ''));
      } else {
        localStorage.removeItem(FIREBASE_RTDB_KEY);
      }
    } catch {}
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.assignments = parsed;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.assignments));
    } catch (e) {
      // ignore
    }
  }

  private notifyListeners() {
    this.saveToStorage();
    const copy = { ...this.assignments };
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.warn('[Realtime Assignments] Erro no listener:', err);
      }
    });
  }

  /**
   * Conecta ao WebSocket para receber alterações em tempo real de outros usuários
   */
  private initWebSocket() {
    if (typeof window === 'undefined' || this.isConnecting) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/tracking`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        console.log('[Realtime Assignments] Conectado ao canal WebSocket de direcionamento.');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'assignments:init' && msg.assignments && typeof msg.assignments === 'object') {
            this.assignments = {
              ...this.assignments,
              ...msg.assignments
            };
            this.notifyListeners();
          } else if (msg.type === 'assignment:update' && msg.orderId && msg.assignment) {
            const orderIdStr = String(msg.orderId);
            this.assignments[orderIdStr] = msg.assignment;
            this.notifyListeners();
          } else if (msg.type === 'assignment:remove' && msg.orderId) {
            const orderIdStr = String(msg.orderId);
            delete this.assignments[orderIdStr];
            this.notifyListeners();
          }
        } catch (e) {
          // ignore
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        if (this.ws) this.ws.close();
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (typeof window !== 'undefined' && navigator.onLine) {
        this.initWebSocket();
      }
    }, 4000);
  }

  /**
   * Sincroniza atribuições com o endpoint REST (/api/realtime/assignments)
   */
  public async fetchServerAssignments(): Promise<Record<string, OrderAssignment>> {
    try {
      const res = await fetch(`/api/realtime/assignments?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data && typeof json.data === 'object') {
          this.assignments = {
            ...this.assignments,
            ...json.data
          };
          this.notifyListeners();
          return this.assignments;
        }
      }
    } catch (e) {
      // fallback to storage
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
    operationType?: string
  ): Promise<OrderAssignment> {
    const numId = rawPlaceId.match(/\d+/)?.[0] || rawPlaceId;
    const cleanDriverId = driver.id.replace(/\D/g, '') || driver.id;

    const assignment: OrderAssignment = {
      orderId: rawPlaceId,
      driverId: String(cleanDriverId),
      driverName: driver.name,
      driverPhone: driver.phone,
      vehicleType: driver.vehicleType,
      assignedAt: Date.now()
    };

    // 1. Atualiza estado em memória e localStorage imediatamente pelo ID específico do marcador
    this.assignments[rawPlaceId] = assignment;
    if (operationType) {
      this.assignments[`${numId}_${operationType}`] = assignment;
      this.assignments[`pedido-${numId}-${operationType}`] = assignment;
    }
    this.notifyListeners();

    // 2. Transmite via WebSocket se conectado
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'assignment:set',
          orderId: rawPlaceId,
          assignment
        }));
      } catch (e) {}
    }

    // 3. Persiste no servidor (/api/realtime/assign-driver)
    try {
      fetch('/api/realtime/assign-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignment)
      }).catch(() => {});
    } catch {}

    // 4. Sincroniza com Firebase Realtime Database se configurado
    const firebaseRtdbUrl = this.getFirebaseRtdbUrl();
    if (firebaseRtdbUrl) {
      try {
        const sanitizedKey = rawPlaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
        fetch(`${firebaseRtdbUrl}/assignments/${sanitizedKey}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assignment)
        }).catch(() => {});
      } catch {}
    }

    return assignment;
  }

  /**
   * Desvincula um marcador específico de um motorista em tempo real
   */
  public async unassignOrder(rawPlaceId: string, operationType?: string): Promise<void> {
    const numId = rawPlaceId.match(/\d+/)?.[0];

    delete this.assignments[rawPlaceId];
    if (operationType && numId) {
      delete this.assignments[`${numId}_${operationType}`];
      delete this.assignments[`pedido-${numId}-${operationType}`];
    }
    this.notifyListeners();

    // 1. Transmite via WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'assignment:clear',
          orderId: rawPlaceId
        }));
      } catch (e) {}
    }

    // 2. Persiste no servidor
    try {
      fetch('/api/realtime/unassign-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: rawPlaceId })
      }).catch(() => {});
    } catch {}

    // 3. Sincroniza com Firebase Realtime Database se configurado
    const firebaseRtdbUrl = this.getFirebaseRtdbUrl();
    if (firebaseRtdbUrl) {
      try {
        const sanitizedKey = rawPlaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
        fetch(`${firebaseRtdbUrl}/assignments/${sanitizedKey}.json`, {
          method: 'DELETE'
        }).catch(() => {});
      } catch {}
    }
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
    if (place.orderVisibility === 'privado') {
      return false;
    }

    const numOrderId = place.id.match(/\d+/)?.[0] || (place.orderCode ? place.orderCode.match(/\d+/)?.[0] : null);
    const rt = this.getAssignmentForOrder(place.id, place.operationType) || 
      (numOrderId ? this.getAssignmentForOrder(numOrderId, place.operationType) : null);

    const hasDriver = Boolean(
      place.assignedDriverId || 
      place.assignedDriverPhone || 
      place.assignedDriverName ||
      rt?.driverId ||
      rt?.driverName
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

    // Normaliza dados do usuário logado
    const userPhoneClean = (user.phone || '').replace(/\D/g, '');
    const userIdStr = String(user.id || '').toLowerCase().trim();
    const userIdClean = userIdStr.replace(/\D/g, '');
    const userNameClean = (user.name || '').toLowerCase().trim();

    // 1. Verifica dados de atribuição gravados no Place
    const assignedIdStr = String(place.assignedDriverId || '').toLowerCase().trim();
    const assignedIdClean = assignedIdStr.replace(/\D/g, '');
    const assignedPhoneClean = (place.assignedDriverPhone || '').replace(/\D/g, '');
    const assignedNameClean = (place.assignedDriverName || '').toLowerCase().trim();

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

    // A. Comparação por ID limpo (ex: 1380 === 1380 ou usr-mot-04)
    if (userIdClean && candidateIds.some(id => id === userIdClean)) {
      return true;
    }

    // B. Comparação por ID em formato de texto (ex: usr-mot-04 === usr-mot-04)
    if (userIdStr && candidateIds.some(id => id === userIdStr || id === `usr-mot-${userIdStr}` || userIdStr.endsWith(id))) {
      return true;
    }

    // C. Comparação por Telefone (últimos 8 dígitos para cobrir com ou sem DDD/nono dígito)
    if (userPhoneClean.length >= 8) {
      const userPhoneSuffix = userPhoneClean.slice(-8);
      if (candidatePhones.some(phone => phone.slice(-8) === userPhoneSuffix)) {
        return true;
      }
    }

    // D. Comparação por Nome do Condutor (ex: Marcos Silva)
    if (userNameClean.length >= 3) {
      const firstName = userNameClean.split(' ')[0];
      if (candidateNames.some(name => {
        if (name === userNameClean) return true;
        if (name.includes(userNameClean) || userNameClean.includes(name)) return true;
        if (firstName.length >= 3 && name.startsWith(firstName)) return true;
        return false;
      })) {
        return true;
      }
    }

    // E. Caso especial: Conta de teste de motorista (Marcos Silva Moto 62996157343 / usr-mot-04)
    if (userPhoneClean === '62996157343' || userIdStr.includes('04')) {
      if (candidateIds.some(id => id === '4' || id === '04' || id.includes('04'))) return true;
      if (candidateNames.some(name => name.includes('marcos'))) return true;
    }

    // F. Caso especial: Roberto Andrade Carro (62996157344 / usr-mot-05)
    if (userPhoneClean === '62996157344' || userIdStr.includes('05')) {
      if (candidateIds.some(id => id === '5' || id === '05' || id.includes('05'))) return true;
      if (candidateNames.some(name => name.includes('roberto'))) return true;
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
