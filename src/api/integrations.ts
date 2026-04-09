import type { Transport } from '../transport.js';
import type { AgentIntegration, AgentIntegrationsResponse, ModelInfo, OfficeIntegration } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

export class IntegrationsAPI {
  constructor(private transport: Transport) {}

  /**
   * List integrations for an office with agent-facing metadata (channels/env vars/etc).
   * Uses the dashboard API since that is the source of truth for the integration registry.
   */
  async listOffice(officeId: string): Promise<OfficeIntegration[]> {
    return this.transport.get<OfficeIntegration[]>(`/api/offices/${officeId}/integrations`);
  }

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

  /**
   * Poll agent-specific integration state (CLA-519).
   * Returns null if nothing changed since the given rev (304 Not Modified).
   */
  async myIntegrations(officeId: string, agentName: string, rev?: number): Promise<AgentIntegrationsResponse | null> {
    const resp = await this.transport.request<Response>('GET',
      `${base(officeId)}/employees/${agentName}/integrations`,
      {
        raw: true,
        ...(rev ? { headers: { 'If-None-Match': String(rev) } } : {}),
      },
    );
    if ((resp as any).status === 304) return null;
    return (resp as any).json() as Promise<AgentIntegrationsResponse>;
  }

  /**
   * Report runtime integration status back to office-manager (CLA-519).
   */
  async reportStatus(officeId: string, agentName: string, integrationId: string, status: string, error?: string): Promise<void> {
    await this.transport.post(
      `${base(officeId)}/employees/${agentName}/integrations/${integrationId}/status`,
      { status, ...(error ? { error } : {}) },
    );
  }
}
