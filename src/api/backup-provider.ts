import type {
  BackupPlatform,
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

/**
 * Abstract backup provider interface.
 *
 * Platform-specific implementations (OpenClaw, Hermes) conform to this
 * interface. All snapshot/restore/diff/schedule operations go through here.
 * The provider abstracts away storage backend (S3 vs local) and platform
 * differences (K8s API vs local filesystem).
 */
export interface BackupProvider {
  /** Platform this provider targets. */
  readonly platform: BackupPlatform;

  /** Data surfaces available on this platform. */
  readonly availableSurfaces: DataSurfaceKind[];

  /** Check if the provider's storage and dependencies are properly configured. */
  healthCheck(): Promise<BackupHealthStatus>;

  // ─── Snapshot lifecycle ─────────────────────────────────────────────────

  /** Create a point-in-time snapshot. */
  createSnapshot(officeId: string, req: CreateSnapshotRequest): Promise<BackupManifest>;

  /** List snapshots for an office, optionally filtered by agent. */
  listSnapshots(officeId: string, opts?: {
    agentName?: string;
    limit?: number;
    offset?: number;
    since?: string;
    until?: string;
  }): Promise<{ snapshots: BackupManifest[]; total: number }>;

  /** Get a specific snapshot manifest. */
  getSnapshot(officeId: string, snapshotId: string): Promise<BackupManifest>;

  /** Delete a snapshot and its data. */
  deleteSnapshot(officeId: string, snapshotId: string): Promise<void>;

  // ─── Restore ────────────────────────────────────────────────────────────

  /** Restore from a snapshot. */
  restore(officeId: string, req: RestoreFromSnapshotRequest): Promise<RestoreResult>;

  // ─── Diff ───────────────────────────────────────────────────────────────

  /** Compute diff between two snapshots. */
  diff(officeId: string, req: DiffSnapshotsRequest): Promise<BackupDiff>;

  // ─── Schedules ──────────────────────────────────────────────────────────

  /** Create or update a backup schedule. */
  upsertSchedule(officeId: string, agentName: string | undefined, config: BackupScheduleConfig): Promise<BackupSchedule>;

  /** List backup schedules. */
  listSchedules(officeId: string): Promise<BackupSchedule[]>;

  /** Delete a backup schedule. */
  deleteSchedule(officeId: string, scheduleId: string): Promise<void>;
}
