// ─── Auth ────────────────────────────────────────────────────────────────────

export interface ClientConfig {
  /** OS-1 API endpoint */
  endpoint: string;
  /** API key from the OS-1 dashboard */
  apiKey: string;
  /** User ID (auto-detected from API key if not provided) */
  userId?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /**
   * External agent API key — when set, sent as X-Agent-Api-Key header
   * instead of wrapping apiKey in a JWT. Set this for agents that joined
   * via `os1 join` (the raw key returned by the join endpoint).
   */
  agentKey?: string;
}

// ─── Office ──────────────────────────────────────────────────────────────────

export interface Office {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  settings?: Record<string, unknown>;
}

export interface CreateOfficeRequest {
  name: string;
}

export interface OfficeSettings {
  [key: string]: unknown;
}

export interface ClusterStatus {
  phase: string;
  message?: string;
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export interface Agent {
  name: string;
  role?: string;
  modelTier?: string;
  modelProvider?: string;
  skills?: string[];
  status?: AgentStatus;
}

export interface AgentStatus {
  phase?: string;
  ready?: boolean;
  message?: string;
}

export interface HireAgentRequest {
  name: string;
  role?: string;
  modelTier?: string;
  skills?: string[];
  env?: Record<string, string>;
}

export interface UpdateAgentRequest {
  role?: string;
  modelTier?: string;
  skills?: string[];
  env?: Record<string, string>;
}

export interface PromoteRequest {
  modelTier: string;
  provider?: string;
}

export interface SkillsRequest {
  add?: string[];
  remove?: string[];
}

export interface AgentLogs {
  logs: string;
  pod: string;
}

// ─── Activity ────────────────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  category: string;
  type: string;
  summary: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityQuery {
  limit?: number;
  offset?: number;
  category?: string;
  since?: string;
}

// ─── Integrations ────────────────────────────────────────────────────────────

export interface ModelInfo {
  provider: string;
  model_id: string;
  name: string;
  available: boolean;
}

export interface IntegrationSecret {
  provider: string;
  has_key: boolean;
  updated_at?: string;
}

// ─── Join ───────────────────────────────────────────────────────────────────

export interface JoinRequest {
  /** 6-char invite code */
  code: string;
  /** Agent's display name */
  agent_name: string;
  /** XMTP wallet address (0x...) */
  xmtp_address?: string;
  /** secp256k1 public key hex */
  public_key?: string;
  /** Agent capabilities */
  capabilities?: string[];
}

export interface JoinResponse {
  employee_id: string | null;
  bot_id: string;
  office_id: string;
  api_key: string;
  agent_name: string;
  xmtp: {
    office_group_address: string | null;
    members: Array<{ name: string; xmtp_address: string; status: string }>;
  };
}

// ─── Clone ──────────────────────────────────────────────────────────────────

export interface CloneRequest {
  /** 6-char invite code for the target office */
  code: string;
  /** Optional: override the auto-mutated clone name */
  name?: string;
}

export interface CloneResponse {
  clone_name: string;
  clone_id: string;
  office_id: string;
  origin_name: string;
  employee_id: string | null;
  status: string; // 'provisioning'
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class OS1Error extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'OS1Error';
    this.status = status;
    this.code = code;
  }
}
