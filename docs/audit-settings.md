# `~/.os1/settings.json` — audit state file

Every `mi audit <subcommand>` writes its latest result into a local JSON
file. This is the shared state layer that:

- lets future `mi onboard <subcommand>` know what's already configured and
  what to walk the user through,
- lets gates like `mi backup` refuse to run when the recorded state of a
  prerequisite audit is `[OFFLINE]` or `[UNSAFE]`,
- gives the user a single file to look at to see what was last true.

It is **per-machine, per-user**, not synced anywhere. Each
machine you run `mi` on has its own.

---

## Where

`~/.os1/settings.json` (i.e. `$HOME/.os1/settings.json` on the user
running `mi`).

The directory is created on first write (`mkdir -p`). The file is
written `0600` to match the keystore convention; the data is not secret
per se but may contain internal office UUIDs and agent names that should
not leak to other users on the same box.

Writes are atomic: serialised to `~/.os1/settings.json.tmp` then
`rename()`d over the target. A crash mid-write leaves either the old
file or the new file, never a partial one.

---

## Schema (v1)

```jsonc
{
  "version": 1,
  "updatedAt": "2026-05-19T19:45:07.546Z",
  "audits": {
    "data-access":    { "auditedAt": "...", "report": Report },
    "model-provider": { "auditedAt": "...", "report": Report }
    // future: "backups", "benchmark", ...
  }
}
```

- `version` — integer schema version. Bump on breaking changes; readers
  should warn and back up the file rather than crash.
- `updatedAt` — ISO timestamp of the most recent write (any subcommand).
- `audits[<key>]` — one entry per `mi audit` subcommand. The `<key>` is
  the subcommand name with the `audit ` prefix stripped
  (`"audit data-access"` → `"data-access"`). Defined by `auditKey()` in
  `src/cli/audit-shared.ts`.
- `audits[<key>].auditedAt` — ISO timestamp of when *this slot* was last
  written. Earlier than `updatedAt` if a different subcommand ran more
  recently.
- `audits[<key>].report` — the full `Report` object from the audit run.
  Same shape as the `--json` output. See `audit-data-access.md` and
  `audit-model-provider.md` for the per-surface fields.

### `Report` shape recap

```ts
interface Report {
  command: string;     // "audit data-access" | "audit model-provider" | ...
  title: string;       // human headline used by render()
  platform: 'openclaw' | 'hermes';
  context: Record<string, string | undefined>;
  surfaces: Surface[];
  overall: 'connected' | 'partial' | 'disconnected' | 'unknown';
  footer?: string;
}

interface Surface {
  id: string;
  label: string;
  status: 'connected' | 'partial' | 'disconnected' | 'unknown';
  notes: string[];
  remediation: string[];
  statusLabels?: { ok: string; partial: string; bad: string; unknown: string };
}
```

The `Report` is fully self-describing — a reader does not need to know
about specific subcommands to render or reason about a slot. Anything
that depends on a particular subcommand's semantics should key off
`audits[<key>]` directly.

---

## Lifecycle

```
mi audit data-access            (run 1)
  ├─ probe sources, build Report
  ├─ render to stdout
  └─ saveAuditResult(report)
        ├─ readSettings()       ── creates {} if file missing
        ├─ audits["data-access"] = { auditedAt: now, report }
        ├─ updatedAt = now
        └─ atomic write to ~/.os1/settings.json (mode 0600)
                                                                Footer: "[saved] ~/.os1/settings.json  (key: data-access)"

mi audit model-provider         (run 2)
  ├─ … same flow …
  └─ writes audits["model-provider"], preserves audits["data-access"]
```

Each `mi audit <X>` only ever touches its own slot. Two parallel
invocations of *different* subcommands can interleave because the
combined write is atomic but the read-modify-write window is not — the
last writer wins, but only for its own slot. Two parallel invocations of
the *same* subcommand will produce one of the two results in the slot;
neither result is lost from stdout, only one survives in the file.

---

## Opting out

`--no-save` on any `mi audit` subcommand skips the write entirely. Use
when:

- you are running an ad-hoc check in CI and do not want to pollute the
  runner's home dir,
- you are running with elevated privileges (e.g. `sudo`) and do not
  want the file owned by root,
- you are auditing a non-default office/agent and do not want it to
  overwrite the slot from your default agent.

Behaviour:

| Mode | Persists? | stdout |
|---|---|---|
| default (no flag) | yes | report + `[saved] ~/.os1/settings.json  (key: <name>)` |
| `--no-save` | no | report only |
| `--json` | yes (silent) | JSON only — no save banner, no warning text |
| `--json --no-save` | no | JSON only |

If the write fails (disk full, permission denied), `mi` prints a
single-line `[warn] could not save settings: <reason>` to stderr and
continues — the failure does not affect the report or the exit code.
This is deliberate: the audit output is the primary product; the
settings file is a convenience.

---

## Exit codes (unchanged)

The settings file does not alter exit-code semantics. They remain
report-driven:

| Code | Meaning |
|---|---|
| 0 | `overall === 'connected'` |
| 1 | `overall === 'partial'` or `'unknown'` |
| 2 | `overall === 'disconnected'` |

A successful save with an `[OFFLINE]` report still exits 2. The file
records *what was true*, not *whether saving succeeded*.

---

## How to use it from other tools

### Read a single slot

```ts
import { readSettings } from '@mitosislabs/sdk/cli/audit-shared.js';
const s = readSettings();
const dataAccess = s.audits['data-access'];
if (dataAccess?.report.overall === 'disconnected') {
  console.error('Gmail not connected — run `mi audit data-access` for details.');
  process.exit(1);
}
```

### Read raw (no SDK install required — pure JSON)

```bash
jq '.audits["model-provider"].report.overall' ~/.os1/settings.json
# "disconnected"  →  agent is on a third-party cloud provider
```

### `mi backup` gate (planned)

```
mi backup
  ├─ read ~/.os1/settings.json
  ├─ if audits["data-access"].report.overall !== "connected": warn
  ├─ if audits["model-provider"].report.overall === "disconnected":
  │     "Your provider is UNSAFE. Backups would also leak. Aborting.
  │      Run `mi onboard model-provider` first, or pass --i-know to proceed."
  └─ otherwise proceed
```

This pattern — read the slot, branch on `overall` — is the contract
other tools should use. Do not parse the rendered text.

---

## Migration / versioning

`version: 1` is the only schema in use. When a future change is
breaking (e.g. slot keys change shape):

1. Bump `SETTINGS_VERSION` in `audit-shared.ts`.
2. In `readSettings()`, if the file's `version` is older, either:
   - migrate in memory and rewrite on the next save, or
   - back up the existing file to `settings.json.v<old>.bak` and start
     fresh with an empty `audits: {}`.
3. Bump major version of the SDK so consumers know to expect different
   on-disk shape.

Non-breaking additions (new optional fields, new audit subcommand
slots) do not need a version bump. Existing readers should tolerate
unknown keys.

---

## Why this shape

A flat `audits[<key>]` map (rather than an append-only history list,
or one file per subcommand):

- **One slot per audit type** matches the user's mental model — "is
  data-access healthy right now?" is a single boolean-ish question. A
  history list answers a different question ("when did it last break?")
  and can be added later as `audits[<key>].history` or a sibling
  `~/.os1/audit-history.jsonl` without breaking this contract.
- **Single file** is easier to inspect (`jq`, `cat`) and easier to
  back up than a directory full of per-subcommand files.
- **Full `Report` per slot** means future readers do not need any
  knowledge of specific subcommands — the file is self-describing.

If we need an audit-history view later, it composes on top of this
file rather than replacing it.

---

## Inspecting

```bash
# what's in the file
cat ~/.os1/settings.json | jq .

# only the verdicts
jq '.audits | to_entries | map({key, overall: .value.report.overall})' \
   ~/.os1/settings.json

# when was each slot last updated
jq '.audits | to_entries | map({key, auditedAt: .value.auditedAt})' \
   ~/.os1/settings.json

# wipe state (next audit run rebuilds it)
rm ~/.os1/settings.json
```

---

## Non-goals

- **Sync across machines.** Settings is per-machine state. If you want
  org-wide audit tracking, push the `--json` output to a backend.
- **Authoritative truth.** The file records what an audit *most recently
  found*. It can be wrong if the underlying state changed since the last
  run. Tools that depend on it should still consider re-running the
  audit when the slot is older than some threshold.
- **Mutable by hand-editing.** Nothing stops you, but the next `mi
  audit` run will overwrite the slot with fresh truth. If you need
  policy overrides (e.g. "claude-code counts as SAFE for our org"),
  that belongs in a separate `~/.os1/audit-policy.json` — see the
  follow-up sketched in conversation, not implemented here.
