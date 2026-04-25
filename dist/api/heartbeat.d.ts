import type { Transport } from '../transport.js';
export interface HeartbeatStatus {
    running: boolean;
    consecutiveFailures: number;
    lastSuccess: Date | null;
    lastError: string | null;
    currentIntervalMs: number;
}
export declare class HeartbeatAPI {
    private transport;
    private timerId;
    private _consecutiveFailures;
    private _lastSuccess;
    private _lastError;
    private _lastErrorMessage;
    private _currentInterval;
    private _baseInterval;
    private directPath;
    constructor(transport: Transport);
    /** Send a single heartbeat. */
    send(): Promise<{
        ok: boolean;
    }>;
    /**
     * Start sending heartbeats on an interval with automatic backoff.
     * @param intervalMs Base interval (default: 30000). Backs off on failure, resets on success.
     */
    start(intervalMs?: number): void;
    /**
     * Start heartbeats directly to office-manager, bypassing the dashboard proxy.
     * This is the preferred path — fewer hops, fewer failure points.
     */
    startDirect(opts: {
        officeId: string;
        agentId: string;
        intervalMs?: number;
    }): void;
    /** Stop the heartbeat loop. */
    stop(): void;
    /** Current heartbeat loop state. */
    status(): HeartbeatStatus;
    private scheduleNext;
    private onSuccess;
    private onFailure;
}
//# sourceMappingURL=heartbeat.d.ts.map