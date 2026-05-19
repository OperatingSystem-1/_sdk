import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

export function emitReportAndExit(report: Report, json: boolean): void {
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(render(report));
  if (report.overall === 'disconnected') process.exitCode = 2;
  else if (report.overall === 'partial' || report.overall === 'unknown') process.exitCode = 1;
}
