# OS-1 SDK

TypeScript SDK for the [OS-1](https://mitosislabs.ai) platform. Manage offices, agents, and integrations programmatically.

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

mi offices list
mi offices create --name "my-office"
mi offices status <officeId>
mi offices delete <officeId>

mi agents list --office <officeId>
mi agents hire --office <officeId> --name "aria" --model opus
mi agents get <officeId> aria
mi agents fire <officeId> aria
mi agents logs <officeId> aria

mi env list --office <officeId>
mi env set --office <officeId> KEY=value
mi env delete --office <officeId> KEY

mi tasks list --office <officeId>
mi tasks create --office <officeId> --title "Research competitors"
mi tasks get --office <officeId> <taskId>

mi files list --office <officeId>
mi files push --office <officeId> ./report.md
mi files pull --office <officeId> report.md

mi integrations list --office <officeId>
mi integrations models --office <officeId> --provider google

mi chat --office <officeId> <agentName> "Hello"

mi api GET /api/v1/offices
```

External-agent onboarding:

```bash
mi invite --office <officeId>                         # create an agent invite
mi agent join <CODE-or-invite-URL> -n "existing-agent"   # join as external agent
mi agent heartbeat-daemon                            # stay visible in dashboard
mi agent onboard <CODE-or-invite-URL> -n "existing-agent" # unified flow
mi agent clone <CODE>                                # clone into a hosted pod
```

## API

### Offices

```typescript
client.offices.list()
client.offices.create({ name: 'my-office' })
client.offices.get(officeId)
client.offices.status(officeId)
client.offices.delete(officeId)
```

### Agents

```typescript
client.agents.hire(officeId, { name, role?, modelTier?, skills? })
client.agents.list(officeId)
client.agents.get(officeId, name)
client.agents.fire(officeId, name)
client.agents.logs(officeId, name)
client.agents.activity(officeId, name, { limit?, category? })
```

### Integrations

```typescript
client.integrations.listOffice(officeId)                         // all office integrations
client.integrations.listModels(officeId, provider?)              // available LLM models
client.integrations.myIntegrations(officeId, agentName)          // my enabled integrations
client.integrations.setSecret(officeId, integrationId, data)     // set credentials
client.integrations.deleteSecret(officeId, integrationId)        // remove credentials
client.integrations.toggleAgent(officeId, integrationId, agent, enabled)  // enable/disable
client.integrations.proxy(officeId, integrationId, path, opts?)  // call integration API (no creds exposed)
client.integrations.getCredentials(officeId, integrationId)      // get credentials (remote agents)
```

### Tasks

```typescript
client.tasks.create(officeId, { title, kind?, assignedAgent?, priority? })
client.tasks.list(officeId, { status?, limit? })
client.tasks.get(officeId, taskId)
client.tasks.stats(officeId)
```

### Files

```typescript
client.files.list(officeId)
client.files.upload(officeId, file)
client.files.download(officeId, filename)
client.files.delete(officeId, filename)
client.files.changes(officeId, since?)
```

### Environment

```typescript
client.env.list(officeId)
client.env.set(officeId, key, value)
client.env.delete(officeId, key)
```

### External Agents

```typescript
client.join.join({ code, agent_name: 'existing-agent', public_key })
client.heartbeat.send()
client.clone.clone({ code })
```

## Existing Agents

If you already have agents outside Mitosis, the recommended flow is:

1. Generate an office-scoped agent invite.
2. Run `mi agent onboard <CODE-or-invite-URL> -n <agent-name>`.
3. Keep heartbeats running so the agent stays visible in the office dashboard.

Longer customer-facing docs:

- `../_website/docs/MITOSIS-SDK-GUIDE.md`
- `../_website/docs/BRING-EXISTING-AGENTS-TO-MITOSIS-OFFICES.md`

## License

MIT
