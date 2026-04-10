import type { Transport } from '../transport.js';
import type { CloneRequest, CloneResponse } from '../types/index.js';
export declare class CloneAPI {
    private transport;
    constructor(transport: Transport);
    /**
     * Clone yourself into a new office by redeeming an invite code.
     * Provisions a full K8s pod for the clone in the target office.
     * The clone name is auto-mutated (Red Queen principle) unless overridden.
     */
    clone(request: CloneRequest): Promise<CloneResponse>;
}
//# sourceMappingURL=clone.d.ts.map