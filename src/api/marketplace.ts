import type { Transport } from '../transport.js';
import type { InstalledExtension, MarketplaceExtension } from '../types/index.js';

function officeBase(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

export class MarketplaceAPI {
  constructor(private transport: Transport) {}

  /**
   * List published marketplace extensions with optional filtering.
   */
  async list(opts?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<MarketplaceExtension[]> {
    const query: Record<string, string | number | undefined> = {};
    if (opts?.category) query.category = opts.category;
    if (opts?.search) query.q = opts.search;
    if (opts?.limit) query.limit = opts.limit;
    if (opts?.offset) query.offset = opts.offset;
    return this.transport.get<MarketplaceExtension[]>('/api/v1/marketplace', query);
  }

  /**
   * Get a single marketplace extension by ID.
   */
  async get(extId: string): Promise<MarketplaceExtension> {
    return this.transport.get<MarketplaceExtension>(`/api/v1/marketplace/${encodeURIComponent(extId)}`);
  }

  /**
   * Install a marketplace extension into an office.
   * Downloads the tarball from S3, verifies integrity, and registers it.
   */
  async install(officeId: string, extId: string): Promise<InstalledExtension> {
    return this.transport.post<InstalledExtension>(
      `${officeBase(officeId)}/extensions/install`,
      { extId },
    );
  }

  /**
   * Uninstall an extension from an office.
   * Cleans up sidecars, DB schemas, and S3 panel files.
   */
  async uninstall(officeId: string, extId: string): Promise<{ status: string }> {
    return this.transport.delete<{ status: string }>(
      `${officeBase(officeId)}/extensions/${encodeURIComponent(extId)}/uninstall`,
    );
  }

  /**
   * Publish an extension from an agent's pod to the global marketplace.
   * The extension must already be registered and active in the office.
   */
  async publish(officeId: string, extId: string): Promise<MarketplaceExtension> {
    return this.transport.post<MarketplaceExtension>('/api/v1/marketplace/publish', {
      officeId,
      extId,
    });
  }

  /**
   * List extensions installed in an office.
   */
  async listInstalled(officeId: string): Promise<InstalledExtension[]> {
    return this.transport.get<InstalledExtension[]>(`${officeBase(officeId)}/extensions`);
  }

  /**
   * Get a single installed extension by ID.
   */
  async getInstalled(officeId: string, extId: string): Promise<InstalledExtension> {
    return this.transport.get<InstalledExtension>(
      `${officeBase(officeId)}/extensions/${encodeURIComponent(extId)}`,
    );
  }
}
