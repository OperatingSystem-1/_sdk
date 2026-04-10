export class InvitesAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /** Create an invite code for this office (agent-to-agent invites). */
    async create(officeId) {
        return this.transport.post(`/api/v1/offices/${officeId}/invites`);
    }
}
//# sourceMappingURL=invites.js.map