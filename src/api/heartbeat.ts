import type { Transport } from '../transport.js';

export interface HeartbeatStatus {
  running: boolean;
  consecutiveFailures: number;
  lastSuccess: Date | null;
  lastError: string | null;
  currentIntervalMs: number;
}

const BASE_INTERVAL = 30_000;
const MAX_INTERVAL = 120_000; // Just under the 2-min offline threshold
const AUTH_BACKOFF_MULTIPLIER = 4; // Back off harder on auth errors

export class HeartbeatAPI {
  private transport: Transport;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private _consecutiveFailures = 0;
  private _lastSuccess: Date | null = null;
  private _lastError: string | null = null;
  private _lastErrorMessage: string | null = null; // dedup logging
  private _currentInterval: number = BASE_INTERVAL;
  private _baseInterval: number = BASE_INTERVAL;
  private directPath: string | null = null;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /** Send a single heartbeat. */
  async send(): Promise<{ ok: boolean }> {
    const path = this.directPath || '/api/agents/heartbeat';
    return this.transport.post<{ ok: boolean }>(path, {});
  }

  /**
   * Start sending heartbeats on an interval with automatic backoff.
   * @param intervalMs Base interval (default: 30000). Backs off on failure, resets on success.
   */
  start(intervalMs = BASE_INTERVAL): void {
    if (this.timerId) return;
    this._baseInterval = intervalMs;
    this._currentInterval = intervalMs;
    this.scheduleNext(0); // Send immediately
  }

  /**
   * Start heartbeats directly to office-manager, bypassing the dashboard proxy.
   * This is the preferred path — fewer hops, fewer failure points.
   */
  startDirect(opts: {
    officeId: string;
    agentId: string;
    intervalMs?: number;
  }): void {
    this.directPath = `/api/v1/offices/${opts.officeId}/employees/${opts.agentId}/heartbeat`;
    this.start(opts.intervalMs);
  }

  /** Stop the heartbeat loop. */
  stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** Current heartbeat loop state. */
  status(): HeartbeatStatus {
    return {
      running: this.timerId !== null,
      consecutiveFailures: this._consecutiveFailures,
      lastSuccess: this._lastSuccess,
      lastError: this._lastError,
      currentIntervalMs: this._currentInterval,
    };
  }

  private scheduleNext(delayMs: number): void {
    this.timerId = setTimeout(async () => {
      try {
        await this.send();
        this.onSuccess();
      } catch (err: any) {
        this.onFailure(err);
      }
      if (this.timerId !== null) {
        this.scheduleNext(this._currentInterval);
      }
    }, delayMs);
  }

  private onSuccess(): void {
    if (this._consecutiveFailures > 0) {
      console.error(`[os1] Heartbeat recovered after ${this._consecutiveFailures} failures`);
    }
    this._consecutiveFailures = 0;
    this._lastSuccess = new Date();
    this._lastError = null;
    this._lastErrorMessage = null;
    this._currentInterval = this._baseInterval;
  }

  private onFailure(err: any): void {
    this._consecutiveFailures++;
    this._lastError = err.message || String(err);

    const status = err.status || err.statusCode;
    const isAuth = status === 401 || status === 403;

    // Exponential backoff, capped
    const multiplier = isAuth ? AUTH_BACKOFF_MULTIPLIER : 2;
    this._currentInterval = Math.min(
      this._currentInterval * multiplier,
      MAX_INTERVAL,
    );

    // Suppress repeated identical errors — log first, then every 10th
    const msg = this._lastError;
    if (msg !== this._lastErrorMessage || this._consecutiveFailures % 10 === 1) {
      if (this._consecutiveFailures === 1) {
        console.error(`[os1] Heartbeat failed: ${msg}`);
      } else {
        console.error(
          `[os1] Heartbeat failing (${this._consecutiveFailures}x, next in ${(this._currentInterval / 1000).toFixed(0)}s): ${msg}`,
        );
      }
      this._lastErrorMessage = msg;
    }
  }
}
