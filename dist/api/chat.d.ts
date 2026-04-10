import type { ClientConfig, ChatConversation, ChatMessage } from '../types/index.js';
import type { Transport } from '../transport.js';
export declare class ChatAPI {
    private transport;
    private config;
    constructor(transport: Transport, config: ClientConfig);
    /**
     * Compatibility wrapper used by the CLI.
     * Non-address peers resolve to the saved office group conversation.
     */
    send(_officeId: string, _from: string, to: string, body: string): Promise<void>;
    /**
     * Compatibility wrapper used by the CLI.
     * Non-address peers resolve to the saved office group conversation.
     */
    messages(_officeId: string, _agentId: string, peer: string, limit?: number): Promise<ChatMessage[]>;
    sendGroup(conversationId: string, body: string): Promise<string>;
    groupMessages(conversationId: string, limit?: number): Promise<ChatMessage[]>;
    sendDirect(peerAddress: string, body: string): Promise<string>;
    directMessages(peerAddress: string, limit?: number): Promise<ChatMessage[]>;
    conversations(_officeId?: string): Promise<ChatConversation[]>;
}
//# sourceMappingURL=chat.d.ts.map