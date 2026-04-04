import type { Transport } from '../transport.js';
import type {
  Office,
  CreateOfficeRequest,
  OfficeSettings,
  OfficeStatus,
} from '../types/index.js';

const BASE = '/api/v1/offices';

export class OfficesAPI {
  constructor(private transport: Transport) {}

  async create(req: CreateOfficeRequest): Promise<Office> {
    return this.transport.post<Office>(BASE, req);
  }

  async list(): Promise<Office[]> {
    return this.transport.get<Office[]>(BASE);
  }

  async getSettings(officeId: string): Promise<OfficeSettings> {
    return this.transport.get<OfficeSettings>(`${BASE}/${officeId}/settings`);
  }

  async updateSettings(officeId: string, settings: Partial<OfficeSettings>): Promise<OfficeSettings> {
    return this.transport.patch<OfficeSettings>(`${BASE}/${officeId}/settings`, settings);
  }

  async delete(officeId: string): Promise<void> {
    await this.transport.delete(`${BASE}/${officeId}`);
  }

  async status(officeId: string): Promise<OfficeStatus> {
    return this.transport.get<OfficeStatus>(`${BASE}/${officeId}/status`);
  }

  async kubeconfig(officeId: string): Promise<string> {
    return this.transport.get<string>(`${BASE}/${officeId}/kubeconfig`);
  }

  async transfer(officeId: string, newOwnerId: string): Promise<void> {
    await this.transport.post(`${BASE}/${officeId}/transfer`, { new_owner_id: newOwnerId });
  }

  async rotateSecret(officeId: string): Promise<{ secret: string }> {
    return this.transport.post<{ secret: string }>(`${BASE}/${officeId}/rotate-secret`);
  }

  async setSecret(officeId: string, secretName: string, value: string): Promise<void> {
    await this.transport.put(`${BASE}/${officeId}/secrets/${secretName}`, { value });
  }

  async suspend(officeId: string): Promise<void> {
    await this.transport.post(`${BASE}/${officeId}/suspend`);
  }

  async resume(officeId: string): Promise<void> {
    await this.transport.post(`${BASE}/${officeId}/resume`);
  }
}
