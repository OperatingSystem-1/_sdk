import type { Transport } from '../transport.js';
import type { ModelInfo, IntegrationSecret, SetSecretRequest } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

/**
 * Integrations API matching router.go:
 *   GET  /provider-models
 *   POST /integrations/{integrationId}/secret
 *   DELETE /integrations/{integrationId}/secret
 *   POST /integrations/{integrationId}/agents/{agentName}
 *   POST /integrations/claude-code/sync-key
 */
export class IntegrationsAPI {
  constructor(private transport: Transport) {}

  async listProviderModels(officeId: string): Promise<ModelInfo[]> {
    return this.transport.get<ModelInfo[]>(`${base(officeId)}/provider-models`);
  }

  async ensureSecret(officeId: string, integrationId: string, key: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/integrations/${integrationId}/secret`, { key });
  }

  async deleteSecret(officeId: string, integrationId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/integrations/${integrationId}/secret`);
  }

  async toggleAgent(officeId: string, integrationId: string, agentName: string, enabled: boolean): Promise<void> {
    await this.transport.post(`${base(officeId)}/integrations/${integrationId}/agents/${agentName}`, { enabled });
  }

  async syncClaudeCodeKey(officeId: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/integrations/claude-code/sync-key`);
  }
}
