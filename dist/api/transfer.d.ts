/**
 * Transfer API — upload state bundles and poll transfer status.
 */
import type { Transport } from '../transport.js';
import type { TransferStatus, TransferReport, Manifest } from '../types/index.js';
export declare class TransferAPI {
    private transport;
    constructor(transport: Transport);
    /**
     * Upload a consciousness transfer bundle for a clone.
     *
     * Sends the manifest and (optionally) the tar.gz bundle to the server.
     * Small bundles (<10 MB) are sent inline; larger bundles would use S3
     * pre-signed URLs in production.
     */
    upload(transferId: string, bundlePath: string, manifest: Manifest): Promise<TransferStatus>;
    /** Get current transfer status. */
    status(transferId: string): Promise<TransferStatus>;
    /**
     * Poll transfer status until it reaches a terminal state.
     * Returns the final status including the transfer report.
     */
    waitForOnline(transferId: string, onProgress?: (status: TransferStatus) => void, timeoutMs?: number, pollIntervalMs?: number): Promise<{
        status: TransferStatus;
        report: TransferReport | null;
    }>;
}
//# sourceMappingURL=transfer.d.ts.map