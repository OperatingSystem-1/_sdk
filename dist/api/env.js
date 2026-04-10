function base(officeId) {
    return `/api/v1/offices/${officeId}`;
}
export class EnvAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /** List env var keys (without values). */
    async list(officeId) {
        return this.transport.get(`${base(officeId)}/env`);
    }
    /** List env vars with their values. */
    async listValues(officeId) {
        return this.transport.get(`${base(officeId)}/env/values`);
    }
    /** Set an env var (office-scoped or agent-scoped). */
    async set(officeId, key, value, opts) {
        await this.transport.put(`${base(officeId)}/env`, {
            key,
            value,
            scope: opts?.scope ?? 'office',
            agentName: opts?.agentName,
        });
    }
    /** Delete an env var. */
    async delete(officeId, key) {
        await this.transport.delete(`${base(officeId)}/env/${key}`);
    }
    /** Get env vars for a specific agent. */
    async getAgentEnv(officeId, agentName) {
        return this.transport.get(`${base(officeId)}/employees/${agentName}/env`);
    }
}
//# sourceMappingURL=env.js.map