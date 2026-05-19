export interface JWTAuthConfig {
    jwtSecret: string;
    /** User ID to embed in JWT tokens (required for owner-scoped endpoints) */
    userId?: string;
}
export interface AgentAuthConfig {
    agentId: string;
    signingKey: Uint8Array;
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
export interface KeyPair {
    publicKey: string;
    privateKey: Uint8Array;
}
export interface KeystoreConfig {
    basePath?: string;
}
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
/** Matches office-manager internal/k8s/infrastructure.go ClusterStatus */
export interface ClusterStatus {
    phase: 'ready' | 'degraded' | 'failed' | 'provisioning';
    operator: ComponentStatus;
    ingress: ComponentStatus;
    ingressEndpoint?: string;
    message?: string;
}
export interface ComponentStatus {
    ready: boolean;
    message?: string;
}
export interface Employee {
    name: string;
    role?: string;
    modelTier: string;
    modelProvider: string;
    skills?: string[];
    channels?: EmployeeChannels;
    resources?: EmployeeResources;
    storage?: string;
    selfConfigure?: boolean;
    autoUpdate?: boolean;
    chromium?: boolean;
    webTerminal?: boolean;
    backup?: BackupConfig;
    imageTag?: string;
    customConfig?: Record<string, unknown>;
    env?: Record<string, string>;
    envSecrets?: string[];
    systemPrompt?: string;
    status: EmployeeStatus;
}
export interface EmployeeChannels {
    whatsapp?: boolean;
    discord?: boolean;
    telegram?: boolean;
    signal?: boolean;
    xmtp?: boolean;
}
export interface EmployeeResources {
    cpuRequest?: string;
    cpuLimit?: string;
    memoryRequest?: string;
    memoryLimit?: string;
}
export interface BackupConfig {
    schedule?: string;
    enabled?: boolean;
}
export interface EmployeeStatus {
    phase: string;
    ready: boolean;
    gatewayEndpoint?: string;
    accessUrl?: string;
    accessToken?: string;
    lastSeen?: string;
    message?: string;
}
export interface AgentKitOwner {
    name?: string;
    phone?: string;
    email?: string;
    context?: string;
}
export interface AgentKitConfig {
    enabled?: boolean;
    taskQueue?: boolean;
    disableTaskQueue?: boolean;
    neonSecret?: string;
    owner?: AgentKitOwner;
    personality?: string;
}
export interface HireRequest {
    name: string;
    role?: string;
    modelTier?: string;
    skills?: string[];
    channels?: EmployeeChannels;
    resources?: EmployeeResources;
    storage?: string;
    selfConfigure?: boolean;
    autoUpdate?: boolean;
    chromium?: boolean;
    webTerminal?: boolean;
    imageTag?: string;
    systemPrompt?: string;
    env?: Record<string, string>;
    envSecrets?: string[];
    customConfig?: Record<string, unknown>;
    agentKit?: AgentKitConfig;
    botId?: string;
    bedrockCredentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
    };
    restoreFromBackup?: string;
}
export interface UpdateEmployeeRequest {
    role?: string;
    modelTier?: string;
    skills?: string[];
    channels?: EmployeeChannels;
    resources?: EmployeeResources;
    storage?: string;
    selfConfigure?: boolean;
    autoUpdate?: boolean;
    chromium?: boolean;
    webTerminal?: boolean;
    imageTag?: string;
    systemPrompt?: string;
    env?: Record<string, string>;
    envSecrets?: string[];
    customConfig?: Record<string, unknown>;
}
export interface PromoteRequest {
    modelTier: string;
    provider?: string;
    resources?: EmployeeResources;
}
export interface SkillsRequest {
    add?: string[];
    remove?: string[];
}
export interface EmployeeAction {
    action: string;
    params?: Record<string, unknown>;
}
export interface EmployeeLogs {
    logs: string;
    pod: string;
}
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
export interface MarketplaceItem {
    id: string;
    name: string;
    description?: string;
    author?: string;
    installs: number;
}
export interface WhatsAppStatus {
    connected: boolean;
    phone_number?: string;
    agent_id?: string;
}
export interface WhatsAppQRStatus {
    status: string;
    qr?: string;
}
export interface WhatsAppAgentStatus {
    agents: Array<{
        name: string;
        whatsapp_enabled: boolean;
    }>;
}
export interface ChromiumInstance {
    id: string;
    status: string;
    vnc_url?: string;
}
export interface Delegate {
    agent_id: string;
    permissions: string[];
    created_at: string;
}
export interface CreateDelegateRequest {
    permissions: string[];
}
export interface SendMessageRequest {
    to: string;
    content: string;
}
export interface PoolStats {
    active: number;
    idle: number;
}
export interface ExecRequest {
    command: string;
    timeout_ms?: number;
}
export interface ExecResponse {
    stdout: string;
    stderr: string;
    exit_code: number;
}
export interface Backup {
    id: string;
    employee_name: string;
    office_id: string;
    s3_key: string;
    size_bytes: number;
    created_at: string;
}
export type BackupPlatform = 'openclaw' | 'hermes';
export type BackupStorageBackend = 's3' | 'local';
export type BackupTrigger = 'manual' | 'scheduled' | 'pre-delete';
export type SnapshotStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial';
/** A data surface that can be captured in a snapshot. */
export type DataSurfaceKind = 'agent_workspace' | 'agent_memory' | 'shared_db' | 'neon_db' | 'file_server' | 'chat_sessions' | 'hermes_workspace' | 'hermes_db';
/** One captured data surface within a snapshot. */
export interface SnapshotSurface {
    kind: DataSurfaceKind;
    archivePath: string;
    checksum: string;
    sizeBytes: number;
    compressedBytes: number;
    fileCount?: number;
    rowCount?: number;
    tables?: string[];
    status: SnapshotStatus;
    error?: string;
    durationMs: number;
}
/** Full snapshot manifest — the metadata document describing a point-in-time capture. */
export interface BackupManifest {
    id: string;
    manifestVersion: string;
    platform: BackupPlatform;
    storageBackend: BackupStorageBackend;
    officeId: string;
    agentName?: string;
    trigger: BackupTrigger;
    status: SnapshotStatus;
    parentSnapshotId?: string;
    createdAt: string;
    completedAt?: string;
    durationMs?: number;
    totalSizeBytes: number;
    totalCompressedBytes: number;
    surfaces: SnapshotSurface[];
    storageLocation: string;
    storagePath: string;
    manifestPath: string;
    label?: string;
    metadata?: Record<string, unknown>;
}
/** Change type for a single item in a diff. */
export type DiffChangeType = 'added' | 'modified' | 'deleted';
/** A file-level change between two snapshots. */
export interface FileDiffEntry {
    path: string;
    changeType: DiffChangeType;
    sizeFrom: number;
    sizeTo: number;
    diff?: string;
    checksumFrom?: string;
    checksumTo?: string;
}
/** A database row-level change between two snapshots. */
export interface DbDiffEntry {
    table: string;
    changeType: DiffChangeType;
    primaryKey: Record<string, unknown>;
    valuesFrom?: Record<string, unknown>;
    valuesTo?: Record<string, unknown>;
    changedColumns?: string[];
}
/** Summary statistics for a diff surface. */
export interface DiffSurfaceSummary {
    kind: DataSurfaceKind;
    added: number;
    modified: number;
    deleted: number;
}
/** Full diff between two snapshots. */
export interface BackupDiff {
    fromSnapshotId: string;
    toSnapshotId: string;
    fromCreatedAt: string;
    toCreatedAt: string;
    surfaceSummaries: DiffSurfaceSummary[];
    fileDiffs: FileDiffEntry[];
    dbDiffs: DbDiffEntry[];
    configDiffs: FileDiffEntry[];
    truncated: boolean;
    totalChanges: number;
}
/** Request to create a new snapshot. */
export interface CreateSnapshotRequest {
    agentName?: string;
    surfaces?: DataSurfaceKind[];
    label?: string;
    metadata?: Record<string, unknown>;
}
/** Request to restore from a snapshot. */
export interface RestoreFromSnapshotRequest {
    snapshotId: string;
    agentName?: string;
    surfaces?: DataSurfaceKind[];
    cleanRestore?: boolean;
}
/** Result of a restore operation. */
export interface RestoreResult {
    status: 'completed' | 'failed';
    surfaceResults: Array<{
        kind: DataSurfaceKind;
        status: 'restored' | 'failed' | 'skipped';
        error?: string;
    }>;
}
/** Configuration for a backup schedule. */
export interface BackupScheduleConfig {
    cron: string;
    surfaces?: DataSurfaceKind[];
    retention: number;
    enabled: boolean;
    label?: string;
}
/** A configured backup schedule. */
export interface BackupSchedule {
    id: string;
    officeId: string;
    agentName?: string;
    config: BackupScheduleConfig;
    lastSnapshotId?: string;
    lastRunAt?: string;
    nextRunAt?: string;
    createdAt: string;
    updatedAt: string;
}
/** Request to diff two snapshots. */
export interface DiffSnapshotsRequest {
    fromSnapshotId: string;
    toSnapshotId: string;
    surfaces?: DataSurfaceKind[];
    maxFileDiffs?: number;
    maxDbDiffs?: number;
}
/** Backup health status for audit. */
export interface BackupHealthStatus {
    configured: boolean;
    storageBackend?: BackupStorageBackend;
    storageLocation?: string;
    storageReachable?: boolean;
    lastSnapshot?: BackupManifest;
    schedules: BackupSchedule[];
    hoursSinceLastBackup?: number;
    scheduleOverdue: boolean;
    totalSnapshots: number;
    totalStorageBytes: number;
}
export interface TransferStatus {
    transfer_id: string;
    status: string;
    progress?: number;
}
export interface Role {
    name: string;
    permissions: string[];
}
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
export interface PingResult {
    model: string;
    latency_ms: number;
    success: boolean;
    error?: string;
}
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
export interface EnvVar {
    key: string;
    value?: string;
    source?: string;
}
export interface SetEnvRequest {
    key: string;
    value: string;
}
export interface SessionNegotiation {
    sessionId: string;
    officeId: string;
    agentName: string;
    conversationId: string;
    capabilities?: string[];
    startedAt: string;
}
export interface Paginated<T> {
    data: T[];
    total?: number;
    offset?: number;
    limit?: number;
}
export interface APIError {
    status: number;
    message: string;
    code?: string;
}
export declare class OS1Error extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string);
}
//# sourceMappingURL=index.d.ts.map