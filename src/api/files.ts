import type { Transport } from '../transport.js';
import { makeAuthHeader } from '../auth/index.js';

export interface FileInfo {
  name: string;
  size: number;
  modifiedAt: string;
}

export class FilesAPI {
  private transport: Transport;
  private apiKey: string;

  constructor(transport: Transport, apiKey: string) {
    this.transport = transport;
    this.apiKey = apiKey;
  }

  /** List all files in the office shared drive. */
  async list(): Promise<FileInfo[]> {
    return this.transport.get<FileInfo[]>('/api/agents/office/files');
  }

  /**
   * Upload a file to the office shared drive.
   * @param filename The file name
   * @param content File content as Buffer or Uint8Array
   * @param mimeType MIME type (default: application/octet-stream)
   */
  async upload(
    filename: string,
    content: Buffer | Uint8Array,
    mimeType = 'application/octet-stream'
  ): Promise<{ ok: boolean; filename: string }> {
    const form = new FormData();
    form.append('file', new Blob([content], { type: mimeType }), filename);

    const resp = await fetch(`${this.transport.endpoint}/api/agents/office/files`, {
      method: 'POST',
      headers: { Authorization: makeAuthHeader(this.apiKey) },
      body: form,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText })) as { error?: string };
      throw new Error(err.error || `Upload failed: ${resp.status}`);
    }

    return resp.json() as Promise<{ ok: boolean; filename: string }>;
  }

  /** Download a file from the office shared drive. Returns raw bytes. */
  async download(filename: string): Promise<Buffer> {
    const resp = await fetch(
      `${this.transport.endpoint}/api/agents/office/files/${encodeURIComponent(filename)}`,
      { headers: { Authorization: makeAuthHeader(this.apiKey) } }
    );

    if (!resp.ok) {
      throw new Error(`Download failed: ${resp.status}`);
    }

    return Buffer.from(await resp.arrayBuffer());
  }

  /** Delete a file from the office shared drive. */
  async delete(filename: string): Promise<void> {
    await this.transport.delete(`/api/agents/office/files/${encodeURIComponent(filename)}`);
  }
}
