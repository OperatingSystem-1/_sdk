import type { ClientConfig } from './types/index.js';
import { Transport } from './transport.js';
import { OfficesAPI } from './api/offices.js';
import { AgentsAPI } from './api/agents.js';
import { IntegrationsAPI } from './api/integrations.js';
import { JoinAPI } from './api/join.js';
import { HeartbeatAPI } from './api/heartbeat.js';
import { FilesAPI } from './api/files.js';
import { CloneAPI } from './api/clone.js';

/**
 * OS-1 SDK client.
 *
 * @example
 * ```typescript
 * const client = new OS1Client({
 *   endpoint: 'https://api.mitosislabs.ai',
 *   apiKey: process.env.OS1_API_KEY,
 * });
 *
 * const offices = await client.offices.list();
 * const agents = await client.agents.list(offices[0].id);
 * ```
 */
export class OS1Client {
  readonly transport: Transport;
  readonly offices: OfficesAPI;
  readonly agents: AgentsAPI;
  readonly integrations: IntegrationsAPI;
  readonly join: JoinAPI;
  readonly heartbeat: HeartbeatAPI;
  readonly files: FilesAPI;
  readonly clone: CloneAPI;

  constructor(config: ClientConfig) {
    this.transport = new Transport(config);
    this.offices = new OfficesAPI(this.transport);
    this.agents = new AgentsAPI(this.transport);
    this.integrations = new IntegrationsAPI(this.transport);
    this.join = new JoinAPI(this.transport);
    this.heartbeat = new HeartbeatAPI(this.transport);
    this.files = new FilesAPI(this.transport, config.apiKey);
    this.clone = new CloneAPI(this.transport);
  }

  /** Health check — verify connectivity. */
  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.transport.endpoint}/healthz`);
      return resp.ok;
    } catch {
      return false;
    }
  }
}
