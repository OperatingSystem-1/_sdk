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
export declare function waitForCloneOnline(transport: Transport, officeId: string, cloneName: string, onProgress?: (status: CloneStatus) => void, timeoutMs?: number): Promise<CloneStatus>;
//# sourceMappingURL=clone-status.d.ts.map