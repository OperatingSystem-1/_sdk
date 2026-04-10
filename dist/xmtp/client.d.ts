import { Client, type Identifier } from '@xmtp/node-sdk';
import type { ClientConfig } from '../types/index.js';
type XmtpClient = Client<any>;
export declare function getXmtpIdentifier(address: string): Identifier;
export declare function getXmtpAddress(config: ClientConfig): string;
export declare function getXmtpClient(config: ClientConfig): Promise<XmtpClient>;
export declare function getGroupConversation(config: ClientConfig, conversationId: string): Promise<import("@xmtp/node-sdk").Group<any> | import("@xmtp/node-sdk").Dm<any>>;
/**
 * Create a new XMTP group conversation.
 * Members are specified as Ethereum addresses and added via identifiers.
 * Returns the group conversation object with its public conversation ID.
 */
export declare function createGroupConversation(config: ClientConfig, memberAddresses: string[], options?: {
    name?: string;
    description?: string;
}): Promise<import("@xmtp/node-sdk").Group<any>>;
export declare function getDmConversation(config: ClientConfig, peerAddress: string): Promise<import("@xmtp/node-sdk").Dm<any>>;
export {};
//# sourceMappingURL=client.d.ts.map