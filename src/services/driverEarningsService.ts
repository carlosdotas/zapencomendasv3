import { request } from './httpClient';

export interface DriverEarningRow {
  id: number;
  driver_key: string;
  day: string;
  order_key: string;
  operation?: string | null;
  label?: string | null;
  place_name?: string | null;
  customer_name?: string | null;
  address?: string | null;
  status: 'aceito' | 'coletado';
  price: number;
  paid?: boolean;
  paid_at?: string | null;
}

export interface DriverEarningsDay {
  day: string;
  accepted: number;
  collected: number;
  total: number;
  paid: boolean;
  paid_at?: string | null;
  items: DriverEarningRow[];
}

export interface SaveDriverEarningInput {
  driverId: string;
  day: string;
  orderKey: string;
  price: number;
  status: 'aceito' | 'coletado';
  operation?: string;
  label?: string;
  placeName?: string;
  customerName?: string;
  address?: string;
}

export const driverEarningsService = {
  async list(driverId: string, day: string): Promise<DriverEarningRow[]> {
    const res = await request<DriverEarningRow[]>('/api/driver-earnings/list', 'POST', { driver_id: driverId, day });
    return res.success && Array.isArray(res.data) ? res.data : [];
  },

  async history(driverId: string, from?: string, to?: string): Promise<DriverEarningsDay[]> {
    const res = await request<DriverEarningsDay[]>('/api/driver-earnings/history', 'POST', { driver_id: driverId, from, to, collected_only: true });
    return res.success && Array.isArray(res.data) ? res.data : [];
  },

  async setDayPaid(driverId: string, day: string, paid: boolean): Promise<boolean> {
    const res = await request('/api/driver-earnings/pay', 'POST', { driver_id: driverId, day, paid });
    return Boolean(res.success);
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
      place_name: input.placeName,
      customer_name: input.customerName,
      address: input.address
    });
    return Boolean(res.success);
  }
};
