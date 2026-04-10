import type { Transport } from '../transport.js';
import type { EnvVar } from '../types/index.js';
export declare class EnvAPI {
    private transport;
    constructor(transport: Transport);
    /** List env var keys (without values). */
    list(officeId: string): Promise<EnvVar[]>;
    /** List env vars with their values. */
    listValues(officeId: string): Promise<EnvVar[]>;
    /** Set an env var (office-scoped or agent-scoped). */
    set(officeId: string, key: string, value: string, opts?: {
        scope?: 'office' | 'agent';
        agentName?: string;
    }): Promise<void>;
    /** Delete an env var. */
    delete(officeId: string, key: string): Promise<void>;
    /** Get env vars for a specific agent. */
    getAgentEnv(officeId: string, agentName: string): Promise<EnvVar[]>;
}
//# sourceMappingURL=env.d.ts.map