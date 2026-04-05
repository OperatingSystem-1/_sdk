#!/usr/bin/env node

import { Command } from 'commander';
import { OS1Client } from '../client.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

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

function loadConfig(): { endpoint: string; apiKey: string; userId?: string } {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    die(`Not configured. Run 'os1 init' first.`);
  }
}

function getClient(): OS1Client {
  const config = loadConfig();
  return new OS1Client(config);
}

function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ─── init ────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Configure the OS-1 SDK')
  .option('-e, --endpoint <url>', 'API endpoint', 'https://api.mitosislabs.ai')
  .option('-k, --key <apiKey>', 'API key')
  .option('-u, --user <userId>', 'User ID')
  .action(async (opts) => {
    let apiKey = opts.key;
    if (!apiKey) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      apiKey = await new Promise<string>((r) => {
        rl.question('API key: ', (a) => { rl.close(); r(a.trim()); });
      });
    }
    if (!apiKey) die('API key is required');

    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CONFIG_FILE, JSON.stringify({
      endpoint: opts.endpoint,
      apiKey,
      userId: opts.user,
    }, null, 2));

    console.log(`Configured: ${opts.endpoint}`);
  });

// ─── auth ────────────────────────────────────────────────────────────────────

program
  .command('auth-test')
  .description('Verify authentication')
  .action(async () => {
    const client = getClient();
    const ok = await client.health();
    console.log(ok ? 'OK' : 'FAILED — cannot reach API');
    process.exit(ok ? 0 : 1);
  });

// ─── offices ─────────────────────────────────────────────────────────────────

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

// ─── agents ──────────────────────────────────────────────────────────────────

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
    json(await getClient().agents.hire(opts.office, {
      name: opts.name,
      role: opts.role,
      modelTier: opts.model,
    }));
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
    const r = await getClient().agents.logs(officeId, name, { tail: parseInt(opts.tail) });
    console.log(r.logs);
  });

agents
  .command('activity <officeId> <name>')
  .option('-l, --limit <n>', 'Limit', '20')
  .action(async (officeId, name, opts) => {
    json(await getClient().agents.activity(officeId, name, { limit: parseInt(opts.limit) }));
  });

// ─── integrations ────────────────────────────────────────────────────────────

const integ = program.command('integrations').description('Integration management');

integ.command('models').requiredOption('-o, --office <id>', 'Office ID').action(async (opts) => {
  json(await getClient().integrations.listModels(opts.office));
});

// ─── raw API ─────────────────────────────────────────────────────────────────

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
