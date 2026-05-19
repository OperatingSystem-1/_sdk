import { execSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGzip, createGunzip } from 'node:zlib';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
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
  SnapshotSurface,
  SnapshotStatus,
  DiffSurfaceSummary,
  FileDiffEntry,
} from '../types/index.js';
import type { BackupProvider } from './backup-provider.js';

const MANIFEST_VERSION = '1.0.0';

/**
 * Hermes backup provider.
 *
 * Operates entirely on the local filesystem. Creates tar.gz archives of
 * Hermes workspace directories and pg_dump of local PostgreSQL. Snapshots
 * are stored under ~/.os1/backups/{snapshotId}/.
 */
export class HermesBackupProvider implements BackupProvider {
  readonly platform = 'hermes' as const;

  readonly availableSurfaces: DataSurfaceKind[] = [
    'hermes_workspace',
    'hermes_db',
  ];

  private backupsDir: string;

  constructor(basePath?: string) {
    this.backupsDir = basePath ?? join(homedir(), '.os1', 'backups');
    mkdirSync(this.backupsDir, { recursive: true });
  }

  async healthCheck(): Promise<BackupHealthStatus> {
    const snapshots = this.loadAllManifests();
    const lastSnapshot = snapshots.length > 0 ? snapshots[0] : undefined;
    const hoursSince = lastSnapshot
      ? (Date.now() - new Date(lastSnapshot.createdAt).getTime()) / 3600000
      : undefined;

    return {
      configured: true,
      storageBackend: 'local',
      storageLocation: this.backupsDir,
      storageReachable: existsSync(this.backupsDir),
      lastSnapshot,
      schedules: [],
      hoursSinceLastBackup: hoursSince,
      scheduleOverdue: false,
      totalSnapshots: snapshots.length,
      totalStorageBytes: snapshots.reduce((sum, s) => sum + s.totalCompressedBytes, 0),
    };
  }

  async createSnapshot(_officeId: string, req: CreateSnapshotRequest): Promise<BackupManifest> {
    const id = randomUUID();
    const snapshotDir = join(this.backupsDir, id);
    mkdirSync(snapshotDir, { recursive: true });

    const startTime = Date.now();
    const surfaces: SnapshotSurface[] = [];
    const requestedSurfaces = req.surfaces ?? this.availableSurfaces;

    for (const kind of requestedSurfaces) {
      if (!this.availableSurfaces.includes(kind)) continue;
      const surface = await this.captureSurface(kind, snapshotDir);
      surfaces.push(surface);
    }

    const manifest: BackupManifest = {
      id,
      manifestVersion: MANIFEST_VERSION,
      platform: 'hermes',
      storageBackend: 'local',
      officeId: _officeId || 'hermes-local',
      agentName: req.agentName,
      trigger: 'manual',
      status: surfaces.every(s => s.status === 'completed') ? 'completed' : 'partial',
      createdAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      totalSizeBytes: surfaces.reduce((sum, s) => sum + s.sizeBytes, 0),
      totalCompressedBytes: surfaces.reduce((sum, s) => sum + s.compressedBytes, 0),
      surfaces,
      storageLocation: this.backupsDir,
      storagePath: snapshotDir,
      manifestPath: join(snapshotDir, 'manifest.json'),
      label: req.label,
      metadata: req.metadata,
    };

    writeFileSync(manifest.manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    return manifest;
  }

  async listSnapshots(_officeId: string, opts?: {
    agentName?: string;
    limit?: number;
    offset?: number;
    since?: string;
    until?: string;
  }): Promise<{ snapshots: BackupManifest[]; total: number }> {
    let snapshots = this.loadAllManifests();

    if (opts?.agentName) {
      snapshots = snapshots.filter(s => s.agentName === opts.agentName);
    }
    if (opts?.since) {
      const since = new Date(opts.since).getTime();
      snapshots = snapshots.filter(s => new Date(s.createdAt).getTime() >= since);
    }
    if (opts?.until) {
      const until = new Date(opts.until).getTime();
      snapshots = snapshots.filter(s => new Date(s.createdAt).getTime() <= until);
    }

    const total = snapshots.length;
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 50;
    snapshots = snapshots.slice(offset, offset + limit);

    return { snapshots, total };
  }

  async getSnapshot(_officeId: string, snapshotId: string): Promise<BackupManifest> {
    const manifestPath = join(this.backupsDir, snapshotId, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  }

  async deleteSnapshot(_officeId: string, snapshotId: string): Promise<void> {
    const snapshotDir = join(this.backupsDir, snapshotId);
    if (!existsSync(snapshotDir)) return;
    // Remove all files in snapshot dir
    for (const file of readdirSync(snapshotDir)) {
      unlinkSync(join(snapshotDir, file));
    }
    // rmdir
    try { execSync(`rmdir ${JSON.stringify(snapshotDir)}`); } catch { /* ignore */ }
  }

  async restore(_officeId: string, req: RestoreFromSnapshotRequest): Promise<RestoreResult> {
    const manifest = await this.getSnapshot(_officeId, req.snapshotId);
    const surfaceResults: RestoreResult['surfaceResults'] = [];

    for (const surface of manifest.surfaces) {
      if (req.surfaces && !req.surfaces.includes(surface.kind)) {
        surfaceResults.push({ kind: surface.kind, status: 'skipped' });
        continue;
      }

      try {
        await this.restoreSurface(surface, req.cleanRestore);
        surfaceResults.push({ kind: surface.kind, status: 'restored' });
      } catch (err) {
        surfaceResults.push({
          kind: surface.kind,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      status: surfaceResults.some(r => r.status === 'failed') ? 'failed' : 'completed',
      surfaceResults,
    };
  }

  async diff(_officeId: string, req: DiffSnapshotsRequest): Promise<BackupDiff> {
    const from = await this.getSnapshot(_officeId, req.fromSnapshotId);
    const to = await this.getSnapshot(_officeId, req.toSnapshotId);

    // Build file manifests from both snapshots and compare
    const fileDiffs: FileDiffEntry[] = [];
    const surfaceSummaries: DiffSurfaceSummary[] = [];

    for (const toSurface of to.surfaces) {
      if (req.surfaces && !req.surfaces.includes(toSurface.kind)) continue;
      const fromSurface = from.surfaces.find(s => s.kind === toSurface.kind);

      if (!fromSurface) {
        surfaceSummaries.push({ kind: toSurface.kind, added: 1, modified: 0, deleted: 0 });
        continue;
      }

      if (fromSurface.checksum === toSurface.checksum) {
        surfaceSummaries.push({ kind: toSurface.kind, added: 0, modified: 0, deleted: 0 });
        continue;
      }

      // Checksums differ — surface changed
      surfaceSummaries.push({ kind: toSurface.kind, added: 0, modified: 1, deleted: 0 });
    }

    // Check for surfaces deleted in 'to'
    for (const fromSurface of from.surfaces) {
      if (req.surfaces && !req.surfaces.includes(fromSurface.kind)) continue;
      if (!to.surfaces.find(s => s.kind === fromSurface.kind)) {
        surfaceSummaries.push({ kind: fromSurface.kind, added: 0, modified: 0, deleted: 1 });
      }
    }

    const totalChanges = surfaceSummaries.reduce((sum, s) => sum + s.added + s.modified + s.deleted, 0);

    return {
      fromSnapshotId: from.id,
      toSnapshotId: to.id,
      fromCreatedAt: from.createdAt,
      toCreatedAt: to.createdAt,
      surfaceSummaries,
      fileDiffs,
      dbDiffs: [],
      configDiffs: [],
      truncated: false,
      totalChanges,
    };
  }

  // Hermes doesn't have server-side schedules — these are no-ops that persist locally
  async upsertSchedule(_officeId: string, _agentName: string | undefined, _config: BackupScheduleConfig): Promise<BackupSchedule> {
    throw new Error('Backup schedules are not yet supported for Hermes. Use cron or systemd timers.');
  }

  async listSchedules(_officeId: string): Promise<BackupSchedule[]> {
    return [];
  }

  async deleteSchedule(_officeId: string, _scheduleId: string): Promise<void> {
    throw new Error('Backup schedules are not yet supported for Hermes.');
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private loadAllManifests(): BackupManifest[] {
    if (!existsSync(this.backupsDir)) return [];

    const manifests: BackupManifest[] = [];
    for (const dir of readdirSync(this.backupsDir)) {
      const manifestPath = join(this.backupsDir, dir, 'manifest.json');
      if (existsSync(manifestPath)) {
        try {
          manifests.push(JSON.parse(readFileSync(manifestPath, 'utf-8')));
        } catch { /* skip corrupt manifests */ }
      }
    }

    // Newest first
    manifests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return manifests;
  }

  private async captureSurface(kind: DataSurfaceKind, snapshotDir: string): Promise<SnapshotSurface> {
    const startTime = Date.now();
    const archiveName = `${kind}.tar.gz`;
    const archivePath = join(snapshotDir, archiveName);

    try {
      switch (kind) {
        case 'hermes_workspace': {
          const workspacePath = this.findHermesWorkspace();
          if (!workspacePath) throw new Error('Hermes workspace not found');
          execSync(`tar czf ${JSON.stringify(archivePath)} -C ${JSON.stringify(workspacePath)} .`, { timeout: 300000 });
          break;
        }
        case 'hermes_db': {
          const sqlPath = join(snapshotDir, 'hermes_db.sql');
          const dbUrl = process.env.HERMES_DATABASE_URL || process.env.DATABASE_URL;
          if (!dbUrl) throw new Error('No database URL configured for Hermes');
          execSync(`pg_dump "${dbUrl}" > ${JSON.stringify(sqlPath)}`, { timeout: 300000 });
          execSync(`gzip ${JSON.stringify(sqlPath)}`, { timeout: 60000 });
          // gzip renames to .sql.gz
          const gzPath = sqlPath + '.gz';
          // Rename to match expected archive path
          execSync(`mv ${JSON.stringify(gzPath)} ${JSON.stringify(archivePath)}`);
          break;
        }
        default:
          throw new Error(`Surface ${kind} not supported on Hermes`);
      }

      const stat = statSync(archivePath);
      const checksum = this.fileChecksum(archivePath);

      return {
        kind,
        archivePath,
        checksum,
        sizeBytes: stat.size, // compressed (tar.gz), uncompressed unknown
        compressedBytes: stat.size,
        status: 'completed',
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        kind,
        archivePath,
        checksum: '',
        sizeBytes: 0,
        compressedBytes: 0,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async restoreSurface(surface: SnapshotSurface, cleanRestore?: boolean): Promise<void> {
    if (!existsSync(surface.archivePath)) {
      throw new Error(`Archive not found: ${surface.archivePath}`);
    }

    switch (surface.kind) {
      case 'hermes_workspace': {
        const workspacePath = this.findHermesWorkspace();
        if (!workspacePath) throw new Error('Hermes workspace not found');
        if (cleanRestore) {
          execSync(`rm -rf ${JSON.stringify(workspacePath)}/*`, { timeout: 60000 });
        }
        execSync(`tar xzf ${JSON.stringify(surface.archivePath)} -C ${JSON.stringify(workspacePath)}`, { timeout: 300000 });
        break;
      }
      case 'hermes_db': {
        const dbUrl = process.env.HERMES_DATABASE_URL || process.env.DATABASE_URL;
        if (!dbUrl) throw new Error('No database URL configured for Hermes');
        execSync(`gunzip -c ${JSON.stringify(surface.archivePath)} | psql "${dbUrl}"`, { timeout: 300000 });
        break;
      }
      default:
        throw new Error(`Restore not supported for surface: ${surface.kind}`);
    }
  }

  private findHermesWorkspace(): string | undefined {
    const candidates = [
      join(homedir(), '.hermes'),
      join(homedir(), 'pjbrain'),
      join(homedir(), '.pjbrain'),
    ];
    return candidates.find(p => existsSync(p));
  }

  private fileChecksum(filePath: string): string {
    const hash = createHash('sha256');
    const data = readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }
}
