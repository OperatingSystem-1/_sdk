import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupsAPI } from '../src/api/backups.js';
import { OpenClawBackupProvider } from '../src/api/backup-openclaw.js';
import { HermesBackupProvider } from '../src/api/backup-hermes.js';
import { OS1AdminClient } from '../src/client.js';
import type { Transport } from '../src/transport.js';
import type {
  BackupManifest,
  BackupDiff,
  BackupSchedule,
  BackupHealthStatus,
  RestoreResult,
} from '../src/types/index.js';

// ─── Mock transport ─────────────────────────────────────────────────────────

function mockTransport(): Transport {
  return {
    endpoint: 'http://localhost:3000',
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
    stream: vi.fn(),
    request: vi.fn(),
  } as any;
}

// ─── BackupsAPI ─────────────────────────────────────────────────────────────

describe('BackupsAPI', () => {
  let transport: ReturnType<typeof mockTransport>;
  let api: BackupsAPI;

  beforeEach(() => {
    transport = mockTransport();
    api = new BackupsAPI(transport);
  });

  describe('legacy endpoints', () => {
    it('list() calls office-manager /backups', async () => {
      (transport.get as any).mockResolvedValue([{ id: 'b1' }]);
      const result = await api.list('office-1');
      expect(transport.get).toHaveBeenCalledWith('/api/v1/offices/office-1/backups', undefined);
      expect(result).toEqual([{ id: 'b1' }]);
    });

    it('list() with employee filter', async () => {
      (transport.get as any).mockResolvedValue([]);
      await api.list('office-1', { employee: 'atlas' });
      expect(transport.get).toHaveBeenCalledWith('/api/v1/offices/office-1/backups', { employee: 'atlas' });
    });

    it('get() fetches by ID', async () => {
      (transport.get as any).mockResolvedValue({ id: 'b1', s3_key: 'test.tar.gz' });
      const result = await api.get('office-1', 'b1');
      expect(transport.get).toHaveBeenCalledWith('/api/v1/offices/office-1/backups/b1');
      expect(result.s3_key).toBe('test.tar.gz');
    });

    it('delete() calls correct path', async () => {
      (transport.delete as any).mockResolvedValue(undefined);
      await api.delete('office-1', 'b1');
      expect(transport.delete).toHaveBeenCalledWith('/api/v1/offices/office-1/backups/b1');
    });
  });

  describe('snapshot endpoints', () => {
    const manifest: BackupManifest = {
      id: 'snap-1',
      manifestVersion: '1.0.0',
      platform: 'openclaw',
      storageBackend: 's3',
      officeId: 'office-1',
      trigger: 'manual',
      status: 'completed',
      createdAt: '2026-05-19T14:00:00Z',
      completedAt: '2026-05-19T14:00:12Z',
      durationMs: 12000,
      totalSizeBytes: 1048576,
      totalCompressedBytes: 524288,
      surfaces: [],
      storageLocation: 's3://bucket',
      storagePath: 'snapshots/office-1/snap-1/',
      manifestPath: 'snapshots/office-1/snap-1/manifest.json',
    };

    it('createSnapshot() posts to /api/snapshots', async () => {
      (transport.post as any).mockResolvedValue(manifest);
      const result = await api.createSnapshot('office-1', { label: 'test' });
      expect(transport.post).toHaveBeenCalledWith('/api/snapshots', { label: 'test' });
      expect(result.id).toBe('snap-1');
    });

    it('listSnapshots() gets from /api/snapshots', async () => {
      (transport.get as any).mockResolvedValue({ snapshots: [manifest], total: 1 });
      const result = await api.listSnapshots('office-1', { agentName: 'atlas', limit: 10 });
      expect(transport.get).toHaveBeenCalledWith('/api/snapshots', { agentName: 'atlas', limit: 10 });
      expect(result.total).toBe(1);
    });

    it('getSnapshot() gets by ID', async () => {
      (transport.get as any).mockResolvedValue(manifest);
      const result = await api.getSnapshot('office-1', 'snap-1');
      expect(transport.get).toHaveBeenCalledWith('/api/snapshots/snap-1');
      expect(result.status).toBe('completed');
    });

    it('deleteSnapshot() deletes by ID', async () => {
      (transport.delete as any).mockResolvedValue(undefined);
      await api.deleteSnapshot('office-1', 'snap-1');
      expect(transport.delete).toHaveBeenCalledWith('/api/snapshots/snap-1');
    });

    it('restore() posts to /api/snapshots/restore', async () => {
      const restoreResult: RestoreResult = {
        status: 'completed',
        surfaceResults: [{ kind: 'agent_workspace', status: 'restored' }],
      };
      (transport.post as any).mockResolvedValue(restoreResult);
      const result = await api.restore('office-1', { snapshotId: 'snap-1' });
      expect(transport.post).toHaveBeenCalledWith('/api/snapshots/restore', { snapshotId: 'snap-1' });
      expect(result.status).toBe('completed');
    });

    it('diff() posts to /api/snapshots/diff', async () => {
      const diff: BackupDiff = {
        fromSnapshotId: 'snap-1',
        toSnapshotId: 'snap-2',
        fromCreatedAt: '2026-05-19T14:00:00Z',
        toCreatedAt: '2026-05-19T15:00:00Z',
        surfaceSummaries: [{ kind: 'agent_workspace', added: 0, modified: 1, deleted: 0 }],
        fileDiffs: [],
        dbDiffs: [],
        configDiffs: [],
        truncated: false,
        totalChanges: 1,
      };
      (transport.post as any).mockResolvedValue(diff);
      const result = await api.diff('office-1', { fromSnapshotId: 'snap-1', toSnapshotId: 'snap-2' });
      expect(result.totalChanges).toBe(1);
    });

    it('health() gets from /api/snapshots/health', async () => {
      const health: BackupHealthStatus = {
        configured: true,
        storageBackend: 's3',
        schedules: [],
        scheduleOverdue: false,
        totalSnapshots: 5,
        totalStorageBytes: 10485760,
      };
      (transport.get as any).mockResolvedValue(health);
      const result = await api.health('office-1');
      expect(transport.get).toHaveBeenCalledWith('/api/snapshots/health');
      expect(result.totalSnapshots).toBe(5);
    });
  });

  describe('schedule endpoints', () => {
    it('upsertSchedule() puts to /api/snapshots/schedules', async () => {
      const sched: BackupSchedule = {
        id: 'sched-1',
        officeId: 'office-1',
        config: { cron: '0 */6 * * *', retention: 7, enabled: true },
        createdAt: '2026-05-19T14:00:00Z',
        updatedAt: '2026-05-19T14:00:00Z',
      };
      (transport.put as any).mockResolvedValue(sched);
      const result = await api.upsertSchedule('office-1', undefined, {
        cron: '0 */6 * * *',
        retention: 7,
        enabled: true,
      });
      expect(transport.put).toHaveBeenCalledWith('/api/snapshots/schedules', {
        agentName: undefined,
        cron: '0 */6 * * *',
        retention: 7,
        enabled: true,
      });
      expect(result.id).toBe('sched-1');
    });

    it('listSchedules() gets from /api/snapshots/schedules', async () => {
      (transport.get as any).mockResolvedValue([]);
      const result = await api.listSchedules('office-1');
      expect(transport.get).toHaveBeenCalledWith('/api/snapshots/schedules');
      expect(result).toEqual([]);
    });

    it('deleteSchedule() deletes by ID', async () => {
      (transport.delete as any).mockResolvedValue(undefined);
      await api.deleteSchedule('office-1', 'sched-1');
      expect(transport.delete).toHaveBeenCalledWith('/api/snapshots/schedules/sched-1');
    });
  });
});

// ─── OpenClawBackupProvider ─────────────────────────────────────────────────

describe('OpenClawBackupProvider', () => {
  it('has correct platform and surfaces', () => {
    const transport = mockTransport();
    const api = new BackupsAPI(transport);
    const provider = new OpenClawBackupProvider(api);

    expect(provider.platform).toBe('openclaw');
    expect(provider.availableSurfaces).toContain('agent_workspace');
    expect(provider.availableSurfaces).toContain('shared_db');
    expect(provider.availableSurfaces).toContain('neon_db');
    expect(provider.availableSurfaces).not.toContain('hermes_workspace');
  });

  it('delegates createSnapshot to BackupsAPI', async () => {
    const transport = mockTransport();
    const api = new BackupsAPI(transport);
    const provider = new OpenClawBackupProvider(api);

    const manifest = { id: 'snap-1', status: 'completed' };
    (transport.post as any).mockResolvedValue(manifest);

    const result = await provider.createSnapshot('office-1', { label: 'test' });
    expect(result.id).toBe('snap-1');
  });
});

// ─── HermesBackupProvider ───────────────────────────────────────────────────

describe('HermesBackupProvider', () => {
  it('has correct platform and surfaces', () => {
    const provider = new HermesBackupProvider('/tmp/test-backups');
    expect(provider.platform).toBe('hermes');
    expect(provider.availableSurfaces).toContain('hermes_workspace');
    expect(provider.availableSurfaces).toContain('hermes_db');
    expect(provider.availableSurfaces).not.toContain('agent_workspace');
  });

  it('healthCheck returns local storage info', async () => {
    const provider = new HermesBackupProvider('/tmp/test-backups');
    const health = await provider.healthCheck();
    expect(health.configured).toBe(true);
    expect(health.storageBackend).toBe('local');
    expect(health.storageLocation).toBe('/tmp/test-backups');
  });

  it('listSnapshots returns empty for fresh provider', async () => {
    const provider = new HermesBackupProvider('/tmp/test-backups-empty-' + Date.now());
    const { snapshots, total } = await provider.listSnapshots('local');
    expect(snapshots).toEqual([]);
    expect(total).toBe(0);
  });

  it('deleteSnapshot is a no-op for missing ID', async () => {
    const provider = new HermesBackupProvider('/tmp/test-backups-noop-' + Date.now());
    await expect(provider.deleteSnapshot('local', 'nonexistent')).resolves.toBeUndefined();
  });

  it('getSnapshot throws for missing snapshot', async () => {
    const provider = new HermesBackupProvider('/tmp/test-backups-miss-' + Date.now());
    await expect(provider.getSnapshot('local', 'missing')).rejects.toThrow('not found');
  });

  it('throws on schedule operations (not supported)', async () => {
    const provider = new HermesBackupProvider('/tmp/test-backups-sched-' + Date.now());
    await expect(
      provider.upsertSchedule('local', undefined, { cron: '0 * * * *', retention: 7, enabled: true }),
    ).rejects.toThrow('not yet supported');
  });
});

// ─── Client integration ────────────────────────────────────────────────────

describe('OS1AdminClient backup integration', () => {
  it('backupProvider() returns OpenClawBackupProvider by default', () => {
    const client = new OS1AdminClient({
      endpoint: 'http://localhost:3000',
      jwt: { jwtSecret: 'test-secret-for-jwt-signing-32chars!!' },
    });
    const provider = client.backupProvider();
    expect(provider.platform).toBe('openclaw');
  });

  it('backupProvider("hermes") returns HermesBackupProvider', () => {
    const client = new OS1AdminClient({
      endpoint: 'http://localhost:3000',
      jwt: { jwtSecret: 'test-secret-for-jwt-signing-32chars!!' },
    });
    const provider = client.backupProvider('hermes');
    expect(provider.platform).toBe('hermes');
  });

  it('backups API module is wired correctly', () => {
    const client = new OS1AdminClient({
      endpoint: 'http://localhost:3000',
      jwt: { jwtSecret: 'test-secret-for-jwt-signing-32chars!!' },
    });
    expect(client.backups).toBeInstanceOf(BackupsAPI);
  });
});
