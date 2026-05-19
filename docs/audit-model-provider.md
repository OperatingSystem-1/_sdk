# `mi audit model-provider`

Tells the user, in plain English, what LLM provider their agent is talking to
and whether that provider is private (SAFE) or a third-party cloud (UNSAFE).

This is a sibling of [`mi audit data-access`](./audit-data-access.md). Both
share the same shared module (`src/cli/audit-shared.ts`) and the same
auto-detection, output, and exit-code conventions.

---

## Why this exists

From the founding sketch:

> 2. Use private inference (GOOD - runs locally and checks system if there is
> enough resources) or cloud service provider (NOT SAFE)
>    i) If resources --> local
>    ii) IF NOT resources --> tell them and give option to use Mitosis Private
>        Inference (SAFE)
>    iii) cloud service provider (NOT SAFE)

And from the 2026-05-15 17:00 PDT meeting:

> infrastructure costs and operational efficiency [...] highlighted the
> benefits of using Bedrock for private inference and emphasized that they
> continue to explore new models, such as those available through Venice, to
> optimize both performance and data privacy

The model-provider audit makes this binary explicit. Every audit prints
either SAFE / WATCH / UNSAFE / UNKNOWN, with the reason inline, and
remediation that names a private alternative.

---

## Provider classification

| Provider id (input) | Verdict | Why |
|---|---|---|
| `amazon-bedrock` / `bedrock` | SAFE | Private inference under AWS contract; prompts do not train provider models. |
| `mitosis-private` / `colony` | SAFE | Mitosis-hosted private inference; data stays inside your colony. |
| `venice-ai` / `venice` | SAFE | Privacy-focused provider; no prompt retention. |
| `local` / `ollama` | SAFE | Runs on your hardware; nothing leaves the machine. |
| `claude-code` | WATCH | Routed via the Mitosis claude-code proxy, but prompts ultimately hit the Anthropic API. |
| `openai-codex` | WATCH | Routed via the Mitosis codex proxy, but prompts ultimately hit the OpenAI API. |
| `gemini-cli` | WATCH | Routed via the Mitosis gemini proxy, but prompts ultimately hit Google Gemini. |
| `anthropic` | UNSAFE | Direct cloud API. |
| `openai` | UNSAFE | Direct cloud API. |
| `google-gemini` / `gemini` | UNSAFE | Direct cloud API. |
| `azure-openai` | UNSAFE | Cloud-hosted; data leaves your control unless an enterprise privacy clause applies. |
| anything else | UNKNOWN | Not in the catalogue — cannot judge safety without classifying it. |

To add a provider: edit `PROVIDERS` in `src/cli/audit-model-provider.ts`.
The map keys are the input strings the user might supply; the
`canonicalId` is what the audit reports and what
`providerExpectedKey` keys off for env-var hints.

---

## Behaviour

### Invocation

```
mi audit model-provider [options]
```

| Flag | Meaning |
|---|---|
| `-p, --platform <openclaw\|hermes>` | Force platform. Default: auto-detect. |
| `-o, --office <officeId>` | Office UUID (openclaw mode). |
| `-a, --agent <name>` | Agent name (openclaw mode). |
| `--hermes-env <path>` | Path to hermes `.env`. Default: `~/.hermes/.env`. |
| `--hermes-config <path>` | Path to hermes `config.toml`. Default: `~/.hermes/config.toml`. |
| `--json` | Emit machine-readable JSON. |

### Exit codes

| Code | Verdict | Meaning |
|---|---|---|
| 0 | SAFE | Private inference. CI green. |
| 1 | WATCH or UNKNOWN | Proxied or unclassified — review. |
| 2 | UNSAFE | Direct cloud API; data is leaving the user's control. |

`UNKNOWN` is intentionally exit 1 (not 0). An unclassified provider is a
configuration gap, not a green light.

### Status labels

The shared `Surface` type accepts `statusLabels` to override the default
`[CONNECTED]/[PARTIAL]/[OFFLINE]` set. This audit uses
`SAFETY_LABELS = [SAFE]/[WATCH]/[UNSAFE]/[UNKNOWN]` from
`audit-shared.ts`.

---

## OpenClaw mode

### What it reads

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/offices/{officeId}` | Read `office.modelProvider` (office default for new agents). |
| GET | `/api/v1/offices/{officeId}/employees/{agent}` | Read `employee.modelProvider` (per-agent override) and `modelTier`. |

Effective provider is `employee.modelProvider || office.modelProvider`. Both
are reported in `notes` so the user sees which one is winning.

### Backend types

- Office response: `_office-manager/internal/api/handlers/office.go:62` (`officeToResponse`) — `ModelProvider string \`json:"modelProvider"\``.
- Employee response: `_office-manager/internal/api/handlers/employees.go:985-999` — `modelProvider` + `modelTier` exposed on `Employee`.
- DB columns: `offices.model_provider` and `employees.model_provider`
  (`internal/store/store.go:175,274`).

### Remediation

- **UNSAFE:** suggest `mi offices settings set <officeId> --model-provider amazon-bedrock` (or `venice-ai`), plus the per-agent `PATCH /employees/{name}` body for an override.
- **WATCH:** explain that the proxy still hits the upstream provider, point at the same private alternatives.
- **UNKNOWN:** tell the user to set a provider via `mi offices settings set`.

---

## Hermes mode

### What it reads

- `~/.hermes/config.toml` (or `--hermes-config`): the `[model]` section.
  Reference: `_pjbrain/hermes/config.toml.example` shows the shape
  (`provider = "anthropic"` / `model = "claude-sonnet-4-6"`).
- `~/.hermes/.env` (or `--hermes-env`): provider-specific API keys, used
  as a sanity check. We do not block on missing keys — the toml's
  `[model].provider` is the source of truth — but a missing expected key
  for the declared provider is surfaced as `[MISS]`.

### Provider-to-env-key map

| canonicalId | env var checked |
|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `google-gemini` | `GEMINI_API_KEY` |
| `amazon-bedrock` | `AWS_ACCESS_KEY_ID` |
| `azure-openai` | `AZURE_API_KEY` |
| `venice-ai` | `VENICE_API_KEY` |

Defined in `providerExpectedKey` in `src/cli/audit-model-provider.ts`.

### Remediation

- **UNSAFE:** show the exact `~/.hermes/config.toml` `[model]` block to
  swap in for `amazon-bedrock`, the AWS creds to add to `~/.hermes/.env`,
  and the `hermes gateway restart` command.
- **UNKNOWN with no `[model]` section:** show the block to add.
- **Declared provider but missing API key:** tell the user the env var
  to set.

### TOML parser

`src/cli/audit-shared.ts` ships a minimal TOML reader (`parseToml`). It
handles `[section]` headers and `key = value` pairs with quoted or bare
scalars — enough for `~/.hermes/config.toml`. No arrays-of-tables, no
inline tables, no dates. If a future audit needs more, swap in
`@iarna/toml` (~20kB) or similar.

---

## Output

### Human-readable

```
Mitosis Model Provider Audit
-----------------------------------------------------
Platform: hermes
hermes_config_path /home/ubuntu/.hermes/config.toml

[UNSAFE]    Hermes model provider
  config: /home/ubuntu/.hermes/config.toml
  env file: /home/ubuntu/.hermes/.env
  provider: Anthropic API (direct) [unsafe]
  model:    claude-sonnet-4-6
  [OK]   ANTHROPIC_API_KEY (required for Anthropic API (direct))

  why: prompts and outputs are sent directly to Anthropic; governed by their data policy

  How to fix:
    Move hermes to a private-inference provider by editing ~/.hermes/config.toml:
      [model]
      provider = "amazon-bedrock"
      model    = "claude-sonnet-4-5-20250929-v1:0"
    Set AWS credentials in ~/.hermes/.env:
      AWS_ACCESS_KEY_ID=...
      AWS_SECRET_ACCESS_KEY=...
      AWS_REGION=us-east-2
    Then restart hermes: hermes gateway restart

Surfaces marked [UNSAFE] send your prompts and outputs to a third-party provider.
There is no fallback that hides this — every call goes out.
```

### JSON (`--json`)

```json
{
  "command": "audit model-provider",
  "title": "Mitosis Model Provider Audit",
  "platform": "hermes",
  "context": { "hermes_config_path": "/home/ubuntu/.hermes/config.toml" },
  "surfaces": [
    {
      "id": "model-provider",
      "label": "Hermes model provider",
      "status": "disconnected",
      "notes": ["provider: Anthropic API (direct) [unsafe]", "..."],
      "remediation": ["Move hermes to a private-inference provider...", "..."],
      "statusLabels": { "ok": "[SAFE]     ", "partial": "[WATCH]    ", "bad": "[UNSAFE]   ", "unknown": "[UNKNOWN]  " }
    }
  ],
  "overall": "disconnected",
  "footer": "Surfaces marked [UNSAFE] ..."
}
```

The JSON contract is identical to `audit data-access` — same `Report`
shape, same `Surface` shape. The only difference is `statusLabels` is
populated to switch the display vocabulary.

---

## File layout

```
_sdk/src/cli/
  audit.ts                   # parent command; delegates to subcommands (~12 LOC)
  audit-shared.ts            # types, helpers, dotenv/toml parsers, render, exit codes
  audit-data-access.ts       # mi audit data-access
  audit-model-provider.ts    # mi audit model-provider  (new)
_sdk/docs/
  audit-data-access.md
  audit-model-provider.md    # this file
```

This shape is set up for the next siblings (`audit identity`,
`audit safety`, etc.) — drop a new `audit-<name>.ts` and register it in
`audit.ts`. The shared module already exports everything a new audit
needs (`Platform`, `Surface`, `Report`, `resolvePlatform`,
`resolveOpenClawContext`, `findHermesEnv`, `findHermesConfigToml`,
`emitReportAndExit`).

---

## Non-goals

- We do **not** measure actual data egress. The audit reports the
  configured provider; the runtime may differ if e.g. a process env var
  overrides the config. That divergence is itself a bug worth reporting.
- We do **not** judge model quality, latency, or cost. Only the safety
  surface (private vs cloud).
- We do **not** auto-fix. The audit emits remediation lines; the user
  (or a separate `mi config` command) runs them.
