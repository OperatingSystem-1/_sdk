import { Command } from 'commander';
import { homedir } from 'node:os';
import { OS1AdminClient } from '../client.js';
import {
  findHermesEnv,
  resolveOpenClawContext,
  resolvePlatform,
  emitReportAndExit,
  type Report,
  type SurfaceStatus,
} from './audit-shared.js';

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

const FOOTER =
  'Surfaces marked [OFFLINE] or [PARTIAL] are NOT SAFE to rely on:\n' +
  'the agent cannot read that data, and there is no silent fallback.';

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
    notes.push(
      'NOT VERIFIED HERE: gmail_accounts row + active Pub/Sub watch (run inside pjbrain Postgres to confirm)',
    );
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
    title: 'Mitosis Data Access Audit',
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
    footer: FOOTER,
  };
}

async function auditOpenClaw(opts: { office?: string; agent?: string }): Promise<Report> {
  const { officeId, agentName } = resolveOpenClawContext(opts);

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
  notes.push(
    `${officeOk ? '[OK]  ' : '[MISS]'} office credential (K8s secret google-workspace-${officeId})`,
  );
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
    title: 'Mitosis Data Access Audit',
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
    footer: FOOTER,
  };
}

export function registerDataAccessCommand(parent: Command): void {
  parent
    .command('data-access')
    .description('Check which data sources the agent can read (Gmail / Google Workspace today)')
    .option('-p, --platform <name>', 'Force platform: openclaw|hermes (default: auto-detect)')
    .option('-o, --office <officeId>', 'Office ID (openclaw)')
    .option('-a, --agent <name>', 'Agent name (openclaw)')
    .option('--hermes-env <path>', 'Path to hermes .env (default: ~/.hermes/.env)')
    .option('--json', 'Emit JSON instead of human-readable text')
    .option('--no-save', 'Do not persist this audit result to ~/.os1/settings.json')
    .action(
      async (opts: {
        platform?: string;
        office?: string;
        agent?: string;
        hermesEnv?: string;
        json?: boolean;
        save?: boolean;
      }) => {
        const platform = resolvePlatform(opts.platform);
        const report =
          platform === 'openclaw'
            ? await auditOpenClaw({ office: opts.office, agent: opts.agent })
            : auditHermes(opts.hermesEnv);
        emitReportAndExit(report, Boolean(opts.json), { save: opts.save });
      },
    );
}
