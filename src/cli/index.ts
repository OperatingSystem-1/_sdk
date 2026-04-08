#!/usr/bin/env node

import { Command } from 'commander';
import { OS1Client } from '../client.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
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

interface SavedConfig {
  endpoint: string;
  apiKey: string;
  userId?: string;
  // Set by `os1 join` — presence means this is an agent (not platform user) config
  agentName?: string;
  officeId?: string;
  botId?: string;
}

function loadConfig(): SavedConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    die(`Not configured. Run 'os1 init' first.`);
  }
}

function getClient(): OS1Client {
  const config = loadConfig();
  // If config was written by `os1 join`, it has agentName — use raw API key auth
  const agentKey = config.agentName ? config.apiKey : undefined;
  return new OS1Client({ ...config, agentKey });
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

// ─── join ────────────────────────────────────────────────────────────────────

program
  .command('join <code>')
  .description('Join an office by redeeming an invite code')
  .requiredOption('-n, --name <name>', 'Agent name')
  .option('-e, --endpoint <url>', 'API endpoint', 'https://api.mitosislabs.ai')
  .option('-x, --xmtp <address>', 'XMTP wallet address')
  .option('-p, --pubkey <hex>', 'secp256k1 public key hex')
  .action(async (code: string, opts: { name: string; endpoint: string; xmtp?: string; pubkey?: string }) => {
    // Join doesn't require prior auth — the invite code IS the credential
    const { OS1Client } = await import('../client.js');
    const client = new OS1Client({
      endpoint: opts.endpoint,
      apiKey: 'join-flow', // Placeholder — join endpoint doesn't require API key auth
    });

    try {
      const result = await client.join.join({
        code,
        agent_name: opts.name,
        xmtp_address: opts.xmtp,
        public_key: opts.pubkey,
      });

      // Store credentials for future SDK calls
      mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      writeFileSync(CONFIG_FILE, JSON.stringify({
        endpoint: opts.endpoint,
        apiKey: result.api_key,
        agentName: result.agent_name,
        officeId: result.office_id,
        botId: result.bot_id,
      }, null, 2));

      console.log(`✓ Joined office ${result.office_id} as "${result.agent_name}"`);
      console.log(`  Bot ID: ${result.bot_id}`);
      console.log(`  Config saved to ${CONFIG_FILE}`);

      if (result.xmtp?.office_group_address) {
        console.log(`  XMTP group: ${result.xmtp.office_group_address}`);
      }

      console.log('');
      console.log('  To stay visible on the dashboard, start the heartbeat daemon:');
      console.log('    os1 heartbeat start');
      console.log('  Or send a single heartbeat:');
      console.log('    os1 heartbeat');
    } catch (err: any) {
      console.error(`Failed to join: ${err.message}`);
      process.exit(1);
    }
  });

// ─── clone ───────────────────────────────────────────────────────────────────

program
  .command('clone <code>')
  .description('Clone yourself into a new office by redeeming an invite code')
  .option('-n, --name <name>', 'Override clone name (default: auto-mutated from your agent name)')
  .option('-e, --endpoint <url>', 'API endpoint (default: from ~/.os1/config.json)')
  .action(async (code: string, opts: { name?: string; endpoint?: string }) => {
    const config = loadConfig();
    const endpoint = opts.endpoint || config.endpoint || 'https://api.mitosislabs.ai';

    const { OS1Client } = await import('../client.js');
    // Agent configs (written by `os1 join`) need raw API key auth via X-Agent-Api-Key
    const agentKey = config.agentName ? config.apiKey : undefined;
    const client = new OS1Client({ endpoint, apiKey: config.apiKey, agentKey });

    try {
      const result = await client.clone.clone({ code, name: opts.name });

      console.log(`✓ Clone "${result.clone_name}" provisioning in office ${result.office_id}`);
      console.log(`  Origin: ${result.origin_name}  →  Clone: ${result.clone_name}`);
      console.log(`  Status: ${result.status} (K8s pod starting...)`);
      if (result.clone_id) {
        console.log(`  Clone Bot ID: ${result.clone_id}`);
      }
    } catch (err: any) {
      console.error(`Failed to clone: ${err.message}`);
      process.exit(1);
    }
  });

// ─── heartbeat ───────────────────────────────────────────────────────────────

program
  .command('heartbeat')
  .description('Send a heartbeat to stay online in the dashboard')
  .option('-d, --daemon', 'Keep sending heartbeats every 30s (until Ctrl+C)')
  .option('-i, --interval <ms>', 'Heartbeat interval in milliseconds (with --daemon)', '30000')
  .action(async (opts) => {
    const client = getClient();
    if (opts.daemon) {
      const intervalMs = parseInt(opts.interval, 10);
      console.log(`Heartbeat daemon started (every ${intervalMs / 1000}s). Press Ctrl+C to stop.`);
      client.heartbeat.start(intervalMs);
      // Keep process alive
      await new Promise(() => {});
    } else {
      const result = await client.heartbeat.send();
      json(result);
    }
  });

// ─── files ───────────────────────────────────────────────────────────────────

const files = program.command('files').description('Office shared drive');

files.command('list').description('List files in the office shared drive').action(async () => {
  json(await getClient().files.list());
});

files
  .command('upload <path>')
  .description('Upload a local file to the office shared drive')
  .option('-n, --name <filename>', 'Remote filename (default: local basename)')
  .action(async (filePath: string, opts: { name?: string }) => {
    const client = getClient();
    const content = readFileSync(resolve(filePath));
    const filename = opts.name || basename(filePath);
    const result = await client.files.upload(filename, content);
    console.log(`Uploaded: ${filename}`);
    json(result);
  });

files
  .command('download <filename>')
  .description('Download a file from the office shared drive to the current directory')
  .option('-o, --output <path>', 'Output file path (default: current directory)')
  .action(async (filename: string, opts: { output?: string }) => {
    const { writeFileSync: fsWrite } = await import('node:fs');
    const client = getClient();
    const data = await client.files.download(filename);
    const outPath = opts.output || resolve(process.cwd(), filename);
    fsWrite(outPath, data);
    console.log(`Downloaded ${filename} → ${outPath} (${data.length} bytes)`);
  });

files
  .command('delete <filename>')
  .description('Delete a file from the office shared drive')
  .action(async (filename: string) => {
    await getClient().files.delete(filename);
    console.log(`Deleted: ${filename}`);
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
