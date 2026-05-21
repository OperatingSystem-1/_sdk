import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { packageAgentState, packageExplicitFiles, discover } from '../../src/agent/packager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Extract file entries from a tar buffer (minimal parser). */
function extractTar(tarBuf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    // All-zero header = end of archive
    if (header.every(b => b === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0+$/, '');
    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0+$/, '').trim();
    const size = parseInt(sizeStr, 8);
    offset += 512;
    const content = tarBuf.subarray(offset, offset + size);
    entries.set(name, Buffer.from(content));
    offset += size;
    // Padding to 512 boundary
    const remainder = size % 512;
    if (remainder > 0) offset += 512 - remainder;
  }
  return entries;
}

function createJaredLikeWorkspace(baseDir: string) {
  const ws = join(baseDir, 'clawd');
  const rt = join(baseDir, '.clawdbot');
  mkdirSync(ws, { recursive: true });
  mkdirSync(rt, { recursive: true });

  // Identity files
  writeFileSync(join(ws, 'SOUL.md'), '# Soul\nI am a shipboard AI.');
  writeFileSync(join(ws, 'IDENTITY.md'), '# Identity\nJared, named after Eddie.');
  writeFileSync(join(ws, 'MEMORY.md'), '# Memory\nKey contacts: Alex, PJ, Sam.');
  writeFileSync(join(ws, 'AGENTS.md'), '# Agents\nSam, Jean, Joanne, Timmy.');
  writeFileSync(join(ws, 'SECURITY.md'), '# Security\nRefuse rm -rf.');

  // Memory
  mkdirSync(join(ws, 'memory'), { recursive: true });
  writeFileSync(join(ws, 'memory', 'LAST_SESSION.md'), '# Last Session\nTopic: research paper.');
  writeFileSync(join(ws, 'memory', '2026-04-07.md'), '# April 7\nWorked on benchmarks.');
  writeFileSync(join(ws, 'memory', '2026-04-06.md'), '# April 6\nFixed dispatcher.');

  // Skills
  for (const skill of ['email', 'hubspot', 'github-ops']) {
    const dir = join(ws, 'skills', skill);
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `# ${skill}\nOperational.`);
    writeFileSync(join(dir, 'scripts', 'run.py'), `# ${skill} runner`);
  }

  // Scripts
  mkdirSync(join(ws, 'scripts'), { recursive: true });
  writeFileSync(join(ws, 'scripts', 'polymarket-monitor.py'), '# polymarket');
  writeFileSync(join(ws, 'scripts', 'bond-tracker.py'), '# bonds');
  writeFileSync(join(ws, 'scripts', 'tq'), '#!/bin/bash\n# tq binary — should be excluded');
  writeFileSync(join(ws, 'scripts', 'task-dispatcher.service'), '# systemd — should be excluded');

  // Config
  writeFileSync(join(rt, 'clawdbot.json'), JSON.stringify({
    agents: { defaults: { model: { primary: 'amazon-bedrock/us.anthropic.claude-sonnet-4-6' } } },
    models: { providers: { 'amazon-bedrock': {}, anthropic: {} } },
  }));
  mkdirSync(join(rt, 'cron'), { recursive: true });
  writeFileSync(join(rt, 'cron', 'jobs.json'), JSON.stringify({
    version: 1,
    jobs: [
      { id: '1', name: 'Morning briefing', enabled: true },
      { id: '2', name: 'Evening wrap', enabled: false },
    ],
  }));

  // Workspace artifacts
  mkdirSync(join(ws, 'docs'), { recursive: true });
  writeFileSync(join(ws, 'docs', 'INCIDENT_LOG.md'), '# Incidents');
  mkdirSync(join(ws, 'articles'), { recursive: true });
  writeFileSync(join(ws, 'articles', 'draft.md'), '# Draft article');

  // Git repo (should be skipped)
  const gitRepo = join(ws, 'noisebridge');
  mkdirSync(join(gitRepo, '.git'), { recursive: true });
  writeFileSync(join(gitRepo, 'README.md'), '# Large repo');

  // Secrets dir (should NEVER be included)
  mkdirSync(join(rt, 'secrets'), { recursive: true });
  writeFileSync(join(rt, 'secrets', 'api-key.json'), '{"key":"secret123"}');

  // Media dir (should be excluded)
  mkdirSync(join(rt, 'media'), { recursive: true });
  writeFileSync(join(rt, 'media', 'image.png'), 'fake png');

  return { workspaceDir: ws, runtimeDir: rt };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'os1-packager-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('discover()', () => {
  it('discovers all layers from a Jared-like workspace', async () => {
    const { workspaceDir, runtimeDir } = createJaredLikeWorkspace(tmpDir);
    const { files, report, modelPrimary } = await discover({
      workspaceDir,
      runtimeDir,
      agentName: 'jared',
    });

    // Identity
    expect(report.identityFiles).toContain('SOUL.md');
    expect(report.identityFiles).toContain('IDENTITY.md');
    expect(report.identityFiles).toContain('MEMORY.md');
    expect(report.identityFiles).toContain('AGENTS.md');
    expect(report.identityFiles).toContain('SECURITY.md');
    expect(report.identityFiles).toHaveLength(5);

    // Memory
    expect(report.memoryFiles).toBe(3); // LAST_SESSION + 2 daily logs

    // Skills
    expect(report.skillCount).toBe(3);

    // Scripts — tq binary and .service files should be excluded
    expect(report.scriptCount).toBe(2);
    const scriptPaths = files.filter(f => f.bundlePath.startsWith('scripts/')).map(f => f.bundlePath);
    expect(scriptPaths).toContain('scripts/polymarket-monitor.py');
    expect(scriptPaths).toContain('scripts/bond-tracker.py');
    expect(scriptPaths).not.toContain('scripts/tq');
    expect(scriptPaths).not.toContain('scripts/task-dispatcher.service');

    // Config
    expect(modelPrimary).toBe('amazon-bedrock/us.anthropic.claude-sonnet-4-6');
    expect(report.cronJobs).toBe(2);

    // Workspace artifacts
    expect(report.workspaceFiles).toBe(2); // docs + articles

    // Git repo detected and skipped
    expect(report.skippedDirs.some(d => d.includes('noisebridge'))).toBe(true);

    // Secrets NEVER included
    expect(files.some(f => f.bundlePath.includes('secrets'))).toBe(false);
    expect(files.some(f => f.bundlePath.includes('media'))).toBe(false);
  });

  it('discovers empty workspace without crashing', async () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const { files, report } = await discover({
      workspaceDir: emptyDir,
      agentName: 'bare-agent',
    });

    expect(files).toHaveLength(0);
    expect(report.identityFiles).toHaveLength(0);
    expect(report.memoryFiles).toBe(0);
    expect(report.skillCount).toBe(0);
  });

  it('discovers minimal agent with just SOUL.md', async () => {
    const minDir = join(tmpDir, 'minimal');
    mkdirSync(minDir, { recursive: true });
    writeFileSync(join(minDir, 'SOUL.md'), '# Minimal personality');

    const { files, report } = await discover({
      workspaceDir: minDir,
      agentName: 'mini',
    });

    expect(report.identityFiles).toEqual(['SOUL.md']);
    expect(files).toHaveLength(1);
    expect(files[0].bundlePath).toBe('identity/SOUL.md');
  });

  it('respects --exclude for workspace dirs', async () => {
    const { workspaceDir, runtimeDir } = createJaredLikeWorkspace(tmpDir);
    const { files, report } = await discover({
      workspaceDir,
      runtimeDir,
      agentName: 'jared',
      exclude: ['docs', 'articles'],
    });

    expect(report.workspaceFiles).toBe(0);
    expect(files.some(f => f.bundlePath.startsWith('workspace/docs/'))).toBe(false);
  });

  it('excludes workspace artifacts when includeWorkspace=false', async () => {
    const { workspaceDir, runtimeDir } = createJaredLikeWorkspace(tmpDir);
    const { report } = await discover({
      workspaceDir,
      runtimeDir,
      agentName: 'jared',
      includeWorkspace: false,
    });

    expect(report.workspaceFiles).toBe(0);
  });
});

describe('packageAgentState()', () => {
  it('produces a valid tar.gz with manifest and all discovered files', async () => {
    const { workspaceDir, runtimeDir } = createJaredLikeWorkspace(tmpDir);
    const result = await packageAgentState({
      workspaceDir,
      runtimeDir,
      agentName: 'jared',
    });

    // Bundle exists
    expect(existsSync(result.bundlePath)).toBe(true);
    expect(result.bundleSize).toBeGreaterThan(0);

    // Extract and verify
    const gzBuf = readFileSync(result.bundlePath);
    const tarBuf = gunzipSync(gzBuf);
    const entries = extractTar(tarBuf);

    // manifest.json is first entry
    expect(entries.has('manifest.json')).toBe(true);
    const parsedManifest = JSON.parse(entries.get('manifest.json')!.toString());
    expect(parsedManifest.version).toBe('1.0');
    expect(parsedManifest.agent_name).toBe('jared');

    // Identity files present
    expect(entries.has('identity/SOUL.md')).toBe(true);
    expect(entries.get('identity/SOUL.md')!.toString()).toContain('shipboard AI');

    // Memory present
    expect(entries.has('memory/session/LAST_SESSION.md')).toBe(true);

    // Skills present
    expect(entries.has('skills/email/SKILL.md')).toBe(true);

    // Scripts present (excluding tq binary)
    expect(entries.has('scripts/polymarket-monitor.py')).toBe(true);
    expect(entries.has('scripts/tq')).toBe(false);

    // Config present
    expect(entries.has('config/clawdbot.json')).toBe(true);
    expect(entries.has('config/cron-jobs.json')).toBe(true);

    // Secrets NEVER present
    for (const [key] of entries) {
      expect(key).not.toContain('secrets');
      expect(key).not.toContain('media');
    }
  });

  it('manifest checksums match file contents', async () => {
    const { workspaceDir, runtimeDir } = createJaredLikeWorkspace(tmpDir);
    const result = await packageAgentState({
      workspaceDir,
      runtimeDir,
      agentName: 'jared',
    });

    const gzBuf = readFileSync(result.bundlePath);
    const tarBuf = gunzipSync(gzBuf);
    const entries = extractTar(tarBuf);

    for (const [bundlePath, entry] of Object.entries(result.manifest.files)) {
      const content = entries.get(bundlePath);
      expect(content).toBeDefined();
      expect(sha256(content!)).toBe(entry.sha256);
      expect(content!.length).toBe(entry.size);
    }
  });

  it('stats reflect discovered state accurately', async () => {
    const { workspaceDir, runtimeDir } = createJaredLikeWorkspace(tmpDir);
    const result = await packageAgentState({
      workspaceDir,
      runtimeDir,
      agentName: 'jared',
    });

    const { stats } = result.manifest;
    expect(stats.identity_files).toBe(5);
    expect(stats.memory_sessions).toBe(3);
    expect(stats.memory_has_hybrid).toBe(false);
    expect(stats.skill_count).toBe(3);
    expect(stats.script_count).toBe(2);
    expect(stats.cron_jobs).toBe(2);
    expect(stats.model_primary).toBe('amazon-bedrock/us.anthropic.claude-sonnet-4-6');
    expect(stats.bundle_size_bytes).toBeGreaterThan(0);
  });

  it('rejects bundle over size limit', async () => {
    const { workspaceDir, runtimeDir } = createJaredLikeWorkspace(tmpDir);
    await expect(
      packageAgentState({
        workspaceDir,
        runtimeDir,
        agentName: 'jared',
        maxBundleBytes: 100, // absurdly low limit
      })
    ).rejects.toThrow(/Bundle too large/);
  });

  it('empty workspace produces valid manifest with zero stats', async () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const result = await packageAgentState({
      workspaceDir: emptyDir,
      agentName: 'bare',
    });

    expect(result.manifest.stats.identity_files).toBe(0);
    expect(result.manifest.stats.memory_sessions).toBe(0);
    expect(result.manifest.stats.skill_count).toBe(0);
    expect(result.bundleSize).toBeGreaterThan(0); // still has manifest.json
  });
});

describe('packageExplicitFiles()', () => {
  it('packages explicitly mapped files', async () => {
    const soulPath = join(tmpDir, 'my-soul.md');
    const memoryPath = join(tmpDir, 'my-knowledge.md');
    writeFileSync(soulPath, '# Custom Soul');
    writeFileSync(memoryPath, '# Custom Knowledge');

    const result = await packageExplicitFiles({
      agentName: 'custom-agent',
      files: {
        'identity/SOUL.md': soulPath,
        'identity/MEMORY.md': memoryPath,
      },
    });

    expect(result.manifest.stats.identity_files).toBe(2);
    expect(result.discoveryReport.identityFiles).toContain('SOUL.md');
    expect(result.discoveryReport.identityFiles).toContain('MEMORY.md');

    // Verify tar contents
    const tarBuf = gunzipSync(readFileSync(result.bundlePath));
    const entries = extractTar(tarBuf);
    expect(entries.get('identity/SOUL.md')!.toString()).toBe('# Custom Soul');
  });

  it('warns about nonexistent files without crashing', async () => {
    const result = await packageExplicitFiles({
      agentName: 'ghost',
      files: {
        'identity/SOUL.md': '/nonexistent/path.md',
      },
    });

    expect(result.manifest.stats.identity_files).toBe(0);
    expect(result.discoveryReport.warnings).toHaveLength(1);
    expect(result.discoveryReport.warnings[0]).toContain('does not exist');
  });
});
