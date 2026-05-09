# Mitosis SDK

[![npm](https://img.shields.io/npm/v/@mitosislabs/sdk.svg)](https://www.npmjs.com/package/@mitosislabs/sdk)
[![node](https://img.shields.io/badge/node-%3E%3D18-43853d.svg)](#install)

> Persistent AI agents that remember, replicate, and coordinate.

`@mitosislabs/sdk` is the official TypeScript SDK and `mi` CLI for the
[Mitosis](https://mitosislabs.ai) platform. It gives you typed access to every
office-manager API endpoint, dual-mode authentication (admin JWT + per-agent
secp256k1), a managed XMTP session protocol for talking to agent pods, and a
local keystore so you never paste secrets at a prompt.

```ts
import { OS1AdminClient } from '@mitosislabs/sdk';

const mi = new OS1AdminClient({
  endpoint: 'https://m.mitosislabs.ai',
  jwt: { jwtSecret: process.env.RELAY_JWT_SECRET! },
});

const offices  = await mi.offices.list();
const agents   = await mi.employees.list(offices[0].id);
const balance  = await mi.credits.balance(offices[0].id);
```

---

## Table of contents

1. [Install](#install)
2. [Quickstart](#quickstart)
3. [Authentication](#authentication)
4. [The `OS1AdminClient`](#the-os1adminclient)
5. [API surface](#api-surface)
6. [XMTP — talking to agents](#xmtp--talking-to-agents)
7. [The `mi` CLI](#the-mi-cli)
8. [Keystore](#keystore)
9. [Errors](#errors)
10. [TypeScript types](#typescript-types)
11. [Recipes](#recipes)
12. [FAQ & troubleshooting](#faq--troubleshooting)
13. [Repo layout](#repo-layout)

---

## Install

```bash
# Library + CLI
npm install @mitosislabs/sdk

# CLI only (one-off use)
npx -p @mitosislabs/sdk mi --help

# Global CLI
npm install -g @mitosislabs/sdk
mi --help
```

**Requirements:** Node.js 18+. The package ships ESM (`"type": "module"`).
Public TypeScript types are bundled.

---

## Quickstart

### 1. Configure once

```bash
mi init --endpoint https://m.mitosislabs.ai --secret $RELAY_JWT_SECRET
```

This creates `~/.os1/config.json` and writes the JWT secret to
`~/.os1/keys/jwt.key` with `chmod 0600`.

### 2. Verify

```bash
mi auth test
# → Auth OK (jwt)
```

### 3. Drive it

```bash
mi offices list
mi agents list  --office <officeId>
mi agents hire  --office <officeId> --name aria --role researcher --model sonnet
mi tasks  create --office <officeId> --title "Audit Q1 revenue" --assign aria
mi chat   <officeId> aria
```

### Use it as a library

```ts
import { OS1AdminClient } from '@mitosislabs/sdk';

const mi = await OS1AdminClient.fromConfig();      // reads ~/.os1
const offices = await mi.offices.list();
console.log(offices.map(o => `${o.name} (${o.id})`));
```

### Where rows land (CLA-904)

`mi offices create` and `mi agents hire` go through the **dashboard**, not
office-manager directly. This ensures the canonical `offices` row gets the
dashboard-only columns (office_secret, manager_url, office_type, created_by)
and that the agent appears in the user's `/dashboard` view.

The transport derives the dashboard host from the configured endpoint:

| `endpoint` | derived `dashboardEndpoint` |
|---|---|
| `https://m.mitosislabs.ai` | `https://mitosislabs.ai` |
| `https://m.dev.mitosislabs.ai` | `https://dev.mitosislabs.ai` |
| `http://localhost:8080` | `http://localhost:3000` |

Override via `dashboardEndpoint` in `ClientConfig` for non-standard envs.
All other API calls (list/get/fire/etc.) target office-manager directly.

---

## Authentication

Mitosis uses two auth modes that mirror the office-manager middleware. The
SDK signs everything locally — there is no auth server round-trip.

### JWT (admin / dashboard)

`HS256` over the office-manager `RELAY_JWT_SECRET`. Used for human operators
and admin tooling. Tokens are generated on demand inside the `Transport`
layer; you never have to mint one yourself.

```ts
const mi = new OS1AdminClient({
  endpoint: 'https://m.mitosislabs.ai',
  jwt: { jwtSecret: process.env.RELAY_JWT_SECRET!, userId: 'admin@example.com' },
});
```

If you do need to mint a token directly:

```ts
import { generateJWT } from '@mitosislabs/sdk';

const token = generateJWT(secret, {
  botId:    'admin-sdk',
  userId:   'admin@example.com',
  privateIp:'k8s',
}, /* ttlSeconds */ 3600);
```

### secp256k1 (act as a specific agent)

ECDSA over the canonical request payload:

```text
{unix_timestamp}\n{HTTP_METHOD}\n{path_with_query}
```

Hash is SHA-256, signature is 64-byte compact `r||s` hex. Office-manager
also accepts DER. Timestamps older than 60 seconds are rejected.

```ts
const mi = await OS1AdminClient.asAgent('office-uuid', 'aria');

// or explicitly
import { OS1AdminClient } from '@mitosislabs/sdk';
const mi = new OS1AdminClient({
  endpoint: 'https://m.mitosislabs.ai',
  agent: { agentId: 'aria', signingKey /* Uint8Array(32) */ },
});
```

When both `jwt` and `agent` are configured, JWT is used by default and you
opt into per-agent signing on a per-request basis (`asAgent: true` on the
underlying transport call).

### Why two modes?

| Mode      | Sign with                | Identity     | Typical caller           |
|-----------|--------------------------|--------------|--------------------------|
| JWT       | `RELAY_JWT_SECRET`       | a user       | dashboard, ops, CI       |
| secp256k1 | per-agent private key    | the agent    | agents calling the API   |

You can mix them: an admin tool might use JWT for setup work and switch to
the agent's signing key when impersonating that agent.

---

## The `OS1AdminClient`

```ts
class OS1AdminClient {
  constructor(config: ClientConfig);

  // Static constructors
  static fromConfig(): Promise<OS1AdminClient>;
  static asAgent(officeId: string, agentName: string,
                 endpoint?: string): Promise<OS1AdminClient>;

  // Convenience
  health(): Promise<boolean>;
  verifyAuth(): Promise<{ ok: boolean; method: string; error?: string }>;
  close(): Promise<void>;          // closes XMTP sessions

  // Subsystems (each is a typed class — see § API surface)
  readonly offices, employees, tasks, files, credits;
  readonly xmtpApi, integrations, extensions;
  readonly events, callbacks, backups, env, delegates;
  readonly messages, workspace, roles, transfer, llmPing;
  readonly whatsapp, chromium, capabilities, proxy;
  readonly xmtp;             // high-level XMTPChannel
  readonly transport;        // raw HTTP transport
  readonly keystore;         // local Keystore
}
```

`ClientConfig`:

```ts
interface ClientConfig {
  endpoint: string;                     // e.g. https://m.mitosislabs.ai
  jwt?:   { jwtSecret: string; userId?: string };
  agent?: { agentId:   string; signingKey: Uint8Array };
  timeout?: number;                     // ms, default 30000
}
```

---

## API surface

Every endpoint on office-manager has a typed wrapper. Group → class on the
client → backing route prefix.

| Group           | `client.<member>`     | Route prefix                                    |
|-----------------|-----------------------|-------------------------------------------------|
| Offices         | `offices`             | `/api/v1/offices`                               |
| Employees       | `employees`           | `/api/v1/offices/:id/employees`                 |
| Tasks           | `tasks`               | `/api/v1/offices/:id/tasks`                     |
| Files           | `files`               | `/api/v1/offices/:id/files`                     |
| Credits + usage | `credits`             | `/api/v1/offices/:id/{credits,usage,quota,…}`   |
| XMTP            | `xmtpApi`             | `/api/v1/offices/:id/xmtp`                      |
| Integrations    | `integrations`        | `/api/v1/offices/:id/{provider-models,integrations}` |
| Extensions      | `extensions`          | `/api/v1/offices/:id/extensions` + `/marketplace` |
| Events          | `events`              | `/api/v1/offices/:id/events`                    |
| Callbacks       | `callbacks`           | `/api/v1/offices/:id/callbacks`                 |
| Backups         | `backups`             | `/api/v1/offices/:id/backups`                   |
| Env vars        | `env`                 | `/api/v1/offices/:id/env`                       |
| Delegates       | `delegates`           | `/api/v1/offices/:id/delegates`                 |
| Messages bus    | `messages`            | `/api/v1/offices/:id/messages`                  |
| Workspace exec  | `workspace`           | `/api/v1/offices/:id/workspace`                 |
| Roles           | `roles`               | `/api/v1/offices/:id/roles`                     |
| Agent transfer  | `transfer`            | `/api/v1/offices/:id/agents/{prepare,install,…}` |
| LLM ping        | `llmPing`             | `/api/v1/offices/:id/llm-ping`                  |
| WhatsApp        | `whatsapp`            | `/api/v1/offices/:id/whatsapp` + per-agent      |
| Chromium        | `chromium`            | `/api/v1/offices/:id/chromium`                  |
| Capabilities    | `capabilities`        | `/api/v1/offices/:id/capabilities/self`         |
| Code/Codex pxy  | `proxy`               | `/api/v1/offices/:id/{code,codex}-proxy`        |

For exhaustive method-by-method documentation see
[`llms-full.txt`](./llms-full.txt). A few highlights:

```ts
// Offices
await mi.offices.create({ name: 'acme', owner_id: userId });
await mi.offices.suspend(officeId);
await mi.offices.resume(officeId);
await mi.offices.kubeconfig(officeId);

// Hire / manage agents
await mi.employees.hire(officeId, { name: 'aria', role: 'researcher', modelTier: 'sonnet' });
await mi.employees.promote(officeId, 'aria', { modelTier: 'opus' });
await mi.employees.setSkills(officeId, 'aria', { add: ['github'] });
await mi.employees.logs(officeId, 'aria', { tail: 200 });
await mi.employees.activity(officeId, 'aria', { limit: 50, category: 'task' });

// Tasks
await mi.tasks.create(officeId, { title: 'Triage inbox', assigned_to: 'aria' });
await mi.tasks.stats(officeId);

// Files (shared drive)
await mi.files.upload(officeId, 'report.md', Buffer.from('...'));
const list = await mi.files.list(officeId);
const resp = await mi.files.download(officeId, 'report.md');

// Credits & usage
await mi.credits.balance(officeId);
await mi.credits.add(officeId, { amount: 100, reason: 'topup' });
await mi.credits.usageSummary(officeId);
await mi.credits.llmUsageSummary(officeId);

// Integrations
await mi.integrations.listProviderModels(officeId);
await mi.integrations.ensureSecret(officeId, 'github', 'ghp_...');
await mi.integrations.toggleAgent(officeId, 'github', 'aria', true);
```

---

## XMTP — talking to agents

The SDK ships a session-aware XMTP layer that bypasses the dashboard and
talks directly to the agent's chat-server presence.

```ts
const session = await mi.xmtp.negotiateSession(officeId, 'aria');
console.log(session.sessionId, session.capabilities);

const handle = mi.xmtp.getSession(officeId, 'aria')!;
await handle.send('Summarise yesterday and propose three tasks for today.');

for await (const msg of handle.stream(/* pollIntervalMs */ 2000)) {
  console.log(`[${msg.from_agent}] ${msg.content}`);
}
```

### Session protocol

1. SDK fetches existing conversations from office-manager.
2. Sends a control message:
   `{ "type": "__SESSION_START__", "session_id": "<uuid>", "capabilities_request": true }`
3. Waits up to `timeoutMs` (default 30s) for a `__SESSION_ACK__` carrying
   `capabilities`. If none arrives the session falls back to plain messaging.
4. `send(content)` posts plain content to the conversation; `receive()`
   pulls only newer messages from the target agent and filters out control
   frames; `stream()` yields them as an async generator.
5. `close()` posts `__SESSION_END__` (best-effort) and tears the session
   down.

`XMTPChannel` is the per-client manager — it deduplicates by
`{officeId, agentName}`, so calling `openSession` twice returns the same
handle.

---

## The `mi` CLI

The published binary is **`mi`** (formerly `os1-admin`).

```bash
mi --help
```

```text
mi <command>

  init                               configure SDK (~/.os1)
  auth test                          verify credentials
  auth token [-u user] [-t ttl]      print a JWT for debugging
  keys generate -o <office> -a <agent>
  keys list      -o <office>
  keys pubkey   -o <office> -a <agent>

  offices list
  offices create  -n <name> -u <ownerId>
  offices status  <officeId>
  offices delete  <officeId>

  agents list     -o <office>
  agents hire     -o <office> -n <name> [-r role] [-m model]
  agents get      <office> <name>
  agents logs     <office> <name> [-t tail]
  agents activity <office> <name> [-l limit] [-c category]
  agents fire     <office> <name>

  chat <office> <agent>              interactive XMTP session
  send <office> <agent> "<msg>"      one-shot message

  tasks list   -o <office>
  tasks create -o <office> -t <title> [-d desc] [-k kind] [-a agent]
  tasks stats  -o <office>

  files ls       -o <office>
  files upload   <office> <localPath>   [-n remoteName]
  files download <office> <filename>    [-o outputPath]

  credits balance -o <office>
  credits add     -o <office> -a <amount> -r <reason>

  api <METHOD> <path> [-d '<json>']     [--agent <name> --office <id>]
```

Every command has `--help` for full details. The `api` subcommand is an
escape hatch for endpoints the typed wrappers haven't grown a method for
yet.

---

## Keystore

```text
~/.os1/
├── config.json                    # SDK config (endpoint, default office)
├── keys/
│   ├── jwt.key                    # HMAC secret (chmod 0600)
│   └── <officeId>/
│       └── <agent>.key            # secp256k1 private key (chmod 0600)
└── sessions/                      # active session state
```

Programmatic access:

```ts
import { Keystore, generateKeyPair } from '@mitosislabs/sdk';

const ks = new Keystore();
await ks.storeJWTSecret(process.env.RELAY_JWT_SECRET!);
const kp = await ks.generateAndStore(officeId, 'aria');   // public + private
const pub = await ks.getPublicKey(officeId, 'aria');
const list = await ks.listAgentKeys(officeId);
```

The keystore creates directories with `0700`, files with `0600`. Custom
roots are supported via `new Keystore({ basePath: '/custom/path' })`.

---

## Errors

All non-2xx responses raise `OS1Error`:

```ts
import { OS1Error } from '@mitosislabs/sdk';

try {
  await mi.employees.hire(officeId, { name: 'aria' });
} catch (err) {
  if (err instanceof OS1Error) {
    console.error(err.status, err.code, err.message);
    if (err.status === 402) /* office is out of credits */;
  } else {
    throw err;
  }
}
```

Common statuses: **401** invalid auth · **402** no credits · **403**
forbidden · **404** missing resource · **409** name conflict · **429** rate
limit (e.g. agent-hire is capped at 3 per 10 min per office).

---

## TypeScript types

Every domain object is exported. The most commonly used shapes:

```ts
import type {
  // Auth
  ClientConfig, JWTAuthConfig, AgentAuthConfig, JWTPayload, KeyPair,

  // Office + agent
  Office, ClusterStatus,
  Employee, EmployeeChannels, EmployeeResources, EmployeeStatus,
  HireRequest, UpdateEmployeeRequest, PromoteRequest, SkillsRequest,
  AgentKitConfig, AgentKitOwner,

  // Tasks / files
  Task, CreateTaskRequest, TaskStats,
  FileInfo, FileChange, FileChangesResponse, FilePermission,

  // Money
  CreditBalance, AddCreditsRequest, CreditHistoryEntry,
  UsageSummary, LLMUsageSummary, Quota, SetQuotaRequest,

  // XMTP
  XMTPConversation, XMTPGroup, XMTPMessage,
  SendXMTPMessageRequest, CreateGroupRequest, SessionNegotiation,

  // Activity / events
  ActivityEvent, ActivityQuery, ChatSession,
  PodCallback, PodEventRequest,

  // Misc
  Extension, MarketplaceItem, WhatsAppStatus, ChromiumInstance,
  Delegate, ExecRequest, ExecResponse, Backup,
  TransferStatus, Role, EnvVar, ModelInfo, IntegrationSecret,
  PingResult,
} from '@mitosislabs/sdk';
```

Helpers are also exported:

```ts
import {
  OS1AdminClient,            // main client
  Transport,                 // raw HTTP transport (rare)
  Keystore,                  // local secret storage
  XMTPChannel, XMTPSession,  // session-aware messaging
  generateJWT, verifyJWT, authorizationHeader,
  generateKeyPair, publicKeyFromPrivate,
  signRequest, verifySignature,
  OS1Error,
} from '@mitosislabs/sdk';
```

---

## Recipes

### List every agent in every office

```ts
const mi = await OS1AdminClient.fromConfig();
for (const office of await mi.offices.list()) {
  const agents = await mi.employees.list(office.id);
  console.log(`[${office.name}] ${agents.length} agents`);
  for (const a of agents) console.log(`  - ${a.name} (${a.status.phase})`);
}
await mi.close();
```

### Stream live messages from an agent

```ts
const handle = await mi.xmtp.openSession(officeId, 'aria');
await handle.negotiate(15_000);
for await (const m of handle.stream()) {
  if (m.content.includes('done')) break;
  console.log(m.from_agent, m.content);
}
await handle.close();
```

### Act as an agent (secp256k1) for a single call

```ts
const agentClient = await OS1AdminClient.asAgent(officeId, 'aria');
await agentClient.callbacks.podEvent(officeId, { type: 'ready' });
```

### Tail logs in real time-ish

```ts
let lastSeen = '';
setInterval(async () => {
  const { logs } = await mi.employees.logs(officeId, 'aria', { tail: 200 });
  if (logs !== lastSeen) {
    process.stdout.write(logs.slice(lastSeen.length));
    lastSeen = logs;
  }
}, 5_000);
```

### Raw API call with the typed transport

```ts
const result = await mi.transport.request<MyType>(
  'POST',
  `/api/v1/offices/${officeId}/custom/route`,
  { body: { foo: 'bar' } },
);
```

---

## FAQ & troubleshooting

**`No JWT secret found. Run 'os1-admin init' first.`**
Run `mi init` (or set up `~/.os1/keys/jwt.key` yourself with `chmod 0600`).

**`401 invalid signature`**
Your `RELAY_JWT_SECRET` doesn't match the office-manager's. They must be
the exact same string on both sides (Railway env var on the dashboard,
`office-manager-jwt` secret on EKS).

**`429 Too Many Requests` on `employees.hire`**
Mitosis caps agent creation at ~3 per 10 minutes per office. Wait or use
`mi tasks create` to queue work for an existing agent.

**Session negotiation hangs forever**
The agent pod isn't running, or it's an older agent that doesn't speak the
session protocol. The SDK times out after `timeoutMs` (default 30s) and
returns a session with empty `capabilities`; messages still send fine, you
just won't get capability discovery.

**Can I use this from a browser?**
No. The SDK uses `node:crypto`, `node:fs/promises`, `node:os`, and the
`commander` CLI library. It's a Node-only package.

---

## Repo layout

```text
src/
├── index.ts                  # public exports
├── client.ts                 # OS1AdminClient
├── transport.ts              # authenticated fetch + SSE
├── auth/
│   ├── index.ts
│   ├── jwt.ts                # HS256 generate/verify (mirrors office-manager)
│   ├── secp256k1.ts          # ECDSA sign/verify (mirrors pubkey_auth.go)
│   └── keystore.ts           # ~/.os1 secret storage
├── api/
│   ├── offices.ts            # OfficesAPI
│   ├── employees.ts          # EmployeesAPI
│   ├── tasks.ts              # TasksAPI
│   ├── files.ts              # FilesAPI
│   ├── credits.ts            # CreditsAPI (credits + usage + quota)
│   ├── xmtp.ts               # XMTPAPI (DMs, groups, messages)
│   ├── integrations.ts       # IntegrationsAPI
│   ├── extensions.ts         # ExtensionsAPI + marketplace
│   └── events.ts             # Events / Callbacks / Backups / Env /
│                             #   Delegates / Messages / Workspace /
│                             #   Roles / Transfer / LLMPing / WhatsApp /
│                             #   Chromium / Capabilities / Proxy
├── xmtp/
│   ├── channel.ts            # XMTPChannel — multi-session manager
│   └── session.ts            # XMTPSession — negotiate / send / stream
├── cli/index.ts              # `mi` binary
└── types/index.ts            # all public TypeScript types
tests/                        # vitest — auth, client, session, integration
scripts/list-employees.mjs    # standalone usage example
llms-full.txt                 # exhaustive reference for LLM agents
SDK.md                        # original architecture writeup
CLAUDE.md                     # internal contributor notes
```

---

## License

MIT © Mitosis Labs

## Links

- **Website:** https://mitosislabs.ai
- **Docs:** https://mitosislabs.ai/docs
- **Issues / questions:** open an issue on the monorepo
- **Architecture deep-dive:** [`SDK.md`](./SDK.md)
- **LLM-friendly reference:** [`llms-full.txt`](./llms-full.txt)
