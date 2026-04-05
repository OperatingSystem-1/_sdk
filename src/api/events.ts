import type { Transport } from '../transport.js';
import type {
  Backup,
  PodCallback,
  PodEventRequest,
  EnvVar,
  SetEnvRequest,
  Delegate,
  CreateDelegateRequest,
  SendMessageRequest,
  PoolStats,
  ExecRequest,
  ExecResponse,
  Role,
  TransferStatus,
  PingResult,
  WhatsAppStatus,
  ChromiumInstance,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

/**
 * Remaining API modules grouped together for completeness.
 * Each could be split into its own file as the SDK grows.
 */

// ─── Events ──────────────────────────────────────────────────────────────────

export class EventsAPI {
  constructor(private transport: Transport) {}

  async list(officeId: string): Promise<unknown[]> {
    return this.transport.get<unknown[]>(`${base(officeId)}/events`);
  }

  async chatEvents(officeId: string, sessionKey: string): Promise<unknown[]> {
    return this.transport.get<unknown[]>(`${base(officeId)}/events/chat/${sessionKey}`);
  }

  async sshEvents(officeId: string): Promise<unknown[]> {
    return this.transport.get<unknown[]>(`${base(officeId)}/events/ssh`);
  }
}

// ─── Callbacks ───────────────────────────────────────────────────────────────

export class CallbacksAPI {
  constructor(private transport: Transport) {}

  async podEvent(officeId: string, req: PodEventRequest): Promise<void> {
    await this.transport.post(`${base(officeId)}/callbacks/pod-event`, req);
  }

  async list(officeId: string): Promise<PodCallback[]> {
    return this.transport.get<PodCallback[]>(`${base(officeId)}/callbacks`);
  }

  async get(officeId: string, callbackId: string): Promise<PodCallback> {
    return this.transport.get<PodCallback>(`${base(officeId)}/callbacks/${callbackId}`);
  }
}

// ─── Backups ─────────────────────────────────────────────────────────────────

export class BackupsAPI {
  constructor(private transport: Transport) {}

  async list(officeId: string, opts?: { employee?: string }): Promise<Backup[]> {
    return this.transport.get<Backup[]>(`${base(officeId)}/backups`, opts);
  }

  async get(officeId: string, backupId: string): Promise<Backup> {
    return this.transport.get<Backup>(`${base(officeId)}/backups/${backupId}`);
  }

  async delete(officeId: string, backupId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/backups/${backupId}`);
  }
}

// ─── Environment Variables ───────────────────────────────────────────────────

export class EnvAPI {
  constructor(private transport: Transport) {}

  async list(officeId: string): Promise<EnvVar[]> {
    return this.transport.get<EnvVar[]>(`${base(officeId)}/env`);
  }

  async values(officeId: string): Promise<Record<string, string>> {
    return this.transport.get<Record<string, string>>(`${base(officeId)}/env/values`);
  }

  async set(officeId: string, vars: Record<string, string>): Promise<void> {
    await this.transport.put(`${base(officeId)}/env`, vars);
  }

  async delete(officeId: string, key: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/env/${key}`);
  }

  async getAgentEnv(officeId: string, name: string): Promise<Record<string, string>> {
    return this.transport.get<Record<string, string>>(`${base(officeId)}/employees/${name}/env`);
  }

  async setAgentEnv(officeId: string, name: string, key: string, value: string): Promise<void> {
    await this.transport.put(`${base(officeId)}/employees/${name}/env/${key}`, { value });
  }
}

// ─── Delegates ───────────────────────────────────────────────────────────────

export class DelegatesAPI {
  constructor(private transport: Transport) {}

  async list(officeId: string): Promise<Delegate[]> {
    return this.transport.get<Delegate[]>(`${base(officeId)}/delegates`);
  }

  async get(officeId: string, agentId: string): Promise<Delegate> {
    return this.transport.get<Delegate>(`${base(officeId)}/delegates/${agentId}`);
  }

  async create(officeId: string, agentId: string, req: CreateDelegateRequest): Promise<Delegate> {
    return this.transport.post<Delegate>(`${base(officeId)}/delegates/${agentId}`, req);
  }

  async update(officeId: string, agentId: string, req: Partial<CreateDelegateRequest>): Promise<Delegate> {
    return this.transport.patch<Delegate>(`${base(officeId)}/delegates/${agentId}`, req);
  }

  async delete(officeId: string, agentId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/delegates/${agentId}`);
  }
}

// ─── Messages ────────────────────────────────────────────────────────────────

export class MessagesAPI {
  constructor(private transport: Transport) {}

  async send(officeId: string, req: SendMessageRequest): Promise<void> {
    await this.transport.post(`${base(officeId)}/messages/send`, req);
  }

  async poolStats(officeId: string): Promise<PoolStats> {
    return this.transport.get<PoolStats>(`${base(officeId)}/messages/pool-stats`);
  }

  async *stream(officeId: string): AsyncGenerator<{ event?: string; data: string }> {
    yield* this.transport.stream(`${base(officeId)}/messages/stream`);
  }
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export class WorkspaceAPI {
  constructor(private transport: Transport) {}

  async exec(officeId: string, req: ExecRequest): Promise<ExecResponse> {
    return this.transport.post<ExecResponse>(`${base(officeId)}/workspace/exec`, req);
  }

  async health(officeId: string): Promise<{ healthy: boolean }> {
    return this.transport.get<{ healthy: boolean }>(`${base(officeId)}/workspace/health`);
  }
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export class RolesAPI {
  constructor(private transport: Transport) {}

  async list(officeId: string): Promise<Role[]> {
    return this.transport.get<Role[]>(`${base(officeId)}/roles`);
  }

  async get(officeId: string, name: string): Promise<Role> {
    return this.transport.get<Role>(`${base(officeId)}/roles/${name}`);
  }
}

// ─── Transfer ────────────────────────────────────────────────────────────────

export class TransferAPI {
  constructor(private transport: Transport) {}

  async prepare(officeId: string): Promise<{ transfer_id: string }> {
    return this.transport.post<{ transfer_id: string }>(`${base(officeId)}/agents/prepare`);
  }

  async install(officeId: string, data: unknown): Promise<void> {
    await this.transport.post(`${base(officeId)}/agents/install`, data);
  }

  async start(officeId: string, data: unknown): Promise<void> {
    await this.transport.post(`${base(officeId)}/agents/start`, data);
  }

  async status(officeId: string, transferId: string): Promise<TransferStatus> {
    return this.transport.get<TransferStatus>(`${base(officeId)}/agents/transfer/${transferId}`);
  }
}

// ─── LLM Ping ────────────────────────────────────────────────────────────────

export class LLMPingAPI {
  constructor(private transport: Transport) {}

  async ping(officeId: string): Promise<PingResult> {
    return this.transport.post<PingResult>(`${base(officeId)}/llm-ping`);
  }

  async agentPing(officeId: string, name: string): Promise<PingResult> {
    return this.transport.post<PingResult>(`${base(officeId)}/employees/${name}/llm-ping`);
  }
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────
// Matches router.go: per-agent QR pairing + office-level WhatsApp management

export class WhatsAppAPI {
  constructor(private transport: Transport) {}

  // Per-agent QR pairing flow
  async qrStart(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/employees/${name}/whatsapp/qr-start`);
  }

  async qrStatus(officeId: string, name: string): Promise<WhatsAppStatus> {
    return this.transport.get<WhatsAppStatus>(`${base(officeId)}/employees/${name}/whatsapp/qr-status`);
  }

  async qrStop(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/employees/${name}/whatsapp/qr-stop`);
  }

  async sessionStatus(officeId: string, name: string): Promise<WhatsAppStatus> {
    return this.transport.get<WhatsAppStatus>(`${base(officeId)}/employees/${name}/whatsapp/status`);
  }

  async reset(officeId: string, name: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/employees/${name}/whatsapp/reset`);
  }

  // Office-level WhatsApp management
  async agentStatus(officeId: string): Promise<unknown> {
    return this.transport.get(`${base(officeId)}/whatsapp/agents`);
  }

  async toggleAgentAccess(officeId: string, agentName: string, enabled: boolean): Promise<void> {
    await this.transport.post(`${base(officeId)}/whatsapp/agents/${agentName}/access`, { enabled });
  }

  async registerAgent(officeId: string, agentName: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/whatsapp/agents/${agentName}/register`);
  }

  async officeQRStart(officeId: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/whatsapp/qr-start`);
  }

  async officeQRStatus(officeId: string): Promise<unknown> {
    return this.transport.get(`${base(officeId)}/whatsapp/qr-status`);
  }

  async officeReset(officeId: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/whatsapp/reset`);
  }
}

// ─── Chromium ────────────────────────────────────────────────────────────────

export class ChromiumAPI {
  constructor(private transport: Transport) {}

  async start(officeId: string): Promise<ChromiumInstance> {
    return this.transport.post<ChromiumInstance>(`${base(officeId)}/chromium/start`);
  }

  async status(officeId: string): Promise<ChromiumInstance> {
    return this.transport.get<ChromiumInstance>(`${base(officeId)}/chromium/status`);
  }

  async done(officeId: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/chromium/done`);
  }

  async delete(officeId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/chromium`);
  }
}

// ─── Capabilities ────────────────────────────────────────────────────────────

export class CapabilitiesAPI {
  constructor(private transport: Transport) {}

  async self(officeId: string): Promise<unknown> {
    return this.transport.get(`${base(officeId)}/capabilities/self`);
  }
}

// ─── Code/Codex Proxy ────────────────────────────────────────────────────────

export class ProxyAPI {
  constructor(private transport: Transport) {}

  async teardownCodeProxy(officeId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/code-proxy`);
  }

  async teardownCodexProxy(officeId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/codex-proxy`);
  }
}
