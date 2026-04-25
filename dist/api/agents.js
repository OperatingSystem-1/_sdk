function base(officeId) {
    return `/api/v1/offices/${officeId}/employees`;
}
export class AgentsAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    async hire(officeId, req) {
        return this.transport.post(base(officeId), req);
    }
    async list(officeId) {
        return this.transport.get(base(officeId));
    }
    async get(officeId, name) {
        return this.transport.get(`${base(officeId)}/${name}`);
    }
    async update(officeId, name, req) {
        return this.transport.patch(`${base(officeId)}/${name}`, req);
    }
    async fire(officeId, name) {
        await this.transport.delete(`${base(officeId)}/${name}`);
    }
    async logs(officeId, name, opts) {
        return this.transport.get(`${base(officeId)}/${name}/logs`, {
            tail: opts?.tail,
        });
    }
    async activity(officeId, name, query) {
        return this.transport.get(`${base(officeId)}/${name}/activity`, query);
    }
    async promote(officeId, name, req) {
        return this.transport.post(`${base(officeId)}/${name}/promote`, req);
    }
    async setSkills(officeId, name, req) {
        return this.transport.post(`${base(officeId)}/${name}/skills`, req);
    }
    async archive(officeId, name) {
        await this.transport.post(`${base(officeId)}/${name}/archive`);
    }
    async restore(officeId, name) {
        await this.transport.post(`${base(officeId)}/${name}/restore`);
    }
    async presence(officeId, name) {
        return this.transport.get(`${base(officeId)}/${name}/presence`);
    }
    /** Get the last error for an agent. */
    async lastError(officeId, name) {
        return this.transport.get(`${base(officeId)}/${name}/last-error`);
    }
    /** Stop, start, or restart an agent pod. */
    async lifecycle(officeId, name, action) {
        await this.transport.post(`${base(officeId)}/${name}/lifecycle`, { action });
    }
    /** Rotate agent credentials (signing key + IAM). */
    async rotateCredentials(officeId, name) {
        await this.transport.post(`${base(officeId)}/${name}/credentials/rotate`);
    }
    /**
     * Execute a debug command in another agent's pod (same office only).
     * Cross-office access is rejected by the server.
     */
    async debug(officeId, name, target, command) {
        return this.transport.post(`${base(officeId)}/${name}/debug/${target}`, { command });
    }
}
//# sourceMappingURL=agents.js.map