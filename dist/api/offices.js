const BASE = '/api/v1/offices';
export class OfficesAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    async create(req) {
        return this.transport.post(BASE, req);
    }
    async list() {
        return this.transport.get(BASE);
    }
    async get(officeId) {
        return this.transport.get(`${BASE}/${officeId}`);
    }
    async getSettings(officeId) {
        return this.transport.get(`${BASE}/${officeId}/settings`);
    }
    async updateSettings(officeId, settings) {
        return this.transport.patch(`${BASE}/${officeId}/settings`, settings);
    }
    async delete(officeId) {
        await this.transport.delete(`${BASE}/${officeId}`);
    }
    async status(officeId) {
        return this.transport.get(`${BASE}/${officeId}/status`);
    }
    async kubeconfig(officeId) {
        return this.transport.get(`${BASE}/${officeId}/kubeconfig`);
    }
    async transfer(officeId, newOwnerId) {
        await this.transport.post(`${BASE}/${officeId}/transfer`, { new_owner_id: newOwnerId });
    }
    async rotateSecret(officeId) {
        return this.transport.post(`${BASE}/${officeId}/rotate-secret`);
    }
    async setSecret(officeId, secretName, value) {
        await this.transport.put(`${BASE}/${officeId}/secrets/${secretName}`, { value });
    }
    async suspend(officeId) {
        await this.transport.post(`${BASE}/${officeId}/suspend`);
    }
    async resume(officeId) {
        await this.transport.post(`${BASE}/${officeId}/resume`);
    }
}
//# sourceMappingURL=offices.js.map