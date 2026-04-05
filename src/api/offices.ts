import type { Transport } from '../transport.js';
import type { Office, CreateOfficeRequest, OfficeSettings, ClusterStatus } from '../types/index.js';

const BASE = '/api/v1/offices';

export class OfficesAPI {
  constructor(private transport: Transport) {}

  async list(): Promise<Office[]> {
    return this.transport.get<Office[]>(BASE);
  }

  async create(req: CreateOfficeRequest): Promise<Office> {
    return this.transport.post<Office>(BASE, req);
  }

  async get(officeId: string): Promise<Office> {
    return this.transport.get<Office>(`${BASE}/${officeId}`);
  }

  async status(officeId: string): Promise<ClusterStatus> {
    return this.transport.get<ClusterStatus>(`${BASE}/${officeId}/status`);
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

  async suspend(officeId: string): Promise<void> {
    await this.transport.post(`${BASE}/${officeId}/suspend`);
  }

  async resume(officeId: string): Promise<void> {
    await this.transport.post(`${BASE}/${officeId}/resume`);
  }
}
