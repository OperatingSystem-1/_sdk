import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type Platform = 'openclaw' | 'hermes';
export type SurfaceStatus = 'connected' | 'partial' | 'disconnected' | 'unknown';

export interface StatusLabels {
  ok: string;
  partial: string;
  bad: string;
  unknown: string;
}

export const DEFAULT_LABELS: StatusLabels = {
  ok: '[CONNECTED]',
  partial: '[PARTIAL]  ',
  bad: '[OFFLINE]  ',
  unknown: '[UNKNOWN]  ',
};

export const SAFETY_LABELS: StatusLabels = {
  ok: '[SAFE]     ',
  partial: '[WATCH]    ',
  bad: '[UNSAFE]   ',
  unknown: '[UNKNOWN]  ',
};

export interface Surface {
  id: string;
  label: string;
  status: SurfaceStatus;
  notes: string[];
  remediation: string[];
  statusLabels?: StatusLabels;
}

export interface Report {
  command: string;
  title: string;
  platform: Platform;
  context: Record<string, string | undefined>;
  surfaces: Surface[];
  overall: SurfaceStatus;
  footer?: string;
}

export function detectPlatform(): Platform | undefined {
  if (process.env.OS1_AGENT_NAME || process.env.AGENT_POD_NAME || process.env.BOT_NAME) {
    return 'openclaw';
  }
  if (
    process.env.HERMES_GATEWAY_URL ||
    process.env.PJBRAIN_OWNER_WHATSAPP_JIDS ||
    process.env.PJBRAIN_OWNER_WHATSAPP_JID ||
    existsSync(join(homedir(), '.hermes')) ||
    existsSync(join(homedir(), 'pjbrain'))
  ) {
    return 'hermes';
  }
  return undefined;
}

export function resolvePlatform(forced?: string): Platform {
  if (forced) {
    if (forced !== 'openclaw' && forced !== 'hermes') {
      throw new Error(`--platform must be "openclaw" or "hermes" (got "${forced}")`);
    }
    return forced;
  }
  const detected = detectPlatform();
  if (!detected) {
    throw new Error(
      'could not auto-detect platform. Pass --platform openclaw|hermes\n' +
        '  openclaw signals: OS1_AGENT_NAME, AGENT_POD_NAME, BOT_NAME env vars\n' +
        '  hermes signals:   ~/.hermes/, HERMES_GATEWAY_URL, PJBRAIN_* env vars',
    );
  }
  return detected;
}

export function resolveOpenClawContext(opts: { office?: string; agent?: string }): {
  officeId: string;
  agentName: string;
} {
  const officeId =
    opts.office ??
    process.env.OFFICE_ID ??
    process.env.OS1_OFFICE_ID ??
    process.env.AGENT_POD_NAMESPACE?.replace(/^office-/, '');
  const agentName =
    opts.agent ??
    process.env.OS1_AGENT_NAME ??
    process.env.BOT_NAME ??
    process.env.AGENT_POD_NAME;
  if (!officeId) throw new Error('openclaw audit requires --office or OFFICE_ID env var');
  if (!agentName) {
    throw new Error('openclaw audit requires --agent or BOT_NAME/OS1_AGENT_NAME env var');
  }
  return { officeId, agentName };
}

export interface FoundFile<T> {
  path: string;
  values: T;
}

function findFile<T>(
  candidates: (string | undefined)[],
  parse: (text: string) => T,
): FoundFile<T> | undefined {
  for (const path of candidates.filter(Boolean) as string[]) {
    try {
      if (!existsSync(path)) continue;
      const text = readFileSync(path, 'utf8');
      return { path, values: parse(text) };
    } catch {
      // skip unreadable
    }
  }
  return undefined;
}

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function findHermesEnv(override?: string): FoundFile<Record<string, string>> | undefined {
  return findFile(
    [
      override,
      process.env.PJBRAIN_ENV_FILE,
      join(homedir(), '.hermes', '.env'),
      join(homedir(), '.pjbrain', '.env'),
      join(homedir(), 'pjbrain', '.env'),
    ],
    parseDotenv,
  );
}

export type TomlTable = Record<string, Record<string, string>>;

// Minimal TOML reader: supports `[section]` headers, `key = value` pairs
// with quoted or bare scalars. Enough for ~/.hermes/config.toml shape.
// Not a full TOML parser — no arrays-of-tables, no inline tables, no dates.
export function parseToml(text: string): TomlTable {
  const out: TomlTable = {};
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1];
      if (!out[section]) out[section] = {};
      continue;
    }
    if (!section) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[section][key] = value;
  }
  return out;
}

export function findHermesConfigToml(override?: string): FoundFile<TomlTable> | undefined {
  return findFile(
    [
      override,
      process.env.HERMES_CONFIG_FILE,
      join(homedir(), '.hermes', 'config.toml'),
    ],
    parseToml,
  );
}

// Minimal YAML reader for the shape Hermes actually writes:
//   section_name:
//     key: value
//     other: "quoted value"
//   another_section: {}
// Supports top-level scalar sections (2-space-indented `key: value`).
// Ignores nested maps, lists, multi-line strings — they are not needed
// for the model-provider audit and would require a real YAML lib.
export function parseSimpleYaml(text: string): TomlTable {
  const out: TomlTable = {};
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const topMatch = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (topMatch) {
      section = topMatch[1];
      if (!out[section]) out[section] = {};
      // top-level scalar like `key: value` (no children) — record under '' section too
      const rest = topMatch[2].trim();
      if (rest && rest !== '{}' && rest !== '[]' && !rest.startsWith('|') && !rest.startsWith('>')) {
        out[''] = out[''] ?? {};
        out[''][section] = unquote(rest);
      }
      continue;
    }
    const childMatch = line.match(/^  ([A-Za-z_][\w-]*):\s*(.*)$/);
    if (childMatch && section) {
      const key = childMatch[1];
      const rest = childMatch[2].trim();
      if (rest && rest !== '{}' && rest !== '[]' && !rest.startsWith('|') && !rest.startsWith('>')) {
        out[section][key] = unquote(rest);
      }
    }
  }
  return out;
}

function unquote(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// Find hermes config across the formats hermes actually writes (yaml is
// canonical on the deployed runtime; toml only appears in pjbrain's
// example file). Dispatches the parser by extension.
export function findHermesConfig(override?: string): FoundFile<TomlTable> | undefined {
  const candidates = [
    override,
    process.env.HERMES_CONFIG_FILE,
    join(homedir(), '.hermes', 'config.yaml'),
    join(homedir(), '.hermes', 'config.yml'),
    join(homedir(), '.hermes', 'config.toml'),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const text = readFileSync(path, 'utf8');
      const parser = path.endsWith('.toml') ? parseToml : parseSimpleYaml;
      return { path, values: parser(text) };
    } catch {
      // skip
    }
  }
  return undefined;
}

export function render(report: Report): string {
  const lines: string[] = [];
  lines.push(report.title);
  lines.push('-----------------------------------------------------');
  lines.push(`Platform: ${report.platform}`);
  for (const [k, v] of Object.entries(report.context)) {
    if (v) lines.push(`${k.padEnd(18)} ${v}`);
  }
  lines.push('');

  for (const s of report.surfaces) {
    const labels = s.statusLabels ?? DEFAULT_LABELS;
    const head =
      s.status === 'connected'
        ? labels.ok
        : s.status === 'partial'
          ? labels.partial
          : s.status === 'disconnected'
            ? labels.bad
            : labels.unknown;
    lines.push(`${head} ${s.label}`);
    for (const n of s.notes) lines.push(`  ${n}`);
    if (s.remediation.length) {
      lines.push('');
      lines.push('  How to fix:');
      for (const r of s.remediation) lines.push(`    ${r}`);
    }
    lines.push('');
  }

  if ((report.overall === 'partial' || report.overall === 'disconnected') && report.footer) {
    lines.push(report.footer);
  }
  return lines.join('\n');
}

// Settings file: keyed by subcommand. Each `mi audit <name>` overwrites its
// own slot; other slots are preserved. Later read by `mi onboard <name>` to
// know what state to walk the user through, and by future tooling (`mi
// backup` refusing to proceed when `audits["model-provider"].overall ===
// "disconnected"`).
//
// Path: ~/.os1/settings.json, mode 0600 (matches keystore convention even
// though no secrets are stored — the file may name internal office UUIDs
// and agent names which are not meant for casual sharing).

export const SETTINGS_PATH = join(homedir(), '.os1', 'settings.json');
export const SETTINGS_VERSION = 1;

export interface SettingsFile {
  version: number;
  updatedAt: string;
  audits: Record<string, { auditedAt: string; report: Report }>;
}

function emptySettings(): SettingsFile {
  return { version: SETTINGS_VERSION, updatedAt: '', audits: {} };
}

export function readSettings(): SettingsFile {
  if (!existsSync(SETTINGS_PATH)) return emptySettings();
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    return {
      version: parsed.version ?? SETTINGS_VERSION,
      updatedAt: parsed.updatedAt ?? '',
      audits: parsed.audits ?? {},
    };
  } catch {
    return emptySettings();
  }
}

function auditKey(report: Report): string {
  // "audit data-access" -> "data-access"; defensively fall back to full command.
  const m = report.command.match(/^audit\s+(.+)$/);
  return m ? m[1] : report.command;
}

export function saveAuditResult(report: Report): string {
  const now = new Date().toISOString();
  const settings = readSettings();
  settings.audits[auditKey(report)] = { auditedAt: now, report };
  settings.updatedAt = now;
  settings.version = SETTINGS_VERSION;

  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  const tmp = SETTINGS_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(settings, null, 2));
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // chmod is best-effort; rename will still succeed
  }
  renameSync(tmp, SETTINGS_PATH);
  return SETTINGS_PATH;
}

export function emitReportAndExit(
  report: Report,
  json: boolean,
  opts?: { save?: boolean },
): void {
  const save = opts?.save !== false;

  if (json) {
    if (save) {
      try {
        saveAuditResult(report);
      } catch {
        // do not pollute JSON output with warning text
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(render(report));
    if (save) {
      try {
        const path = saveAuditResult(report);
        console.log(`[saved] ${path}  (key: ${auditKey(report)})`);
      } catch (err) {
        console.error(`[warn] could not save settings: ${(err as Error).message}`);
      }
    }
  }

  if (report.overall === 'disconnected') process.exitCode = 2;
  else if (report.overall === 'partial' || report.overall === 'unknown') process.exitCode = 1;
}
