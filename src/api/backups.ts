import type { Transport } from '../transport.js';
import type {
  Backup,
  BackupManifest,
  BackupDiff,
  BackupSchedule,
  BackupScheduleConfig,
  BackupHealthStatus,
  CreateSnapshotRequest,
  RestoreFromSnapshotRequest,
  RestoreResult,
  DiffSnapshotsRequest,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

/**
 * Unified Backups API module.
 *
 * Provides both legacy backup endpoints (workspace-only tar-to-S3) and the
 * new snapshot-based backup provider framework with point-in-time capture,
 * diff, restore, and scheduling across all data surfaces.
 */
export class BackupsAPI {
  constructor(private transport: Transport) {}

  // ─── Legacy endpoints (workspace-only backups) ──────────────────────────

  /** List legacy workspace backups for an office. */
  async list(officeId: string, opts?: { employee?: string }): Promise<Backup[]> {
    return this.transport.get<Backup[]>(`${base(officeId)}/backups`, opts);
  }

  /** Get a legacy workspace backup by ID. */
  async get(officeId: string, backupId: string): Promise<Backup> {
    return this.transport.get<Backup>(`${base(officeId)}/backups/${backupId}`);
  }

  /** Delete a legacy workspace backup. */
  async delete(officeId: string, backupId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/backups/${backupId}`);
  }

  // ─── Snapshots (new backup provider framework) ──────────────────────────

  /** Create a point-in-time snapshot across all data surfaces. */
  async createSnapshot(officeId: string, req: CreateSnapshotRequest): Promise<BackupManifest> {
    return this.transport.post<BackupManifest>(`${base(officeId)}/snapshots`, req);
  }

  /** List snapshots for an office, optionally filtered. */
  async listSnapshots(officeId: string, opts?: {
    agentName?: string;
    limit?: number;
    offset?: number;
    since?: string;
    until?: string;
  }): Promise<{ snapshots: BackupManifest[]; total: number }> {
    return this.transport.get<{ snapshots: BackupManifest[]; total: number }>(
      `${base(officeId)}/snapshots`,
      opts as Record<string, string>,
    );
  }

  /** Get a specific snapshot manifest. */
  async getSnapshot(officeId: string, snapshotId: string): Promise<BackupManifest> {
    return this.transport.get<BackupManifest>(`${base(officeId)}/snapshots/${snapshotId}`);
  }

  /** Delete a snapshot and all its archived data. */
  async deleteSnapshot(officeId: string, snapshotId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/snapshots/${snapshotId}`);
  }

  // ─── Restore ────────────────────────────────────────────────────────────

  /** Restore from a snapshot. */
  async restore(officeId: string, req: RestoreFromSnapshotRequest): Promise<RestoreResult> {
    return this.transport.post<RestoreResult>(`${base(officeId)}/snapshots/restore`, req);
  }

  // ─── Diff ───────────────────────────────────────────────────────────────

  /** Compute diff between two snapshots. */
  async diff(officeId: string, req: DiffSnapshotsRequest): Promise<BackupDiff> {
    return this.transport.post<BackupDiff>(`${base(officeId)}/snapshots/diff`, req);
  }

  // ─── Schedules ──────────────────────────────────────────────────────────

  /** Create or update a backup schedule. */
  async upsertSchedule(
    officeId: string,
    agentName: string | undefined,
    config: BackupScheduleConfig,
  ): Promise<BackupSchedule> {
    return this.transport.put<BackupSchedule>(`${base(officeId)}/snapshots/schedules`, {
      agentName,
      ...config,
    });
  }

  /** List backup schedules for an office. */
  async listSchedules(officeId: string): Promise<BackupSchedule[]> {
    return this.transport.get<BackupSchedule[]>(`${base(officeId)}/snapshots/schedules`);
  }

  /** Delete a backup schedule. */
  async deleteSchedule(officeId: string, scheduleId: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/snapshots/schedules/${scheduleId}`);
  }

  // ─── Health ─────────────────────────────────────────────────────────────

  /** Check backup health and configuration status. */
  async health(officeId: string): Promise<BackupHealthStatus> {
    return this.transport.get<BackupHealthStatus>(`${base(officeId)}/snapshots/health`);
  }
}
