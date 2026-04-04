// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JWTAuthConfig {
  jwtSecret: string;
  /** User ID to embed in JWT tokens (required for owner-scoped endpoints) */
  userId?: string;
}

export interface AgentAuthConfig {
  agentId: string;
  signingKey: Uint8Array; // secp256k1 private key (32 bytes)
}

export interface ClientConfig {
  endpoint: string;
  jwt?: JWTAuthConfig;
  agent?: AgentAuthConfig;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

export interface SignedHeaders {
  'X-Agent-Id': string;
  'X-Timestamp': string;
  'X-Signature': string;
}

export interface JWTPayload {
  botId: string;
  instanceId?: string;
  privateIp?: string;
  userId: string;
  role?: string;
  iat: number;
  exp: number;
}

// ─── Keystore ────────────────────────────────────────────────────────────────

export interface KeyPair {
  publicKey: string;   // hex-encoded uncompressed point (04...)
  privateKey: Uint8Array; // 32-byte raw scalar
}

export interface KeystoreConfig {
  basePath?: string; // default: ~/.os1/keys
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
  owner_id: string;
}

export interface OfficeSettings {
  [key: string]: unknown;
}

export interface OfficeStatus {
  office_id: string;
  namespace: string;
  agents: number;
  status: string;
}

// ─── Employee (Agent) ────────────────────────────────────────────────────────

export interface Employee {
  name: string;
  office_id: string;
  status: string;
  role?: string;
  model?: string;
  public_key?: string;
  created_at: string;
  updated_at?: string;
}

export interface HireRequest {
  name: string;
  role?: string;
  model?: string;
  skills?: string[];
  env?: Record<string, string>;
}

export interface UpdateEmployeeRequest {
  role?: string;
  model?: string;
  skills?: string[];
}

export interface EmployeeAction {
  action: string;
  params?: Record<string, unknown>;
}

export interface EmployeeLogs {
  logs: string;
  pod: string;
}

// ─── Task ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  office_id: string;
  title: string;
  description?: string;
  kind?: string;
  priority?: number;
  status: string;
  assigned_to?: string;
  created_at: string;
  completed_at?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  kind?: string;
  priority?: number;
  assigned_to?: string;
}

export interface TaskStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

// ─── File ────────────────────────────────────────────────────────────────────

export interface FileInfo {
  name: string;
  size: number;
  modifiedAt: string;
}

export interface FileChange {
  type: 'upload' | 'delete';
  name: string;
  timestamp: number;
}

export interface FileChangesResponse {
  events: FileChange[];
  serverTime: number;
  full_refresh?: boolean;
}

export interface FilePermission {
  agent_name: string;
  access: 'none' | 'read' | 'write';
}

// ─── Credits & Usage ─────────────────────────────────────────────────────────

export interface CreditBalance {
  office_id: string;
  balance: number;
}

export interface AddCreditsRequest {
  amount: number;
  reason: string;
}

export interface CreditHistoryEntry {
  id: string;
  office_id: string;
  amount: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

export interface UsageSummary {
  cpu_core_hours: number;
  memory_gib_hours: number;
  total_credits: number;
  pods: Record<string, unknown>[];
}

export interface LLMUsageSummary {
  total_tokens: number;
  total_cost: number;
  total_credits: number;
  agents: Record<string, unknown>[];
}

// ─── XMTP ────────────────────────────────────────────────────────────────────

export interface XMTPConversation {
  id: string;
  peer: string;
  last_message?: string;
  last_message_at?: string;
}

export interface XMTPGroup {
  id: string;
  name?: string;
  members: string[];
  created_at: string;
}

export interface XMTPMessage {
  id: string;
  from_agent: string;
  content: string;
  created_at: string;
}

export interface SendXMTPMessageRequest {
  agent_id: string;
  content: string;
}

export interface CreateGroupRequest {
  name?: string;
  members: string[];
}

// ─── Events & Activity ───────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  category: 'task' | 'message' | 'standup' | 'session' | 'xmtp' | 'lifecycle' | 'chat' | 'terminal';
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

export interface ChatSession {
  session_key: string;
  started_at: string;
  messages: number;
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

export interface SetSecretRequest {
  provider: string;
  key: string;
}

// ─── Extensions ──────────────────────────────────────────────────────────────

export interface Extension {
  id: string;
  name: string;
  office_id: string;
  manifest?: Record<string, unknown>;
  created_at: string;
}

export interface CreateExtensionRequest {
  name: string;
  manifest?: Record<string, unknown>;
  panel_html?: string;
}

// ─── Marketplace ─────────────────────────────────────────────────────────────

export interface MarketplaceItem {
  id: string;
  name: string;
  description?: string;
  author?: string;
  installs: number;
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

export interface WhatsAppStatus {
  connected: boolean;
  phone_number?: string;
  agent_id?: string;
}

// ─── Chromium ────────────────────────────────────────────────────────────────

export interface ChromiumInstance {
  id: string;
  status: string;
  vnc_url?: string;
}

// ─── Delegates ───────────────────────────────────────────────────────────────

export interface Delegate {
  agent_id: string;
  permissions: string[];
  created_at: string;
}

export interface CreateDelegateRequest {
  permissions: string[];
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface SendMessageRequest {
  to: string;
  content: string;
}

export interface PoolStats {
  active: number;
  idle: number;
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export interface ExecRequest {
  command: string;
  timeout_ms?: number;
}

export interface ExecResponse {
  stdout: string;
  stderr: string;
  exit_code: number;
}

// ─── Backups ─────────────────────────────────────────────────────────────────

export interface Backup {
  id: string;
  employee_name: string;
  office_id: string;
  s3_key: string;
  size_bytes: number;
  created_at: string;
}

// ─── Transfer ────────────────────────────────────────────────────────────────

export interface TransferStatus {
  transfer_id: string;
  status: string;
  progress?: number;
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export interface Role {
  name: string;
  permissions: string[];
}

// ─── Quota ───────────────────────────────────────────────────────────────────

export interface Quota {
  cpu: string;
  memory: string;
  pods: number;
  tier: string;
}

export interface SetQuotaRequest {
  tier: string;
  cpu?: string;
  memory?: string;
  pods?: number;
}

// ─── LLM Ping ────────────────────────────────────────────────────────────────

export interface PingResult {
  model: string;
  latency_ms: number;
  success: boolean;
  error?: string;
}

// ─── Callbacks ───────────────────────────────────────────────────────────────

export interface PodCallback {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PodEventRequest {
  type: string;
  payload?: Record<string, unknown>;
}

// ─── Env ─────────────────────────────────────────────────────────────────────

export interface EnvVar {
  key: string;
  value?: string;
  source?: string;
}

export interface SetEnvRequest {
  key: string;
  value: string;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface SessionNegotiation {
  sessionId: string;
  officeId: string;
  agentName: string;
  conversationId: string;
  capabilities?: string[];
  startedAt: string;
}

// ─── Paginated ───────────────────────────────────────────────────────────────

export interface Paginated<T> {
  data: T[];
  total?: number;
  offset?: number;
  limit?: number;
}

// ─── API Response ────────────────────────────────────────────────────────────

export interface APIError {
  status: number;
  message: string;
  code?: string;
}

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
