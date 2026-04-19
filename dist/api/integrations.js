function base(officeId) {
    return `/api/v1/offices/${officeId}`;
}
export class IntegrationsAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /**
     * List integrations for an office with agent-facing metadata (channels/env vars/etc).
     * Uses the dashboard API since that is the source of truth for the integration registry.
     */
    async listOffice(officeId) {
        return this.transport.get(`/api/offices/${officeId}/integrations`);
    }
    async listModels(officeId) {
        return this.transport.get(`${base(officeId)}/provider-models`);
    }
    async setSecret(officeId, integrationId, key) {
        await this.transport.post(`${base(officeId)}/integrations/${integrationId}/secret`, { key });
    }
    async deleteSecret(officeId, integrationId) {
        await this.transport.delete(`${base(officeId)}/integrations/${integrationId}/secret`);
    }
    async toggleAgent(officeId, integrationId, agentName, enabled) {
        await this.transport.post(`${base(officeId)}/integrations/${integrationId}/agents/${agentName}`, { enabled });
    }
    /**
     * Poll agent-specific integration state (CLA-519).
     * Returns null if nothing changed since the given rev (304 Not Modified).
     */
    async myIntegrations(officeId, agentName, rev) {
        const resp = await this.transport.request('GET', `${base(officeId)}/employees/${agentName}/integrations`, {
            raw: true,
            ...(rev ? { headers: { 'If-None-Match': String(rev) } } : {}),
        });
        if (resp.status === 304)
            return null;
        return resp.json();
    }
    /**
     * Fetch actual integration credentials (env var values) for this agent.
     * Remote agents use this to get the same credentials pod-based agents
     * receive via envFrom mounts. Requires secp256k1 authentication.
     */
    async getCredentials(officeId, agentName) {
        return this.transport.get(`${base(officeId)}/employees/${encodeURIComponent(agentName)}/integration-credentials`);
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
    async proxy(officeId, integrationId, path, options) {
        const method = options?.method ?? 'GET';
        const proxyPath = `${base(officeId)}/proxy/${integrationId}/${path.replace(/^\//, '')}`;
        if (method === 'GET') {
            return this.transport.get(proxyPath);
        }
        return this.transport.post(proxyPath, options?.body);
    }
    /**
     * Report runtime integration status back to office-manager (CLA-519).
     */
    async reportStatus(officeId, agentName, integrationId, status, error) {
        await this.transport.post(`${base(officeId)}/employees/${agentName}/integrations/${integrationId}/status`, { status, ...(error ? { error } : {}) });
    }
}
//# sourceMappingURL=integrations.js.map