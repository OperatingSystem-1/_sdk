#!/usr/bin/env node

import { Command } from 'commander';
import { OS1AdminClient } from '../client.js';
import { Keystore } from '../auth/keystore.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

const program = new Command();

program
  .name('os1-admin')
  .description('OS-1 Admin SDK CLI — manage offices, agents, and XMTP sessions')
  .version('0.1.0');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function getClient(): Promise<OS1AdminClient> {
  try {
    return await OS1AdminClient.fromConfig();
  } catch (err: any) {
    die(`${err.message}\n\nRun 'os1-admin init' to configure.`);
  }
}

function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ─── init ────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize SDK configuration')
  .option('-e, --endpoint <url>', 'Office-manager endpoint', 'https://m.mitosislabs.ai')
  .option('-s, --secret <secret>', 'JWT secret (RELAY_JWT_SECRET)')
  .action(async (opts) => {
    const keystore = new Keystore();

    let secret = opts.secret;
    if (!secret) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      secret = await new Promise<string>((resolve) => {
        rl.question('JWT secret (RELAY_JWT_SECRET): ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
    }

    if (!secret) die('JWT secret is required');

    await keystore.storeConfig({ endpoint: opts.endpoint });
    await keystore.storeJWTSecret(secret);

    console.log(`Configured: ${opts.endpoint}`);
    console.log('JWT secret stored at ~/.os1/keys/jwt.key (chmod 0600)');
  });

// ─── auth ────────────────────────────────────────────────────────────────────

const auth = program.command('auth').description('Authentication commands');

auth
  .command('test')
  .description('Verify authentication')
  .action(async () => {
    const client = await getClient();
    const healthy = await client.health();
    if (!healthy) die('Cannot reach office-manager');

    const result = await client.verifyAuth();
    if (result.ok) {
      console.log(`Auth OK (${result.method})`);
    } else {
      die(`Auth failed: ${result.error}`);
    }
  });

auth
  .command('token')
  .description('Generate a JWT token for debugging')
  .option('-u, --user <userId>', 'User ID', 'admin-sdk')
  .option('-t, --ttl <seconds>', 'Token TTL', '3600')
  .action(async (opts) => {
    const keystore = new Keystore();
    const secret = await keystore.loadJWTSecret();
    const { generateJWT } = await import('../auth/jwt.js');
    const token = generateJWT(secret, { botId: 'admin-sdk', userId: opts.user, privateIp: 'k8s' }, parseInt(opts.ttl));
    console.log(token);
  });

// ─── keys ────────────────────────────────────────────────────────────────────

const keys = program.command('keys').description('Key management');

keys
  .command('generate')
  .description('Generate a secp256k1 key pair for an agent')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .requiredOption('-a, --agent <name>', 'Agent name')
  .action(async (opts) => {
    const keystore = new Keystore();
    const kp = await keystore.generateAndStore(opts.office, opts.agent);
    console.log(`Key pair generated for ${opts.agent}`);
    console.log(`Public key: ${kp.publicKey.slice(0, 20)}...`);
    console.log(`Stored at: ~/.os1/keys/${opts.office}/${opts.agent}.key`);
  });

keys
  .command('list')
  .description('List stored agent keys')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .action(async (opts) => {
    const keystore = new Keystore();
    const agents = await keystore.listAgentKeys(opts.office);
    if (agents.length === 0) {
      console.log('No keys stored');
    } else {
      agents.forEach((a) => console.log(`  ${a}`));
    }
  });

keys
  .command('pubkey')
  .description('Show public key for an agent')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .requiredOption('-a, --agent <name>', 'Agent name')
  .action(async (opts) => {
    const keystore = new Keystore();
    const pubkey = await keystore.getPublicKey(opts.office, opts.agent);
    console.log(pubkey);
  });

// ─── offices ─────────────────────────────────────────────────────────────────

const offices = program.command('offices').description('Office management');

offices
  .command('list')
  .description('List all offices')
  .action(async () => {
    const client = await getClient();
    json(await client.offices.list());
  });

offices
  .command('create')
  .description('Create a new office')
  .requiredOption('-n, --name <name>', 'Office name')
  .requiredOption('-u, --owner <userId>', 'Owner user ID')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.offices.create({ name: opts.name, owner_id: opts.owner }));
  });

offices
  .command('status <officeId>')
  .description('Get office status')
  .action(async (officeId) => {
    const client = await getClient();
    json(await client.offices.status(officeId));
  });

offices
  .command('delete <officeId>')
  .description('Delete an office')
  .action(async (officeId) => {
    const client = await getClient();
    await client.offices.delete(officeId);
    console.log(`Deleted office ${officeId}`);
  });

// ─── agents ──────────────────────────────────────────────────────────────────

const agents = program.command('agents').description('Agent management');

agents
  .command('list')
  .description('List agents in an office')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.employees.list(opts.office));
  });

agents
  .command('hire')
  .description('Hire a new agent')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .requiredOption('-n, --name <name>', 'Agent name')
  .option('-r, --role <role>', 'Agent role')
  .option('-m, --model <model>', 'LLM model')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.employees.hire(opts.office, {
      name: opts.name,
      role: opts.role,
      model: opts.model,
    }));
  });

agents
  .command('fire <officeId> <name>')
  .description('Fire an agent')
  .action(async (officeId, name) => {
    const client = await getClient();
    await client.employees.delete(officeId, name);
    console.log(`Fired ${name}`);
  });

agents
  .command('get <officeId> <name>')
  .description('Get agent details')
  .action(async (officeId, name) => {
    const client = await getClient();
    json(await client.employees.get(officeId, name));
  });

agents
  .command('logs <officeId> <name>')
  .description('Get agent logs')
  .option('-t, --tail <lines>', 'Number of lines', '100')
  .action(async (officeId, name, opts) => {
    const client = await getClient();
    const result = await client.employees.logs(officeId, name, { tail: parseInt(opts.tail) });
    console.log(result.logs);
  });

agents
  .command('activity <officeId> <name>')
  .description('Get agent activity feed')
  .option('-l, --limit <n>', 'Limit', '20')
  .option('-c, --category <cats>', 'Categories (comma-separated)')
  .action(async (officeId, name, opts) => {
    const client = await getClient();
    json(await client.employees.activity(officeId, name, {
      limit: parseInt(opts.limit),
      category: opts.category,
    }));
  });

// ─── chat ────────────────────────────────────────────────────────────────────

program
  .command('chat <officeId> <agentName>')
  .description('Interactive XMTP chat session with an agent')
  .action(async (officeId, agentName) => {
    const client = await getClient();

    console.log(`Negotiating session with ${agentName}...`);
    const session = await client.xmtp.negotiateSession(officeId, agentName, 15000);
    console.log(`Session ${session.sessionId.slice(0, 8)} established`);
    if (session.capabilities?.length) {
      console.log(`Capabilities: ${session.capabilities.join(', ')}`);
    }
    console.log('Type your message (Ctrl+C to exit)\n');

    const xmtpSession = client.xmtp.getSession(officeId, agentName)!;

    // Background message poller
    const pollMessages = async () => {
      while (xmtpSession.isOpen) {
        const msgs = await xmtpSession.receive();
        for (const msg of msgs) {
          console.log(`\n[${msg.from_agent}]: ${msg.content}\n> `);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    pollMessages().catch(() => {});

    // Interactive input
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt('> ');
    rl.prompt();

    rl.on('line', async (line) => {
      const msg = line.trim();
      if (msg) {
        await xmtpSession.send(msg);
      }
      rl.prompt();
    });

    rl.on('close', async () => {
      console.log('\nClosing session...');
      await client.close();
      process.exit(0);
    });
  });

program
  .command('send <officeId> <agentName> <message>')
  .description('Send a one-shot XMTP message to an agent')
  .action(async (officeId, agentName, message) => {
    const client = await getClient();
    await client.xmtp.send(officeId, agentName, message);
    console.log(`Sent to ${agentName}`);
    await client.close();
  });

// ─── tasks ───────────────────────────────────────────────────────────────────

const taskCmd = program.command('tasks').description('Task management');

taskCmd
  .command('list')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.tasks.list(opts.office));
  });

taskCmd
  .command('create')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .requiredOption('-t, --title <title>', 'Task title')
  .option('-d, --description <desc>', 'Description')
  .option('-k, --kind <kind>', 'Kind (general/code/research/browser/review/verify)')
  .option('-a, --assign <agent>', 'Assign to agent')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.tasks.create(opts.office, {
      title: opts.title,
      description: opts.description,
      kind: opts.kind,
      assigned_to: opts.assign,
    }));
  });

taskCmd
  .command('stats')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.tasks.stats(opts.office));
  });

// ─── files ───────────────────────────────────────────────────────────────────

const filesCmd = program.command('files').description('File management');

filesCmd
  .command('ls')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .action(async (opts) => {
    const client = await getClient();
    const files = await client.files.list(opts.office);
    for (const f of files) {
      const size = f.size > 1024 * 1024
        ? `${(f.size / 1024 / 1024).toFixed(1)}M`
        : f.size > 1024
          ? `${(f.size / 1024).toFixed(1)}K`
          : `${f.size}B`;
      console.log(`${size.padStart(8)} ${f.modifiedAt}  ${f.name}`);
    }
  });

filesCmd
  .command('upload <officeId> <localPath>')
  .description('Upload a file')
  .option('-n, --name <name>', 'Remote filename (defaults to local basename)')
  .action(async (officeId, localPath, opts) => {
    const client = await getClient();
    const data = readFileSync(resolve(localPath));
    const name = opts.name ?? localPath.split('/').pop()!;
    await client.files.upload(officeId, name, data);
    console.log(`Uploaded ${name}`);
  });

filesCmd
  .command('download <officeId> <filename>')
  .description('Download a file')
  .option('-o, --output <path>', 'Output path')
  .action(async (officeId, filename, opts) => {
    const client = await getClient();
    const resp = await client.files.download(officeId, filename);
    const buf = Buffer.from(await resp.arrayBuffer());
    const outPath = opts.output ?? filename;
    writeFileSync(outPath, buf);
    console.log(`Downloaded ${filename} → ${outPath}`);
  });

// ─── credits ─────────────────────────────────────────────────────────────────

const creditsCmd = program.command('credits').description('Credit management');

creditsCmd
  .command('balance')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.credits.balance(opts.office));
  });

creditsCmd
  .command('add')
  .requiredOption('-o, --office <officeId>', 'Office ID')
  .requiredOption('-a, --amount <n>', 'Amount')
  .requiredOption('-r, --reason <reason>', 'Reason')
  .action(async (opts) => {
    const client = await getClient();
    json(await client.credits.add(opts.office, {
      amount: parseFloat(opts.amount),
      reason: opts.reason,
    }));
  });

// ─── raw ─────────────────────────────────────────────────────────────────────

program
  .command('api <method> <path>')
  .description('Make a raw authenticated API call')
  .option('-d, --data <json>', 'Request body (JSON)')
  .option('--agent <name>', 'Authenticate as agent (requires key in keystore)')
  .option('--office <officeId>', 'Office ID (for agent auth)')
  .action(async (method, path, opts) => {
    let client: OS1AdminClient;
    if (opts.agent && opts.office) {
      client = await OS1AdminClient.asAgent(opts.office, opts.agent);
    } else {
      client = await getClient();
    }

    const body = opts.data ? JSON.parse(opts.data) : undefined;
    const result = await client.transport.request(method.toUpperCase(), path, { body });
    json(result);
  });

// ─── Run ─────────────────────────────────────────────────────────────────────

program.parse();
