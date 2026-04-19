import type { Transport } from '../transport.js';
import type { AgentIntegrationsResponse, IntegrationCredentials, ModelInfo, OfficeIntegration } from '../types/index.js';
export declare class IntegrationsAPI {
    private transport;
    constructor(transport: Transport);
    /**
     * List integrations for an office with agent-facing metadata (channels/env vars/etc).
     * Uses the dashboard API since that is the source of truth for the integration registry.
     */
    listOffice(officeId: string): Promise<OfficeIntegration[]>;
    listModels(officeId: string): Promise<ModelInfo[]>;
    setSecret(officeId: string, integrationId: string, key: string): Promise<void>;
    deleteSecret(officeId: string, integrationId: string): Promise<void>;
    toggleAgent(officeId: string, integrationId: string, agentName: string, enabled: boolean): Promise<void>;
    /**
     * Poll agent-specific integration state (CLA-519).
     * Returns null if nothing changed since the given rev (304 Not Modified).
     */
    myIntegrations(officeId: string, agentName: string, rev?: number): Promise<AgentIntegrationsResponse | null>;
    /**
     * Fetch actual integration credentials (env var values) for this agent.
     * Remote agents use this to get the same credentials pod-based agents
     * receive via envFrom mounts. Requires secp256k1 authentication.
     */
    getCredentials(officeId: string, agentName: string): Promise<IntegrationCredentials>;
    /**
     * Report runtime integration status back to office-manager (CLA-519).
     */
    reportStatus(officeId: string, agentName: string, integrationId: string, status: string, error?: string): Promise<void>;
}
//# sourceMappingURL=integrations.d.ts.map