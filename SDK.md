# OS-1 Admin SDK

## Overview

TypeScript SDK for programmatic control of the OS-1 platform. Provides authenticated access to all office-manager API endpoints, direct XMTP messaging to agent pods, autonomous session negotiation, and a CLI for interactive use.

Designed as the foundation for future CLI tools, MCP server integrations, and agent-to-platform automation.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  os1-admin CLI                    │
├─────────────────────────────────────────────────┤
│                OS1AdminClient                    │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Auth Layer │  │ API Layer│  │ XMTP Channel │ │
│  │            │  │          │  │              │ │
│  │ • JWT      │  │ • Offices│  │ • DM agents  │ │
│  │ • secp256k1│  │ • Agents │  │ • Groups     │ │
│  │ • Keystore │  │ • Tasks  │  │ • SSE stream │ │
│  │            │  │ • Files  │  │ • Session    │ │
│  │            │  │ • Credits│  │   negotiate  │ │
│  │            │  │ • XMTP   │  │              │ │
│  │            │  │ • Events │  │              │ │
│  └───────────┘  └──────────┘  └──────────────┘ │
├─────────────────────────────────────────────────┤
│              Transport (fetch + WebSocket)        │
└─────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  office-manager API            chat-server XMTP
  (m.mitosislabs.ai)           (per-office pods)
```

## Authentication Model

### Three auth modes (matching office-manager's cascading middleware):

1. **JWT (admin/dashboard)** — HMAC-SHA256 signed tokens with `RELAY_JWT_SECRET`. For human operators and admin tools. The SDK generates tokens locally — no auth server round-trip.

2. **secp256k1 (agent identity)** — ECDSA signatures over `{timestamp}\n{METHOD}\n{path}`. For programmatic agent-as-caller use cases. Requires a signing key (provisioned via chat-server or imported).

3. **Dual-mode** — The SDK can operate as both simultaneously. JWT for admin operations, secp256k1 for agent impersonation.

### Key provisioning

```
SDK.provision(officeId, agentName)
  → POST chat-server /api/agents/provision-identity
  → receives { publicKey, privateKey }
  → stores privateKey in ~/.os1/keys/{officeId}/{agentName}.key (chmod 0600)
  → stores publicKey in employees.public_key via API
  → returns KeyPair for immediate use
```

### Keystore

Keys stored at `~/.os1/keys/` with strict permissions:
```
~/.os1/
├── config.json          # SDK configuration (endpoints, default office)
├── keys/
│   ├── jwt.key          # HMAC secret for JWT generation (chmod 0600)
│   └── {officeId}/
│       └── {agent}.key  # secp256k1 private key (chmod 0600)
└── sessions/
    └── {sessionId}.json # Active session state
```

## API Coverage

Complete typed coverage of all office-manager endpoints:

| Module | Endpoints | Description |
|--------|-----------|-------------|
| `offices` | 12 | CRUD, settings, suspend/resume, secrets, kubeconfig |
| `employees` | 18 | Hire/fire/list, lifecycle, skills, credentials, archive |
| `tasks` | 4 | Create/list/get/stats |
| `files` | 7 | Upload/download/list/delete, changes, permissions |
| `credits` | 3 | Balance, add, history |
| `usage` | 7 | Compute, LLM, per-agent, summaries |
| `xmtp` | 9 | Conversations, groups, messages, stream |
| `events` | 4 | Office events, chat events, SSH events, sessions |
| `integrations` | 6 | Models, secrets, agent toggles, Claude Code sync |
| `extensions` | 5 | CRUD, panel proxy, API proxy |
| `marketplace` | 5 | List/get/publish/install/uninstall |
| `whatsapp` | 4 | QR, status, agent assignment, register |
| `chromium` | 5 | Start/status/done/delete, VNC proxy |
| `messages` | 3 | Send, pool stats, SSE stream |
| `workspace` | 2 | Exec, health |
| `delegates` | 4 | CRUD |
| `env` | 6 | Office/agent env vars |
| `callbacks` | 3 | Pod events, list, get |
| `backups` | 3 | List/get/delete |
| `roles` | 2 | List/get |
| `quota` | 2 | Get/set |
| `transfer` | 4 | Prepare/install/start/status |
| `llmPing` | 2 | Office/agent ping |

## XMTP Direct Channel

The SDK can connect directly to agent pods via XMTP messaging, bypassing the dashboard:

```typescript
const client = new OS1AdminClient({ jwtSecret: '...' });
const session = await client.xmtp.negotiateSession(officeId, agentName);

// Send a task via XMTP
await session.send('Research competitor pricing and report back');

// Stream responses
for await (const msg of session.stream()) {
  console.log(`[${msg.from}]: ${msg.content}`);
}
```

### Session Negotiation Protocol

1. SDK authenticates to office-manager (JWT)
2. Fetches agent's XMTP identity from chat-server
3. Establishes XMTP conversation (DM or group)
4. Sends `SESSION_START` control message with session metadata
5. Agent acknowledges with `SESSION_ACK` + capabilities
6. Bidirectional messaging begins with automatic cursor tracking

## CLI

```bash
# Setup
os1-admin init                           # Interactive setup (endpoint, JWT secret)
os1-admin auth test                      # Verify credentials

# Offices
os1-admin offices list
os1-admin offices create --name "my-office"
os1-admin offices status <officeId>

# Agents
os1-admin agents list --office <officeId>
os1-admin agents hire --office <officeId> --name "aria" --role "researcher"
os1-admin agents fire --office <officeId> --name "aria"
os1-admin agents logs --office <officeId> --name "aria" --follow

# Direct messaging
os1-admin chat <officeId> <agentName>    # Interactive XMTP session
os1-admin send <officeId> <agentName> "message"

# Tasks
os1-admin tasks create --office <officeId> --title "Research X" --assign "aria"
os1-admin tasks list --office <officeId>

# Files
os1-admin files ls --office <officeId>
os1-admin files upload --office <officeId> ./local-file.txt
os1-admin files download --office <officeId> remote-file.txt

# Credits
os1-admin credits balance --office <officeId>
os1-admin credits add --office <officeId> --amount 100 --reason "topup"
```

## Security Properties

1. **No secrets in transit** — JWT tokens generated locally from shared secret. secp256k1 signatures computed locally from private key. No auth server dependency.

2. **Timestamp replay protection** — secp256k1 signatures include unix timestamp, rejected if >60s drift.

3. **Key isolation** — Each agent's signing key stored in its own file with 0600 permissions. Keys never leave the keystore unless explicitly exported.

4. **Constant-time comparison** — All signature and token verification uses constant-time comparison to prevent timing attacks.

5. **No ambient credentials** — The SDK never reads from environment variables implicitly. All credentials must be explicitly provided via config file or constructor options.

6. **Session binding** — XMTP sessions are bound to a specific agent + office pair. Session tokens cannot be reused across agents.

## Usage as Library

```typescript
import { OS1AdminClient } from '@os1/admin-sdk';

// JWT auth (admin operations)
const admin = new OS1AdminClient({
  endpoint: 'https://m.mitosislabs.ai',
  jwtSecret: process.env.RELAY_JWT_SECRET,
});

// List all offices
const offices = await admin.offices.list();

// Hire an agent
const agent = await admin.employees.hire(officeId, {
  name: 'aria',
  role: 'researcher',
  model: 'claude-opus-4-6',
});

// Send a task via XMTP
const session = await admin.xmtp.negotiateSession(officeId, 'aria');
await session.send('Analyze Q1 revenue data');

// secp256k1 auth (act as agent)
const agentClient = new OS1AdminClient({
  endpoint: 'https://m.mitosislabs.ai',
  agentAuth: {
    agentId: 'aria',
    signingKey: await admin.keystore.load(officeId, 'aria'),
  },
});

// Agent can now call endpoints as itself
await agentClient.callbacks.podEvent(officeId, { type: 'ready' });
```

## MCP Integration Path

The SDK is designed to be wrapped as an MCP server:

```typescript
// Future: @os1/mcp-server
import { OS1AdminClient } from '@os1/admin-sdk';

const client = new OS1AdminClient({ ... });

// Each API module maps to MCP tools
// offices.list → tool: os1_offices_list
// employees.hire → tool: os1_agents_hire
// xmtp.send → tool: os1_xmtp_send
```

Every method returns typed results, making MCP tool schema generation trivial.
