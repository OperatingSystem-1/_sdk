import type { Transport } from '../transport.js';
import type {
  FileInfo,
  FileChangesResponse,
  FilePermission,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/files`;
}

export class FilesAPI {
  constructor(private transport: Transport) {}

  async upload(officeId: string, filename: string, data: Buffer | Uint8Array): Promise<void> {
    await this.transport.upload(base(officeId), filename, data);
  }

  async list(officeId: string): Promise<FileInfo[]> {
    return this.transport.get<FileInfo[]>(base(officeId));
  }

  async download(officeId: string, filename: string): Promise<Response> {
    return this.transport.request<Response>('GET', `${base(officeId)}/${filename}`, { raw: true });
  }

  async delete(officeId: string, filename: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/${filename}`);
  }

  async changes(officeId: string, since?: number): Promise<FileChangesResponse> {
    return this.transport.get<FileChangesResponse>(`${base(officeId)}/_changes`, {
      since: since,
    });
  }

  async getPermissions(officeId: string, filename: string): Promise<FilePermission[]> {
    return this.transport.get<FilePermission[]>(`${base(officeId)}/${filename}/permissions`);
  }

  async setPermissions(officeId: string, filename: string, perms: FilePermission): Promise<void> {
    await this.transport.put(`${base(officeId)}/${filename}/permissions`, perms);
  }
}
