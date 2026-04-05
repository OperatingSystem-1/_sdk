#!/usr/bin/env node

import { Command } from 'commander';
import { OS1Client } from '../client.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';

const program = new Command();
const CONFIG_DIR = join(homedir(), '.os1');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULT_ENDPOINT = 'https://m.mitosislabs.ai';

interface Config {
  endpoint: string;
  key: string;
}

program
  .name('mi')
  .description('Mitosis One — manage offices, agents, and integrations')
  .version('0.1.0');

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function peekConfig(): Config | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function loadConfig(): Config {
  const config = peekConfig();
  if (!config) die(`Not logged in. Run 'mi login' first.`);
  return config;
}

function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function getClient(): OS1Client {
  const config = loadConfig();
  return new OS1Client({
    endpoint: config.endpoint,
    auth: { type: 'token', token: config.key },
  });
}

function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function openBrowser(url: string): void {
  try {
    const cmd = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${cmd} "${url}"`, { stdio: 'ignore' });
  } catch {
    // silent — user can open manually
  }
}

// ─── login ──────────────────────────────────────────────────────────────────

program
  .command('login [code]')
  .description('Authenticate with an invite code or API key')
  .option('-e, --endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
  .action(async (code: string | undefined, opts: { endpoint: string }) => {
    const endpoint = opts.endpoint;

    let key: string;

    if (code) {
      // Invite code — exchange for API key
      if (code.startsWith('mi_')) {
        // It's already an API key
        key = code;
      } else {
        // It's an invite code — claim it
        const resp = await fetch(`${endpoint}/api/v1/auth/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({})) as { error?: string };
          die(err.error ?? `Invalid invite code (${resp.status})`);
        }
        const result = await resp.json() as { key: string; officeId?: string };
        key = result.key;
        if (result.officeId) {
          console.log(`Office: ${result.officeId}`);
        }
      }
    } else {
      // Interactive — open browser and prompt
      const settingsUrl = 'https://mitosislabs.ai/dashboard/settings';
      console.log(`Get your API key from: ${settingsUrl}`);
      openBrowser(settingsUrl);
      key = await prompt('\nPaste your API key: ');
      if (!key) die('No key provided.');
    }

    if (!key.startsWith('mi_')) die('Invalid key format. Keys start with mi_');

    saveConfig({ endpoint, key });
    console.log('Logged in.');
  });

program
  .command('logout')
  .description('Remove stored credentials')
  .action(() => {
    if (existsSync(CONFIG_FILE)) unlinkSync(CONFIG_FILE);
    console.log('Logged out.');
  });

program
  .command('whoami')
  .description('Show current auth status')
  .action(() => {
    const config = peekConfig();
    if (!config) die('Not logged in.');
    console.log(`Endpoint: ${config.endpoint}`);
    console.log(`Key:      ${config.key.slice(0, 11)}...`);
  });

// ─── offices ────────────────────────────────────────────────────────────────

const offices = program.command('offices').description('Office management');

offices.command('list').action(async () => {
  json(await getClient().offices.list());
});

offices.command('create').requiredOption('-n, --name <name>', 'Name').action(async (opts) => {
  json(await getClient().offices.create({ name: opts.name }));
});

offices.command('status <officeId>').action(async (id) => {
  json(await getClient().offices.status(id));
});

offices.command('delete <officeId>').action(async (id) => {
  await getClient().offices.delete(id);
  console.log('Deleted');
});

// ─── agents ─────────────────────────────────────────────────────────────────

const agents = program.command('agents').description('Agent management');

agents.command('list').requiredOption('-o, --office <id>', 'Office ID').action(async (opts) => {
  json(await getClient().agents.list(opts.office));
});

agents
  .command('hire')
  .requiredOption('-o, --office <id>', 'Office ID')
  .requiredOption('-n, --name <name>', 'Agent name')
  .option('-r, --role <role>', 'Role')
  .option('-m, --model <tier>', 'Model tier (opus/sonnet/haiku)')
  .action(async (opts) => {
    json(
      await getClient().agents.hire(opts.office, {
        name: opts.name,
        role: opts.role,
        modelTier: opts.model,
      }),
    );
  });

agents.command('get <officeId> <name>').action(async (officeId, name) => {
  json(await getClient().agents.get(officeId, name));
});

agents.command('fire <officeId> <name>').action(async (officeId, name) => {
  await getClient().agents.fire(officeId, name);
  console.log(`Fired ${name}`);
});

agents
  .command('logs <officeId> <name>')
  .option('-t, --tail <n>', 'Lines', '100')
  .action(async (officeId, name, opts) => {
    const r = await getClient().agents.logs(officeId, name, { tail: parseInt(opts.tail, 10) });
    console.log(r.logs);
  });

agents
  .command('activity <officeId> <name>')
  .option('-l, --limit <n>', 'Limit', '20')
  .action(async (officeId, name, opts) => {
    json(await getClient().agents.activity(officeId, name, { limit: parseInt(opts.limit, 10) }));
  });

// ─── integrations ───────────────────────────────────────────────────────────

const integ = program.command('integrations').description('Integration management');

integ.command('models').requiredOption('-o, --office <id>', 'Office ID').action(async (opts) => {
  json(await getClient().integrations.listModels(opts.office));
});

// ─── raw API ────────────────────────────────────────────────────────────────

program
  .command('api <method> <path>')
  .description('Raw authenticated API call')
  .option('-d, --data <json>', 'Request body')
  .action(async (method, path, opts) => {
    const client = getClient();
    const body = opts.data ? JSON.parse(opts.data) : undefined;
    json(await client.transport.request(method.toUpperCase(), path, { body }));
  });

program.parse();
