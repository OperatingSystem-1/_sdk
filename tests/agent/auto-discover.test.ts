/**
 * Tests for auto-discovery of agent workspace during onboarding.
 *
 * Verifies that the packager's discover() function correctly identifies
 * OpenClaw workspace layouts (~/clawd/, ~/.openclaw/) and returns useful
 * probe results for the CLI auto-detection logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discover } from '../../src/agent/packager.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'os1-discover-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('auto-discovery probe', () => {
  it('detects standard OpenClaw layout (~/clawd/ with SOUL.md)', async () => {
    const ws = join(tmpDir, 'clawd');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'SOUL.md'), '# Soul');
    writeFileSync(join(ws, 'IDENTITY.md'), '# Identity');

    const result = await discover({
      workspaceDir: ws,
      agentName: 'test',
      includeWorkspace: false, // quick probe
    });

    expect(result.report.identityFiles).toContain('SOUL.md');
    expect(result.report.identityFiles).toContain('IDENTITY.md');
    expect(result.report.identityFiles.length).toBeGreaterThan(0);
  });

  it('detects OS-1 pod layout (~/.openclaw/ with SOUL.md)', async () => {
    const ws = join(tmpDir, '.openclaw');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'SOUL.md'), '# Pod soul');

    const result = await discover({
      workspaceDir: ws,
      agentName: 'pod-agent',
      includeWorkspace: false,
    });

    expect(result.report.identityFiles).toContain('SOUL.md');
  });

  it('returns empty for directory with no identity files', async () => {
    const ws = join(tmpDir, 'empty-workspace');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'random.txt'), 'not an identity file');

    const result = await discover({
      workspaceDir: ws,
      agentName: 'empty',
      includeWorkspace: false,
    });

    expect(result.report.identityFiles).toHaveLength(0);
  });

  it('picks up runtime config from separate dir', async () => {
    const ws = join(tmpDir, 'clawd');
    const rt = join(tmpDir, '.clawdbot');
    mkdirSync(ws, { recursive: true });
    mkdirSync(join(rt, 'cron'), { recursive: true });
    writeFileSync(join(ws, 'SOUL.md'), '# Soul');
    writeFileSync(join(rt, 'clawdbot.json'), JSON.stringify({
      agents: { defaults: { model: { primary: 'amazon-bedrock/us.anthropic.claude-sonnet-4-6' } } },
    }));
    writeFileSync(join(rt, 'cron', 'jobs.json'), JSON.stringify({
      version: 1, jobs: [{ id: '1', name: 'Morning briefing' }],
    }));

    const result = await discover({
      workspaceDir: ws,
      runtimeDir: rt,
      agentName: 'test',
      includeWorkspace: false,
    });

    expect(result.modelPrimary).toBe('amazon-bedrock/us.anthropic.claude-sonnet-4-6');
    expect(result.report.cronJobs).toBe(1);
  });

  it('probe is fast with includeWorkspace=false', async () => {
    const ws = join(tmpDir, 'clawd');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'SOUL.md'), '# Soul');

    // Create a large workspace dir that should be skipped
    const dataDir = join(ws, 'data');
    mkdirSync(dataDir, { recursive: true });
    for (let i = 0; i < 100; i++) {
      writeFileSync(join(dataDir, `file-${i}.txt`), 'x'.repeat(1024));
    }

    const start = Date.now();
    const result = await discover({
      workspaceDir: ws,
      agentName: 'test',
      includeWorkspace: false,
    });
    const elapsed = Date.now() - start;

    expect(result.report.identityFiles).toContain('SOUL.md');
    expect(result.report.workspaceFiles).toBe(0); // skipped
    expect(elapsed).toBeLessThan(1000); // should be very fast
  });
});
