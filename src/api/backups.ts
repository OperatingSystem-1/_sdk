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

function omBase(officeId: string) {
  return `/api/v1/offices/${officeId}`;
}

/**
 * Unified Backups API module.
 *
 * Legacy endpoints hit office-manager (workspace tar-to-S3).
 * New snapshot endpoints hit the Next.js dashboard API (/api/snapshots).
 * The officeId parameter on snapshot methods is accepted for interface
 * compatibility but the API is user-scoped (auth determines the user).
 */
export class BackupsAPI {
  constructor(private transport: Transport) {}

  // ─── Legacy endpoints (office-manager, workspace-only backups) ──────────

  /** List legacy workspace backups for an office. */
  async list(officeId: string, opts?: { employee?: string }): Promise<Backup[]> {
    return this.transport.get<Backup[]>(`${omBase(officeId)}/backups`, opts);
  }

  /** Get a legacy workspace backup by ID. */
  async get(officeId: string, backupId: string): Promise<Backup> {
    return this.transport.get<Backup>(`${omBase(officeId)}/backups/${backupId}`);
  }

  /** Delete a legacy workspace backup. */
  async delete(officeId: string, backupId: string): Promise<void> {
    await this.transport.delete(`${omBase(officeId)}/backups/${backupId}`);
  }

  // ─── Snapshots (Next.js dashboard API — user-scoped) ───────────────────

  /** Create a point-in-time snapshot across all data surfaces. */
  async createSnapshot(_officeId: string, req: CreateSnapshotRequest): Promise<BackupManifest> {
    return this.transport.post<BackupManifest>('/api/snapshots', req);
  }

  /** List snapshots, optionally filtered. */
  async listSnapshots(_officeId: string, opts?: {
    agentName?: string;
    limit?: number;
    offset?: number;
    since?: string;
    until?: string;
  }): Promise<{ snapshots: BackupManifest[]; total: number }> {
    return this.transport.get<{ snapshots: BackupManifest[]; total: number }>(
      '/api/snapshots',
      opts as Record<string, string>,
    );
  }

  /** Get a specific snapshot manifest. */
  async getSnapshot(_officeId: string, snapshotId: string): Promise<BackupManifest> {
    return this.transport.get<BackupManifest>(`/api/snapshots/${snapshotId}`);
  }

  /** Delete a snapshot and all its archived data. */
  async deleteSnapshot(_officeId: string, snapshotId: string): Promise<void> {
    await this.transport.delete(`/api/snapshots/${snapshotId}`);
  }

  // ─── Restore ────────────────────────────────────────────────────────────

  /** Restore from a snapshot. */
  async restore(_officeId: string, req: RestoreFromSnapshotRequest): Promise<RestoreResult> {
    return this.transport.post<RestoreResult>('/api/snapshots/restore', req);
  }

  // ─── Diff ───────────────────────────────────────────────────────────────

  /** Compute diff between two snapshots. */
  async diff(_officeId: string, req: DiffSnapshotsRequest): Promise<BackupDiff> {
    return this.transport.post<BackupDiff>('/api/snapshots/diff', req);
  }

  // ─── Schedules ──────────────────────────────────────────────────────────

  /** Create or update a backup schedule. */
  async upsertSchedule(
    _officeId: string,
    agentName: string | undefined,
    config: BackupScheduleConfig,
  ): Promise<BackupSchedule> {
    return this.transport.put<BackupSchedule>('/api/snapshots/schedules', {
      agentName,
      ...config,
    });
  }

  /** List backup schedules. */
  async listSchedules(_officeId: string): Promise<BackupSchedule[]> {
    return this.transport.get<BackupSchedule[]>('/api/snapshots/schedules');
  }

  /** Delete a backup schedule. */
  async deleteSchedule(_officeId: string, scheduleId: string): Promise<void> {
    await this.transport.delete(`/api/snapshots/schedules/${scheduleId}`);
  }

  // ─── Health ─────────────────────────────────────────────────────────────

  /** Check backup health and configuration status. */
  async health(_officeId: string): Promise<BackupHealthStatus> {
    return this.transport.get<BackupHealthStatus>('/api/snapshots/health');
  }
}
