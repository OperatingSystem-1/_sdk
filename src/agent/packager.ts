/**
 * Discovery-based agent state packager.
 *
 * Scans an agent's home directory for known state patterns (identity files,
 * session memory, skills, scripts, config, cron jobs) and produces a
 * manifest + tar.gz bundle for consciousness transfer.
 */

import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream, existsSync, statSync, readFileSync, mkdirSync } from 'node:fs';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import type { Manifest, ManifestFileEntry, ManifestStats, DiscoveryReport, PackageResult } from '../types/index.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BUNDLE_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const WARN_DIR_BYTES = 100 * 1024 * 1024; // 100 MB

/** Identity files discovered at the workspace root. */
const IDENTITY_FILENAMES = [
  'SOUL.md', 'IDENTITY.md', 'MEMORY.md', 'AGENTS.md',
  'SECURITY.md', 'ESCALATION.md', 'TOOLS.md', 'BRIEFING.md',
  'HEARTBEAT.md', 'INTER-AGENT.md', 'USER.md', 'SECURITY-POSTURE.md',
  'AGENT-SYNC-BRIEFING.md',
];

/** Directories that are never included, regardless of flags. */
const ALWAYS_EXCLUDE = new Set([
  '.git', 'node_modules', '__pycache__', '.clawdbot/memory',
  '.clawdbot/media', '.clawdbot/agents', '.clawdbot/secrets',
  '.clawdbot/credentials', '.clawdbot/browser', '.clawdbot/devices',
  '.clawdbot/plugins',
]);

/** File extensions that are never included. */
const EXCLUDE_EXTS = new Set(['.sqlite', '.db', '.sock', '.pid', '.lock']);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PackageOptions {
  /** Agent workspace root (e.g., ~/clawd). */
  workspaceDir: string;
  /** Agent runtime dir — parent of clawdbot.json (e.g., ~/.clawdbot). Optional. */
  runtimeDir?: string;
  /** Agent name for manifest. */
  agentName: string;
  /** Directories to exclude (relative to workspaceDir). */
  exclude?: string[];
  /** Include workspace artifacts (docs, articles, research, data). Default: true */
  includeWorkspace?: boolean;
  /** Max bundle size in bytes. Default: 500 MB. */
  maxBundleBytes?: number;
}

export interface ExplicitPackageOptions {
  /** Explicit file map: bundle path → source absolute path. */
  files: Record<string, string>;
  /** Agent name. */
  agentName: string;
  /** Origin label. */
  origin?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function isExcluded(relPath: string, excludeSet: Set<string>): boolean {
  const parts = relPath.split('/');
  for (let i = 0; i < parts.length; i++) {
    const partial = parts.slice(0, i + 1).join('/');
    if (excludeSet.has(partial) || ALWAYS_EXCLUDE.has(partial)) return true;
  }
  if (EXCLUDE_EXTS.has(extname(relPath).toLowerCase())) return true;
  return false;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isFile()) total += (await stat(p)).size;
      else if (e.isDirectory()) total += await dirSize(p);
    }
  } catch { /* inaccessible dir */ }
  return total;
}

async function walkFiles(dir: string, base: string, excludeSet: Set<string>): Promise<Array<{ absPath: string; relPath: string }>> {
  const results: Array<{ absPath: string; relPath: string }> = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries) {
    const absPath = join(dir, e.name);
    const relPath = relative(base, absPath);
    if (isExcluded(relPath, excludeSet)) continue;
    if (e.isFile()) {
      results.push({ absPath, relPath });
    } else if (e.isDirectory()) {
      results.push(...await walkFiles(absPath, base, excludeSet));
    }
  }
  return results;
}

// ─── TAR builder (minimal, no deps) ────────────────────────────────────────

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  // name (0-99)
  header.write(name.slice(0, 99), 0, 'utf8');
  // mode (100-107)
  header.write('0000644\0', 100, 'utf8');
  // uid (108-115), gid (116-123) — zero
  header.write('0000000\0', 108, 'utf8');
  header.write('0000000\0', 116, 'utf8');
  // size (124-135) — octal
  header.write(size.toString(8).padStart(11, '0') + '\0', 124, 'utf8');
  // mtime (136-147)
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 'utf8');
  // typeflag (156) — '0' = regular file
  header.write('0', 156, 'utf8');
  // magic (257-262) + version (263-264)
  header.write('ustar\0', 257, 'utf8');
  header.write('00', 263, 'utf8');
  // checksum (148-155) — compute after filling other fields
  header.write('        ', 148, 'utf8'); // 8 spaces placeholder
  let chksum = 0;
  for (let i = 0; i < 512; i++) chksum += header[i];
  header.write(chksum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8');
  return header;
}

function tarPadding(size: number): Buffer {
  const remainder = size % 512;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(512 - remainder);
}

// ─── Discovery ──────────────────────────────────────────────────────────────

interface DiscoveredFile {
  bundlePath: string;
  absPath: string;
  size: number;
  content?: Buffer; // for inline content (e.g., SQL dumps)
}

export async function discover(opts: PackageOptions): Promise<{
  files: DiscoveredFile[];
  report: DiscoveryReport;
  modelPrimary: string | null;
}> {
  const { workspaceDir, runtimeDir, exclude = [], includeWorkspace = true } = opts;
  const excludeSet = new Set<string>(exclude);
  const files: DiscoveredFile[] = [];
  const report: DiscoveryReport = {
    identityFiles: [],
    memoryFiles: 0,
    hasHybridMemory: false,
    skillCount: 0,
    scriptCount: 0,
    cronJobs: 0,
    workspaceFiles: 0,
    taskCount: 0,
    agentMessages: 0,
    skippedDirs: [],
    warnings: [],
  };
  let modelPrimary: string | null = null;

  // Layer 1: Identity files at workspace root
  for (const name of IDENTITY_FILENAMES) {
    const absPath = join(workspaceDir, name);
    if (existsSync(absPath)) {
      const s = statSync(absPath);
      files.push({ bundlePath: `identity/${name}`, absPath, size: s.size });
      report.identityFiles.push(name);
    }
  }

  // Layer 2: Memory
  const memoryDir = join(workspaceDir, 'memory');
  if (existsSync(memoryDir)) {
    const memFiles = await walkFiles(memoryDir, memoryDir, excludeSet);
    for (const f of memFiles) {
      const s = await stat(f.absPath);
      if (s.size > MAX_SINGLE_FILE_BYTES) {
        report.warnings.push(`memory/${f.relPath} is ${(s.size / 1024 / 1024).toFixed(1)} MB — skipped (>${MAX_SINGLE_FILE_BYTES / 1024 / 1024} MB limit)`);
        continue;
      }
      files.push({ bundlePath: `memory/session/${f.relPath}`, absPath: f.absPath, size: s.size });
      report.memoryFiles++;
    }
  }

  if (runtimeDir) {
    const hybridPath = join(runtimeDir, 'hybrid-memory.json');
    if (existsSync(hybridPath)) {
      const s = statSync(hybridPath);
      if (s.size <= MAX_SINGLE_FILE_BYTES) {
        files.push({ bundlePath: 'memory/hybrid-memory.json', absPath: hybridPath, size: s.size });
        report.hasHybridMemory = true;
      } else {
        report.warnings.push(`hybrid-memory.json is ${(s.size / 1024 / 1024).toFixed(1)} MB — skipped`);
      }
    }
  }

  // Layer 3: Skills
  const skillsDir = join(workspaceDir, 'skills');
  if (existsSync(skillsDir)) {
    try {
      const skillEntries = await readdir(skillsDir, { withFileTypes: true });
      for (const se of skillEntries) {
        if (!se.isDirectory()) continue;
        const skillDir = join(skillsDir, se.name);
        const skillFiles = await walkFiles(skillDir, skillDir, excludeSet);
        let skillHasFiles = false;
        for (const f of skillFiles) {
          const s = await stat(f.absPath);
          if (s.size > MAX_SINGLE_FILE_BYTES) continue;
          files.push({ bundlePath: `skills/${se.name}/${f.relPath}`, absPath: f.absPath, size: s.size });
          skillHasFiles = true;
        }
        if (skillHasFiles) report.skillCount++;
      }
    } catch { /* unreadable */ }
  }

  // Layer 4: Scripts
  const scriptsDir = join(workspaceDir, 'scripts');
  if (existsSync(scriptsDir)) {
    try {
      const scriptEntries = await readdir(scriptsDir, { withFileTypes: true });
      for (const se of scriptEntries) {
        if (!se.isFile()) continue;
        // Skip binary/service files
        if (se.name === 'tq' || se.name.endsWith('.service')) continue;
        if (se.name === '__pycache__') continue;
        const absPath = join(scriptsDir, se.name);
        const s = await stat(absPath);
        if (s.size > MAX_SINGLE_FILE_BYTES) continue;
        files.push({ bundlePath: `scripts/${se.name}`, absPath, size: s.size });
        report.scriptCount++;
      }
    } catch { /* unreadable */ }
  }

  // Layer 5: Config
  if (runtimeDir) {
    const configPath = join(runtimeDir, 'clawdbot.json');
    if (existsSync(configPath)) {
      const s = statSync(configPath);
      files.push({ bundlePath: 'config/clawdbot.json', absPath: configPath, size: s.size });
      // Extract primary model
      try {
        const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
        modelPrimary = cfg?.agents?.defaults?.model?.primary ?? null;
      } catch { /* malformed config */ }
    }

    const cronPath = join(runtimeDir, 'cron', 'jobs.json');
    if (existsSync(cronPath)) {
      const s = statSync(cronPath);
      files.push({ bundlePath: 'config/cron-jobs.json', absPath: cronPath, size: s.size });
      try {
        const cron = JSON.parse(readFileSync(cronPath, 'utf8'));
        report.cronJobs = cron?.jobs?.length ?? 0;
      } catch { /* malformed */ }
    }
  }

  // Layer 6: Workspace artifacts
  if (includeWorkspace) {
    const artifactDirs = ['docs', 'articles', 'research', 'data'];
    for (const dirName of artifactDirs) {
      if (excludeSet.has(dirName)) continue;
      const dir = join(workspaceDir, dirName);
      if (!existsSync(dir)) continue;
      const size = await dirSize(dir);
      if (size > WARN_DIR_BYTES) {
        report.warnings.push(`${dirName}/ is ${(size / 1024 / 1024).toFixed(0)} MB — included (use --exclude ${dirName} to skip)`);
      }
      const wsFiles = await walkFiles(dir, workspaceDir, excludeSet);
      for (const f of wsFiles) {
        const s = await stat(f.absPath);
        if (s.size > MAX_SINGLE_FILE_BYTES) {
          report.warnings.push(`${f.relPath} is ${(s.size / 1024 / 1024).toFixed(1)} MB — skipped`);
          continue;
        }
        files.push({ bundlePath: `workspace/${f.relPath}`, absPath: f.absPath, size: s.size });
        report.workspaceFiles++;
      }
    }
  }

  // Check for dirs that exist but were skipped (git repos, etc.)
  try {
    const topEntries = await readdir(workspaceDir, { withFileTypes: true });
    for (const e of topEntries) {
      if (!e.isDirectory()) continue;
      if (excludeSet.has(e.name)) {
        report.skippedDirs.push(`${e.name} (excluded by --exclude)`);
        continue;
      }
      // Check for large git repos
      const gitPath = join(workspaceDir, e.name, '.git');
      if (existsSync(gitPath) && !['skills', 'scripts', 'memory', 'docs', 'articles', 'research', 'data'].includes(e.name)) {
        const size = await dirSize(join(workspaceDir, e.name));
        report.skippedDirs.push(`${e.name} (${(size / 1024 / 1024).toFixed(0)} MB, git repo)`);
      }
    }
  } catch { /* unreadable */ }

  return { files, report, modelPrimary };
}

// ─── Package ────────────────────────────────────────────────────────────────

export async function packageAgentState(opts: PackageOptions): Promise<PackageResult> {
  const maxBundle = opts.maxBundleBytes ?? MAX_BUNDLE_BYTES;
  const { files, report, modelPrimary } = await discover(opts);

  // Compute total size
  let totalSize = 0;
  for (const f of files) totalSize += f.size;
  if (totalSize > maxBundle) {
    throw new Error(`Bundle too large: ${(totalSize / 1024 / 1024).toFixed(1)} MB exceeds ${(maxBundle / 1024 / 1024).toFixed(0)} MB limit. Use --exclude to skip large directories.`);
  }

  // Build manifest
  const manifestFiles: Record<string, ManifestFileEntry> = {};
  for (const f of files) {
    const content = f.content ?? readFileSync(f.absPath);
    manifestFiles[f.bundlePath] = { sha256: sha256(content), size: f.size };
  }

  const stats: ManifestStats = {
    identity_files: report.identityFiles.length,
    memory_sessions: report.memoryFiles,
    memory_has_hybrid: report.hasHybridMemory,
    skill_count: report.skillCount,
    script_count: report.scriptCount,
    cron_jobs: report.cronJobs,
    task_count: report.taskCount,
    agent_messages: report.agentMessages,
    workspace_files: report.workspaceFiles,
    bundle_size_bytes: totalSize,
    skipped_dirs: report.skippedDirs,
    model_primary: modelPrimary,
  };

  const manifest: Manifest = {
    version: '1.0',
    agent_name: opts.agentName,
    origin: `local/${hostname()}`,
    packed_at: new Date().toISOString(),
    files: manifestFiles,
    stats,
  };

  // Write tar.gz
  const bundlePath = join(tmpdir(), `os1-transfer-${Date.now()}.tar.gz`);
  const chunks: Buffer[] = [];

  // Add manifest.json first
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2));
  chunks.push(tarHeader('manifest.json', manifestBuf.length));
  chunks.push(manifestBuf);
  chunks.push(tarPadding(manifestBuf.length));

  // Add all files
  for (const f of files) {
    const content = f.content ?? readFileSync(f.absPath);
    chunks.push(tarHeader(f.bundlePath, content.length));
    chunks.push(content);
    chunks.push(tarPadding(content.length));
  }

  // End-of-archive marker (two 512-byte zero blocks)
  chunks.push(Buffer.alloc(1024));

  // Gzip the tar
  const { gzipSync } = await import('node:zlib');
  const tarBuf = Buffer.concat(chunks);
  const gzBuf = gzipSync(tarBuf);
  const { writeFileSync: wfs } = await import('node:fs');
  wfs(bundlePath, gzBuf);

  return {
    manifest,
    bundlePath,
    bundleSize: gzBuf.length,
    discoveryReport: report,
  };
}

// ─── Explicit file map mode ─────────────────────────────────────────────────

export async function packageExplicitFiles(opts: ExplicitPackageOptions): Promise<PackageResult> {
  const files: DiscoveredFile[] = [];
  const report: DiscoveryReport = {
    identityFiles: [],
    memoryFiles: 0,
    hasHybridMemory: false,
    skillCount: 0,
    scriptCount: 0,
    cronJobs: 0,
    workspaceFiles: 0,
    taskCount: 0,
    agentMessages: 0,
    skippedDirs: [],
    warnings: [],
  };

  for (const [bundlePath, absPath] of Object.entries(opts.files)) {
    if (!existsSync(absPath)) {
      report.warnings.push(`${absPath} does not exist — skipped`);
      continue;
    }
    const s = statSync(absPath);
    if (s.size > MAX_SINGLE_FILE_BYTES) {
      report.warnings.push(`${absPath} is ${(s.size / 1024 / 1024).toFixed(1)} MB — skipped`);
      continue;
    }
    files.push({ bundlePath, absPath, size: s.size });
    if (bundlePath.startsWith('identity/')) report.identityFiles.push(basename(bundlePath));
    else if (bundlePath.startsWith('memory/')) report.memoryFiles++;
    else if (bundlePath.startsWith('skills/')) report.skillCount++;
    else if (bundlePath.startsWith('scripts/')) report.scriptCount++;
    else report.workspaceFiles++;
  }

  // Delegate to shared packaging logic by constructing a temporary PackageOptions
  // that maps the explicit files. We reuse the tar building from packageAgentState.
  let totalSize = 0;
  for (const f of files) totalSize += f.size;
  if (totalSize > MAX_BUNDLE_BYTES) {
    throw new Error(`Bundle too large: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  }

  const manifestFiles: Record<string, ManifestFileEntry> = {};
  for (const f of files) {
    const content = readFileSync(f.absPath);
    manifestFiles[f.bundlePath] = { sha256: sha256(content), size: f.size };
  }

  const manifest: Manifest = {
    version: '1.0',
    agent_name: opts.agentName,
    origin: opts.origin ?? 'explicit',
    packed_at: new Date().toISOString(),
    files: manifestFiles,
    stats: {
      identity_files: report.identityFiles.length,
      memory_sessions: report.memoryFiles,
      memory_has_hybrid: report.hasHybridMemory,
      skill_count: report.skillCount,
      script_count: report.scriptCount,
      cron_jobs: report.cronJobs,
      task_count: report.taskCount,
      agent_messages: report.agentMessages,
      workspace_files: report.workspaceFiles,
      bundle_size_bytes: totalSize,
      skipped_dirs: [],
      model_primary: null,
    },
  };

  const chunks: Buffer[] = [];
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2));
  chunks.push(tarHeader('manifest.json', manifestBuf.length));
  chunks.push(manifestBuf);
  chunks.push(tarPadding(manifestBuf.length));

  for (const f of files) {
    const content = readFileSync(f.absPath);
    chunks.push(tarHeader(f.bundlePath, content.length));
    chunks.push(content);
    chunks.push(tarPadding(content.length));
  }
  chunks.push(Buffer.alloc(1024));

  const { gzipSync } = await import('node:zlib');
  const gzBuf = gzipSync(Buffer.concat(chunks));
  const bundlePath = join(tmpdir(), `os1-transfer-${Date.now()}.tar.gz`);
  const { writeFileSync: wfs } = await import('node:fs');
  wfs(bundlePath, gzBuf);

  return { manifest, bundlePath, bundleSize: gzBuf.length, discoveryReport: report };
}
