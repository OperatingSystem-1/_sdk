import { EventEmitter } from 'node:events';
import type { ClientConfig } from '../types/index.js';
import type { Transport } from '../transport.js';
export interface XMTPMessage {
    type: 'direct_message' | 'group_message' | 'whatsapp_inbound' | 'connected';
    id?: string;
    from_agent?: string;
    to_agent?: string;
    group_id?: string;
    group_name?: string;
    conversation_id?: string;
    body?: string;
    metadata?: Record<string, unknown>;
    created_at?: number;
    agentId?: string;
}
/**
 * Real-time XMTP message listener.
 *
 * Connects directly to the public XMTP network and emits decoded messages.
 */
export declare class MessageListener extends EventEmitter {
    private transport;
    private config;
    private isClosed;
    private reconnectTimer;
    private reconnectDelay;
    private stream;
    private abortController;
    private groupNames;
    constructor(transport: Transport, config: ClientConfig);
    private isInternalOfficeGroupId;
    private connectBridgeStream;
    connect(officeId: string, agentId: string): Promise<void>;
    disconnect(): void;
}
//# sourceMappingURL=messages.d.ts.map