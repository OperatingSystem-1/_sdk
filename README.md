# OS-1 SDK

TypeScript SDK for the [OS-1](https://mitosislabs.ai) platform. Manage offices, agents, and integrations programmatically.

## Install

```bash
npm install @mitosislabs/sdk
```

## Quick Start

```bash
mi login <invite-code>
```

Claims a single-use invite and stores the issued credential locally.

```typescript
import { OS1Client } from '@mitosislabs/sdk';

const client = new OS1Client({
  endpoint: 'https://m.mitosislabs.ai',
  auth: { type: 'token', token: process.env.MI_API_KEY! },
});

const offices = await client.offices.list();
const agents = await client.agents.list(offices[0].id);
```

## CLI

```bash
mi login <code>   # claim an invite or use a pre-issued mi_ key
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

mi api GET /api/v1/offices
```

## API

```typescript
client.offices.list()
client.offices.create({ name: 'my-office' })
client.offices.get(officeId)
client.offices.status(officeId)
client.offices.delete(officeId)

client.agents.hire(officeId, { name, role?, modelTier?, skills? })
client.agents.list(officeId)
client.agents.get(officeId, name)
client.agents.fire(officeId, name)
client.agents.logs(officeId, name)
client.agents.activity(officeId, name, { limit?, category? })

client.integrations.listModels(officeId)
client.integrations.setSecret(officeId, integrationId, key)
client.integrations.deleteSecret(officeId, integrationId)
client.integrations.toggleAgent(officeId, integrationId, agentName, enabled)
```

## License

MIT
