export class CloneAPI {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    /**
     * Clone yourself into a new office by redeeming an invite code.
     * Provisions a full K8s pod for the clone in the target office.
     * The clone name is auto-mutated (Red Queen principle) unless overridden.
     */
    async clone(request) {
        return this.transport.post('/api/agents/clone', request);
    }
}
//# sourceMappingURL=clone.js.map