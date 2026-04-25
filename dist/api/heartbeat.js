const BASE_INTERVAL = 30_000;
const MAX_INTERVAL = 120_000; // Just under the 2-min offline threshold
const AUTH_BACKOFF_MULTIPLIER = 4; // Back off harder on auth errors
export class HeartbeatAPI {
    transport;
    timerId = null;
    _consecutiveFailures = 0;
    _lastSuccess = null;
    _lastError = null;
    _lastErrorMessage = null; // dedup logging
    _currentInterval = BASE_INTERVAL;
    _baseInterval = BASE_INTERVAL;
    directPath = null;
    constructor(transport) {
        this.transport = transport;
    }
    /** Send a single heartbeat. */
    async send() {
        const path = this.directPath || '/api/agents/heartbeat';
        return this.transport.post(path, {});
    }
    /**
     * Start sending heartbeats on an interval with automatic backoff.
     * @param intervalMs Base interval (default: 30000). Backs off on failure, resets on success.
     */
    start(intervalMs = BASE_INTERVAL) {
        if (this.timerId)
            return;
        this._baseInterval = intervalMs;
        this._currentInterval = intervalMs;
        this.scheduleNext(0); // Send immediately
    }
    /**
     * Start heartbeats directly to office-manager, bypassing the dashboard proxy.
     * This is the preferred path — fewer hops, fewer failure points.
     */
    startDirect(opts) {
        this.directPath = `/api/v1/offices/${opts.officeId}/employees/${opts.agentId}/heartbeat`;
        this.start(opts.intervalMs);
    }
    /** Stop the heartbeat loop. */
    stop() {
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }
    /** Current heartbeat loop state. */
    status() {
        return {
            running: this.timerId !== null,
            consecutiveFailures: this._consecutiveFailures,
            lastSuccess: this._lastSuccess,
            lastError: this._lastError,
            currentIntervalMs: this._currentInterval,
        };
    }
    scheduleNext(delayMs) {
        this.timerId = setTimeout(async () => {
            try {
                await this.send();
                this.onSuccess();
            }
            catch (err) {
                this.onFailure(err);
            }
            if (this.timerId !== null) {
                this.scheduleNext(this._currentInterval);
            }
        }, delayMs);
    }
    onSuccess() {
        if (this._consecutiveFailures > 0) {
            console.error(`[os1] Heartbeat recovered after ${this._consecutiveFailures} failures`);
        }
        this._consecutiveFailures = 0;
        this._lastSuccess = new Date();
        this._lastError = null;
        this._lastErrorMessage = null;
        this._currentInterval = this._baseInterval;
    }
    onFailure(err) {
        this._consecutiveFailures++;
        this._lastError = err.message || String(err);
        const status = err.status || err.statusCode;
        const isAuth = status === 401 || status === 403;
        // Exponential backoff, capped
        const multiplier = isAuth ? AUTH_BACKOFF_MULTIPLIER : 2;
        this._currentInterval = Math.min(this._currentInterval * multiplier, MAX_INTERVAL);
        // Suppress repeated identical errors — log first, then every 10th
        const msg = this._lastError;
        if (msg !== this._lastErrorMessage || this._consecutiveFailures % 10 === 1) {
            if (this._consecutiveFailures === 1) {
                console.error(`[os1] Heartbeat failed: ${msg}`);
            }
            else {
                console.error(`[os1] Heartbeat failing (${this._consecutiveFailures}x, next in ${(this._currentInterval / 1000).toFixed(0)}s): ${msg}`);
            }
            this._lastErrorMessage = msg;
        }
    }
}
//# sourceMappingURL=heartbeat.js.map