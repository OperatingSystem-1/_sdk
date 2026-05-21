import type { Transport } from '../transport.js';

export interface CloneStatus {
  name: string;
  phase: string;
  ready: boolean;
  gatewayEndpoint?: string;
  lastSeen?: string;
}

/**
 * Poll clone pod status until it's online or times out.
 *
 * @param onProgress Called on each phase change with the current status
 * @param timeoutMs Max time to wait (default: 5 minutes)
 * @returns Final status when pod is ready, or throws on timeout
 */
export async function waitForCloneOnline(
  transport: Transport,
  officeId: string,
  cloneName: string,
  onProgress?: (status: CloneStatus) => void,
  timeoutMs = 300_000,
): Promise<CloneStatus> {
  const start = Date.now();
  let lastPhase = '';

  while (Date.now() - start < timeoutMs) {
    try {
      const status = await transport.get<{
        name: string;
        status: { phase: string; ready: boolean; gatewayEndpoint?: string; lastSeen?: string };
      }>(`/api/v1/offices/${officeId}/employees/${cloneName}`);

      const cs: CloneStatus = {
        name: status.name,
        phase: status.status.phase,
        ready: status.status.ready,
        gatewayEndpoint: status.status.gatewayEndpoint,
        lastSeen: status.status.lastSeen,
      };

      if (cs.phase !== lastPhase) {
        lastPhase = cs.phase;
        onProgress?.(cs);
      }

      if (cs.ready || cs.phase === 'Running') {
        return cs;
      }

      if (cs.phase === 'Failed' || cs.phase === 'Suspended') {
        throw new Error(`Clone ${cloneName} entered ${cs.phase} state`);
      }
    } catch (err: any) {
      // 404 means pod not created yet — keep waiting
      if (err.status !== 404) {
        onProgress?.({ name: cloneName, phase: 'waiting', ready: false });
      }
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error(`Clone ${cloneName} did not come online within ${timeoutMs / 1000}s`);
}
