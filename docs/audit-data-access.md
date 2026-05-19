# `mi audit data-access`

A health check that tells you, in plain English, whether the agent can actually
read your data right now — or whether it would silently lie if you asked.

Today it checks one surface: **Google Workspace (Gmail / Calendar / Drive)**.
The shape is built so more surfaces (Slack, GitHub, WhatsApp, private files)
slot in without re-architecting.

---

## Why this exists

Onboarding (per the founding sketch) walks the user through:

1. Connect a data source
2. Pick inference (local vs cloud)
3. Ingest + enrich
4. Backup? -> `mi backup`
5. Join colony? -> `mi join`

If step 1 is silently broken, everything downstream is fiction. `audit
data-access` is the first thing you run, and the first thing CI runs, to make
sure the agent isn't claiming access it doesn't have.

The product invariant from the same sketch:

> extremely transparent to build trust and TELL THEM WHAT IS NOT SAFE.

This command applies that literally. Surfaces are either CONNECTED, PARTIAL,
OFFLINE, or UNKNOWN. There is no silent fallback, and the output says so when
the result is anything other than CONNECTED.

---

## Behaviour

### Invocation

```
mi audit data-access [options]
```

| Flag | Meaning |
|---|---|
| `-p, --platform <openclaw\|hermes>` | Force platform. Default: auto-detect. |
| `-o, --office <officeId>` | Office UUID (openclaw mode). |
| `-a, --agent <name>` | Agent name (openclaw mode). |
| `--hermes-env <path>` | Path to hermes `.env`. Default: `~/.hermes/.env`. |
| `--json` | Emit machine-readable JSON instead of text. |

### Platform auto-detection

In order:

1. **OpenClaw** if any of `OS1_AGENT_NAME`, `AGENT_POD_NAME`, `BOT_NAME` is set.
   These are injected into the agent pod by office-manager.
2. **Hermes** if any of `HERMES_GATEWAY_URL`, `PJBRAIN_OWNER_WHATSAPP_JIDS`,
   `PJBRAIN_OWNER_WHATSAPP_JID` is set, OR `~/.hermes/` or `~/pjbrain/` exists.
3. Otherwise: fail loudly with a message listing the signals.

### Exit codes

| Code | Meaning | Use case |
|---|---|---|
| 0 | All surfaces CONNECTED | `mi audit data-access && mi backup` |
| 1 | At least one surface PARTIAL | CI warning, not a hard fail |
| 2 | At least one surface OFFLINE | CI block, deploy gate |

Humans read the text. Scripts read the exit code. The two stay in sync.

---

## OpenClaw mode

### Context resolution

```
officeId  := --office | OFFICE_ID | OS1_OFFICE_ID | strip("office-" from AGENT_POD_NAMESPACE)
agentName := --agent  | OS1_AGENT_NAME | BOT_NAME | AGENT_POD_NAME
```

Both must resolve. If either is missing, we fail with a message naming the
flags and env vars that would satisfy it.

### Endpoints hit

Both authenticated via the SDK's existing JWT path (`OS1AdminClient.fromConfig`,
which reads `~/.os1/config.json` + `~/.os1/keys/jwt.key`).

| Method | Path | What we read |
|---|---|---|
| GET | `/api/v1/offices/{officeId}/integrations` | `integrationListItem[]` — find `id === "google-workspace"`, read `hasSecret`, `capabilities`, `agentEnvVars`. |
| GET | `/api/v1/offices/{officeId}/employees/{agent}/integrations` | `{integrations: AgentIntegration[], rev}` — find `id === "google-workspace"`, read `enabled`, `status`. |

Backend handlers:

- `_office-manager/internal/api/handlers/integrations.go:69` (`List`)
- `_office-manager/internal/api/handlers/integrations.go:1221` (`AgentIntegrations`)

Backend types we depend on:

- `integrationListItem` in `_office-manager/internal/api/handlers/integrations.go:46`
- `store.AgentIntegration` in `_office-manager/internal/store/agent_integrations.go:11`

### Verdict logic

| Office secret | Agent enabled | Agent runtime status | Verdict |
|---|---|---|---|
| no | * | * | OFFLINE |
| yes | no | * | PARTIAL |
| yes | yes | `error` or `offline` | PARTIAL |
| yes | yes | anything else | CONNECTED |

### Remediation lines (printed under "How to fix")

Generated from the verdict:

- **No office secret:** point at the dashboard Integrations page and the raw
  `POST .../integrations/google-workspace/secret` body shape.
- **Office secret but not enabled for this agent:** show the
  `POST .../integrations/google-workspace/agents/{agent}` toggle call.
- **Enabled but runtime status is error/offline:** point at
  `mi agents activity {office} {agent}` to see why.

These mirror the existing `IntegrationsAPI` methods so users can also fix it
programmatically without leaving the CLI.

---

## Hermes mode

Hermes (the pjbrain stack) keeps its config in a dotenv on disk, not in a
remote service. We read it directly.

### Env file resolution

First match wins:

1. `--hermes-env <path>` flag
2. `PJBRAIN_ENV_FILE` env var
3. `~/.hermes/.env`
4. `~/.pjbrain/.env`
5. `~/pjbrain/.env`

Values from `process.env` are used as a baseline; values from the dotenv file
override them. (Rationale: when the user runs `mi` on the hermes host, the
dotenv on disk is the source of truth that the running services actually use.)

### Variables checked

Required (missing -> OFFLINE):

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Optional (missing -> PARTIAL):

- `GOOGLE_PUBSUB_TOPIC`
- `GOOGLE_PUBSUB_VERIFICATION_TOKEN`
- `WEBHOOK_PUBLIC_URL`
- `DRIVE_ACCOUNT`

Without the optional set, OAuth works but Gmail/Calendar push delivery does
not — the user would have to poll, which pjbrain does not do.

### What we deliberately do NOT verify (yet)

- That `gmail_accounts` has a row with a valid encrypted refresh token.
- That the Pub/Sub watch is registered and unexpired (`watch_expiry > now()`).
- That the webhook URL is publicly reachable from Google.

Those checks need Postgres access and an outbound HTTP probe; they belong in a
follow-up `--deep` mode. Today we print a banner saying these are not verified
so the user is not misled by a green check.

---

## Output format

### Human-readable (default)

```
Mitosis Data Access Audit
-----------------------------------------------------
Platform: hermes
hermes_env_path    /home/ubuntu/.hermes/.env
home               /home/ubuntu

[OFFLINE]   Google Workspace (Gmail / Calendar / Drive)
  config: /home/ubuntu/.hermes/.env
  [MISS] GOOGLE_OAUTH_CLIENT_ID
  [MISS] GOOGLE_OAUTH_CLIENT_SECRET
  [ -- ] GOOGLE_PUBSUB_TOPIC (optional)
  ...

  How to fix:
    Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in ~/.hermes/.env
    Create OAuth client at console.cloud.google.com -> Credentials
    Then run from pjbrain repo: python -m ingestion.gmail.register_account <you@gmail.com>
    For calendar: python -m ingestion.calendar.register_account <you@gmail.com>

Surfaces marked [OFFLINE] or [PARTIAL] are NOT SAFE to rely on:
the agent cannot read that data, and there is no silent fallback.
```

### JSON (`--json`)

```json
{
  "command": "audit data-access",
  "platform": "hermes",
  "context": {
    "hermes_env_path": "/home/ubuntu/.hermes/.env",
    "home": "/home/ubuntu"
  },
  "surfaces": [
    {
      "id": "google-workspace",
      "label": "Google Workspace (Gmail / Calendar / Drive)",
      "status": "disconnected",
      "notes": ["..."],
      "remediation": ["..."]
    }
  ],
  "overall": "disconnected"
}
```

The JSON is the contract. Anything depending on this output programmatically
should consume `--json`, not parse the text.

---

## File layout

```
_sdk/
  src/cli/
    audit.ts           new — all audit logic (~290 LOC)
    index.ts           edited — imports + calls registerAuditCommand(program)
  docs/
    audit-data-access.md   this file
```

`audit.ts` exports a single function:

```ts
export function registerAuditCommand(program: Command): void
```

It owns the `audit` parent command and registers `data-access` as a child.
Future subcommands (`audit identity`, `audit safety`, etc.) register against
the same `audit` Command instance returned at the top.

---

## How to add a new surface

The shape of a surface is:

```ts
interface Surface {
  id: string;                // stable machine id, e.g. "google-workspace"
  label: string;             // human label, e.g. "Google Workspace (Gmail / Calendar / Drive)"
  status: 'connected' | 'partial' | 'disconnected' | 'unknown';
  notes: string[];           // facts ([OK] / [MISS] / config paths)
  remediation: string[];     // exact next steps, one per line
}
```

To add e.g. Slack:

1. In `auditOpenClaw`, also look up `integrations.find(i => i.id === 'slack')`
   and the same per-agent entry. Append a second `Surface` to the report.
2. In `auditHermes`, decide what Slack means on a self-hosted box (probably
   `SLACK_BOT_TOKEN` + a registered workspace row). Append a second `Surface`.
3. Update `overall` in `Report` to be the worst status across all surfaces.

The render and exit-code logic already iterate over `surfaces`, so no other
changes are needed.

---

## How to add a new mode

To add e.g. a fully managed `cloud` mode (no agent, just an account):

1. Extend the `Platform` union: `'openclaw' | 'hermes' | 'cloud'`.
2. Add `detectPlatform()` signals — probably the presence of a Mitosis cloud
   API token in the keystore.
3. Add an `auditCloud()` function returning the same `Report` shape.
4. Switch on `platform` in the action handler.

The renderer and JSON contract do not care which mode produced the report.

---

## Testing

Manual smoke tests run during development:

```bash
# Hermes — disconnected (no env file)
mi audit data-access --platform hermes --hermes-env /tmp/missing.env
# expect: exit 2, [OFFLINE], remediation listed

# Hermes — fully connected (synthetic env)
mi audit data-access --platform hermes --hermes-env /tmp/full.env
# expect: exit 0, [CONNECTED], "NOT VERIFIED HERE" banner about Postgres

# JSON mode
mi audit data-access --platform hermes --hermes-env /tmp/full.env --json
# expect: parseable JSON matching the schema above

# Platform auto-detect failure
env -i PATH=$PATH HOME=/tmp/empty node dist/cli/index.js audit data-access
# expect: clear error naming both sets of signals
```

OpenClaw mode requires a running office-manager and a configured SDK
(`mi init`); not in CI today. Add as a vitest under `tests/audit.test.ts`
once an office-manager mock fixture exists (`tests/integration.test.ts`
already mocks the transport — reuse that pattern).

---

## Non-goals

- This command does **not** mutate any state. No OAuth flow, no secret writes,
  no toggling. Audit only. Remediation is text the user follows.
- It does **not** check LLM provider connectivity, billing, or compute quota.
  Those are separate surfaces and belong in `audit identity` / `audit billing`.
- It does **not** probe Google directly. We trust the office-manager / dotenv
  as the source of truth for whether things are configured; whether Google
  actually accepts the credential is a runtime concern.
