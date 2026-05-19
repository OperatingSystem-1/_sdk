import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OS1AdminClient } from '../client.js';

type Platform = 'openclaw' | 'hermes';
type SurfaceStatus = 'connected' | 'partial' | 'disconnected' | 'unknown';

interface Surface {
  id: string;
  label: string;
  status: SurfaceStatus;
  notes: string[];
  remediation: string[];
}

interface Report {
  command: 'audit data-access';
  platform: Platform;
  context: Record<string, string | undefined>;
  surfaces: Surface[];
  overall: SurfaceStatus;
}

interface OfficeIntegration {
  id: string;
  name?: string;
  status?: string;
  hasSecret?: boolean;
  capabilities?: string[];
  agentEnvVars?: string[];
}

interface AgentIntegration {
  id: string;
  enabled?: boolean;
  status?: string;
  envVars?: string[];
}

const GOOGLE_HERMES_REQUIRED = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'];
const GOOGLE_HERMES_OPTIONAL = [
  'GOOGLE_PUBSUB_TOPIC',
  'GOOGLE_PUBSUB_VERIFICATION_TOKEN',
  'WEBHOOK_PUBLIC_URL',
  'DRIVE_ACCOUNT',
];

function detectPlatform(): Platform | undefined {
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

function parseDotenv(text: string): Record<string, string> {
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

function findHermesEnv(override?: string): { path: string; values: Record<string, string> } | undefined {
  const candidates = [
    override,
    process.env.PJBRAIN_ENV_FILE,
    join(homedir(), '.hermes', '.env'),
    join(homedir(), '.pjbrain', '.env'),
    join(homedir(), 'pjbrain', '.env'),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const text = readFileSync(path, 'utf8');
      return { path, values: parseDotenv(text) };
    } catch {
      // skip unreadable candidates
    }
  }
  return undefined;
}

function auditHermes(envOverride?: string): Report {
  const env = findHermesEnv(envOverride);
  const merged: Record<string, string | undefined> = {
    ...Object.fromEntries(
      [...GOOGLE_HERMES_REQUIRED, ...GOOGLE_HERMES_OPTIONAL].map((k) => [k, process.env[k]]),
    ),
    ...(env?.values ?? {}),
  };
  const present = (k: string) => Boolean(merged[k]?.length);

  const notes: string[] = [];
  const remediation: string[] = [];

  notes.push(env ? `config: ${env.path}` : 'config: no hermes .env found (using process env only)');

  for (const k of GOOGLE_HERMES_REQUIRED) {
    notes.push(`${present(k) ? '[OK]  ' : '[MISS]'} ${k}`);
  }
  for (const k of GOOGLE_HERMES_OPTIONAL) {
    notes.push(`${present(k) ? '[OK]  ' : '[ -- ]'} ${k} (optional)`);
  }

  const requiredMissing = GOOGLE_HERMES_REQUIRED.filter((k) => !present(k));
  const optionalMissing = GOOGLE_HERMES_OPTIONAL.filter((k) => !present(k));

  let status: SurfaceStatus;
  if (requiredMissing.length === 0 && optionalMissing.length === 0) {
    status = 'connected';
    notes.push('NOT VERIFIED HERE: gmail_accounts row + active Pub/Sub watch (run inside pjbrain Postgres to confirm)');
  } else if (requiredMissing.length === 0) {
    status = 'partial';
    notes.push('OAuth client configured, but push delivery may not be wired up yet');
  } else {
    status = 'disconnected';
  }

  if (requiredMissing.length) {
    remediation.push(
      `Set ${requiredMissing.join(' and ')} in ~/.hermes/.env`,
      `Create OAuth client at console.cloud.google.com -> Credentials`,
      `Then run from pjbrain repo: python -m ingestion.gmail.register_account <you@gmail.com>`,
      `For calendar: python -m ingestion.calendar.register_account <you@gmail.com>`,
    );
  } else if (optionalMissing.length) {
    remediation.push(
      `Set ${optionalMissing.join(', ')} to enable push-based ingestion`,
      `Without these, mail/calendar will not stream in real time`,
    );
  }

  return {
    command: 'audit data-access',
    platform: 'hermes',
    context: { hermes_env_path: env?.path, home: homedir() },
    surfaces: [
      {
        id: 'google-workspace',
        label: 'Google Workspace (Gmail / Calendar / Drive)',
        status,
        notes,
        remediation,
      },
    ],
    overall: status,
  };
}

function resolveOpenClawContext(opts: { office?: string; agent?: string }): {
  officeId?: string;
  agentName?: string;
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
  return { officeId, agentName };
}

async function auditOpenClaw(opts: { office?: string; agent?: string }): Promise<Report> {
  const { officeId, agentName } = resolveOpenClawContext(opts);
  if (!officeId) throw new Error('openclaw audit requires --office or OFFICE_ID env var');
  if (!agentName) throw new Error('openclaw audit requires --agent or BOT_NAME/OS1_AGENT_NAME env var');

  const client = await OS1AdminClient.fromConfig();

  const officeIntegrations = await client.transport.get<OfficeIntegration[]>(
    `/api/v1/offices/${officeId}/integrations`,
  );
  const agentResp = await client.transport.get<{ integrations?: AgentIntegration[] }>(
    `/api/v1/offices/${officeId}/employees/${agentName}/integrations`,
  );
  const agentIntegrations = agentResp.integrations ?? [];

  const office = officeIntegrations.find((i) => i.id === 'google-workspace');
  const agentEntry = agentIntegrations.find((i) => i.id === 'google-workspace');

  const officeOk = Boolean(office?.hasSecret);
  const agentOk = Boolean(agentEntry?.enabled);

  const notes: string[] = [];
  notes.push(`${officeOk ? '[OK]  ' : '[MISS]'} office credential (K8s secret google-workspace-${officeId})`);
  notes.push(
    `${agentOk ? '[OK]  ' : '[MISS]'} enabled for agent "${agentName}"` +
      (agentEntry?.status ? ` (status: ${agentEntry.status})` : ''),
  );
  if (office?.capabilities?.length) {
    notes.push(`capabilities: ${office.capabilities.join(', ')}`);
  }
  if (office?.agentEnvVars?.length) {
    notes.push(`env vars delivered: ${office.agentEnvVars.join(', ')}`);
  }

  let status: SurfaceStatus;
  if (officeOk && agentOk) {
    status =
      agentEntry?.status === 'error' || agentEntry?.status === 'offline' ? 'partial' : 'connected';
  } else if (officeOk && !agentOk) {
    status = 'partial';
  } else {
    status = 'disconnected';
  }

  const remediation: string[] = [];
  if (!officeOk) {
    remediation.push(
      `Add the office-wide Google Workspace credential:`,
      `  Dashboard: https://mitosislabs.ai -> Integrations -> Google Workspace`,
      `  Or: POST /api/v1/offices/${officeId}/integrations/google-workspace/secret`,
      `       body: { "secretName": "google-workspace-${officeId}", "data": { "GOOGLE_CREDENTIALS_JSON": "..." } }`,
    );
  }
  if (officeOk && !agentOk) {
    remediation.push(
      `Enable for agent "${agentName}":`,
      `  POST /api/v1/offices/${officeId}/integrations/google-workspace/agents/${agentName}`,
      `       body: { "enabled": true }`,
    );
  }
  if (officeOk && agentOk && status === 'partial') {
    remediation.push(
      `Integration reports status "${agentEntry?.status}". Check the agent's recent activity feed:`,
      `  mi agents activity ${officeId} ${agentName}`,
    );
  }

  return {
    command: 'audit data-access',
    platform: 'openclaw',
    context: {
      office_id: officeId,
      agent_name: agentName,
      endpoint: client.transport.endpoint,
    },
    surfaces: [
      {
        id: 'google-workspace',
        label: 'Google Workspace (Gmail / Calendar / Drive)',
        status,
        notes,
        remediation,
      },
    ],
    overall: status,
  };
}

function render(report: Report): string {
  const lines: string[] = [];
  lines.push('Mitosis Data Access Audit');
  lines.push('-----------------------------------------------------');
  lines.push(`Platform: ${report.platform}`);
  for (const [k, v] of Object.entries(report.context)) {
    if (v) lines.push(`${k.padEnd(18)} ${v}`);
  }
  lines.push('');

  for (const s of report.surfaces) {
    const head =
      s.status === 'connected'
        ? '[CONNECTED]'
        : s.status === 'partial'
          ? '[PARTIAL]  '
          : s.status === 'disconnected'
            ? '[OFFLINE]  '
            : '[UNKNOWN]  ';
    lines.push(`${head} ${s.label}`);
    for (const n of s.notes) lines.push(`  ${n}`);
    if (s.remediation.length) {
      lines.push('');
      lines.push('  How to fix:');
      for (const r of s.remediation) lines.push(`    ${r}`);
    }
    lines.push('');
  }

  if (report.overall !== 'connected') {
    lines.push('Surfaces marked [OFFLINE] or [PARTIAL] are NOT SAFE to rely on:');
    lines.push('the agent cannot read that data, and there is no silent fallback.');
  }
  return lines.join('\n');
}

export function registerAuditCommand(program: Command): void {
  const audit = program
    .command('audit')
    .description('Audit this agent: data access, identity, safety (more checks coming)');

  audit
    .command('data-access')
    .description('Check which data sources the agent can read (Gmail / Google Workspace today)')
    .option('-p, --platform <name>', 'Force platform: openclaw|hermes (default: auto-detect)')
    .option('-o, --office <officeId>', 'Office ID (openclaw)')
    .option('-a, --agent <name>', 'Agent name (openclaw)')
    .option('--hermes-env <path>', 'Path to hermes .env (default: ~/.hermes/.env)')
    .option('--json', 'Emit JSON instead of human-readable text')
    .action(
      async (opts: {
        platform?: string;
        office?: string;
        agent?: string;
        hermesEnv?: string;
        json?: boolean;
      }) => {
        let platform: Platform | undefined;
        if (opts.platform) {
          if (opts.platform !== 'openclaw' && opts.platform !== 'hermes') {
            throw new Error(`--platform must be "openclaw" or "hermes" (got "${opts.platform}")`);
          }
          platform = opts.platform;
        } else {
          platform = detectPlatform();
        }
        if (!platform) {
          throw new Error(
            'could not auto-detect platform. Pass --platform openclaw|hermes\n' +
              '  openclaw signals: OS1_AGENT_NAME, AGENT_POD_NAME, BOT_NAME env vars\n' +
              '  hermes signals:   ~/.hermes/, HERMES_GATEWAY_URL, PJBRAIN_* env vars',
          );
        }

        const report =
          platform === 'openclaw'
            ? await auditOpenClaw({ office: opts.office, agent: opts.agent })
            : auditHermes(opts.hermesEnv);

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(render(report));
        }

        if (report.overall === 'disconnected') process.exitCode = 2;
        else if (report.overall === 'partial') process.exitCode = 1;
      },
    );
}
