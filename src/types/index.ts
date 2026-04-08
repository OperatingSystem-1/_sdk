// ─── Auth ────────────────────────────────────────────────────────────────────

export interface ClientConfig {
  /** OS-1 API endpoint */
  endpoint: string;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /**
   * External agent API key — when set, sent as X-Agent-Api-Key header
   * instead of normal auth. Set this for agents that joined via `mi join`
   * (the raw key returned by the join endpoint).
   * @deprecated Use signingKey + agentId for pubkey auth instead.
   */
  agentKey?: string;
  /** secp256k1 private key hex — signs every request with ECDSA */
  signingKey?: string;
  /** Agent name — sent as X-Agent-Id header with signed requests */
  agentId?: string;
}

export type AuthConfig = ApiKeyAuth | TokenAuth;

export interface ApiKeyAuth {
  type: 'apiKey';
  key: string;
  userId?: string;
}

export interface TokenAuth {
  type: 'token';
  token: string;
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

// ─── Environment Variables ──────────────────────────────────────────────────

export interface EnvVar {
  key: string;
  value?: string;
  scope?: 'office' | 'agent';
  agentName?: string;
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: number;
  kind?: string;
  requestedBy?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority?: number;
  kind?: string;
  status: string;
  claimedBy?: string;
  requestedBy?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface TaskStats {
  total: number;
  pending: number;
  claimed: number;
  completed: number;
  failed: number;
}

// ─── Files ──────────────────────────────────────────────────────────────────

export interface FileInfo {
  name: string;
  size: number;
  modifiedAt: string;
}

export interface FileChanges {
  events?: FileChangeEvent[];
  serverTime?: number;
  full_refresh?: boolean;
}

export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted';
  name: string;
  timestamp: number;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  created_at: number;
}

export interface ChatConversation {
  peerAddress: string;
  agentName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

// ─── External Agent (A2A) ───────────────────────────────────────────────────

export interface JoinRequest {
  code: string;
  agent_name: string;
  xmtp_address?: string;
  public_key?: string;
  capabilities?: string[];
}

export interface JoinResponse {
  employee_id: string | null;
  bot_id: string;
  office_id: string;
  api_key: string;
  agent_name: string;
  xmtp: {
    office_group_id: string | null;
    registered: boolean;
  };
}

export interface CloneRequest {
  /** Invite code for target office. If omitted, clones into current office. */
  code?: string;
  name?: string;
}

export interface CloneResponse {
  clone_name: string;
  clone_id: string;
  office_id: string;
  origin_name: string;
  employee_id: string | null;
  status: string;
}

export interface HeartbeatResponse {
  ok: boolean;
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
