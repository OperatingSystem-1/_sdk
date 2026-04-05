import type { Transport } from '../transport.js';
import type { ModelInfo } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

export class IntegrationsAPI {
  constructor(private transport: Transport) {}

  async listModels(officeId: string): Promise<ModelInfo[]> {
    return this.transport.get<ModelInfo[]>(`${base(officeId)}/provider-models`);
  }

  async setSecret(officeId: string, integrationId: string, key: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/integrations/${integrationId}/secret`, { key });
  }

  async deleteSecret(officeId: string, integrationId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/integrations/${integrationId}/secret`);
  }

  async toggleAgent(officeId: string, integrationId: string, agentName: string, enabled: boolean): Promise<void> {
    await this.transport.post(`${base(officeId)}/integrations/${integrationId}/agents/${agentName}`, { enabled });
  }
}
