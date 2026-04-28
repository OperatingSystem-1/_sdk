# Mitosis SDK

TypeScript SDK for [Mitosis](https://mitosislabs.ai). Manage colonies, agents, and integrations programmatically.

## Install

```bash
npm install @mitosislabs/sdk
```

## Quick Start

```bash
mi login
```

Opens the dashboard in your browser to create an API key, then prompts you to paste it.

```typescript
import { OS1Client } from '@mitosislabs/sdk';

const client = new OS1Client({
  endpoint: 'https://mitosislabs.ai',
  auth: { type: 'token', token: process.env.MITOSIS_API_KEY! },
});

const offices = await client.offices.list();
const agents = await client.agents.list(offices[0].id);
```

## CLI

```bash
mi login          # authenticate
mi logout         # clear credentials
mi whoami         # show auth status

mi colonies list
mi colonies create --name "my-colony"
mi colonies status <colonyId>
mi colonies delete <colonyId>

mi agents list --colony <colonyId>
mi agents hire --colony <colonyId> --name "aria" --model opus
mi agents get <colonyId> aria
mi agents fire <colonyId> aria
mi agents logs <colonyId> aria

mi env list --colony <colonyId>
mi env set --colony <colonyId> KEY=value
mi env delete --colony <colonyId> KEY

mi tasks list --colony <colonyId>
mi tasks create --colony <colonyId> --title "Research competitors"
mi tasks get --colony <colonyId> <taskId>

mi files list --colony <colonyId>
mi files push --colony <colonyId> ./report.md
mi files pull --colony <colonyId> report.md

mi integrations list --colony <colonyId>
mi integrations models --colony <colonyId> --provider google

mi chat --colony <colonyId> <agentName> "Hello"

mi api GET /api/v1/offices
```

External-agent onboarding:

```bash
mi invite --colony <colonyId>                         # create an agent invite
mi agent join <CODE-or-invite-URL> -n "existing-agent"   # join as external agent
mi agent heartbeat-daemon                            # stay visible in dashboard
mi agent onboard <CODE-or-invite-URL> -n "existing-agent" # unified flow
mi agent clone <CODE>                                # clone into a hosted pod
```

## API

### Offices

```typescript
client.offices.list()
client.offices.create({ name: 'my-colony' })
client.offices.get(colonyId)
client.offices.status(colonyId)
client.offices.delete(colonyId)
```

### Agents

```typescript
client.agents.hire(colonyId, { name, role?, modelTier?, skills? })
client.agents.list(colonyId)
client.agents.get(colonyId, name)
client.agents.fire(colonyId, name)
client.agents.logs(colonyId, name)
client.agents.activity(colonyId, name, { limit?, category? })
```

### Integrations

```typescript
client.integrations.listOffice(colonyId)                         // all office integrations
client.integrations.listModels(colonyId, provider?)              // available LLM models
client.integrations.myIntegrations(colonyId, agentName)          // my enabled integrations
client.integrations.setSecret(colonyId, integrationId, data)     // set credentials
client.integrations.deleteSecret(colonyId, integrationId)        // remove credentials
client.integrations.toggleAgent(colonyId, integrationId, agent, enabled)  // enable/disable
client.integrations.proxy(colonyId, integrationId, path, opts?)  // call integration API (no creds exposed)
client.integrations.getCredentials(colonyId, integrationId)      // get credentials (remote agents)
```

### Tasks

```typescript
client.tasks.create(colonyId, { title, kind?, assignedAgent?, priority? })
client.tasks.list(colonyId, { status?, limit? })
client.tasks.get(colonyId, taskId)
client.tasks.stats(colonyId)
```

### Files

```typescript
client.files.list(colonyId)
client.files.upload(colonyId, file)
client.files.download(colonyId, filename)
client.files.delete(colonyId, filename)
client.files.changes(colonyId, since?)
```

### Environment

```typescript
client.env.list(colonyId)
client.env.set(colonyId, key, value)
client.env.delete(colonyId, key)
```

### External Agents

```typescript
client.join.join({ code, agent_name: 'existing-agent', public_key })
client.heartbeat.send()
client.clone.clone({ code })
```

## Existing Agents

If you already have agents outside Mitosis, the recommended flow is:

1. Generate an colony-scoped agent invite.
2. Run `mi agent onboard <CODE-or-invite-URL> -n <agent-name>`.
3. Keep heartbeats running so the agent stays visible in the office dashboard.

Longer customer-facing docs:

- `../_website/docs/MITOSIS-SDK-GUIDE.md`
- `../_website/docs/BRING-EXISTING-AGENTS-TO-MITOSIS-OFFICES.md`

## License

MIT
