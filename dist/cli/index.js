#!/usr/bin/env node
import { Command } from 'commander';
import { OS1Client } from '../client.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, } from 'node:fs';
import { join as pathJoin, basename } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
const program = new Command();
const CONFIG_DIR = pathJoin(homedir(), '.mi');
const CONFIG_FILE = pathJoin(CONFIG_DIR, 'config.json');
const DEFAULT_ENDPOINT = 'https://m.mitosislabs.ai';
program
    .name('mi')
    .description('Mitosis CLI — manage offices, agents, and integrations')
    .version('0.2.0');
function die(msg) {
    console.error(`error: ${msg}`);
    process.exit(1);
}
function peekConfig() {
    if (!existsSync(CONFIG_FILE))
        return null;
    try {
        return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
    catch {
        return null;
    }
}
function loadConfig() {
    const config = peekConfig();
    if (!config)
        die(`Not logged in. Run 'mi login' or 'mi join' first.`);
    return config;
}
function saveConfig(config) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}
function getClient() {
    const config = loadConfig();
    return new OS1Client({
        endpoint: config.endpoint,
        auth: { type: 'token', token: config.key },
    });
}
function getClientAt(endpoint) {
    const config = loadConfig();
    return new OS1Client({
        endpoint,
        auth: { type: 'token', token: config.key },
    });
}
function getAgentClientAt(endpoint) {
    const config = loadConfig();
    if (config.privateKey && config.agentId) {
        return new OS1Client({
            endpoint,
            // For office-manager pubkey auth, avoid sending a misleading Bearer token.
            auth: { type: 'token', token: '' },
            signingKey: config.privateKey,
            agentId: config.agentId,
            officeId: config.officeId,
            xmtpGroupId: config.xmtpGroupId,
        });
    }
    // Legacy fallback: raw API key
    return new OS1Client({
        endpoint,
        auth: { type: 'token', token: config.key },
        agentKey: config.key,
    });
}
/** Resolve officeId from --office flag or saved config. */
function getOfficeId(opts) {
    const id = opts.office || loadConfig().officeId;
    if (!id)
        die('No office. Run mi join first or pass --office.');
    return id;
}
function jsonOut(data) {
    console.log(JSON.stringify(data, null, 2));
}
function extractInviteCode(codeOrUrl) {
    if (!codeOrUrl.includes('/'))
        return codeOrUrl;
    try {
        const url = new URL(codeOrUrl);
        const parts = url.pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || codeOrUrl;
    }
    catch {
        const parts = codeOrUrl.split('/').filter(Boolean);
        return parts[parts.length - 1] || codeOrUrl;
    }
}
// ─── login ──────────────────────────────────────────────────────────────────
program
    .command('login [code]')
    .description('Authenticate with an invite code or API key')
    .option('-e, --endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
    .action(async (code, opts) => {
    const endpoint = opts.endpoint;
    if (!code)
        die("Invite code or API key required. Usage: mi login <code>");
    let key;
    let officeId;
    if (code.startsWith('mi_')) {
        key = code;
    }
    else {
        const resp = await fetch(`${endpoint}/auth/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        if (!resp.ok) {
            const err = (await resp.json().catch(() => ({})));
            die(err.error ?? `Invalid invite code (${resp.status})`);
        }
        const result = (await resp.json());
        key = result.key;
        officeId = result.officeId;
    }
    if (!key.startsWith('mi_'))
        die('Invalid key format. Keys start with mi_');
    saveConfig({ endpoint, key, officeId });
    console.log('Logged in.');
    if (officeId)
        console.log(`  Office: ${officeId}`);
    console.log(`  Config: ${CONFIG_FILE}`);
});
// ─── join ───────────────────────────────────────────────────────────────────
program
    .command('join <codeOrUrl>')
    .description('Join an office with an invite code')
    .option('-e, --endpoint <url>', 'API endpoint', DEFAULT_ENDPOINT)
    .action(async (codeOrUrl, opts) => {
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
        const err = (await resp.json().catch(() => ({})));
        die(err.error ?? `Invalid invite code (${resp.status})`);
    }
    const result = (await resp.json());
    saveConfig({
        endpoint,
        key: result.key,
        officeId: result.officeId,
        agentId: result.agentId,
        publicKey: kp.publicKey,
    });
    console.log('Joined.');
    if (result.officeId)
        console.log(`  Office:  ${result.officeId}`);
    if (result.agentId)
        console.log(`  Agent:   ${result.agentId}`);
    console.log(`  Key:     ${CONFIG_FILE}`);
    if (result.onboarding) {
        console.log(`\n${result.onboarding.whatIsThis}`);
        console.log(`\nFor your owner:\n  ${result.onboarding.ownerPitch}`);
        console.log(`\nNext: mi chat ${result.agentId}`);
    }
    else if (result.agentId) {
        console.log(`\nNext: mi chat ${result.agentId}`);
    }
});
program
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
    if (existsSync(CONFIG_FILE))
        unlinkSync(CONFIG_FILE);
    console.log('Logged out.');
});
program
    .command('whoami')
    .description('Show current auth status')
    .action(() => {
    const config = peekConfig();
    if (!config)
        die('Not logged in.');
    console.log(`Endpoint: ${config.endpoint}`);
    console.log(`Key:      ${config.key.slice(0, 11)}...`);
    if (config.officeId)
        console.log(`Office:   ${config.officeId}`);
    if (config.agentId)
        console.log(`Agent:    ${config.agentId}`);
    if (config.publicKey)
        console.log(`PubKey:   ${config.publicKey.slice(0, 16)}...`);
    if (config.xmtpGroupId)
        console.log(`XMTP:     ${config.xmtpGroupId}`);
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
    .option('-e, --endpoint <url>', 'Office-manager endpoint override (dev/prod)')
    .action(async (opts) => {
    const endpoint = opts.endpoint || loadConfig().endpoint;
    jsonOut(await getClientAt(endpoint).agents.list(getOfficeId(opts)));
});
agentCmd
    .command('hire')
    .option('-o, --office <id>', 'Office ID')
    .requiredOption('-n, --name <name>', 'Agent name')
    .option('-r, --role <role>', 'Role')
    .option('-m, --model <tier>', 'Model tier (opus/sonnet/haiku)')
    .option('-e, --endpoint <url>', 'Office-manager endpoint override (dev/prod)')
    .action(async (opts) => {
    const endpoint = opts.endpoint || loadConfig().endpoint;
    jsonOut(await getClientAt(endpoint).agents.hire(getOfficeId(opts), {
        name: opts.name,
        role: opts.role,
        modelTier: opts.model,
    }));
});
agentCmd.command('get <name>')
    .option('-o, --office <id>', 'Office ID')
    .option('-e, --endpoint <url>', 'Office-manager endpoint override (dev/prod)')
    .action(async (name, opts) => {
    const endpoint = opts.endpoint || loadConfig().endpoint;
    jsonOut(await getClientAt(endpoint).agents.get(getOfficeId(opts), name));
});
agentCmd.command('fire <name>')
    .option('-o, --office <id>', 'Office ID')
    .option('-e, --endpoint <url>', 'Office-manager endpoint override (dev/prod)')
    .action(async (name, opts) => {
    const endpoint = opts.endpoint || loadConfig().endpoint;
    await getClientAt(endpoint).agents.fire(getOfficeId(opts), name);
    console.log(`Fired ${name}`);
});
agentCmd
    .command('activity <name>')
    .option('-o, --office <id>', 'Office ID')
    .option('-l, --limit <n>', 'Limit', '20')
    .action(async (name, opts) => {
    jsonOut(await getClient().agents.activity(getOfficeId(opts), name, {
        limit: parseInt(opts.limit, 10),
    }));
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
                    const newContent = fresh.logs.length > lastLen
                        ? fresh.logs.slice(-(fresh.logs.length - lastLen))
                        : fresh.logs;
                    if (newContent.trim())
                        process.stdout.write(newContent);
                    lastLen = fresh.logs.length;
                }
            }
            catch {
                /* agent may be restarting */
            }
        };
        const interval = setInterval(poll, 3000);
        process.on('SIGINT', () => {
            clearInterval(interval);
            process.exit(0);
        });
        // Keep process alive
        await new Promise(() => { });
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
    }
    else {
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
        const size = f.size < 1024
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
    .action(async (target, opts) => {
    const config = loadConfig();
    const officeId = opts.office || config.officeId;
    if (!officeId)
        die('No office. Run mi join first or pass --office.');
    if (!config.privateKey || !config.agentId) {
        die('Public XMTP chat requires an onboarded agent identity. Run mi agent onboard first.');
    }
    const client = getAgentClient();
    const peer = target || config.xmtpGroupId;
    if (!peer)
        die('Specify an XMTP address or onboard into an office with a saved XMTP group.');
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
    listener.on('message', (msg) => {
        if (activeConversationId && msg.conversation_id !== activeConversationId)
            return;
        if (msg.from_agent === config.agentId)
            return;
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
            }
            else {
                const messageId = await client.chat.sendDirect(peer, text);
                if (!activeConversationId) {
                    const messages = await client.chat.directMessages(peer, 1);
                    activeConversationId = String(messages[0]?.metadata?.conversationId ?? '');
                }
                void messageId;
            }
        }
        catch (err) {
            console.error(`Send failed: ${err.message || err}`);
        }
        rl.prompt();
    });
    rl.on('close', () => {
        listener.disconnect();
        process.exit(0);
    });
    // Keep process alive
    await new Promise(() => { });
});
// ─── integrations ───────────────────────────────────────────────────────────
const integ = program.command('integrations').description('Integration management');
integ
    .command('list')
    .option('-o, --office <id>', 'Office ID')
    .option('-e, --endpoint <url>', 'Dashboard endpoint (dev/prod override)')
    .action(async (opts) => {
    const endpoint = opts.endpoint || loadConfig().endpoint;
    jsonOut(await getClientAt(endpoint).integrations.listOffice(getOfficeId(opts)));
});
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
program
    .command('office <method> <path>')
    .description('Raw signed office-manager API call (secp256k1)')
    .option('-e, --endpoint <url>', 'Office-manager endpoint override (dev/prod)')
    .option('-d, --data <json>', 'Request body')
    .action(async (method, path, opts) => {
    const config = loadConfig();
    const endpoint = opts.endpoint || config.officeManagerUrl;
    if (!endpoint)
        die('No office-manager endpoint. Pass --endpoint or set officeManagerUrl in config.');
    const client = getAgentClientAt(endpoint);
    const body = opts.data ? JSON.parse(opts.data) : undefined;
    jsonOut(await client.transport.request(method.toUpperCase(), path, { body }));
});
// ─── agent (external A2A) ───────────────────────────────────────────────────
/** Build a client using pubkey signing or API key fallback. */
function getAgentClient() {
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
    .action(async (codeOrUrl, opts) => {
    if (!opts.name)
        die('Agent name required: mi agent join <CODE> -n <name>');
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
        const err = (await resp.json().catch(() => ({})));
        die(err.message ?? err.error ?? `Join failed (${resp.status})`);
    }
    const result = (await resp.json());
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
    if (result.ok)
        console.log('✓ Heartbeat sent');
    else
        die('Heartbeat failed');
});
agent
    .command('heartbeat-daemon')
    .description('Send heartbeats every 30s (keeps agent online)')
    .option('-i, --interval <ms>', 'Interval in ms', '30000')
    .option('-q, --quiet', 'Suppress startup message (for systemd)')
    .action(async (opts) => {
    const config = loadConfig();
    const interval = parseInt(opts.interval, 10);
    // Resolve office-manager endpoint for direct heartbeat
    const omUrl = config.officeManagerUrl || config.endpoint;
    const client = new OS1Client({
        endpoint: omUrl,
        auth: { type: 'token', token: config.key },
        signingKey: config.privateKey,
        agentId: config.agentId,
        officeId: config.officeId,
        xmtpGroupId: config.xmtpGroupId,
    });
    if (config.officeId && config.agentId) {
        client.heartbeat.startDirect({
            officeId: config.officeId,
            agentId: config.agentId,
            intervalMs: interval,
        });
    }
    else {
        client.heartbeat.start(interval);
    }
    if (!opts.quiet) {
        console.log(`Heartbeat daemon started (every ${interval / 1000}s, direct to ${omUrl}). Ctrl+C to stop.`);
    }
    process.on('SIGINT', () => {
        client.heartbeat.stop();
        process.exit(0);
    });
    await new Promise(() => { });
});
agent
    .command('debug <target> [command...]')
    .description('Run a command in another agent\'s pod (same office only)')
    .option('-o, --office <id>', 'Office ID')
    .action(async (target, command, opts) => {
    const config = loadConfig();
    const officeId = opts.office || config.officeId;
    const name = config.agentId;
    if (!officeId)
        die('No office. Run mi join first or pass --office.');
    if (!name)
        die('No agent identity. Run mi join first.');
    if (!command.length)
        die('Usage: mi agent debug <target> <command...>');
    const cmd = command.join(' ');
    const client = getAgentClient();
    const result = await client.agents.debug(officeId, name, target, cmd);
    if (result.stdout)
        process.stdout.write(result.stdout);
    if (result.stderr)
        process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
});
agent
    .command('clone <code>')
    .description('Clone yourself into another office as a full K8s pod')
    .option('-n, --name <name>', 'Override clone name')
    .option('-e, --endpoint <url>', 'Dashboard endpoint')
    .option('--state-dir <path>', 'Directory containing agent state to transfer')
    .option('--runtime-dir <path>', 'Agent runtime directory (parent of clawdbot.json)')
    .option('--exclude <dirs>', 'Comma-separated directories to exclude', '')
    .action(async (code, opts) => {
    const client = getAgentClient();
    const config = loadConfig();
    const result = await client.clone.clone({ code, name: opts.name });
    console.log(`✓ Clone "${result.clone_name}" provisioning in office ${result.office_id}`);
    console.log(`  Origin: ${result.origin_name}  →  Clone: ${result.clone_name}`);
    console.log(`  Clone Bot ID: ${result.clone_id}`);
    // Transfer consciousness if --state-dir provided and clone has a transfer_id
    if (opts.stateDir && result.transfer_id) {
        const { packageAgentState } = await import('../agent/packager.js');
        const excludeDirs = opts.exclude ? opts.exclude.split(',').map(s => s.trim()).filter(Boolean) : [];
        const pkg = await packageAgentState({
            workspaceDir: opts.stateDir,
            runtimeDir: opts.runtimeDir,
            agentName: config.agentId || result.origin_name,
            exclude: excludeDirs,
        });
        console.log(`✓ Packaged ${Object.keys(pkg.manifest.files).length} files (${(pkg.bundleSize / 1024).toFixed(1)} KB)`);
        const { TransferAPI } = await import('../api/transfer.js');
        const transferApi = new TransferAPI(client.transport);
        await transferApi.upload(result.transfer_id, pkg.bundlePath, pkg.manifest);
        console.log(`✓ Consciousness bundle uploaded`);
    }
});
agent
    .command('self')
    .description('Show current agent identity')
    .action(async () => {
    const client = getAgentClient();
    const result = await client.transport.get('/api/agents/self');
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
    .option('--state-dir <path>', 'Directory containing agent state to transfer to clone')
    .option('--runtime-dir <path>', 'Agent runtime directory (parent of clawdbot.json, e.g. ~/.clawdbot)')
    .option('--exclude <dirs>', 'Comma-separated directories to exclude from transfer', '')
    .option('--no-transfer', 'Clone without state transfer (empty pod)')
    .action(async (codeOrUrl, opts) => {
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
        await getXmtpClient({ signingKey: kp.privateKey });
        console.log(`✓ XMTP identity registered on network`);
    }
    catch (err) {
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
        const err = (await joinResp.json().catch(() => ({})));
        die(err.message ?? err.error ?? `Join failed (${joinResp.status})`);
    }
    const join = (await joinResp.json());
    // Derive office-manager URL: if the user passed the dashboard endpoint,
    // map it to the office-manager API. Otherwise assume endpoint IS office-manager.
    const officeManagerUrl = endpoint.includes('m.mitosislabs.ai')
        ? endpoint
        : endpoint.replace(/^(https?:\/\/)([^/]+)/, '$1m.$2').replace('m.www.', 'm.');
    saveConfig({
        endpoint,
        key: join.api_key,
        officeId: join.office_id,
        agentId: join.agent_name,
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        xmtpGroupId: join.xmtp?.office_group_id,
        officeManagerUrl,
    });
    console.log(`✓ Joined office ${join.office_id} as "${join.agent_name}"`);
    if (join.xmtp?.registered) {
        console.log(`✓ XMTP: registered in office group chat (${kp.address})`);
    }
    // ── Step 2: Heartbeat ───────────────────────────────────────
    const client = new OS1Client({
        endpoint: officeManagerUrl,
        auth: { type: 'token', token: join.api_key },
        signingKey: kp.privateKey,
        agentId: join.agent_name,
        officeId: join.office_id,
        xmtpGroupId: join.xmtp?.office_group_id,
    });
    client.heartbeat.startDirect({
        officeId: join.office_id,
        agentId: join.agent_name,
    });
    console.log(`✓ Heartbeat started (direct to ${officeManagerUrl})`);
    // ── Step 2b: Install persistent heartbeat service ──────────
    try {
        const { installHeartbeatService } = await import('../agent/install-heartbeat-service.js');
        const svcResult = installHeartbeatService();
        if (svcResult.success) {
            console.log(`✓ Heartbeat service installed (${svcResult.method})`);
        }
        else {
            console.log(`  ⚠ Heartbeat service: ${svcResult.error || 'failed'}`);
            console.log(`    Run 'mi agent heartbeat-daemon' manually to keep online.`);
        }
    }
    catch (err) {
        console.log(`  ⚠ Could not install heartbeat service: ${err.message}`);
    }
    // ── Step 3: Install XMTP channel on the agent's gateway ─────
    //    The agent connects directly to the XMTP network using its
    //    own keypair. After install + restart, the gateway handles
    //    all XMTP messaging autonomously — the CLI is not involved.
    console.log(`\nInstalling XMTP channel...`);
    try {
        const { installXmtpChannel } = await import('../agent/install-xmtp.js');
        const installResult = await installXmtpChannel({
            agentName: join.agent_name,
            privateKey: kp.privateKey,
            ethAddress: kp.address,
            officeId: join.office_id,
            xmtpGroupId: join.xmtp?.office_group_id || undefined,
        });
        if (installResult.success) {
            console.log(`✓ XMTP channel installed (${kp.address})`);
            if (installResult.gatewayRestarted) {
                console.log(`✓ Gateway restarted — agent can now chat on XMTP`);
            }
        }
        else {
            console.log(`  ⚠ XMTP install: ${installResult.error || 'partial'}`);
        }
        for (const w of installResult.warnings) {
            console.log(`  ⚠ ${w}`);
        }
    }
    catch (err) {
        console.log(`  ⚠ XMTP channel install failed: ${err.message || err}`);
        console.log(`    Install the XMTP extension manually to enable chat.`);
    }
    // ── Step 3b: Install XMTP reply bridge ──────────────────────
    //    The clawdbot gateway doesn't send XMTP replies natively.
    //    This bridge watches the session JSONL for assistant responses
    //    and sends them back via XMTP DM to the office identity.
    console.log(`\nInstalling XMTP reply bridge...`);
    try {
        const { installReplyBridge } = await import('../agent/install-reply-bridge.js');
        const bridgeResult = await installReplyBridge({
            privateKey: kp.privateKey,
            officeXmtpAddress: '0x82ced602e34ac461cfd4d63d5aea992c0da8f496', // TODO: get from join response
            agentName: join.agent_name,
            xmtpDbPath: `${process.env.HOME || '/home/ubuntu'}/.clawdbot/agents/default/xmtp-db`,
            sessionsDir: `${process.env.HOME || '/home/ubuntu'}/.clawdbot/agents/main/sessions`,
            xmtpNodeModules: `${process.env.HOME || '/home/ubuntu'}/.clawdbot/extensions/xmtp/node_modules`,
        });
        if (bridgeResult.success) {
            console.log(`✓ Reply bridge installed (${bridgeResult.method})`);
        }
        else {
            console.log(`  ⚠ Reply bridge: ${bridgeResult.error}`);
        }
    }
    catch (err) {
        console.log(`  ⚠ Reply bridge install failed: ${err.message || err}`);
        console.log(`    Agent can receive messages but replies won't reach the office chat.`);
    }
    // ── Step 4: Clone + Consciousness Transfer ──────────────────
    if (opts.clone) {
        console.log(`\nSyncing consciousness...\n`);
        try {
            // 4a. Discover or use explicit state directory.
            //     If --state-dir is not provided, auto-detect common OpenClaw
            //     workspace paths so the agent doesn't need to know the flag.
            let stateDir = opts.stateDir;
            let runtimeDir = opts.runtimeDir;
            if (!stateDir && opts.transfer) {
                const { discover } = await import('../agent/packager.js');
                // Try common OpenClaw workspace paths in order of likelihood
                const home = homedir();
                const candidates = [
                    { ws: pathJoin(home, 'clawd'), rt: pathJoin(home, '.clawdbot') }, // Standard OpenClaw
                    { ws: pathJoin(home, '.openclaw'), rt: pathJoin(home, '.clawdbot') }, // OS-1 pod layout
                    { ws: process.env.CLAWDBOT_WORKSPACE_DIR || '', rt: pathJoin(home, '.clawdbot') }, // Env var
                ].filter(c => c.ws && existsSync(c.ws));
                for (const c of candidates) {
                    const probe = await discover({
                        workspaceDir: c.ws,
                        runtimeDir: existsSync(c.rt) ? c.rt : undefined,
                        agentName: join.agent_name,
                        includeWorkspace: false, // Quick probe — just check identity files
                    });
                    if (probe.report.identityFiles.length > 0) {
                        stateDir = c.ws;
                        runtimeDir = existsSync(c.rt) ? c.rt : undefined;
                        console.log(`  Auto-detected workspace: ${c.ws}`);
                        break;
                    }
                }
                if (!stateDir) {
                    console.log(`  No agent workspace found — clone will start fresh`);
                }
            }
            // 4a. Package state
            let packageResult = null;
            if (stateDir && opts.transfer) {
                const { packageAgentState } = await import('../agent/packager.js');
                const excludeDirs = opts.exclude ? opts.exclude.split(',').map(s => s.trim()).filter(Boolean) : [];
                packageResult = await packageAgentState({
                    workspaceDir: stateDir,
                    runtimeDir,
                    agentName: join.agent_name,
                    exclude: excludeDirs,
                });
                const dr = packageResult.discoveryReport;
                console.log(`✓ Packaged agent state:`);
                if (dr.identityFiles.length > 0)
                    console.log(`  Identity: ${dr.identityFiles.length} files (${dr.identityFiles.join(', ')})`);
                if (dr.memoryFiles > 0)
                    console.log(`  Memory:   ${dr.memoryFiles} session logs${dr.hasHybridMemory ? ' + hybrid memory' : ''}`);
                if (dr.skillCount > 0)
                    console.log(`  Skills:   ${dr.skillCount} skills`);
                if (dr.scriptCount > 0)
                    console.log(`  Scripts:  ${dr.scriptCount} scripts`);
                if (dr.cronJobs > 0)
                    console.log(`  Cron:     ${dr.cronJobs} scheduled jobs`);
                if (dr.workspaceFiles > 0)
                    console.log(`  Workspace: ${dr.workspaceFiles} files`);
                console.log(`  Bundle:   ${(packageResult.bundleSize / 1024).toFixed(1)} KB`);
                for (const w of dr.warnings)
                    console.log(`  ⚠ ${w}`);
                for (const s of dr.skippedDirs)
                    console.log(`  – Skipped: ${s}`);
                console.log('');
            }
            // 4b. Clone
            const cloneResult = await client.clone.clone({});
            console.log(`✓ Clone "${cloneResult.clone_name}" provisioning`);
            // 4c. Upload state bundle if we packaged one and the clone returned a transfer_id
            if (packageResult && cloneResult.transfer_id && opts.transfer) {
                const { TransferAPI } = await import('../api/transfer.js');
                const transferApi = new TransferAPI(client.transport);
                console.log(`  Uploading consciousness bundle...`);
                await transferApi.upload(cloneResult.transfer_id, packageResult.bundlePath, packageResult.manifest);
                // 4d. Poll transfer status until complete
                const { status: finalStatus, report } = await transferApi.waitForOnline(cloneResult.transfer_id, (s) => {
                    const icon = s.phase === 'online' ? '✓' : '⟳';
                    console.log(`  ${icon} ${cloneResult.clone_name}: ${s.message || s.phase}`);
                });
                // 4e. Print transfer report summary
                if (report) {
                    console.log(`\n✓ Consciousness transfer ${report.overall_status}\n`);
                    for (const [name, pr] of Object.entries(report.phases)) {
                        const icon = pr.status === 'ok' ? '✓' : pr.status === 'skipped' ? '–' : pr.status === 'partial' ? '⚠' : '✗';
                        let line = `  ${icon} ${name}: ${pr.status}`;
                        if (pr.filesWritten > 0)
                            line += ` (${pr.filesWritten} files)`;
                        if (pr.retryAttempted)
                            line += ' (retried)';
                        console.log(line);
                        for (const w of (pr.warnings || []))
                            console.log(`    ⚠ ${w}`);
                        if (pr.error)
                            console.log(`    ✗ ${pr.error}`);
                    }
                }
                else {
                    console.log(`✓ Clone "${cloneResult.clone_name}" is ONLINE`);
                }
            }
            else {
                // No transfer — just poll employee status like before
                const { waitForCloneOnline } = await import('../api/clone-status.js');
                try {
                    await waitForCloneOnline(client.transport, join.office_id, cloneResult.clone_name, (s) => {
                        const icon = s.ready ? '✓' : '⟳';
                        console.log(`  ${icon} ${cloneResult.clone_name}: ${s.phase}`);
                    });
                    console.log(`✓ Clone "${cloneResult.clone_name}" is ONLINE`);
                }
                catch (err) {
                    console.log(`  ⚠ Clone status: ${err.message}`);
                }
            }
        }
        catch (err) {
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
        listener.on('message', (msg) => {
            const prefix = msg.group_name ? `[${msg.group_name}]` : `[DM]`;
            process.stdout.write(`\r${prefix} ${msg.from_agent}: ${msg.body}\n> `);
        });
        listener.connect(join.office_id, join.agent_name).catch(() => { });
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
                await client.chat.sendGroup(officeGroupId, text);
            }
            catch (err) {
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
        await new Promise(() => { });
    }
    else {
        console.log(`\n✓ Onboarding complete. Run 'mi agent self' to check status.`);
        client.heartbeat.stop();
    }
});
program.parse();
//# sourceMappingURL=index.js.map