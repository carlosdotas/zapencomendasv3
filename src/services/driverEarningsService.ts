import { request } from './httpClient';

export interface DriverEarningRow {
  id: number;
  driver_key: string;
  day: string;
  order_key: string;
  operation?: string | null;
  label?: string | null;
  address?: string | null;
  status: 'aceito' | 'coletado';
  price: number;
}

export interface SaveDriverEarningInput {
  driverId: string;
  day: string;
  orderKey: string;
  price: number;
  status: 'aceito' | 'coletado';
  operation?: string;
  label?: string;
  address?: string;
}

export const driverEarningsService = {
  async list(driverId: string, day: string): Promise<DriverEarningRow[]> {
    const res = await request<DriverEarningRow[]>('/api/driver-earnings/list', 'POST', { driver_id: driverId, day });
    return res.success && Array.isArray(res.data) ? res.data : [];
  },

  async save(input: SaveDriverEarningInput): Promise<boolean> {
    const res = await request('/api/driver-earnings/save', 'POST', {
      driver_id: input.driverId,
      day: input.day,
      order_key: input.orderKey,
      price: input.price,
      status: input.status,
      operation: input.operation,
      label: input.label,
      address: input.address
    });
    return Boolean(res.success);
  }
};
