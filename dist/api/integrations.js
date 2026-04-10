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
     * Report runtime integration status back to office-manager (CLA-519).
     */
    async reportStatus(officeId, agentName, integrationId, status, error) {
        await this.transport.post(`${base(officeId)}/employees/${agentName}/integrations/${integrationId}/status`, { status, ...(error ? { error } : {}) });
    }
}
//# sourceMappingURL=integrations.js.map