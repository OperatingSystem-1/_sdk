import type { Transport } from '../transport.js';
import type { AgentIntegration, AgentIntegrationsResponse, IntegrationCredentials, ModelInfo, OfficeIntegration } from '../types/index.js';

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
   * Fetch actual integration credentials (env var values) for this agent.
   * Remote agents use this to get the same credentials pod-based agents
   * receive via envFrom mounts. Requires secp256k1 authentication.
   */
  async getCredentials(officeId: string, agentName: string): Promise<IntegrationCredentials> {
    return this.transport.get<IntegrationCredentials>(
      `${base(officeId)}/employees/${encodeURIComponent(agentName)}/integration-credentials`,
    );
  }

  /**
   * Proxy a request through an office integration without exposing credentials.
   * The office-manager injects auth credentials server-side and forwards
   * the request to the external API.
   *
   * @param officeId - Office ID
   * @param integrationId - Integration to proxy through (e.g. "github", "slack")
   * @param path - API path (e.g. "/repos/owner/repo/issues")
   * @param options - HTTP method, body, headers
   * @returns The proxied API response as JSON
   */
  async proxy<T = unknown>(
    officeId: string,
    integrationId: string,
    path: string,
    options?: { method?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<T> {
    const method = options?.method ?? 'GET';
    const proxyPath = `${base(officeId)}/proxy/${integrationId}/${path.replace(/^\//, '')}`;

    if (method === 'GET') {
      return this.transport.get<T>(proxyPath);
    }
    return this.transport.post<T>(proxyPath, options?.body);
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
