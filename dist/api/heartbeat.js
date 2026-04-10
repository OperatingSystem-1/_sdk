export class HeartbeatAPI {
    transport;
    intervalId = null;
    constructor(transport) {
        this.transport = transport;
    }
    /** Send a single heartbeat. */
    async send() {
        return this.transport.post('/api/agents/heartbeat', {});
    }
    /**
     * Start sending heartbeats on an interval.
     * @param intervalMs Default: 30000 (30s). Office-manager considers agent offline after 2 minutes.
     */
    start(intervalMs = 30_000) {
        if (this.intervalId)
            return; // Already running
        // Send immediately, then on interval
        this.send().catch((err) => console.error('[os1] Heartbeat failed:', err.message));
        this.intervalId = setInterval(() => {
            this.send().catch((err) => console.error('[os1] Heartbeat failed:', err.message));
        }, intervalMs);
    }
    /** Stop the heartbeat loop. */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
//# sourceMappingURL=heartbeat.js.map