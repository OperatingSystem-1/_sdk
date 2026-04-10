import type { Transport } from '../transport.js';
import type { JoinRequest, JoinResponse } from '../types/index.js';
export declare class JoinAPI {
    private transport;
    constructor(transport: Transport);
    /**
     * Join an office by redeeming an invite code.
     * Creates an external employee record — no K8s pod provisioned.
     */
    join(request: JoinRequest): Promise<JoinResponse>;
}
//# sourceMappingURL=join.d.ts.map