# Backup Provider Framework

A unified backup system for OS-1 that works across both platforms (OpenClaw
and Hermes). Provides point-in-time snapshots, restore, diff, and scheduling
across all data surfaces.

---

## Architecture

```
mi backup create ──→ BackupProvider.createSnapshot()
                         │
                 ┌───────┴────────┐
                 │                │
          OpenClawProvider   HermesProvider
          (HTTP → OM API)    (local filesystem)
                 │                │
          office-manager     tar/pg_dump
          orchestrator       to ~/.os1/backups/
                 │
          S3 multipart
          streaming
```

### BackupProvider Interface

All backup operations go through a single `BackupProvider` interface.
Platform detection is automatic (via env vars) or explicit (`--platform`).

```typescript
interface BackupProvider {
  readonly platform: BackupPlatform;
  readonly availableSurfaces: DataSurfaceKind[];

  healthCheck(): Promise<BackupHealthStatus>;
  createSnapshot(officeId, req): Promise<BackupManifest>;
  listSnapshots(officeId, opts?): Promise<{ snapshots, total }>;
  getSnapshot(officeId, snapshotId): Promise<BackupManifest>;
  deleteSnapshot(officeId, snapshotId): Promise<void>;
  restore(officeId, req): Promise<RestoreResult>;
  diff(officeId, req): Promise<BackupDiff>;
  upsertSchedule(officeId, agentName?, config): Promise<BackupSchedule>;
  listSchedules(officeId): Promise<BackupSchedule[]>;
  deleteSchedule(officeId, scheduleId): Promise<void>;
}
```

### Data Surfaces

| Kind | Description | OpenClaw | Hermes |
|------|-------------|----------|--------|
| `agent_workspace` | Agent workspace PVC | Yes | — |
| `agent_memory` | ~/.memory/ state + logs | Yes | — |
| `shared_db` | Per-office shared PostgreSQL | Yes | — |
| `neon_db` | Office-scoped Neon rows | Yes | — |
| `file_server` | Per-office shared drive | Yes | — |
| `chat_sessions` | Chat-server sessions | Yes | — |
| `hermes_workspace` | ~/.hermes/ directory | — | Yes |
| `hermes_db` | Hermes local PostgreSQL | — | Yes |

---

## CLI Commands

### `mi backup create`

```
mi backup create -o <officeId> [-a <agentName>] [--surfaces workspace,db] [--label "pre-deploy"]
```

Creates a point-in-time snapshot. On OpenClaw, calls the office-manager
`POST /snapshots` endpoint. On Hermes, creates local archives.

### `mi backup list`

```
mi backup list -o <officeId> [-a <agentName>] [--limit 20] [--since 2026-05-01]
```

### `mi backup get`

```
mi backup get -o <officeId> <snapshotId>
```

### `mi backup restore`

```
mi backup restore -o <officeId> <snapshotId> [-a <agentName>] [--clean] [--surfaces workspace]
```

### `mi backup diff`

```
mi backup diff -o <officeId> <fromId> <toId> [--surfaces workspace,db] [--max-diffs 50]
```

Computes differences between two snapshots:
- File-level: added/modified/deleted with unified diffs
- Database: row-level inserts/updates/deletes per table
- Config: JSON deep-diff of agent state

### `mi backup schedule`

```
mi backup schedule set -o <officeId> --cron "0 */6 * * *" --retention 7
mi backup schedule list -o <officeId>
mi backup schedule delete -o <officeId> <scheduleId>
```

### `mi backup health`

```
mi backup health -o <officeId>
```

### `mi audit backup`

```
mi audit backup [-p openclaw|hermes] [-o <officeId>] [--json] [--no-save]
```

Checks backup health across four surfaces:
- **backup-storage**: Is S3/local storage configured and reachable?
- **backup-recency**: Is there a snapshot within 24h?
- **backup-schedule**: Is a schedule active and not overdue?
- **backup-coverage**: Does the latest snapshot include all surfaces?

Results persist to `~/.os1/settings.json` under `audits["backup"]`.

---

## Gate Pattern

The `mi backup` commands read `~/.os1/settings.json` and warn if:

- `audits["model-provider"].report.overall === "disconnected"`: provider is
  UNSAFE, backups would also leak through the same channel.
- `audits["data-access"].report.overall === "disconnected"`: data access is
  offline.

Pass `--i-know` to bypass.

---

## Snapshot Manifest

Every snapshot produces a `BackupManifest` — a self-describing JSON document
that records what was captured, where it's stored, and checksums for integrity.

```json
{
  "id": "abc123",
  "manifestVersion": "1.0.0",
  "platform": "openclaw",
  "storageBackend": "s3",
  "officeId": "...",
  "agentName": "os1-atlas",
  "trigger": "manual",
  "status": "completed",
  "surfaces": [
    {
      "kind": "agent_workspace",
      "archivePath": "snapshots/.../agent_workspace_os1-atlas.tar.gz",
      "checksum": "sha256:...",
      "sizeBytes": 1048576,
      "compressedBytes": 524288,
      "fileCount": 142,
      "status": "completed",
      "durationMs": 3200
    }
  ],
  "totalSizeBytes": 4194304,
  "totalCompressedBytes": 2097152,
  "createdAt": "2026-05-19T14:00:00Z",
  "completedAt": "2026-05-19T14:00:12Z"
}
```

---

## File Layout

```
_sdk/
  src/api/
    backups.ts              # BackupsAPI module (HTTP client)
    backup-provider.ts      # BackupProvider interface
    backup-openclaw.ts      # OpenClaw implementation (delegates to API)
    backup-hermes.ts        # Hermes implementation (local filesystem)
  src/cli/
    backup.ts               # mi backup commands
    audit-backup.ts         # mi audit backup surface
  src/types/
    index.ts                # All backup types (BackupManifest, BackupDiff, etc.)
  docs/
    backup-provider.md      # This file
```
