# OS-1 SDK

TypeScript SDK for the [OS-1](https://mitosislabs.ai) platform. Manage offices, agents, and integrations programmatically.

## Install

```bash
npm install @os1/sdk
```

## Quick Start

```typescript
import { OS1Client } from '@os1/sdk';

const client = new OS1Client({
  endpoint: 'https://api.mitosislabs.ai',
  apiKey: process.env.OS1_API_KEY,
});

// List your offices
const offices = await client.offices.list();

// Hire an agent
const agent = await client.agents.hire(offices[0].id, {
  name: 'aria',
  role: 'researcher',
  modelTier: 'opus',
});

// Fetch the created agent
const created = await client.agents.get(offices[0].id, 'aria');
console.log(created.name);
```

## Authentication

Get your API key from the [OS-1 dashboard](https://mitosislabs.ai/dashboard/settings).

```typescript
const client = new OS1Client({
  endpoint: 'https://api.mitosislabs.ai',
  apiKey: 'os1_...',
});
```

Or use the CLI:

```bash
os1 init --key os1_...
os1 offices list
os1 agents list --office <id>
```

## API

### Offices

```typescript
client.offices.list()
client.offices.create({ name: 'my-office' })
client.offices.get(officeId)
client.offices.status(officeId)
client.offices.delete(officeId)
client.offices.suspend(officeId)
client.offices.resume(officeId)
```

### Agents

```typescript
client.agents.hire(officeId, { name, role?, modelTier?, skills? })
client.agents.list(officeId)
client.agents.get(officeId, name)
client.agents.update(officeId, name, { role?, modelTier?, skills? })
client.agents.fire(officeId, name)
client.agents.logs(officeId, name)
client.agents.activity(officeId, name, { limit?, category? })
client.agents.promote(officeId, name, { modelTier })
```

### Integrations

```typescript
client.integrations.listModels(officeId)
client.integrations.setSecret(officeId, integrationId, key)
client.integrations.deleteSecret(officeId, integrationId)
client.integrations.toggleAgent(officeId, integrationId, agentName, enabled)
```

## CLI

```bash
# Setup
os1 init --endpoint https://api.mitosislabs.ai --key <api-key>

# Offices
os1 offices list
os1 offices create --name "my-office"
os1 offices status <officeId>

# Agents
os1 agents list --office <officeId>
os1 agents hire --office <officeId> --name "aria" --model opus
os1 agents fire <officeId> aria
os1 agents logs <officeId> aria

# Raw API
os1 api GET /api/v1/offices
```

## License

MIT
