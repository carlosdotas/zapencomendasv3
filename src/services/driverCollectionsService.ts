import { request } from './httpClient';

export interface DriverCollection {
  id: string;
  pickupName: string;
  pickupAddress: string;
  customerName: string;
  photo: string;
  collectedAt: string;
}

export function listDriverCollections(driverId: string, page = 1) {
  return request<DriverCollection[]>('/pedidos/coletas_motorista', 'POST', {
    motorista_id: driverId,
    page
  });
}
