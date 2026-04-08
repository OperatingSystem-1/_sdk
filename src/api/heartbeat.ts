import type { Transport } from '../transport.js';

export class HeartbeatAPI {
  private transport: Transport;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /** Send a single heartbeat. */
  async send(): Promise<{ ok: boolean }> {
    return this.transport.post<{ ok: boolean }>('/api/agents/heartbeat', {});
  }

  /**
   * Start sending heartbeats on an interval.
   * @param intervalMs Default: 30000 (30s). Office-manager considers agent offline after 2 minutes.
   */
  start(intervalMs = 30_000): void {
    if (this.intervalId) return; // Already running
    // Send immediately, then on interval
    this.send().catch((err) => console.error('[os1] Heartbeat failed:', err.message));
    this.intervalId = setInterval(() => {
      this.send().catch((err) => console.error('[os1] Heartbeat failed:', err.message));
    }, intervalMs);
  }

  /** Stop the heartbeat loop. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
