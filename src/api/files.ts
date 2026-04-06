import type { Transport } from '../transport.js';
import type { FileInfo, FileChanges } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/files`;
}

export class FilesAPI {
  constructor(private transport: Transport) {}

  /** List files in the office shared drive. */
  async list(officeId: string): Promise<FileInfo[]> {
    return this.transport.get<FileInfo[]>(base(officeId));
  }

  /** Upload a file to the shared drive. */
  async upload(
    officeId: string,
    filename: string,
    body: Uint8Array,
    contentType = 'application/octet-stream',
  ): Promise<void> {
    const form = new FormData();
    // Copy into a clean ArrayBuffer to satisfy strict TypeScript Blob typing
    const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const blob = new Blob([ab], { type: contentType });
    form.append('file', blob, filename);
    await this.transport.request('POST', base(officeId), { body: form });
  }

  /** Download a file from the shared drive. Returns the raw Response. */
  async download(officeId: string, filename: string): Promise<Response> {
    return this.transport.request<Response>('GET', `${base(officeId)}/${filename}`, {
      raw: true,
    });
  }

  /** Delete a file from the shared drive. */
  async delete(officeId: string, filename: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/${filename}`);
  }

  /** Poll for file changes since a timestamp (ms). */
  async changes(officeId: string, since?: number): Promise<FileChanges> {
    return this.transport.get<FileChanges>(`${base(officeId)}/_changes`, {
      since: since ?? 0,
    });
  }
}
