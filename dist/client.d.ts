import type { ClientConfig } from './types/index.js';
import { Transport } from './transport.js';
import { OfficesAPI } from './api/offices.js';
import { AgentsAPI } from './api/agents.js';
import { IntegrationsAPI } from './api/integrations.js';
import { EnvAPI } from './api/env.js';
import { TasksAPI } from './api/tasks.js';
import { FilesAPI } from './api/files.js';
import { InvitesAPI } from './api/invites.js';
import { ChatAPI } from './api/chat.js';
import { CloneAPI } from './api/clone.js';
import { JoinAPI } from './api/join.js';
import { HeartbeatAPI } from './api/heartbeat.js';
import { MessageListener } from './api/messages.js';
/**
 * OS-1 SDK client.
 *
 * @example
 * ```typescript
 * const client = new OS1Client({
 *   endpoint: 'https://m.mitosislabs.ai',
 *   auth: { type: 'token', token: process.env.OS1_API_KEY },
 * });
 *
 * const offices = await client.offices.list();
 * const agents = await client.agents.list(offices[0].id);
 * ```
 */
export declare class OS1Client {
    readonly transport: Transport;
    readonly offices: OfficesAPI;
    readonly agents: AgentsAPI;
    readonly integrations: IntegrationsAPI;
    readonly env: EnvAPI;
    readonly tasks: TasksAPI;
    readonly files: FilesAPI;
    readonly invites: InvitesAPI;
    readonly chat: ChatAPI;
    readonly clone: CloneAPI;
    readonly join: JoinAPI;
    readonly heartbeat: HeartbeatAPI;
    readonly messages: MessageListener;
    constructor(config: ClientConfig);
    /** Health check — verify connectivity. */
    health(): Promise<boolean>;
}
//# sourceMappingURL=client.d.ts.map