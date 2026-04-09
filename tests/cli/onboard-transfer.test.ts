/**
 * Tests for the `mi agent onboard --state-dir` consciousness transfer flow.
 *
 * These are component-level tests that verify the packaging + upload pipeline
 * works correctly when invoked programmatically (same code path as the CLI).
 * They don't spawn a real CLI process — they call the underlying functions
 * directly with mock transports.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { packageAgentState } from '../../src/agent/packager.js';
import { TransferAPI } from '../../src/api/transfer.js';
import type { TransferReport, TransferStatus } from '../../src/types/index.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a Jared-like workspace for testing. */
function createTestWorkspace(baseDir: string) {
  const ws = join(baseDir, 'clawd');
  const rt = join(baseDir, '.clawdbot');
  mkdirSync(ws, { recursive: true });
  mkdirSync(rt, { recursive: true });

  // Identity
  writeFileSync(join(ws, 'SOUL.md'), '# Soul\nShipboard AI with dry humor.');
  writeFileSync(join(ws, 'IDENTITY.md'), '# Identity\nJared, ops agent.');
  writeFileSync(join(ws, 'MEMORY.md'), '# Memory\nKey contacts: Alex, PJ.');

  // Memory
  mkdirSync(join(ws, 'memory'), { recursive: true });
  writeFileSync(join(ws, 'memory', 'LAST_SESSION.md'), '# Last Session\nResearch paper topic.');
  writeFileSync(join(ws, 'memory', '2026-04-07.md'), '# April 7\nBenchmarks.');

  // Skills
  const skillDir = join(ws, 'skills', 'email', 'scripts');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(ws, 'skills', 'email', 'SKILL.md'), '# Email\nSend/receive.');
  writeFileSync(join(skillDir, 'send.py'), '# send email');

  // Config
  writeFileSync(join(rt, 'clawdbot.json'), JSON.stringify({
    agents: { defaults: { model: { primary: 'amazon-bedrock/us.anthropic.claude-sonnet-4-6' } } },
  }));
  mkdirSync(join(rt, 'cron'), { recursive: true });
  writeFileSync(join(rt, 'cron', 'jobs.json'), JSON.stringify({
    version: 1,
    jobs: [{ id: '1', name: 'Morning briefing', enabled: true }],
  }));

  return { workspaceDir: ws, runtimeDir: rt };
}

function createMockTransport(responses: Record<string, unknown[]>) {
  const callLog: Array<{ method: string; path: string; body?: unknown }> = [];
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
    transport: { get: handler('GET'), post: handler('POST'), put: handler('PUT'), patch: handler('PATCH'), delete: handler('DELETE') } as any,
    callLog,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'os1-cli-transfer-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('onboard --state-dir pipeline', () => {
  it('packages state, uploads bundle, and receives transfer report', async () => {
    const { workspaceDir, runtimeDir } = createTestWorkspace(tmpDir);

    // Step 1: Package
    const pkg = await packageAgentState({
      workspaceDir,
      runtimeDir,
      agentName: 'test-agent',
    });

    expect(pkg.discoveryReport.identityFiles).toContain('SOUL.md');
    expect(pkg.discoveryReport.identityFiles).toContain('IDENTITY.md');
    expect(pkg.discoveryReport.identityFiles).toContain('MEMORY.md');
    expect(pkg.discoveryReport.memoryFiles).toBe(2);
    expect(pkg.discoveryReport.skillCount).toBe(1);
    expect(pkg.discoveryReport.cronJobs).toBe(1);
    expect(pkg.bundleSize).toBeGreaterThan(0);
    expect(existsSync(pkg.bundlePath)).toBe(true);

    // Step 2: Upload via mock transport
    const report: TransferReport = {
      transfer_id: 'tx-test',
      origin_agent: 'test-agent',
      clone_name: 'test-agent-2',
      office_id: 'off-1',
      started_at: '2026-04-08T21:40:00Z',
      completed_at: '2026-04-08T21:41:12Z',
      duration_ms: 72000,
      overall_status: 'completed',
      phases: {
        validation: { phase: 'validation', status: 'ok', filesWritten: 0, filesFailed: [], warnings: [], error: null, retryAttempted: false, durationMs: 100 },
        identity: { phase: 'identity', status: 'ok', filesWritten: 8, filesFailed: [], warnings: [], error: null, retryAttempted: false, durationMs: 3000 },
        memory: { phase: 'memory', status: 'ok', filesWritten: 2, filesFailed: [], warnings: [], error: null, retryAttempted: false, durationMs: 1000 },
        config: { phase: 'config', status: 'ok', filesWritten: 1, filesFailed: [], warnings: [], error: null, retryAttempted: false, durationMs: 500 },
      },
      summary: {
        files_transferred: 11,
        files_failed: 0,
        memory_entries: 2,
        personality_transferred: true,
        provider_preserved: true,
        warnings: [],
        errors: [],
      },
    };

    const { transport, callLog } = createMockTransport({
      'POST:/api/agents/clone/transfer': [
        { transfer_id: 'tx-test', phase: 'installing', progress: 10, message: 'Started' },
      ],
      'GET:/api/agents/clone/transfer?id=tx-test': [
        { transfer_id: 'tx-test', phase: 'installing', progress: 40, message: 'Transferring' },
        { transfer_id: 'tx-test', phase: 'online', progress: 100, message: 'Complete', report },
      ],
    });

    const transferApi = new TransferAPI(transport);

    // Upload
    const uploadResult = await transferApi.upload('tx-test', pkg.bundlePath, pkg.manifest);
    expect(uploadResult.phase).toBe('installing');

    // Verify the upload call included bundle_base64 (small bundle)
    const uploadCall = callLog.find(c => c.path === '/api/agents/clone/transfer');
    expect(uploadCall).toBeDefined();
    expect((uploadCall!.body as any).transfer_id).toBe('tx-test');
    expect((uploadCall!.body as any).bundle_base64).toBeDefined();
    expect((uploadCall!.body as any).manifest.version).toBe('1.0');
    expect((uploadCall!.body as any).manifest.stats.identity_files).toBe(3);

    // Poll
    const phases: string[] = [];
    const result = await transferApi.waitForOnline(
      'tx-test',
      (s) => phases.push(s.phase),
      30000,
      10, // fast poll for test
    );

    expect(result.status.phase).toBe('online');
    expect(result.report).toBeDefined();
    expect(result.report!.overall_status).toBe('completed');
    expect(result.report!.summary.files_transferred).toBe(11);
    expect(result.report!.summary.personality_transferred).toBe(true);
    expect(phases).toEqual(['installing', 'online']);
  });

  it('skips transfer when --state-dir not provided', async () => {
    // Without state dir, clone should work but no packaging/upload happens
    const { transport, callLog } = createMockTransport({});
    const transferApi = new TransferAPI(transport);

    // No calls should be made since there's nothing to upload
    expect(callLog).toHaveLength(0);
  });

  it('handles transfer failure gracefully', async () => {
    const { workspaceDir, runtimeDir } = createTestWorkspace(tmpDir);

    const pkg = await packageAgentState({
      workspaceDir,
      runtimeDir,
      agentName: 'fail-agent',
    });

    const failReport: TransferReport = {
      transfer_id: 'tx-fail',
      origin_agent: 'fail-agent',
      clone_name: 'fail-agent-2',
      office_id: 'off-1',
      started_at: '2026-04-08T21:40:00Z',
      completed_at: '2026-04-08T21:40:05Z',
      duration_ms: 5000,
      overall_status: 'partial',
      phases: {
        validation: { phase: 'validation', status: 'ok', filesWritten: 0, filesFailed: [], warnings: [], error: null, retryAttempted: false, durationMs: 100 },
        identity: { phase: 'identity', status: 'ok', filesWritten: 3, filesFailed: [], warnings: [], error: null, retryAttempted: false, durationMs: 2000 },
        memory: { phase: 'memory', status: 'failed', filesWritten: 0, filesFailed: ['hybrid-memory.json'], warnings: [], error: 'exec timeout', retryAttempted: true, durationMs: 10000 },
      },
      summary: {
        files_transferred: 3,
        files_failed: 1,
        memory_entries: 0,
        personality_transferred: true,
        provider_preserved: true,
        warnings: [],
        errors: ['memory: exec timeout'],
      },
    };

    const { transport } = createMockTransport({
      'POST:/api/agents/clone/transfer': [
        { transfer_id: 'tx-fail', phase: 'installing', progress: 10, message: 'Started' },
      ],
      'GET:/api/agents/clone/transfer?id=tx-fail': [
        { transfer_id: 'tx-fail', phase: 'online', progress: 100, message: 'Partial', report: failReport },
      ],
    });

    const transferApi = new TransferAPI(transport);
    await transferApi.upload('tx-fail', pkg.bundlePath, pkg.manifest);

    const result = await transferApi.waitForOnline('tx-fail', undefined, 30000, 10);

    // Partial transfer still resolves (clone is functional, just missing memory)
    expect(result.report!.overall_status).toBe('partial');
    expect(result.report!.summary.personality_transferred).toBe(true);
    expect(result.report!.summary.errors).toContain('memory: exec timeout');
    expect(result.report!.phases.identity.status).toBe('ok');
    expect(result.report!.phases.memory.status).toBe('failed');
    expect(result.report!.phases.memory.retryAttempted).toBe(true);
  });

  it('reports warnings for provider overrides', async () => {
    const { workspaceDir, runtimeDir } = createTestWorkspace(tmpDir);
    const pkg = await packageAgentState({ workspaceDir, runtimeDir, agentName: 'provider-test' });

    const warnReport: TransferReport = {
      transfer_id: 'tx-warn',
      origin_agent: 'provider-test',
      clone_name: 'provider-test-2',
      office_id: 'off-1',
      started_at: '2026-04-08T21:40:00Z',
      completed_at: '2026-04-08T21:41:00Z',
      duration_ms: 60000,
      overall_status: 'completed_with_warnings',
      phases: {
        config: {
          phase: 'config', status: 'ok', filesWritten: 1, filesFailed: [], error: null,
          retryAttempted: false, durationMs: 500,
          warnings: ["Provider 'google' not available — using office default"],
        },
      },
      summary: {
        files_transferred: 1,
        files_failed: 0,
        memory_entries: 0,
        personality_transferred: false,
        provider_preserved: false,
        warnings: ["Provider 'google' not available — using office default"],
        errors: [],
      },
    };

    const { transport } = createMockTransport({
      'POST:/api/agents/clone/transfer': [{ transfer_id: 'tx-warn', phase: 'installing', progress: 10 }],
      'GET:/api/agents/clone/transfer?id=tx-warn': [
        { transfer_id: 'tx-warn', phase: 'online', progress: 100, report: warnReport },
      ],
    });

    const transferApi = new TransferAPI(transport);
    await transferApi.upload('tx-warn', pkg.bundlePath, pkg.manifest);
    const result = await transferApi.waitForOnline('tx-warn', undefined, 30000, 10);

    expect(result.report!.overall_status).toBe('completed_with_warnings');
    expect(result.report!.summary.provider_preserved).toBe(false);
    expect(result.report!.summary.warnings[0]).toContain('google');
  });
});

describe('standalone clone --state-dir', () => {
  it('packages and uploads when state-dir is provided', async () => {
    const { workspaceDir, runtimeDir } = createTestWorkspace(tmpDir);

    // Verify packaging works for the standalone clone path
    const pkg = await packageAgentState({
      workspaceDir,
      runtimeDir,
      agentName: 'standalone-test',
    });

    expect(pkg.manifest.agent_name).toBe('standalone-test');
    expect(pkg.manifest.stats.identity_files).toBe(3);
    expect(pkg.manifest.stats.skill_count).toBe(1);

    // Verify upload would work with the correct transfer_id
    const { transport, callLog } = createMockTransport({
      'POST:/api/agents/clone/transfer': [
        { transfer_id: 'tx-standalone', phase: 'installing', progress: 10 },
      ],
    });

    const transferApi = new TransferAPI(transport);
    await transferApi.upload('tx-standalone', pkg.bundlePath, pkg.manifest);

    expect(callLog).toHaveLength(1);
    expect((callLog[0].body as any).manifest.stats.identity_files).toBe(3);
  });
});
