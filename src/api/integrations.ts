import type { Transport } from '../transport.js';
import type { ModelInfo, IntegrationSecret, SetSecretRequest } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/integrations`;
}

export class IntegrationsAPI {
  constructor(private transport: Transport) {}

  async listModels(officeId: string): Promise<ModelInfo[]> {
    return this.transport.get<ModelInfo[]>(`${base(officeId)}/models`);
  }

  async listSecrets(officeId: string): Promise<IntegrationSecret[]> {
    return this.transport.get<IntegrationSecret[]>(`${base(officeId)}/secrets`);
  }

  async setSecret(officeId: string, req: SetSecretRequest): Promise<void> {
    await this.transport.post(`${base(officeId)}/secrets`, req);
  }

  async deleteSecret(officeId: string, provider: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/secrets/${provider}`);
  }

  async setAgentToggle(officeId: string, agentId: string, provider: string, enabled: boolean): Promise<void> {
    await this.transport.put(`${base(officeId)}/agent/${agentId}/${provider}`, { enabled });
  }

  async syncClaudeCodeKey(officeId: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/claude-code/sync-key`);
  }
}
