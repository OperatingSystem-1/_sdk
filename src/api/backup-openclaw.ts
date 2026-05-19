import type {
  BackupManifest,
  BackupDiff,
  BackupSchedule,
  BackupScheduleConfig,
  BackupHealthStatus,
  CreateSnapshotRequest,
  RestoreFromSnapshotRequest,
  RestoreResult,
  DiffSnapshotsRequest,
  DataSurfaceKind,
} from '../types/index.js';
import type { BackupProvider } from './backup-provider.js';
import type { BackupsAPI } from './backups.js';

/**
 * OpenClaw backup provider.
 *
 * Delegates all operations to the BackupsAPI which calls office-manager
 * over HTTP. The heavy lifting (S3 streaming, pod exec, pg_dump) happens
 * server-side in the office-manager snapshot orchestrator.
 */
export class OpenClawBackupProvider implements BackupProvider {
  readonly platform = 'openclaw' as const;

  readonly availableSurfaces: DataSurfaceKind[] = [
    'agent_workspace',
    'agent_memory',
    'shared_db',
    'neon_db',
    'file_server',
    'chat_sessions',
  ];

  constructor(private api: BackupsAPI) {}

  async healthCheck(): Promise<BackupHealthStatus> {
    // officeId is resolved at call time from the provider's context
    throw new Error('Use healthCheckForOffice() or call api.health() directly');
  }

  async healthCheckForOffice(officeId: string): Promise<BackupHealthStatus> {
    return this.api.health(officeId);
  }

  async createSnapshot(officeId: string, req: CreateSnapshotRequest): Promise<BackupManifest> {
    return this.api.createSnapshot(officeId, req);
  }

  async listSnapshots(officeId: string, opts?: {
    agentName?: string;
    limit?: number;
    offset?: number;
    since?: string;
    until?: string;
  }): Promise<{ snapshots: BackupManifest[]; total: number }> {
    return this.api.listSnapshots(officeId, opts);
  }

  async getSnapshot(officeId: string, snapshotId: string): Promise<BackupManifest> {
    return this.api.getSnapshot(officeId, snapshotId);
  }

  async deleteSnapshot(officeId: string, snapshotId: string): Promise<void> {
    return this.api.deleteSnapshot(officeId, snapshotId);
  }

  async restore(officeId: string, req: RestoreFromSnapshotRequest): Promise<RestoreResult> {
    return this.api.restore(officeId, req);
  }

  async diff(officeId: string, req: DiffSnapshotsRequest): Promise<BackupDiff> {
    return this.api.diff(officeId, req);
  }

  async upsertSchedule(
    officeId: string,
    agentName: string | undefined,
    config: BackupScheduleConfig,
  ): Promise<BackupSchedule> {
    return this.api.upsertSchedule(officeId, agentName, config);
  }

  async listSchedules(officeId: string): Promise<BackupSchedule[]> {
    return this.api.listSchedules(officeId);
  }

  async deleteSchedule(officeId: string, scheduleId: string): Promise<void> {
    return this.api.deleteSchedule(officeId, scheduleId);
  }
}
