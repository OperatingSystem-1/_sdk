/**
 * Transfer API — upload state bundles and poll transfer status.
 */

import { readFileSync } from 'node:fs';
import type { Transport } from '../transport.js';
import type { TransferStatus, TransferReport, Manifest } from '../types/index.js';

export class TransferAPI {
  constructor(private transport: Transport) {}

  /**
   * Upload a consciousness transfer bundle for a clone.
   *
   * Sends the manifest and (optionally) the tar.gz bundle to the server.
   * Small bundles (<10 MB) are sent inline; larger bundles would use S3
   * pre-signed URLs in production.
   */
  async upload(transferId: string, bundlePath: string, manifest: Manifest): Promise<TransferStatus> {
    const bundleBuf = readFileSync(bundlePath);

    // Encode as JSON with base64 bundle (for bundles under 10 MB)
    // For larger bundles, production would use S3 pre-signed URL
    const body = {
      transfer_id: transferId,
      manifest,
      bundle_base64: bundleBuf.length <= 10 * 1024 * 1024 ? bundleBuf.toString('base64') : undefined,
      bundle_size: bundleBuf.length,
    };

    return this.transport.post<TransferStatus>('/api/agents/clone/transfer', body);
  }

  /** Get current transfer status. */
  async status(transferId: string): Promise<TransferStatus> {
    return this.transport.get<TransferStatus>(`/api/agents/join/status/${transferId}`);
  }

  /**
   * Poll transfer status until it reaches a terminal state.
   * Returns the final status including the transfer report.
   */
  async waitForOnline(
    transferId: string,
    onProgress?: (status: TransferStatus) => void,
    timeoutMs: number = 5 * 60 * 1000,
    pollIntervalMs: number = 3000,
  ): Promise<{ status: TransferStatus; report: TransferReport | null }> {
    const start = Date.now();
    let lastPhase = '';

    while (Date.now() - start < timeoutMs) {
      const s = await this.status(transferId);

      if (s.phase !== lastPhase) {
        lastPhase = s.phase;
        onProgress?.(s);
      }

      // Terminal states
      if (s.phase === 'online' || s.phase === 'failed') {
        return { status: s, report: s.report ?? null };
      }
      if (s.report && ['completed', 'completed_with_warnings', 'partial'].includes(s.report.overall_status)) {
        return { status: s, report: s.report };
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Transfer ${transferId} timed out after ${timeoutMs / 1000}s`);
  }
}
