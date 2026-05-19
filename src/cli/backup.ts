import { Command } from 'commander';
import type { OS1AdminClient } from '../client.js';
import type { DataSurfaceKind } from '../types/index.js';
import { readSettings } from './audit-shared.js';

function parseSurfaces(val: string): DataSurfaceKind[] {
  return val.split(',').map(s => s.trim()) as DataSurfaceKind[];
}

export function registerBackupCommand(program: Command, getClient: () => Promise<OS1AdminClient>): void {
  const backup = program
    .command('backup')
    .description('Manage point-in-time snapshots across all data surfaces');

  // ─── Gate check ──────────────────────────────────────────────────────────

  function checkGates(force: boolean): void {
    if (force) return;
    const settings = readSettings();

    const modelProvider = settings.audits['model-provider'];
    if (modelProvider?.report.overall === 'disconnected') {
      console.error(
        '[warn] Model provider is UNSAFE — backups may leak through the same channel.\n' +
        '       Run `mi audit model-provider` for details, or pass --i-know to proceed.',
      );
    }

    const dataAccess = settings.audits['data-access'];
    if (dataAccess?.report.overall === 'disconnected') {
      console.error(
        '[warn] Data access is OFFLINE — the agent cannot read your data.\n' +
        '       Run `mi audit data-access` for details.',
      );
    }
  }

  // ─── mi backup create ────────────────────────────────────────────────────

  backup
    .command('create')
    .description('Create a point-in-time snapshot')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .option('-a, --agent <name>', 'Agent name (omit for office-wide)')
    .option('--surfaces <list>', 'Comma-separated surface kinds', parseSurfaces)
    .option('--label <text>', 'Label for the snapshot')
    .option('--i-know', 'Bypass safety gates')
    .option('--json', 'Emit JSON output')
    .action(async (opts) => {
      checkGates(opts.iKnow);
      const client = await getClient();
      const manifest = await client.backups.createSnapshot(opts.office, {
        agentName: opts.agent,
        surfaces: opts.surfaces,
        label: opts.label,
      });

      if (opts.json) {
        console.log(JSON.stringify(manifest, null, 2));
      } else {
        console.log(`Snapshot created: ${manifest.id}`);
        console.log(`  Status:     ${manifest.status}`);
        console.log(`  Surfaces:   ${manifest.surfaces.length}`);
        console.log(`  Size:       ${formatBytes(manifest.totalCompressedBytes)}`);
        console.log(`  Duration:   ${manifest.durationMs}ms`);
        if (manifest.label) console.log(`  Label:      ${manifest.label}`);
        console.log();
        for (const s of manifest.surfaces) {
          const icon = s.status === 'completed' ? '  [OK]' : '  [!!]';
          console.log(`${icon} ${s.kind} — ${formatBytes(s.compressedBytes)} (${s.durationMs}ms)`);
          if (s.error) console.log(`        Error: ${s.error}`);
        }
      }
    });

  // ─── mi backup list ──────────────────────────────────────────────────────

  backup
    .command('list')
    .description('List snapshots')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .option('-a, --agent <name>', 'Filter by agent name')
    .option('--limit <n>', 'Max results', '20')
    .option('--since <date>', 'Only snapshots after this date')
    .option('--json', 'Emit JSON output')
    .action(async (opts) => {
      const client = await getClient();
      const { snapshots, total } = await client.backups.listSnapshots(opts.office, {
        agentName: opts.agent,
        limit: parseInt(opts.limit, 10),
        since: opts.since,
      });

      if (opts.json) {
        console.log(JSON.stringify({ snapshots, total }, null, 2));
      } else {
        console.log(`Snapshots: ${total} total\n`);
        for (const s of snapshots) {
          const agent = s.agentName ? ` (${s.agentName})` : ' (office-wide)';
          const label = s.label ? ` — ${s.label}` : '';
          console.log(`  ${s.id}  ${s.createdAt}${agent}  ${s.status}  ${formatBytes(s.totalCompressedBytes)}${label}`);
        }
      }
    });

  // ─── mi backup get ───────────────────────────────────────────────────────

  backup
    .command('get')
    .description('Get snapshot details')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .argument('<snapshotId>', 'Snapshot ID')
    .option('--json', 'Emit JSON output')
    .action(async (snapshotId, opts) => {
      const client = await getClient();
      const manifest = await client.backups.getSnapshot(opts.office, snapshotId);

      if (opts.json) {
        console.log(JSON.stringify(manifest, null, 2));
      } else {
        console.log(`Snapshot: ${manifest.id}`);
        console.log(`  Created:    ${manifest.createdAt}`);
        console.log(`  Status:     ${manifest.status}`);
        console.log(`  Platform:   ${manifest.platform}`);
        console.log(`  Agent:      ${manifest.agentName ?? '(office-wide)'}`);
        console.log(`  Trigger:    ${manifest.trigger}`);
        console.log(`  Size:       ${formatBytes(manifest.totalCompressedBytes)}`);
        console.log(`  Duration:   ${manifest.durationMs}ms`);
        if (manifest.label) console.log(`  Label:      ${manifest.label}`);
        console.log(`\n  Surfaces:`);
        for (const s of manifest.surfaces) {
          console.log(`    ${s.kind}: ${s.status} — ${formatBytes(s.compressedBytes)}`);
          if (s.tables?.length) console.log(`      Tables: ${s.tables.join(', ')}`);
          if (s.fileCount) console.log(`      Files: ${s.fileCount}`);
          if (s.rowCount) console.log(`      Rows: ${s.rowCount}`);
        }
      }
    });

  // ─── mi backup delete ────────────────────────────────────────────────────

  backup
    .command('delete')
    .description('Delete a snapshot')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .argument('<snapshotId>', 'Snapshot ID')
    .action(async (snapshotId, opts) => {
      const client = await getClient();
      await client.backups.deleteSnapshot(opts.office, snapshotId);
      console.log(`Deleted snapshot: ${snapshotId}`);
    });

  // ─── mi backup restore ──────────────────────────────────────────────────

  backup
    .command('restore')
    .description('Restore from a snapshot')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .argument('<snapshotId>', 'Snapshot ID to restore from')
    .option('-a, --agent <name>', 'Agent name')
    .option('--surfaces <list>', 'Comma-separated surfaces to restore', parseSurfaces)
    .option('--clean', 'Wipe existing data before restoring')
    .option('--i-know', 'Bypass safety gates')
    .option('--json', 'Emit JSON output')
    .action(async (snapshotId, opts) => {
      checkGates(opts.iKnow);
      const client = await getClient();
      const result = await client.backups.restore(opts.office, {
        snapshotId,
        agentName: opts.agent,
        surfaces: opts.surfaces,
        cleanRestore: opts.clean,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Restore: ${result.status}\n`);
        for (const r of result.surfaceResults) {
          const icon = r.status === 'restored' ? '[OK]' : r.status === 'skipped' ? '[--]' : '[!!]';
          console.log(`  ${icon} ${r.kind}: ${r.status}${r.error ? ` — ${r.error}` : ''}`);
        }
      }
    });

  // ─── mi backup diff ─────────────────────────────────────────────────────

  backup
    .command('diff')
    .description('Compare two snapshots')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .argument('<fromId>', 'Older snapshot ID')
    .argument('<toId>', 'Newer snapshot ID')
    .option('--surfaces <list>', 'Comma-separated surfaces to diff', parseSurfaces)
    .option('--max-diffs <n>', 'Max file/DB diffs to return', '50')
    .option('--json', 'Emit JSON output')
    .action(async (fromId, toId, opts) => {
      const client = await getClient();
      const diff = await client.backups.diff(opts.office, {
        fromSnapshotId: fromId,
        toSnapshotId: toId,
        surfaces: opts.surfaces,
        maxFileDiffs: parseInt(opts.maxDiffs, 10),
        maxDbDiffs: parseInt(opts.maxDiffs, 10),
      });

      if (opts.json) {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        console.log(`Diff: ${diff.fromSnapshotId.slice(0, 8)} → ${diff.toSnapshotId.slice(0, 8)}`);
        console.log(`  ${diff.fromCreatedAt} → ${diff.toCreatedAt}`);
        console.log(`  Total changes: ${diff.totalChanges}${diff.truncated ? ' (truncated)' : ''}\n`);

        for (const s of diff.surfaceSummaries) {
          const parts = [];
          if (s.added) parts.push(`+${s.added}`);
          if (s.modified) parts.push(`~${s.modified}`);
          if (s.deleted) parts.push(`-${s.deleted}`);
          console.log(`  ${s.kind}: ${parts.join(', ') || 'no changes'}`);
        }

        if (diff.fileDiffs.length > 0) {
          console.log('\n  File changes:');
          for (const f of diff.fileDiffs) {
            const sizeInfo = f.changeType === 'deleted'
              ? formatBytes(f.sizeFrom)
              : f.changeType === 'added'
                ? formatBytes(f.sizeTo)
                : `${formatBytes(f.sizeFrom)} → ${formatBytes(f.sizeTo)}`;
            console.log(`    ${f.changeType[0].toUpperCase()} ${f.path}  (${sizeInfo})`);
          }
        }

        if (diff.dbDiffs.length > 0) {
          console.log('\n  Database changes:');
          for (const d of diff.dbDiffs) {
            const pk = JSON.stringify(d.primaryKey);
            console.log(`    ${d.changeType[0].toUpperCase()} ${d.table} ${pk}`);
            if (d.changedColumns?.length) {
              console.log(`      Changed: ${d.changedColumns.join(', ')}`);
            }
          }
        }
      }
    });

  // ─── mi backup schedule ─────────────────────────────────────────────────

  const schedule = backup
    .command('schedule')
    .description('Manage backup schedules');

  schedule
    .command('set')
    .description('Create or update a backup schedule')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .option('-a, --agent <name>', 'Agent name')
    .requiredOption('--cron <expression>', 'Cron schedule (e.g. "0 */6 * * *")')
    .option('--retention <n>', 'Snapshots to retain', '7')
    .option('--surfaces <list>', 'Comma-separated surfaces', parseSurfaces)
    .option('--label <text>', 'Label for scheduled snapshots')
    .option('--json', 'Emit JSON output')
    .action(async (opts) => {
      const client = await getClient();
      const sched = await client.backups.upsertSchedule(opts.office, opts.agent, {
        cron: opts.cron,
        retention: parseInt(opts.retention, 10),
        surfaces: opts.surfaces,
        enabled: true,
        label: opts.label,
      });

      if (opts.json) {
        console.log(JSON.stringify(sched, null, 2));
      } else {
        console.log(`Schedule set: ${sched.id}`);
        console.log(`  Cron:       ${sched.config.cron}`);
        console.log(`  Retention:  ${sched.config.retention}`);
        console.log(`  Next run:   ${sched.nextRunAt ?? 'pending'}`);
      }
    });

  schedule
    .command('list')
    .description('List backup schedules')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .option('--json', 'Emit JSON output')
    .action(async (opts) => {
      const client = await getClient();
      const schedules = await client.backups.listSchedules(opts.office);

      if (opts.json) {
        console.log(JSON.stringify(schedules, null, 2));
      } else {
        if (schedules.length === 0) {
          console.log('No backup schedules configured.');
        } else {
          for (const s of schedules) {
            const agent = s.agentName ? ` (${s.agentName})` : '';
            console.log(`  ${s.id}  ${s.config.cron}  retain=${s.config.retention}  enabled=${s.config.enabled}${agent}`);
            if (s.lastRunAt) console.log(`    Last: ${s.lastRunAt}  Next: ${s.nextRunAt}`);
          }
        }
      }
    });

  schedule
    .command('delete')
    .description('Delete a backup schedule')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .argument('<scheduleId>', 'Schedule ID')
    .action(async (scheduleId, opts) => {
      const client = await getClient();
      await client.backups.deleteSchedule(opts.office, scheduleId);
      console.log(`Deleted schedule: ${scheduleId}`);
    });

  // ─── mi backup health ───────────────────────────────────────────────────

  backup
    .command('health')
    .description('Check backup configuration and health')
    .requiredOption('-o, --office <officeId>', 'Office ID')
    .option('--json', 'Emit JSON output')
    .action(async (opts) => {
      const client = await getClient();
      const health = await client.backups.health(opts.office);

      if (opts.json) {
        console.log(JSON.stringify(health, null, 2));
      } else {
        console.log(`Backup Health`);
        console.log(`  Configured:     ${health.configured}`);
        console.log(`  Storage:        ${health.storageBackend ?? 'none'} (${health.storageLocation ?? 'not set'})`);
        console.log(`  Reachable:      ${health.storageReachable ?? 'unknown'}`);
        console.log(`  Total snaps:    ${health.totalSnapshots}`);
        console.log(`  Total storage:  ${formatBytes(health.totalStorageBytes)}`);
        if (health.hoursSinceLastBackup != null) {
          console.log(`  Last backup:    ${health.hoursSinceLastBackup.toFixed(1)}h ago`);
        } else {
          console.log(`  Last backup:    never`);
        }
        console.log(`  Schedule:       ${health.schedules.length} active${health.scheduleOverdue ? ' (OVERDUE)' : ''}`);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
