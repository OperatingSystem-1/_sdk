import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OS1AdminClient } from '../client.js';
import {
  findHermesConfig,
  findHermesEnv,
  resolveOpenClawContext,
  resolvePlatform,
  emitReportAndExit,
  SAFETY_LABELS,
  type Report,
  type SurfaceStatus,
} from './audit-shared.js';

type Verdict = 'safe' | 'partial' | 'unsafe' | 'unknown';

interface ProviderEntry {
  canonicalId: string;
  displayName: string;
  verdict: Verdict;
  reason: string;
}

// Classification per the product invariant from the founding sketch:
//   "private inference (GOOD)"  vs  "cloud service provider (NOT SAFE)"
// and the 2026-05-15 meeting note that Bedrock is private inference
// because the contract prevents data from training provider models.
//
// safe    = data stays under the user's control (private/local/colony)
// partial = routed through a Mitosis-managed proxy but ultimately a 3p model
// unsafe  = direct cloud API; prompts and outputs leave the user's control
const PROVIDERS: Record<string, ProviderEntry> = {
  'amazon-bedrock': {
    canonicalId: 'amazon-bedrock',
    displayName: 'Amazon Bedrock',
    verdict: 'safe',
    reason: 'private inference under AWS contract; prompts do not train provider models',
  },
  bedrock: {
    canonicalId: 'amazon-bedrock',
    displayName: 'Amazon Bedrock',
    verdict: 'safe',
    reason: 'alias for amazon-bedrock',
  },
  'mitosis-private': {
    canonicalId: 'mitosis-private',
    displayName: 'Mitosis Private Inference',
    verdict: 'safe',
    reason: 'Mitosis-hosted private inference; data stays inside your colony',
  },
  colony: {
    canonicalId: 'mitosis-private',
    displayName: 'Mitosis Colony',
    verdict: 'safe',
    reason: 'inference handled inside the Mitosis colony',
  },
  'venice-ai': {
    canonicalId: 'venice-ai',
    displayName: 'Venice AI',
    verdict: 'safe',
    reason: 'privacy-focused provider; no prompt retention',
  },
  venice: {
    canonicalId: 'venice-ai',
    displayName: 'Venice AI',
    verdict: 'safe',
    reason: 'alias for venice-ai',
  },
  local: {
    canonicalId: 'local',
    displayName: 'Local model',
    verdict: 'safe',
    reason: 'runs on your hardware; nothing leaves the machine',
  },
  ollama: {
    canonicalId: 'ollama',
    displayName: 'Ollama (local)',
    verdict: 'safe',
    reason: 'runs locally via Ollama; nothing leaves the machine',
  },

  'claude-code': {
    canonicalId: 'claude-code',
    displayName: 'Claude Code proxy (Anthropic)',
    verdict: 'partial',
    reason: 'routed via the Mitosis claude-code proxy, but prompts ultimately hit the Anthropic API',
  },
  'openai-codex': {
    canonicalId: 'openai-codex',
    displayName: 'Codex proxy (OpenAI)',
    verdict: 'partial',
    reason: 'routed via the Mitosis codex proxy, but prompts ultimately hit the OpenAI API',
  },
  'gemini-cli': {
    canonicalId: 'gemini-cli',
    displayName: 'Gemini CLI proxy (Google)',
    verdict: 'partial',
    reason: 'routed via the Mitosis gemini proxy, but prompts ultimately hit Google Gemini',
  },

  anthropic: {
    canonicalId: 'anthropic',
    displayName: 'Anthropic API (direct)',
    verdict: 'unsafe',
    reason: 'prompts and outputs are sent directly to Anthropic; governed by their data policy',
  },
  openai: {
    canonicalId: 'openai',
    displayName: 'OpenAI API (direct)',
    verdict: 'unsafe',
    reason: 'prompts and outputs are sent directly to OpenAI; governed by their data policy',
  },
  'google-gemini': {
    canonicalId: 'google-gemini',
    displayName: 'Google Gemini API (direct)',
    verdict: 'unsafe',
    reason: 'prompts and outputs are sent directly to Google; governed by their data policy',
  },
  gemini: {
    canonicalId: 'google-gemini',
    displayName: 'Google Gemini API (direct)',
    verdict: 'unsafe',
    reason: 'alias for google-gemini',
  },
  'azure-openai': {
    canonicalId: 'azure-openai',
    displayName: 'Azure OpenAI',
    verdict: 'unsafe',
    reason: 'cloud-hosted; data leaves your control unless covered by an enterprise privacy clause',
  },
};

function classify(providerId: string | undefined): ProviderEntry & { input: string } {
  const input = (providerId ?? '').trim().toLowerCase();
  const entry = PROVIDERS[input];
  if (entry) return { ...entry, input };
  return {
    input,
    canonicalId: input || 'unset',
    displayName: input || '(not set)',
    verdict: 'unknown',
    reason: input
      ? `unrecognised provider id "${input}" — cannot judge safety without an entry in the catalogue`
      : 'no model provider configured',
  };
}

function verdictToStatus(v: Verdict): SurfaceStatus {
  return v === 'safe'
    ? 'connected'
    : v === 'partial'
      ? 'partial'
      : v === 'unsafe'
        ? 'disconnected'
        : 'unknown';
}

const FOOTER =
  'Surfaces marked [UNSAFE] send your prompts and outputs to a third-party provider.\n' +
  'There is no fallback that hides this — every call goes out.';

interface OpenClawOffice {
  id?: string;
  name?: string;
  modelProvider?: string;
  defaultModelTier?: string;
}

interface OpenClawEmployee {
  name: string;
  modelProvider?: string;
  modelTier?: string;
}

function providerExpectedKey(canonicalId: string): string | undefined {
  return {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    'google-gemini': 'GEMINI_API_KEY',
    'amazon-bedrock': 'AWS_ACCESS_KEY_ID',
    'azure-openai': 'AZURE_API_KEY',
    'venice-ai': 'VENICE_API_KEY',
  }[canonicalId];
}

async function auditOpenClawProvider(opts: { office?: string; agent?: string }): Promise<Report> {
  const { officeId, agentName } = resolveOpenClawContext(opts);
  const client = await OS1AdminClient.fromConfig();

  const office = await client.transport.get<OpenClawOffice>(`/api/v1/offices/${officeId}`);
  const employee = await client.transport.get<OpenClawEmployee>(
    `/api/v1/offices/${officeId}/employees/${agentName}`,
  );

  const officeProvider = classify(office.modelProvider);
  const agentProvider = classify(employee.modelProvider);
  const effective = employee.modelProvider ? agentProvider : officeProvider;

  const notes: string[] = [];
  notes.push(`office default: ${officeProvider.displayName} [${officeProvider.verdict}]`);
  notes.push(
    `agent override: ${
      employee.modelProvider
        ? `${agentProvider.displayName} [${agentProvider.verdict}]`
        : '(none — uses office default)'
    }`,
  );
  notes.push(`effective:      ${effective.displayName} [${effective.verdict}]`);
  notes.push(`model tier:     ${employee.modelTier ?? '(unset)'}`);
  notes.push('');
  notes.push(`why: ${effective.reason}`);

  const status = verdictToStatus(effective.verdict);

  const remediation: string[] = [];
  if (effective.verdict === 'unsafe') {
    remediation.push(
      'Switch this office to a private-inference provider (applies to all new agents):',
      `  mi offices settings set ${officeId} --model-provider amazon-bedrock`,
      `  mi offices settings set ${officeId} --model-provider venice-ai`,
      'Or override just this agent:',
      `  PATCH /api/v1/offices/${officeId}/employees/${agentName}`,
      `       body: { "modelProvider": "amazon-bedrock" }`,
    );
  } else if (effective.verdict === 'partial') {
    remediation.push(
      'You are routing via a Mitosis proxy, but prompts still reach the upstream provider.',
      'For maximum privacy, switch to amazon-bedrock or venice-ai (see above).',
    );
  } else if (effective.verdict === 'unknown') {
    remediation.push(
      `No known classification for "${effective.input || '(empty)'}". Either:`,
      ' - it is a custom provider not in the Mitosis catalogue, or',
      ' - the office settings have not been initialised; set one with:',
      `   mi offices settings set ${officeId} --model-provider amazon-bedrock`,
    );
  }

  return {
    command: 'audit model-provider',
    title: 'Mitosis Model Provider Audit',
    platform: 'openclaw',
    context: {
      office_id: officeId,
      agent_name: agentName,
      endpoint: client.transport.endpoint,
    },
    surfaces: [
      {
        id: 'model-provider',
        label: `Model provider for agent "${agentName}"`,
        status,
        notes,
        remediation,
        statusLabels: SAFETY_LABELS,
      },
    ],
    overall: status,
    footer: FOOTER,
  };
}

function auditHermesProvider(opts: { hermesEnv?: string; hermesConfig?: string }): Report {
  const cfgFile = findHermesConfig(opts.hermesConfig);
  const envFile = findHermesEnv(opts.hermesEnv);

  const modelSection = cfgFile?.values?.['model'] ?? {};
  const providerId = modelSection['provider'];
  // hermes yaml uses `model.default` for the model id; pjbrain's toml example uses `model.model`
  const modelId = modelSection['default'] ?? modelSection['model'];
  const classified = classify(providerId);

  const notes: string[] = [];
  notes.push(
    cfgFile
      ? `config: ${cfgFile.path}`
      : 'config: ~/.hermes/config.yaml (or .toml) not found',
  );
  notes.push(envFile ? `env file: ${envFile.path}` : 'env file: ~/.hermes/.env not found');
  notes.push(`provider: ${classified.displayName} [${classified.verdict}]`);
  notes.push(`model:    ${modelId ?? '(unset)'}`);

  const envValues: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AZURE_API_KEY: process.env.AZURE_API_KEY,
    VENICE_API_KEY: process.env.VENICE_API_KEY,
    ...(envFile?.values ?? {}),
  };
  // Hermes auth options for anthropic: API key, OR Claude Max OAuth via
  // ~/.hermes/auth.json (per pjbrain/ARCHITECTURE.md). Accept either.
  const expectedKey = providerExpectedKey(classified.canonicalId);
  let credentialOk = false;
  if (expectedKey) {
    credentialOk = Boolean(envValues[expectedKey]);
  }
  if (classified.canonicalId === 'anthropic' && !credentialOk) {
    const authPath = join(homedir(), '.hermes', 'auth.json');
    if (existsSync(authPath)) {
      credentialOk = true;
      notes.push(`[OK]   Claude Max OAuth (~/.hermes/auth.json) — alternative to ANTHROPIC_API_KEY`);
    }
  }
  if (expectedKey && !credentialOk) {
    notes.push(`[MISS] ${expectedKey} (required for ${classified.displayName})`);
  } else if (expectedKey && envValues[expectedKey]) {
    notes.push(`[OK]   ${expectedKey} (required for ${classified.displayName})`);
  }
  notes.push('');
  notes.push(`why: ${classified.reason}`);

  const status = verdictToStatus(classified.verdict);

  // Reflect the file format we actually read so the remediation matches
  // what the user has on disk (yaml on real hermes; toml in pjbrain example).
  const isYaml = cfgFile ? !cfgFile.path.endsWith('.toml') : true;
  const configPath = cfgFile?.path ?? '~/.hermes/config.yaml';

  const remediation: string[] = [];
  if (classified.verdict === 'unsafe') {
    remediation.push(`Move hermes to a private-inference provider by editing ${configPath}:`);
    if (isYaml) {
      remediation.push('  model:', '    provider: amazon-bedrock', '    default: amazon-bedrock/claude-sonnet-4-5-20250929-v1:0');
    } else {
      remediation.push('  [model]', '  provider = "amazon-bedrock"', '  model    = "claude-sonnet-4-5-20250929-v1:0"');
    }
    remediation.push(
      'Set AWS credentials in ~/.hermes/.env:',
      '  AWS_ACCESS_KEY_ID=...',
      '  AWS_SECRET_ACCESS_KEY=...',
      '  AWS_REGION=us-east-2',
      'Then restart hermes: hermes gateway restart',
    );
  } else if (classified.verdict === 'unknown' && !providerId) {
    remediation.push(
      'No `model.provider` in ~/.hermes/config.yaml. Add (yaml):',
      '  model:',
      '    provider: amazon-bedrock',
      '    default: amazon-bedrock/claude-sonnet-4-5-20250929-v1:0',
      'Or, for pjbrain-style toml at ~/.hermes/config.toml:',
      '  [model]',
      '  provider = "amazon-bedrock"',
      '  model    = "claude-sonnet-4-5-20250929-v1:0"',
    );
  } else if (expectedKey && !credentialOk) {
    remediation.push(
      `Set ${expectedKey} in ~/.hermes/.env — the provider is configured but the credential is missing.`,
    );
    if (classified.canonicalId === 'anthropic') {
      remediation.push(
        `Alternatively, log in with Claude Max OAuth so ~/.hermes/auth.json exists (no API key needed).`,
      );
    }
  }

  return {
    command: 'audit model-provider',
    title: 'Mitosis Model Provider Audit',
    platform: 'hermes',
    context: {
      hermes_config_path: cfgFile?.path,
      hermes_env_path: envFile?.path,
      home: homedir(),
    },
    surfaces: [
      {
        id: 'model-provider',
        label: 'Hermes model provider',
        status,
        notes,
        remediation,
        statusLabels: SAFETY_LABELS,
      },
    ],
    overall: status,
    footer: FOOTER,
  };
}

export function registerModelProviderCommand(parent: Command): void {
  parent
    .command('model-provider')
    .description(
      'Check what LLM provider the agent uses, and whether it is private inference (SAFE) or third-party cloud (UNSAFE)',
    )
    .option('-p, --platform <name>', 'Force platform: openclaw|hermes (default: auto-detect)')
    .option('-o, --office <officeId>', 'Office ID (openclaw)')
    .option('-a, --agent <name>', 'Agent name (openclaw)')
    .option('--hermes-env <path>', 'Path to hermes .env (default: ~/.hermes/.env)')
    .option('--hermes-config <path>', 'Path to hermes config (default: ~/.hermes/config.yaml, falls back to config.toml)')
    .option('--json', 'Emit JSON instead of human-readable text')
    .option('--no-save', 'Do not persist this audit result to ~/.os1/settings.json')
    .action(
      async (opts: {
        platform?: string;
        office?: string;
        agent?: string;
        hermesEnv?: string;
        hermesConfig?: string;
        json?: boolean;
        save?: boolean;
      }) => {
        const platform = resolvePlatform(opts.platform);
        const report =
          platform === 'openclaw'
            ? await auditOpenClawProvider({ office: opts.office, agent: opts.agent })
            : auditHermesProvider({
                hermesEnv: opts.hermesEnv,
                hermesConfig: opts.hermesConfig,
              });
        emitReportAndExit(report, Boolean(opts.json), { save: opts.save });
      },
    );
}
