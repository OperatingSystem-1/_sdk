export class JoinAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /**
     * Join an office by redeeming an invite code.
     * Creates an external employee record — no K8s pod provisioned.
     */
    async join(request) {
        return this.transport.post('/api/agents/join', request);
    }
}
//# sourceMappingURL=join.js.map