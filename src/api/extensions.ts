import type { Transport } from '../transport.js';
import type {
  Extension,
  CreateExtensionRequest,
  MarketplaceItem,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

/**
 * Extensions API matching router.go:
 *   POST /extensions (register)
 *   GET  /extensions (list)
 *   GET  /extensions/{extId} (get)
 *   DELETE /extensions/{extId} (delete)
 *   GET  /extensions/{extId}/panel/* (panel proxy)
 *   POST /extensions/install (marketplace install)
 *   DELETE /extensions/{extId}/uninstall (marketplace uninstall)
 *
 * Global marketplace (no office scope):
 *   GET  /marketplace
 *   GET  /marketplace/{extId}
 *   POST /marketplace/publish
 */
export class ExtensionsAPI {
  constructor(private transport: Transport) {}

  // ─── Office Extensions ────────────────────────────────────────────

  async register(officeId: string, req: CreateExtensionRequest): Promise<Extension> {
    return this.transport.post<Extension>(`${base(officeId)}/extensions`, req);
  }

  async list(officeId: string): Promise<Extension[]> {
    return this.transport.get<Extension[]>(`${base(officeId)}/extensions`);
  }

  async get(officeId: string, extId: string): Promise<Extension> {
    return this.transport.get<Extension>(`${base(officeId)}/extensions/${extId}`);
  }

  async delete(officeId: string, extId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/extensions/${extId}`);
  }

  async install(officeId: string, req: { extId: string }): Promise<void> {
    await this.transport.post(`${base(officeId)}/extensions/install`, req);
  }

  async uninstall(officeId: string, extId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/extensions/${extId}/uninstall`);
  }

  // ─── Global Marketplace ───────────────────────────────────────────

  async marketplaceList(): Promise<MarketplaceItem[]> {
    return this.transport.get<MarketplaceItem[]>('/api/v1/marketplace');
  }

  async marketplaceGet(extId: string): Promise<MarketplaceItem> {
    return this.transport.get<MarketplaceItem>(`/api/v1/marketplace/${extId}`);
  }

  async marketplacePublish(data: unknown): Promise<void> {
    await this.transport.post('/api/v1/marketplace/publish', data);
  }
}
