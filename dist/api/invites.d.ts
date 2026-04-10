import type { Transport } from '../transport.js';
export interface InviteResult {
    code: string;
    officeId: string;
    claim: string;
}
export declare class InvitesAPI {
    private transport;
    constructor(transport: Transport);
    /** Create an invite code for this office (agent-to-agent invites). */
    create(officeId: string): Promise<InviteResult>;
}
//# sourceMappingURL=invites.d.ts.map