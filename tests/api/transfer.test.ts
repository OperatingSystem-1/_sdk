import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferAPI } from '../../src/api/transfer.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TransferStatus, TransferReport } from '../../src/types/index.js';

// ─── Mock Transport ─────────────────────────────────────────────────────────

function createMockTransport(responses: Record<string, unknown[]>) {
  const callLog: Array<{ method: string; path: string; body?: unknown }> = [];

  // Track call counts per path to cycle through responses
  const counters: Record<string, number> = {};

  const handler = (method: string) => async (path: string, body?: unknown) => {
    callLog.push({ method, path, body });
    const key = `${method}:${path}`;
    const resps = responses[key];
    if (!resps) throw new Error(`No mock for ${key}`);
    const idx = counters[key] ?? 0;
    counters[key] = idx + 1;
    const resp = resps[Math.min(idx, resps.length - 1)];
    if (resp instanceof Error) throw resp;
    return resp;
  };

  return {
    transport: {
      get: handler('GET'),
      post: handler('POST'),
      put: handler('PUT'),
      patch: handler('PATCH'),
      delete: handler('DELETE'),
    } as any,
    callLog,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

let tmpDir: string;
let bundlePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'os1-transfer-api-test-'));
  bundlePath = join(tmpDir, 'test-bundle.tar.gz');
  writeFileSync(bundlePath, Buffer.from('fake tar.gz content for testing'));
});

describe('TransferAPI.upload()', () => {
  it('sends manifest and base64-encoded bundle for small files', async () => {
    const { transport, callLog } = createMockTransport({
      'POST:/api/agents/clone/transfer': [
        { transfer_id: 'tx-1', phase: 'installing', progress: 10, message: 'Started' },
      ],
    });

    const api = new TransferAPI(transport);
    const result = await api.upload('tx-1', bundlePath, {
      version: '1.0',
      agent_name: 'test',
      origin: 'test',
      packed_at: new Date().toISOString(),
      files: {},
      stats: {} as any,
    });

    expect(result.phase).toBe('installing');
    expect(callLog).toHaveLength(1);
    expect(callLog[0].method).toBe('POST');
    expect(callLog[0].path).toBe('/api/agents/clone/transfer');
    expect((callLog[0].body as any).transfer_id).toBe('tx-1');
    expect((callLog[0].body as any).bundle_base64).toBeDefined();
  });
});

describe('TransferAPI.status()', () => {
  it('calls correct endpoint and returns status', async () => {
    const { transport } = createMockTransport({
      'GET:/api/agents/join/status/tx-42': [
        { transfer_id: 'tx-42', phase: 'configuring', progress: 70, message: 'Merging config' },
      ],
    });

    const api = new TransferAPI(transport);
    const s = await api.status('tx-42');
    expect(s.transfer_id).toBe('tx-42');
    expect(s.phase).toBe('configuring');
    expect(s.progress).toBe(70);
  });
});

describe('TransferAPI.waitForOnline()', () => {
  it('resolves when transfer reaches online', async () => {
    const report: TransferReport = {
      transfer_id: 'tx-1',
      origin_agent: 'jared',
      clone_name: 'jared-2',
      office_id: 'off-1',
      started_at: '2026-04-08T21:40:00Z',
      completed_at: '2026-04-08T21:41:12Z',
      duration_ms: 72000,
      overall_status: 'completed',
      phases: {},
      summary: {
        files_transferred: 12,
        files_failed: 0,
        memory_entries: 3,
        personality_transferred: true,
        provider_preserved: true,
        warnings: [],
        errors: [],
      },
    };

    const { transport } = createMockTransport({
      'GET:/api/agents/join/status/tx-1': [
        { transfer_id: 'tx-1', phase: 'installing', progress: 40, message: 'Installing' },
        { transfer_id: 'tx-1', phase: 'configuring', progress: 70, message: 'Merging' },
        { transfer_id: 'tx-1', phase: 'online', progress: 100, message: 'Online', report },
      ],
    });

    const progressLog: string[] = [];
    const api = new TransferAPI(transport);
    const result = await api.waitForOnline('tx-1', (s) => progressLog.push(s.phase), 30000, 10);

    expect(result.status.phase).toBe('online');
    expect(result.report).toBeDefined();
    expect(result.report!.overall_status).toBe('completed');
    expect(result.report!.summary.files_transferred).toBe(12);
    expect(progressLog).toEqual(['installing', 'configuring', 'online']);
  });

  it('resolves on failure with report', async () => {
    const failReport: TransferReport = {
      transfer_id: 'tx-2',
      origin_agent: 'agent',
      clone_name: 'agent-2',
      office_id: 'off-1',
      started_at: '2026-04-08T21:40:00Z',
      completed_at: '2026-04-08T21:40:05Z',
      duration_ms: 5000,
      overall_status: 'failed',
      phases: {},
      summary: {
        files_transferred: 0,
        files_failed: 0,
        memory_entries: 0,
        personality_transferred: false,
        provider_preserved: false,
        warnings: [],
        errors: ['Bundle checksum mismatch'],
      },
    };

    const { transport } = createMockTransport({
      'GET:/api/agents/join/status/tx-2': [
        { transfer_id: 'tx-2', phase: 'failed', progress: 0, message: 'Failed', error: 'checksum', report: failReport },
      ],
    });

    const api = new TransferAPI(transport);
    const result = await api.waitForOnline('tx-2', undefined, 10000, 10);

    expect(result.status.phase).toBe('failed');
    expect(result.report!.overall_status).toBe('failed');
    expect(result.report!.summary.errors).toContain('Bundle checksum mismatch');
  });

  it('times out if transfer never completes', async () => {
    const { transport } = createMockTransport({
      'GET:/api/agents/join/status/tx-stuck': [
        // Always returns installing
        { transfer_id: 'tx-stuck', phase: 'installing', progress: 40, message: 'Stuck' },
      ],
    });

    const api = new TransferAPI(transport);
    await expect(
      api.waitForOnline('tx-stuck', undefined, 500, 10) // 500ms timeout, 10ms poll
    ).rejects.toThrow(/timed out/);
  });

  it('calls onProgress only when phase changes', async () => {
    const { transport } = createMockTransport({
      'GET:/api/agents/join/status/tx-3': [
        { transfer_id: 'tx-3', phase: 'installing', progress: 40, message: 'A' },
        { transfer_id: 'tx-3', phase: 'installing', progress: 50, message: 'B' }, // same phase
        { transfer_id: 'tx-3', phase: 'online', progress: 100, message: 'C' },
      ],
    });

    const phases: string[] = [];
    const api = new TransferAPI(transport);
    await api.waitForOnline('tx-3', (s) => phases.push(s.phase), 30000, 10);

    // Should only fire for installing and online, not the duplicate installing
    expect(phases).toEqual(['installing', 'online']);
  });
});
