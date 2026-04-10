import type { Transport } from '../transport.js';
export declare class HeartbeatAPI {
    private transport;
    private intervalId;
    constructor(transport: Transport);
    /** Send a single heartbeat. */
    send(): Promise<{
        ok: boolean;
    }>;
    /**
     * Start sending heartbeats on an interval.
     * @param intervalMs Default: 30000 (30s). Office-manager considers agent offline after 2 minutes.
     */
    start(intervalMs?: number): void;
    /** Stop the heartbeat loop. */
    stop(): void;
}
//# sourceMappingURL=heartbeat.d.ts.map