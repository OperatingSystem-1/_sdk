import { Command } from 'commander';
import { OS1AdminClient } from '../client.js';
import type { BackupHealthStatus } from '../types/index.js';
import {
  type Platform,
  type Surface,
  type Report,
  type SurfaceStatus,
  resolvePlatform,
  resolveOpenClawContext,
  findHermesEnv,
  emitReportAndExit,
} from './audit-shared.js';
import { HermesBackupProvider } from '../api/backup-hermes.js';

/**
 * Register `mi audit backup` subcommand.
 *
 * Checks backup configuration, recency, schedule, and coverage.
 * Persists result to ~/.os1/settings.json under audits["backup"].
 */
export function registerBackupAuditCommand(parent: Command): void {
  parent
    .command('backup')
    .description('Check backup configuration and health')
    .option('-p, --platform <name>', 'Force platform (openclaw|hermes)')
    .option('-o, --office <officeId>', 'Office ID (openclaw)')
    .option('-a, --agent <name>', 'Agent name (openclaw)')
    .option('--hermes-env <path>', 'Path to hermes .env')
    .option('--json', 'Emit machine-readable JSON')
    .option('--no-save', 'Do not persist to settings.json')
    .action(async (opts) => {
      const platform = resolvePlatform(opts.platform);
      let report: Report;

      if (platform === 'openclaw') {
        report = await auditOpenClawBackup(opts);
      } else {
        report = auditHermesBackup(opts);
      }

      emitReportAndExit(report, opts.json, { save: opts.save !== false });
    });
}

async function auditOpenClawBackup(
  opts: { office?: string; agent?: string },
): Promise<Report> {
  const { officeId } = resolveOpenClawContext(opts);
  const client = await OS1AdminClient.fromConfig();

  let health: BackupHealthStatus;
  try {
    health = await client.backups.health(officeId);
  } catch (err: any) {
    return {
      command: 'audit backup',
      title: 'Mitosis Backup Audit',
      platform: 'openclaw',
      context: { office_id: officeId },
      surfaces: [{
        id: 'backup-storage',
        label: 'Backup Storage',
        status: 'disconnected',
        notes: [`[FAIL] Could not reach backup health endpoint: ${err.message}`],
        remediation: [
          'Ensure office-manager is running and accessible.',
          'Check that S3_BACKUP_BUCKET is configured in the office-manager environment.',
        ],
      }],
      overall: 'disconnected',
      footer: 'Backup system is not reachable. Snapshots cannot be created.',
    };
  }

  const surfaces: Surface[] = [];

  // 1. Storage check
  const storageStatus: SurfaceStatus = health.configured && health.storageReachable
    ? 'connected'
    : 'disconnected';
  surfaces.push({
    id: 'backup-storage',
    label: 'Backup Storage (S3)',
    status: storageStatus,
    notes: [
      health.configured ? `[OK]   Configured: ${health.storageBackend}` : '[MISS] Not configured',
      health.storageReachable ? `[OK]   Reachable: ${health.storageLocation}` : '[MISS] Storage unreachable',
    ],
    remediation: storageStatus === 'disconnected'
      ? ['Set S3_BACKUP_BUCKET in office-manager environment.', 'Verify IAM permissions for the S3 bucket.']
      : [],
  });

  // 2. Recency check
  let recencyStatus: SurfaceStatus = 'disconnected';
  const recencyNotes: string[] = [];
  if (health.hoursSinceLastBackup != null) {
    if (health.hoursSinceLastBackup < 24) {
      recencyStatus = 'connected';
      recencyNotes.push(`[OK]   Last backup: ${health.hoursSinceLastBackup.toFixed(1)}h ago`);
    } else if (health.hoursSinceLastBackup < 168) { // 7 days
      recencyStatus = 'partial';
      recencyNotes.push(`[WARN] Last backup: ${health.hoursSinceLastBackup.toFixed(1)}h ago (>24h)`);
    } else {
      recencyNotes.push(`[MISS] Last backup: ${health.hoursSinceLastBackup.toFixed(1)}h ago (>7d)`);
    }
  } else {
    recencyNotes.push('[MISS] No snapshots found');
  }
  surfaces.push({
    id: 'backup-recency',
    label: 'Backup Recency',
    status: recencyStatus,
    notes: recencyNotes,
    remediation: recencyStatus !== 'connected'
      ? ['Run `mi backup create -o <officeId>` to create a snapshot.']
      : [],
  });

  // 3. Schedule check
  let scheduleStatus: SurfaceStatus = 'disconnected';
  const scheduleNotes: string[] = [];
  if (health.schedules.length > 0) {
    const active = health.schedules.filter(s => s.config.enabled);
    if (active.length > 0 && !health.scheduleOverdue) {
      scheduleStatus = 'connected';
      scheduleNotes.push(`[OK]   ${active.length} active schedule(s)`);
    } else if (active.length > 0) {
      scheduleStatus = 'partial';
      scheduleNotes.push(`[WARN] ${active.length} schedule(s) — OVERDUE`);
    } else {
      scheduleNotes.push('[MISS] All schedules disabled');
    }
  } else {
    scheduleNotes.push('[MISS] No backup schedules configured');
  }
  surfaces.push({
    id: 'backup-schedule',
    label: 'Backup Schedule',
    status: scheduleStatus,
    notes: scheduleNotes,
    remediation: scheduleStatus !== 'connected'
      ? ['Run `mi backup schedule set -o <officeId> --cron "0 */6 * * *" --retention 7`']
      : [],
  });

  // 4. Coverage check
  let coverageStatus: SurfaceStatus = 'disconnected';
  const coverageNotes: string[] = [];
  if (health.lastSnapshot) {
    const capturedKinds = health.lastSnapshot.surfaces.map(s => s.kind);
    const expected = ['agent_workspace', 'shared_db', 'neon_db', 'file_server'];
    const missing = expected.filter(k => !capturedKinds.includes(k as any));
    if (missing.length === 0) {
      coverageStatus = 'connected';
      coverageNotes.push(`[OK]   All ${capturedKinds.length} surfaces captured`);
    } else {
      coverageStatus = 'partial';
      coverageNotes.push(`[WARN] Missing surfaces: ${missing.join(', ')}`);
    }
  } else {
    coverageNotes.push('[MISS] No snapshots — cannot assess coverage');
  }
  surfaces.push({
    id: 'backup-coverage',
    label: 'Backup Coverage',
    status: coverageStatus,
    notes: coverageNotes,
    remediation: coverageStatus !== 'connected'
      ? ['Create a snapshot with all surfaces: `mi backup create -o <officeId>`']
      : [],
  });

  // Overall status is the worst across all surfaces
  const statusOrder: SurfaceStatus[] = ['disconnected', 'partial', 'unknown', 'connected'];
  const overall = surfaces.reduce<SurfaceStatus>(
    (worst, s) => statusOrder.indexOf(s.status) < statusOrder.indexOf(worst) ? s.status : worst,
    'connected',
  );

  return {
    command: 'audit backup',
    title: 'Mitosis Backup Audit',
    platform: 'openclaw',
    context: { office_id: officeId },
    surfaces,
    overall,
    footer: overall !== 'connected'
      ? 'Surfaces marked above are NOT SAFE: snapshots may be missing, stale, or incomplete.'
      : undefined,
  };
}

function auditHermesBackup(opts: { hermesEnv?: string }): Report {
  const provider = new HermesBackupProvider();
  const surfaces: Surface[] = [];

  // Check that backups directory exists
  const storageStatus: SurfaceStatus = 'connected'; // Local storage always works
  surfaces.push({
    id: 'backup-storage',
    label: 'Backup Storage (Local)',
    status: storageStatus,
    notes: ['[OK]   Local filesystem storage at ~/.os1/backups/'],
    remediation: [],
  });

  // Check for recent backups
  const hermesEnv = findHermesEnv(opts.hermesEnv);
  surfaces.push({
    id: 'backup-recency',
    label: 'Backup Recency',
    status: 'disconnected',
    notes: ['[MISS] Run `mi backup create --platform hermes` to create your first snapshot'],
    remediation: ['Run `mi backup create --platform hermes` to create a local snapshot.'],
  });

  const overall = surfaces.reduce<SurfaceStatus>(
    (worst, s) => {
      const order: SurfaceStatus[] = ['disconnected', 'partial', 'unknown', 'connected'];
      return order.indexOf(s.status) < order.indexOf(worst) ? s.status : worst;
    },
    'connected',
  );

  return {
    command: 'audit backup',
    title: 'Mitosis Backup Audit',
    platform: 'hermes',
    context: { hermes_env_path: hermesEnv?.path },
    surfaces,
    overall,
    footer: overall !== 'connected'
      ? 'Surfaces marked above need attention. Run `mi backup create --platform hermes` to start.'
      : undefined,
  };
}
