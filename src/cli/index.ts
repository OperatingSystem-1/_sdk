#!/usr/bin/env node

import { Command } from 'commander';
import { OS1Client } from '../client.js';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const program = new Command();
const CONFIG_DIR = join(homedir(), '.mi');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULT_ENDPOINT = 'https://m.mitosislabs.ai';

interface Config {
  endpoint: string;
  key: string;
  officeId?: string;
  agentId?: string;
  publicKey?: string;
}

program
  .name('mi')
  .description('Mitosis CLI — manage offices, agents, and integrations')
  .version('0.2.0');

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
  if (!config) die(`Not logged in. Run 'mi login' or 'mi join' first.`);
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

/** Resolve officeId from --office flag or saved config. */
function getOfficeId(opts: { office?: string }): string {
  const id = opts.office || loadConfig().officeId;
  if (!id) die('No office. Run mi join first or pass --office.');
  return id;
}

function jsonOut(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ─── login ──────────────────────────────────────────────────────────────────

program
  .command('login [code]')
  .description('Authenticate with an invite code or API key')
  .option('-e, --endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
  .action(async (code: string | undefined, opts: { endpoint: string }) => {
    const endpoint = opts.endpoint;
    if (!code) die("Invite code or API key required. Usage: mi login <code>");

    let key: string;
    let officeId: string | undefined;

    if (code.startsWith('mi_')) {
      key = code;
    } else {
      const resp = await fetch(`${endpoint}/auth/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!resp.ok) {
        const err = (await resp.json().catch(() => ({}))) as { error?: string };
        die(err.error ?? `Invalid invite code (${resp.status})`);
      }
      const result = (await resp.json()) as {
        key: string;
        officeId?: string;
      };
      key = result.key;
      officeId = result.officeId;
    }

    if (!key.startsWith('mi_')) die('Invalid key format. Keys start with mi_');

    saveConfig({ endpoint, key, officeId });
    console.log('Logged in.');
    if (officeId) console.log(`  Office: ${officeId}`);
    console.log(`  Config: ${CONFIG_FILE}`);
  });

// ─── join ───────────────────────────────────────────────────────────────────

program
  .command('join <codeOrUrl>')
  .description('Join an office with an invite code')
  .option('-e, --endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
  .action(async (codeOrUrl: string, opts: { endpoint: string }) => {
    const endpoint = opts.endpoint;

    // Extract code from URL: https://mitosislabs.ai/invite/ABCDEF → ABCDEF
    const code = codeOrUrl.includes('/')
      ? codeOrUrl.split('/').pop()!
      : codeOrUrl;

    // Ensure keypair exists
    const { getOrCreateKeypair } = await import('../auth/keys.js');
    const kp = getOrCreateKeypair();

    // Claim invite code with publicKey for agent registration
    const resp = await fetch(`${endpoint}/auth/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, publicKey: kp.publicKey }),
    });

    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      die(err.error ?? `Invalid invite code (${resp.status})`);
    }

    const result = (await resp.json()) as {
      key: string;
      userId: string;
      officeId?: string;
      agentId?: string;
      onboarding?: {
        officeName: string;
        whatIsThis: string;
        ownerPitch: string;
        nextSteps: string;
      };
    };

    saveConfig({
      endpoint,
      key: result.key,
      officeId: result.officeId,
      agentId: result.agentId,
      publicKey: kp.publicKey,
    });

    console.log('Joined.');
    if (result.officeId) console.log(`  Office:  ${result.officeId}`);
    if (result.agentId) console.log(`  Agent:   ${result.agentId}`);
    console.log(`  Key:     ${CONFIG_FILE}`);

    if (result.onboarding) {
      console.log(`\n${result.onboarding.whatIsThis}`);
      console.log(`\nFor your owner:\n  ${result.onboarding.ownerPitch}`);
      console.log(`\nNext: mi chat ${result.agentId}`);
    } else if (result.agentId) {
      console.log(`\nNext: mi chat ${result.agentId}`);
    }
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
    if (config.officeId) console.log(`Office:   ${config.officeId}`);
    if (config.agentId) console.log(`Agent:    ${config.agentId}`);
    if (config.publicKey) console.log(`PubKey:   ${config.publicKey.slice(0, 16)}...`);
  });

// ─── offices ────────────────────────────────────────────────────────────────

const officeCmd = program.command('offices').description('Office management');

officeCmd.command('list').action(async () => {
  jsonOut(await getClient().offices.list());
});

officeCmd
  .command('create')
  .requiredOption('-n, --name <name>', 'Name')
  .action(async (opts) => {
    jsonOut(await getClient().offices.create({ name: opts.name }));
  });

officeCmd.command('status <officeId>').action(async (id) => {
  jsonOut(await getClient().offices.status(id));
});

officeCmd.command('delete <officeId>').action(async (id) => {
  await getClient().offices.delete(id);
  console.log('Deleted');
});

// ─── agents ─────────────────────────────────────────────────────────────────

const agentCmd = program.command('agents').description('Agent management');

agentCmd
  .command('list')
  .option('-o, --office <id>', 'Office ID')
  .action(async (opts) => {
    jsonOut(await getClient().agents.list(getOfficeId(opts)));
  });

agentCmd
  .command('hire')
  .option('-o, --office <id>', 'Office ID')
  .requiredOption('-n, --name <name>', 'Agent name')
  .option('-r, --role <role>', 'Role')
  .option('-m, --model <tier>', 'Model tier (opus/sonnet/haiku)')
  .action(async (opts) => {
    jsonOut(
      await getClient().agents.hire(getOfficeId(opts), {
        name: opts.name,
        role: opts.role,
        modelTier: opts.model,
      }),
    );
  });

agentCmd.command('get <name>').option('-o, --office <id>', 'Office ID').action(async (name, opts) => {
  jsonOut(await getClient().agents.get(getOfficeId(opts), name));
});

agentCmd.command('fire <name>').option('-o, --office <id>', 'Office ID').action(async (name, opts) => {
  await getClient().agents.fire(getOfficeId(opts), name);
  console.log(`Fired ${name}`);
});

agentCmd
  .command('activity <name>')
  .option('-o, --office <id>', 'Office ID')
  .option('-l, --limit <n>', 'Limit', '20')
  .action(async (name, opts) => {
    jsonOut(
      await getClient().agents.activity(getOfficeId(opts), name, {
        limit: parseInt(opts.limit, 10),
      }),
    );
  });

// ─── logs ───────────────────────────────────────────────────────────────────

program
  .command('logs <name>')
  .description('Tail agent logs')
  .option('-o, --office <id>', 'Office ID')
  .option('-t, --tail <n>', 'Lines', '100')
  .option('-f, --follow', 'Follow (poll every 3s)')
  .action(async (name, opts) => {
    const client = getClient();
    const officeId = getOfficeId(opts);
    const tail = parseInt(opts.tail, 10);

    const r = await client.agents.logs(officeId, name, { tail });
    console.log(r.logs);

    if (opts.follow) {
      let lastLen = r.logs.length;
      const poll = async () => {
        try {
          const fresh = await client.agents.logs(officeId, name, { tail: tail * 2 });
          if (fresh.logs.length !== lastLen) {
            // Print only new content (heuristic: if longer, print the diff)
            const newContent =
              fresh.logs.length > lastLen
                ? fresh.logs.slice(-(fresh.logs.length - lastLen))
                : fresh.logs;
            if (newContent.trim()) process.stdout.write(newContent);
            lastLen = fresh.logs.length;
          }
        } catch {
          /* agent may be restarting */
        }
      };
      const interval = setInterval(poll, 3000);
      process.on('SIGINT', () => {
        clearInterval(interval);
        process.exit(0);
      });
      // Keep process alive
      await new Promise(() => {});
    }
  });

// ─── lifecycle ──────────────────────────────────────────────────────────────

program
  .command('restart <name>')
  .description('Restart an agent pod')
  .option('-o, --office <id>', 'Office ID')
  .action(async (name, opts) => {
    await getClient().agents.lifecycle(getOfficeId(opts), name, 'restart');
    console.log(`Restarted ${name}`);
  });

program
  .command('stop <name>')
  .description('Stop an agent pod')
  .option('-o, --office <id>', 'Office ID')
  .action(async (name, opts) => {
    await getClient().agents.lifecycle(getOfficeId(opts), name, 'stop');
    console.log(`Stopped ${name}`);
  });

program
  .command('start <name>')
  .description('Start a stopped agent pod')
  .option('-o, --office <id>', 'Office ID')
  .action(async (name, opts) => {
    await getClient().agents.lifecycle(getOfficeId(opts), name, 'start');
    console.log(`Started ${name}`);
  });

// ─── error ──────────────────────────────────────────────────────────────────

program
  .command('error <name>')
  .description('Show last error for an agent')
  .option('-o, --office <id>', 'Office ID')
  .action(async (name, opts) => {
    const result = await getClient().agents.lastError(getOfficeId(opts), name);
    if (result.error) {
      console.log(`[${result.timestamp}] ${result.error}`);
    } else {
      console.log('No errors.');
    }
  });

// ─── env ────────────────────────────────────────────────────────────────────

const envCmd = program.command('env').description('Environment variables');

envCmd
  .command('list')
  .option('-o, --office <id>', 'Office ID')
  .option('-v, --values', 'Include values')
  .action(async (opts) => {
    const client = getClient();
    const officeId = getOfficeId(opts);
    const vars = opts.values
      ? await client.env.listValues(officeId)
      : await client.env.list(officeId);
    if (!vars.length) {
      console.log('No env vars set.');
      return;
    }
    for (const v of vars) {
      const val = v.value !== undefined ? `=${v.value}` : '';
      const scope = v.agentName ? ` (agent:${v.agentName})` : '';
      console.log(`  ${v.key}${val}${scope}`);
    }
  });

envCmd
  .command('set <key> <value>')
  .option('-o, --office <id>', 'Office ID')
  .option('-a, --agent <name>', 'Agent-scoped')
  .action(async (key, value, opts) => {
    await getClient().env.set(getOfficeId(opts), key, value, {
      scope: opts.agent ? 'agent' : 'office',
      agentName: opts.agent,
    });
    console.log(`Set ${key}`);
  });

envCmd
  .command('delete <key>')
  .option('-o, --office <id>', 'Office ID')
  .action(async (key, opts) => {
    await getClient().env.delete(getOfficeId(opts), key);
    console.log(`Deleted ${key}`);
  });

envCmd
  .command('agent <name>')
  .description('Show env vars for a specific agent')
  .option('-o, --office <id>', 'Office ID')
  .action(async (name, opts) => {
    const vars = await getClient().env.getAgentEnv(getOfficeId(opts), name);
    if (!vars.length) {
      console.log('No agent-specific env vars.');
      return;
    }
    for (const v of vars) {
      console.log(`  ${v.key}=${v.value ?? ''}`);
    }
  });

// ─── tasks ──────────────────────────────────────────────────────────────────

const taskCmd = program.command('tasks').description('Task queue');

taskCmd
  .command('list')
  .option('-o, --office <id>', 'Office ID')
  .option('-s, --status <status>', 'Filter by status')
  .option('-l, --limit <n>', 'Limit', '20')
  .action(async (opts) => {
    const tasks = await getClient().tasks.list(getOfficeId(opts), {
      status: opts.status,
      limit: parseInt(opts.limit, 10),
    });
    if (!tasks.length) {
      console.log('No tasks.');
      return;
    }
    for (const t of tasks) {
      const claimed = t.claimedBy ? ` [${t.claimedBy}]` : '';
      const tid = String(t.id).slice(0, 8);
      console.log(`  ${t.status.padEnd(10)} ${tid} ${t.title}${claimed}`);
    }
  });

taskCmd
  .command('create')
  .option('-o, --office <id>', 'Office ID')
  .requiredOption('-t, --title <title>', 'Task title')
  .option('-d, --desc <description>', 'Description')
  .option('-p, --priority <n>', 'Priority (0-10)')
  .option('-k, --kind <kind>', 'Task kind')
  .action(async (opts) => {
    const task = await getClient().tasks.create(getOfficeId(opts), {
      title: opts.title,
      description: opts.desc,
      priority: opts.priority ? parseInt(opts.priority, 10) : undefined,
      kind: opts.kind,
    });
    console.log(`Created task ${task.id}`);
  });

taskCmd
  .command('get <taskId>')
  .option('-o, --office <id>', 'Office ID')
  .action(async (taskId, opts) => {
    jsonOut(await getClient().tasks.get(getOfficeId(opts), taskId));
  });

taskCmd
  .command('stats')
  .option('-o, --office <id>', 'Office ID')
  .action(async (opts) => {
    jsonOut(await getClient().tasks.stats(getOfficeId(opts)));
  });

// ─── files ──────────────────────────────────────────────────────────────────

const fileCmd = program.command('files').description('Shared drive');

fileCmd
  .command('list')
  .option('-o, --office <id>', 'Office ID')
  .action(async (opts) => {
    const files = await getClient().files.list(getOfficeId(opts));
    if (!files.length) {
      console.log('No files.');
      return;
    }
    for (const f of files) {
      const size =
        f.size < 1024
          ? `${f.size}B`
          : f.size < 1024 * 1024
            ? `${(f.size / 1024).toFixed(1)}K`
            : `${(f.size / (1024 * 1024)).toFixed(1)}M`;
      console.log(`  ${size.padStart(8)}  ${f.modifiedAt}  ${f.name}`);
    }
  });

fileCmd
  .command('push <localPath>')
  .description('Upload a local file to the shared drive')
  .option('-o, --office <id>', 'Office ID')
  .option('-n, --name <remoteName>', 'Remote filename (default: local basename)')
  .action(async (localPath, opts) => {
    const data = readFileSync(localPath);
    const remoteName = opts.name || basename(localPath);
    await getClient().files.upload(getOfficeId(opts), remoteName, data);
    console.log(`Uploaded ${remoteName} (${data.length} bytes)`);
  });

fileCmd
  .command('pull <remoteName>')
  .description('Download a file from the shared drive')
  .option('-o, --office <id>', 'Office ID')
  .option('--out <localPath>', 'Local output path (default: ./<remoteName>)')
  .action(async (remoteName, opts) => {
    const resp = await getClient().files.download(getOfficeId(opts), remoteName);
    const buf = Buffer.from(await resp.arrayBuffer());
    const outPath = opts.out || remoteName;
    writeFileSync(outPath, buf);
    console.log(`Downloaded ${remoteName} → ${outPath} (${buf.length} bytes)`);
  });

fileCmd
  .command('rm <remoteName>')
  .description('Delete a file from the shared drive')
  .option('-o, --office <id>', 'Office ID')
  .action(async (remoteName, opts) => {
    await getClient().files.delete(getOfficeId(opts), remoteName);
    console.log(`Deleted ${remoteName}`);
  });

// ─── invite ─────────────────────────────────────────────────────────────────

program
  .command('invite')
  .description('Create an invite code for this office')
  .option('-o, --office <id>', 'Office ID')
  .action(async (opts) => {
    const result = await getClient().invites.create(getOfficeId(opts));
    console.log(`Code:  ${result.code}`);
    console.log(`Claim: ${result.claim}`);
  });

// ─── chat ───────────────────────────────────────────────────────────────────

program
  .command('chat [agentId]')
  .description('Open live chat with a remote agent')
  .option('-o, --office <id>', 'Office ID')
  .action(async (agentId: string | undefined, opts: { office?: string }) => {
    const config = loadConfig();
    const officeId = opts.office || config.officeId;
    if (!officeId) die('No office. Run mi join first or pass --office.');
    const peer = agentId || config.agentId;
    if (!peer) die('Specify agent ID or run mi join first.');
    const selfId = config.agentId || 'cli-user';

    const client = getClient();

    // Print existing history
    let lastSeenTs = 0;
    try {
      const history = await client.chat.messages(officeId, selfId, peer, 20);
      for (const msg of history) {
        const who = msg.from_agent === selfId ? 'you' : msg.from_agent;
        console.log(`[${who}] ${msg.body}`);
      }
      if (history.length) lastSeenTs = history[history.length - 1].created_at;
    } catch {
      /* no history yet */
    }

    console.log(`\nChat with ${peer} (type /quit to exit)\n`);

    // Poll for new messages
    const pollInterval = setInterval(async () => {
      try {
        const msgs = await client.chat.messages(officeId, selfId, peer, 20);
        const newMsgs = lastSeenTs
          ? msgs.filter((m) => m.created_at > lastSeenTs && m.from_agent === peer)
          : msgs.filter((m) => m.from_agent === peer);
        for (const msg of newMsgs) {
          process.stdout.write(`\r[${msg.from_agent}] ${msg.body}\n> `);
        }
        if (msgs.length) lastSeenTs = msgs[msgs.length - 1].created_at;
      } catch {
        /* agent may be unavailable */
      }
    }, 2000);

    // Interactive readline
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });
    rl.prompt();
    rl.on('line', async (line) => {
      const text = line.trim();
      if (!text) {
        rl.prompt();
        return;
      }
      if (text === '/quit' || text === '/exit') {
        rl.close();
        return;
      }
      try {
        await client.chat.send(officeId, selfId, peer, text);
      } catch (err) {
        console.error(`Send failed: ${err}`);
      }
      rl.prompt();
    });
    rl.on('close', () => {
      clearInterval(pollInterval);
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  });

// ─── integrations ───────────────────────────────────────────────────────────

const integ = program.command('integrations').description('Integration management');

integ
  .command('models')
  .option('-o, --office <id>', 'Office ID')
  .action(async (opts) => {
    jsonOut(await getClient().integrations.listModels(getOfficeId(opts)));
  });

// ─── raw API ────────────────────────────────────────────────────────────────

program
  .command('api <method> <path>')
  .description('Raw authenticated API call')
  .option('-d, --data <json>', 'Request body')
  .action(async (method, path, opts) => {
    const client = getClient();
    const body = opts.data ? JSON.parse(opts.data) : undefined;
    jsonOut(await client.transport.request(method.toUpperCase(), path, { body }));
  });

program.parse();
