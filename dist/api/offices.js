const BASE = '/api/v1/offices';
export class OfficesAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    async list() {
        return this.transport.get(BASE);
    }
    async create(req) {
        return this.transport.post(BASE, req);
    }
    async get(officeId) {
        return this.transport.get(`${BASE}/${officeId}`);
    }
    async status(officeId) {
        return this.transport.get(`${BASE}/${officeId}/status`);
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
    async suspend(officeId) {
        await this.transport.post(`${BASE}/${officeId}/suspend`);
    }
    async resume(officeId) {
        await this.transport.post(`${BASE}/${officeId}/resume`);
    }
}
//# sourceMappingURL=offices.js.map