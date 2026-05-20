import type { ClientConfig, BackupPlatform } from './types/index.js';
import { Transport } from './transport.js';
import { Keystore } from './auth/keystore.js';
import { OfficesAPI } from './api/offices.js';
import { EmployeesAPI } from './api/employees.js';
import { TasksAPI } from './api/tasks.js';
import { FilesAPI } from './api/files.js';
import { CreditsAPI } from './api/credits.js';
import { XMTPAPI } from './api/xmtp.js';
import { IntegrationsAPI } from './api/integrations.js';
import { ExtensionsAPI } from './api/extensions.js';
import { BackupsAPI } from './api/backups.js';
import {
  EventsAPI,
  CallbacksAPI,
  EnvAPI,
  DelegatesAPI,
  MessagesAPI,
  WorkspaceAPI,
  RolesAPI,
  TransferAPI,
  LLMPingAPI,
  WhatsAppAPI,
  ChromiumAPI,
  CapabilitiesAPI,
  ProxyAPI,
} from './api/events.js';
import { XMTPChannel } from './xmtp/channel.js';
import type { BackupProvider } from './api/backup-provider.js';
import { OpenClawBackupProvider } from './api/backup-openclaw.js';
import { HermesBackupProvider } from './api/backup-hermes.js';

/**
 * OS-1 Admin SDK client.
 *
 * Provides typed access to all office-manager API endpoints,
 * XMTP messaging with session negotiation, and dual auth
 * (JWT for admin ops, secp256k1 for agent impersonation).
 *
 * @example
 * ```typescript
 * const client = new OS1AdminClient({
 *   endpoint: 'https://m.mitosislabs.ai',
 *   jwt: { jwtSecret: process.env.RELAY_JWT_SECRET },
 * });
 *
 * const offices = await client.offices.list();
 * const agents = await client.employees.list(offices[0].id);
 * ```
 */
export class OS1AdminClient {
  readonly transport: Transport;
  readonly keystore: Keystore;

  // ─── API Modules ─────────────────────────────────────────────────
  readonly offices: OfficesAPI;
  readonly employees: EmployeesAPI;
  readonly tasks: TasksAPI;
  readonly files: FilesAPI;
  readonly credits: CreditsAPI;
  readonly xmtpApi: XMTPAPI;
  readonly integrations: IntegrationsAPI;
  readonly extensions: ExtensionsAPI;
  readonly events: EventsAPI;
  readonly callbacks: CallbacksAPI;
  readonly backups: BackupsAPI;
  readonly env: EnvAPI;
  readonly delegates: DelegatesAPI;
  readonly messages: MessagesAPI;
  readonly workspace: WorkspaceAPI;
  readonly roles: RolesAPI;
  readonly transfer: TransferAPI;
  readonly llmPing: LLMPingAPI;
  readonly whatsapp: WhatsAppAPI;
  readonly chromium: ChromiumAPI;
  readonly capabilities: CapabilitiesAPI;
  readonly proxy: ProxyAPI;

  // ─── XMTP Channel ───────────────────────────────────────────────
  readonly xmtp: XMTPChannel;

  constructor(config: ClientConfig) {
    this.transport = new Transport(config);
    this.keystore = new Keystore();

    // Initialize API modules
    this.offices = new OfficesAPI(this.transport);
    this.employees = new EmployeesAPI(this.transport);
    this.tasks = new TasksAPI(this.transport);
    this.files = new FilesAPI(this.transport);
    this.credits = new CreditsAPI(this.transport);
    this.xmtpApi = new XMTPAPI(this.transport);
    this.integrations = new IntegrationsAPI(this.transport);
    this.extensions = new ExtensionsAPI(this.transport);
    this.events = new EventsAPI(this.transport);
    this.callbacks = new CallbacksAPI(this.transport);
    this.backups = new BackupsAPI(this.transport);
    this.env = new EnvAPI(this.transport);
    this.delegates = new DelegatesAPI(this.transport);
    this.messages = new MessagesAPI(this.transport);
    this.workspace = new WorkspaceAPI(this.transport);
    this.roles = new RolesAPI(this.transport);
    this.transfer = new TransferAPI(this.transport);
    this.llmPing = new LLMPingAPI(this.transport);
    this.whatsapp = new WhatsAppAPI(this.transport);
    this.chromium = new ChromiumAPI(this.transport);
    this.capabilities = new CapabilitiesAPI(this.transport);
    this.proxy = new ProxyAPI(this.transport);

    // XMTP channel manager
    this.xmtp = new XMTPChannel(this.transport);
  }

  /**
   * Create a client from stored configuration.
   * Tries API key first (from mi login), then JWT secret (from mi init).
   */
  static async fromConfig(): Promise<OS1AdminClient> {
    const keystore = new Keystore();
    const config = await keystore.loadConfig();

    const endpoint = (config.endpoint as string) ?? 'https://mitosislabs.ai';

    // Prefer API key (set by mi login)
    const apiKey = config.apiKey as string | undefined;
    if (apiKey) {
      return new OS1AdminClient({
        endpoint,
        token: apiKey,
      });
    }

    // Fall back to JWT secret (set by mi init)
    const jwtSecret = await keystore.loadJWTSecret();
    return new OS1AdminClient({
      endpoint,
      jwt: { jwtSecret },
    });
  }

  /**
   * Create a client that authenticates as a specific agent.
   * Loads the agent's signing key from the keystore.
   */
  static async asAgent(officeId: string, agentName: string, endpoint?: string): Promise<OS1AdminClient> {
    const keystore = new Keystore();
    const config = await keystore.loadConfig();
    const signingKey = await keystore.loadAgentKey(officeId, agentName);

    return new OS1AdminClient({
      endpoint: endpoint ?? (config.endpoint as string) ?? 'https://m.mitosislabs.ai',
      agent: { agentId: agentName, signingKey },
    });
  }

  /**
   * Health check — verify connectivity to office-manager.
   */
  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.transport.endpoint}/healthz`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * Verify authentication is working.
   */
  async verifyAuth(): Promise<{ ok: boolean; method: string; error?: string }> {
    try {
      await this.offices.list();
      return { ok: true, method: 'jwt' };
    } catch (err: any) {
      return { ok: false, method: 'jwt', error: err.message };
    }
  }

  /**
   * Get a backup provider for the specified platform.
   *
   * OpenClaw providers delegate to the office-manager API.
   * Hermes providers operate on the local filesystem.
   */
  backupProvider(platform: BackupPlatform = 'openclaw'): BackupProvider {
    if (platform === 'hermes') {
      return new HermesBackupProvider();
    }
    return new OpenClawBackupProvider(this.backups);
  }

  /**
   * Close all XMTP sessions and clean up.
   */
  async close(): Promise<void> {
    await this.xmtp.closeAll();
  }
}
