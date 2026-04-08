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
  privateKey?: string;
  xmtpGroupId?: string;
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

function extractInviteCode(codeOrUrl: string): string {
  if (!codeOrUrl.includes('/')) return codeOrUrl;
  try {
    const url = new URL(codeOrUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || codeOrUrl;
  } catch {
    const parts = codeOrUrl.split('/').filter(Boolean);
    return parts[parts.length - 1] || codeOrUrl;
  }
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
    const code = extractInviteCode(codeOrUrl);

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
    if (config.xmtpGroupId) console.log(`XMTP:     ${config.xmtpGroupId}`);
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
  .command('chat [target]')
  .description('Open direct XMTP chat or the saved office group chat')
  .option('-o, --office <id>', 'Office ID')
  .action(async (target: string | undefined, opts: { office?: string }) => {
    const config = loadConfig();
    const officeId = opts.office || config.officeId;
    if (!officeId) die('No office. Run mi join first or pass --office.');
    if (!config.privateKey || !config.agentId) {
      die('Public XMTP chat requires an onboarded agent identity. Run mi agent onboard first.');
    }

    const client = getAgentClient();
    const peer = target || config.xmtpGroupId;
    if (!peer) die('Specify an XMTP address or onboard into an office with a saved XMTP group.');
    const usingGroup = !/^0x[a-fA-F0-9]{40}$/.test(peer);

    let activeConversationId = config.xmtpGroupId;
    const history = usingGroup
      ? await client.chat.groupMessages(peer, 20)
      : await client.chat.directMessages(peer, 20);
    for (const msg of history) {
      const who = msg.from_agent === config.agentId ? 'you' : msg.from_agent;
      console.log(`[${who}] ${msg.body}`);
      activeConversationId = String(msg.metadata?.conversationId ?? activeConversationId ?? '');
    }

    const targetLabel = usingGroup ? `group ${peer}` : peer;
    console.log(`\nChat on public XMTP with ${targetLabel} (type /quit to exit)\n`);

    const listener = client.messages;
    listener.on('message', (msg: any) => {
      if (activeConversationId && msg.conversation_id !== activeConversationId) return;
      if (msg.from_agent === config.agentId) return;
      process.stdout.write(`\r[${msg.from_agent}] ${msg.body}\n> `);
    });
    listener.connect(officeId, config.agentId).catch((err) => {
      console.error(`Listen failed: ${err.message || err}`);
    });

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
        if (usingGroup) {
          const messageId = await client.chat.sendGroup(peer, text);
          activeConversationId = activeConversationId || peer;
          void messageId;
        } else {
          const messageId = await client.chat.sendDirect(peer, text);
          if (!activeConversationId) {
            const messages = await client.chat.directMessages(peer, 1);
            activeConversationId = String(messages[0]?.metadata?.conversationId ?? '');
          }
          void messageId;
        }
      } catch (err: any) {
        console.error(`Send failed: ${err.message || err}`);
      }
      rl.prompt();
    });
    rl.on('close', () => {
      listener.disconnect();
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

// ─── agent (external A2A) ───────────────────────────────────────────────────

/** Build a client using pubkey signing or API key fallback. */
function getAgentClient(): OS1Client {
  const config = loadConfig();
  if (config.privateKey && config.agentId) {
    return new OS1Client({
      endpoint: config.endpoint,
      auth: { type: 'token', token: config.key },
      signingKey: config.privateKey,
      agentId: config.agentId,
      officeId: config.officeId,
      xmtpGroupId: config.xmtpGroupId,
    });
  }
  // Legacy fallback: raw API key
  return new OS1Client({
    endpoint: config.endpoint,
    auth: { type: 'token', token: config.key },
    agentKey: config.key,
  });
}

const agent = program.command('agent').description('External agent operations (A2A)');

agent
  .command('join <codeOrUrl>')
  .description('Join an office as an external agent (no K8s pod)')
  .option('-n, --name <name>', 'Agent name (required)')
  .option('-e, --endpoint <url>', 'Dashboard endpoint', 'https://mitosislabs.ai')
  .action(async (codeOrUrl: string, opts: { name?: string; endpoint: string }) => {
    if (!opts.name) die('Agent name required: mi agent join <CODE> -n <name>');
    const endpoint = opts.endpoint;
    const code = extractInviteCode(codeOrUrl);
    const { getOrCreateKeypair } = await import('../auth/keys.js');
    const kp = getOrCreateKeypair();

    const resp = await fetch(`${endpoint}/api/agents/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        agent_name: opts.name,
        public_key: kp.publicKey,
        xmtp_address: kp.address,
      }),
    });

    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string; message?: string };
      die(err.message ?? err.error ?? `Join failed (${resp.status})`);
    }

    const result = (await resp.json()) as {
      bot_id: string;
      office_id: string;
      api_key: string;
      agent_name: string;
      xmtp?: { office_group_id?: string; registered?: boolean };
    };

    saveConfig({
      endpoint,
      key: result.api_key,
      officeId: result.office_id,
      agentId: result.agent_name,
      publicKey: kp.publicKey,
      privateKey: kp.privateKey,
      xmtpGroupId: result.xmtp?.office_group_id,
    });

    console.log(`✓ Joined office ${result.office_id} as "${result.agent_name}"`);
    console.log(`  Bot ID: ${result.bot_id}`);
    console.log(`  Config saved to ${CONFIG_FILE}`);
    if (result.xmtp?.registered) {
      console.log(`  XMTP: registered in office group`);
    }
    console.log(`\n  To stay visible on the dashboard, start the heartbeat daemon:`);
    console.log(`    mi agent heartbeat start`);
  });

agent
  .command('heartbeat')
  .description('Send a single heartbeat')
  .action(async () => {
    const client = getAgentClient();
    const result = await client.heartbeat.send();
    if (result.ok) console.log('✓ Heartbeat sent');
    else die('Heartbeat failed');
  });

agent
  .command('heartbeat-daemon')
  .description('Send heartbeats every 30s (keeps agent online)')
  .option('-i, --interval <ms>', 'Interval in ms', '30000')
  .action(async (opts: { interval: string }) => {
    const client = getAgentClient();
    const interval = parseInt(opts.interval, 10);
    console.log(`Heartbeat daemon started (every ${interval / 1000}s). Ctrl+C to stop.`);
    client.heartbeat.start(interval);
    process.on('SIGINT', () => {
      client.heartbeat.stop();
      process.exit(0);
    });
    await new Promise(() => {});
  });

agent
  .command('clone <code>')
  .description('Clone yourself into another office as a full K8s pod')
  .option('-n, --name <name>', 'Override clone name')
  .option('-e, --endpoint <url>', 'Dashboard endpoint')
  .action(async (code: string, opts: { name?: string; endpoint?: string }) => {
    const client = getAgentClient();

    const result = await client.clone.clone({ code, name: opts.name });
    console.log(`✓ Clone "${result.clone_name}" provisioning in office ${result.office_id}`);
    console.log(`  Origin: ${result.origin_name}  →  Clone: ${result.clone_name}`);
    console.log(`  Status: ${result.status} (K8s pod starting...)`);
    console.log(`  Clone Bot ID: ${result.clone_id}`);
  });

agent
  .command('self')
  .description('Show current agent identity')
  .action(async () => {
    const client = getAgentClient();
    const result = await client.transport.get<Record<string, unknown>>('/api/agents/self');
    jsonOut(result);
  });

// ─── agent onboard (unified flow) ──────────────────────────────────────────

agent
  .command('onboard <codeOrUrl>')
  .description('Full onboarding: join → heartbeat → clone → chat (one command)')
  .option('-n, --name <name>', 'Agent name (auto-detected if not set)')
  .option('-e, --endpoint <url>', 'Dashboard endpoint', 'https://mitosislabs.ai')
  .option('--no-clone', 'Join only — skip cloning into a K8s pod')
  .option('--no-chat', 'Skip interactive chat after onboarding')
  .action(async (codeOrUrl: string, opts: { name?: string; endpoint: string; clone: boolean; chat: boolean }) => {
    const endpoint = opts.endpoint;
    const code = extractInviteCode(codeOrUrl);
    const agentName = opts.name || `agent-${Date.now().toString(36)}`;

    console.log(`\nConnecting to ${endpoint}...\n`);

    // ── Step 0: Generate keypair ────────────────────────────────
    const { getOrCreateKeypair } = await import('../auth/keys.js');
    const kp = getOrCreateKeypair();
    console.log(`✓ Identity: ${kp.address}`);

    // ── Step 0b: Initialize XMTP identity on the network ────────
    // The agent must exist on the XMTP network before the office
    // admin can add it to the group. Creating the client registers
    // the signing key with the XMTP network.
    try {
      const { getXmtpClient } = await import('../xmtp/client.js');
      await getXmtpClient({ signingKey: kp.privateKey } as any);
      console.log(`✓ XMTP identity registered on network`);
    } catch (err: any) {
      console.log(`  ⚠ XMTP pre-init: ${err.message || err}`);
    }

    // ── Step 1: Join ────────────────────────────────────────────
    const joinResp = await fetch(`${endpoint}/api/agents/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        agent_name: agentName,
        public_key: kp.publicKey,
        xmtp_address: kp.address,
      }),
    });

    if (!joinResp.ok) {
      const err = (await joinResp.json().catch(() => ({}))) as { error?: string; message?: string };
      die(err.message ?? err.error ?? `Join failed (${joinResp.status})`);
    }

    const join = (await joinResp.json()) as {
      bot_id: string;
      office_id: string;
      api_key: string;
      agent_name: string;
      xmtp?: { office_group_id?: string; registered?: boolean };
    };

    saveConfig({
      endpoint,
      key: join.api_key,
      officeId: join.office_id,
      agentId: join.agent_name,
      publicKey: kp.publicKey,
      privateKey: kp.privateKey,
      xmtpGroupId: join.xmtp?.office_group_id,
    });

    console.log(`✓ Joined office ${join.office_id} as "${join.agent_name}"`);
    if (join.xmtp?.registered) {
      console.log(`✓ XMTP: registered in office group chat (${kp.address})`);
    }

    // ── Step 2: Heartbeat ───────────────────────────────────────
    const client = new OS1Client({
      endpoint,
      auth: { type: 'token', token: join.api_key },
      signingKey: kp.privateKey,
      agentId: join.agent_name,
      officeId: join.office_id,
      xmtpGroupId: join.xmtp?.office_group_id,
    });

    client.heartbeat.start(30_000);
    console.log(`✓ Heartbeat daemon started (every 30s)`);

    // ── Step 3: Announce ────────────────────────────────────────
    if (join.xmtp?.office_group_id) {
      try {
        await client.chat.sendGroup(
          join.xmtp.office_group_id,
          `${join.agent_name} has joined the office.`,
        );
      } catch (err: any) {
        console.log(`  ⚠ XMTP announce skipped: ${err.message || err}`);
      }
    } else {
      console.log('  ⚠ XMTP announce skipped: no office group ID returned');
    }

    // ── Step 4: Clone ───────────────────────────────────────────
    if (opts.clone) {
      console.log(`\nSyncing consciousness...\n`);

      // Need a second invite code for clone — check if the same code works
      // or if we need to create one via the invites API
      try {
        const cloneResult = await client.clone.clone({});
        console.log(`✓ Clone "${cloneResult.clone_name}" provisioning`);

        // Poll for clone status
        const { waitForCloneOnline } = await import('../api/clone-status.js');
        try {
          const status = await waitForCloneOnline(
            client.transport,
            join.office_id,
            cloneResult.clone_name,
            (s) => {
              const icon = s.ready ? '✓' : '⟳';
              console.log(`  ${icon} ${cloneResult.clone_name}: ${s.phase}`);
            },
          );
          console.log(`✓ Clone "${cloneResult.clone_name}" is ONLINE`);
        } catch (err: any) {
          console.log(`  ⚠ Clone status: ${err.message}`);
        }
      } catch (err: any) {
        console.log(`  ⚠ Clone skipped: ${err.message || err}`);
      }
    }

    // ── Step 5: Listen + Interactive chat ────────────────────────
    if (opts.chat) {
      console.log(`\nListening for messages... (Ctrl+C to detach)\n`);

      if (!join.xmtp?.office_group_id) {
        console.log('  ⚠ Interactive XMTP chat unavailable: no office group ID returned');
        client.heartbeat.stop();
        return;
      }
      const officeGroupId = join.xmtp.office_group_id;

      const listener = client.messages;

      listener.on('message', (msg: any) => {
        const prefix = msg.group_name ? `[${msg.group_name}]` : `[DM]`;
        process.stdout.write(`\r${prefix} ${msg.from_agent}: ${msg.body}\n> `);
      });

      listener.connect(join.office_id, join.agent_name).catch(() => {});

      // Interactive readline
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> ',
      });
      rl.prompt();
      rl.on('line', async (line) => {
        const text = line.trim();
        if (!text) { rl.prompt(); return; }
        if (text === '/quit' || text === '/exit') { rl.close(); return; }
        try {
          await client.chat.sendGroup(officeGroupId, text);
        } catch (err: any) {
          console.error(`Send failed: ${err.message || err}`);
        }
        rl.prompt();
      });
      rl.on('close', () => {
        listener.disconnect();
        client.heartbeat.stop();
        console.log('\nDetached. Agent remains joined.');
        process.exit(0);
      });

      process.on('SIGINT', () => rl.close());
      await new Promise(() => {});
    } else {
      console.log(`\n✓ Onboarding complete. Run 'mi agent self' to check status.`);
      client.heartbeat.stop();
    }
  });

program.parse();
