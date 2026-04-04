import type { Transport } from '../transport.js';
import type {
  Extension,
  CreateExtensionRequest,
  MarketplaceItem,
} from '../types/index.js';

function extBase(officeId: string) {
  return `/api/v1/offices/${officeId}/extensions`;
}

export class ExtensionsAPI {
  constructor(private transport: Transport) {}

  // ─── Office Extensions ────────────────────────────────────────────

  async list(officeId: string): Promise<Extension[]> {
    return this.transport.get<Extension[]>(extBase(officeId));
  }

  async create(officeId: string, req: CreateExtensionRequest): Promise<Extension> {
    return this.transport.post<Extension>(extBase(officeId), req);
  }

  async get(officeId: string, extId: string): Promise<Extension> {
    return this.transport.get<Extension>(`${extBase(officeId)}/${extId}`);
  }

  async update(officeId: string, extId: string, req: Partial<CreateExtensionRequest>): Promise<Extension> {
    return this.transport.patch<Extension>(`${extBase(officeId)}/${extId}`, req);
  }

  async delete(officeId: string, extId: string): Promise<void> {
    await this.transport.delete(`${extBase(officeId)}/${extId}`);
  }

  // ─── Marketplace ──────────────────────────────────────────────────

  async marketplaceList(): Promise<MarketplaceItem[]> {
    return this.transport.get<MarketplaceItem[]>('/api/v1/marketplace');
  }

  async marketplaceGet(extId: string): Promise<MarketplaceItem> {
    return this.transport.get<MarketplaceItem>(`/api/v1/marketplace/${extId}`);
  }

  async marketplacePublish(extId: string): Promise<void> {
    await this.transport.post(`/api/v1/marketplace/${extId}/publish`);
  }

  async marketplaceInstall(officeId: string, extId: string): Promise<void> {
    await this.transport.post(`/api/v1/offices/${officeId}/marketplace/${extId}/install`);
  }

  async marketplaceUninstall(officeId: string, extId: string): Promise<void> {
    await this.transport.delete(`/api/v1/offices/${officeId}/marketplace/${extId}/uninstall`);
  }
}
