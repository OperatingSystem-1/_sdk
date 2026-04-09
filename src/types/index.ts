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
  /** Current office id for office-scoped APIs and bridge-backed office group chat */
  officeId?: string;
  /** Office XMTP group conversation ID for public network chat */
  xmtpGroupId?: string;
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

export interface OfficeIntegration {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'llm' | 'communication' | 'services';
  aliases: string[];
  capabilities: string[];
  wizard: 'interactive' | 'guide' | 'auto' | 'oauth';
  guideFile: string | null;
  officeLevel: boolean;
  channels: string[];
  agentEnvVars: string[];
  requiredSecrets: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'oauth';
    required: boolean;
    hint?: string;
  }>;
  verified: boolean;
  status: 'pending' | 'configured' | 'active';
  secretName: string | null;
  metadata: Record<string, unknown>;
}

/** Per-agent integration state returned by the polling endpoint (CLA-519). */
export interface AgentIntegration {
  id: string;
  enabled: boolean;
  status: 'pending' | 'loading' | 'active' | 'error' | 'offline';
  error?: string;
  secretName?: string;
  channels: string[];
  envVars: string[];
  rev: number;
  toggledAt: string;
}

export interface AgentIntegrationsResponse {
  integrations: AgentIntegration[];
  rev: number;
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
  conversationId: string;
  peerAddress: string;
  agentName?: string;
  groupName?: string;
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
  transfer_id?: string;
  upload_url?: string;
}

export interface HeartbeatResponse {
  ok: boolean;
}

// ─── Consciousness Transfer ─────────────────────────────────────────────────

export interface ManifestFileEntry {
  sha256: string;
  size: number;
}

export interface ManifestStats {
  identity_files: number;
  memory_sessions: number;
  memory_has_hybrid: boolean;
  skill_count: number;
  script_count: number;
  cron_jobs: number;
  task_count: number;
  agent_messages: number;
  workspace_files: number;
  bundle_size_bytes: number;
  skipped_dirs: string[];
  model_primary: string | null;
}

export interface Manifest {
  version: '1.0';
  agent_name: string;
  origin: string;
  packed_at: string;
  files: Record<string, ManifestFileEntry>;
  stats: ManifestStats;
}

export interface DiscoveryReport {
  identityFiles: string[];
  memoryFiles: number;
  hasHybridMemory: boolean;
  skillCount: number;
  scriptCount: number;
  cronJobs: number;
  workspaceFiles: number;
  taskCount: number;
  agentMessages: number;
  skippedDirs: string[];
  warnings: string[];
}

export interface PackageResult {
  manifest: Manifest;
  bundlePath: string;
  bundleSize: number;
  discoveryReport: DiscoveryReport;
}

export interface PhaseResult {
  phase: string;
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  filesWritten: number;
  filesFailed: string[];
  warnings: string[];
  error: string | null;
  retryAttempted: boolean;
  durationMs: number;
}

export interface TransferReport {
  transfer_id: string;
  origin_agent: string;
  clone_name: string;
  office_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  overall_status: 'completed' | 'completed_with_warnings' | 'partial' | 'failed';
  phases: Record<string, PhaseResult>;
  summary: {
    files_transferred: number;
    files_failed: number;
    memory_entries: number;
    personality_transferred: boolean;
    provider_preserved: boolean;
    warnings: string[];
    errors: string[];
  };
}

export interface TransferStatus {
  transfer_id: string;
  phase: string;
  progress: number;
  message: string;
  error?: string;
  report?: TransferReport;
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
