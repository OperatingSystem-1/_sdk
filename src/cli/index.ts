#!/usr/bin/env node

import { Command } from 'commander';
import { OS1Client } from '../client.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

import type { AuthConfig, ApiKeyAuth, TokenAuth } from '../types/index.js';

const program = new Command();
const CONFIG_DIR = join(homedir(), '.os1');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

program
  .name('os1')
  .description('OS-1 SDK — manage offices, agents, and integrations')
  .version('0.1.0');

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function peekConfig(): { endpoint: string; auth: AuthConfig } | null {
  if (!existsSync(CONFIG_FILE)) return null;
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function loadConfig(): { endpoint: string; auth: AuthConfig } {
  const config = peekConfig();
  if (!config) die(`Not configured. Run 'os1 init' first.`);
  return config;
}

function saveConfig(config: { endpoint: string; auth: AuthConfig }): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function getClient(): OS1Client {
  const config = loadConfig();
  return new OS1Client({ endpoint: config.endpoint, auth: config.auth });
}

function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function apiKeyAuth(key: string, userId?: string): ApiKeyAuth {
  return { type: 'apiKey', key: key.trim(), userId };
}

function tokenAuth(token: string): TokenAuth {
  return { type: 'token', token };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDeviceCode(endpoint: string): Promise<{
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval?: number;
}> {
  const resp = await fetch(`${endpoint.replace(/\/$/, '')}/oauth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Device flow failed (${resp.status})`);
  return resp.json();
}

async function pollDeviceToken(endpoint: string, deviceCode: string, interval: number): Promise<string> {
  const url = `${endpoint.replace(/\/$/, '')}/oauth/device/token`;
  while (true) {
    await sleep(interval * 1000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    });
    if (resp.status === 200) {
      const payload = await resp.json();
      return payload.access_token;
    }
    const err = await resp.json().catch(() => ({}));
    const errorCode = (err as { error?: string }).error;
    if (errorCode === 'authorization_pending') continue;
    if (errorCode === 'slow_down') {
      interval += 5;
      continue;
    }
    throw new Error(
      err?.error_description ??
        err?.error ??
        `Device token request failed with status ${resp.status}`,
    );
  }
}

const DEFAULT_ENDPOINT = 'https://api.mitosislabs.ai';

program
  .command('init')
  .description('Configure the OS-1 SDK')
  .option('-e, --endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
  .option('-k, --key <apiKey>', 'API key')
  .option('-u, --user <userId>', 'User ID')
  .action(async (opts) => {
    let apiKey = opts.key;
    if (!apiKey) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      apiKey = await new Promise<string>((resolve) => {
        rl.question('API key: ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
    }
    if (!apiKey) die('API key is required');

    saveConfig({
      endpoint: opts.endpoint,
      auth: apiKeyAuth(apiKey, opts.user),
    });

    console.log(`Configured: ${opts.endpoint}`);
  });

const login = program.command('login').description('Manage saved credentials');

login
  .command('api-key')
  .description('Store an API key')
  .requiredOption('-k, --key <apiKey>', 'API key')
  .option('-u, --user <userId>', 'User ID')
  .action((opts) => {
    const config = peekConfig();
    if (!config) die("Run 'os1 init' first to set the endpoint.");
    const defaultUserId = config.auth.type === 'apiKey' ? config.auth.userId : undefined;
    saveConfig({
      endpoint: config.endpoint,
      auth: apiKeyAuth(opts.key, opts.user ?? defaultUserId),
    });
    console.log('API key saved.');
  });

login
  .command('device')
  .description('Authorize via OAuth device flow')
  .option('-e, --endpoint <url>', 'API endpoint')
  .action(async (opts) => {
    const config = peekConfig();
    const endpoint = opts.endpoint ?? config?.endpoint ?? DEFAULT_ENDPOINT;
    const device = await requestDeviceCode(endpoint);
    console.log('Open this URL in your browser and enter the code:');
    console.log(`  ${device.verification_uri}`);
    console.log(`Code: ${device.user_code}`);
    console.log('Waiting for authorization...');
    const token = await pollDeviceToken(endpoint, device.device_code, device.interval ?? 5);
    saveConfig({ endpoint, auth: tokenAuth(token) });
    console.log('Device authorization successful.');
  });

program
  .command('logout')
  .description('Forget stored credentials')
  .action(() => {
    if (existsSync(CONFIG_FILE)) unlinkSync(CONFIG_FILE);
    console.log('Credentials removed.');
  });

program
  .command('auth-test')
  .description('Verify authentication')
  .action(async () => {
    const client = getClient();
    const ok = await client.health();
    console.log(ok ? 'OK' : 'FAILED — cannot reach API');
    process.exit(ok ? 0 : 1);
  });

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

const integ = program.command('integrations').description('Integration management');

integ.command('models').requiredOption('-o, --office <id>', 'Office ID').action(async (opts) => {
  json(await getClient().integrations.listModels(opts.office));
});

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
