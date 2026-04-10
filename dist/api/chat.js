import { getDmConversation, getGroupConversation, getXmtpClient } from '../xmtp/client.js';
function isAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
}
function isInternalOfficeGroupId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function contentToText(content) {
    if (typeof content === 'string')
        return content;
    if (content == null)
        return '';
    return JSON.stringify(content);
}
function mapMessage(message, target) {
    return {
        id: message.id,
        from_agent: message.senderInboxId,
        to_agent: target,
        body: contentToText(message.content),
        metadata: {
            conversationId: message.conversationId,
            sentAtNs: message.sentAtNs,
        },
        created_at: message.sentAt.getTime(),
    };
}
export class ChatAPI {
    transport;
    config;
    constructor(transport, config) {
        this.transport = transport;
        this.config = config;
    }
    /**
     * Compatibility wrapper used by the CLI.
     * Non-address peers resolve to the saved office group conversation.
     */
    async send(_officeId, _from, to, body) {
        if (isAddress(to)) {
            await this.sendDirect(to, body);
            return;
        }
        if (!this.config.xmtpGroupId) {
            throw new Error('No office XMTP group configured for this agent');
        }
        await this.sendGroup(this.config.xmtpGroupId, body);
    }
    /**
     * Compatibility wrapper used by the CLI.
     * Non-address peers resolve to the saved office group conversation.
     */
    async messages(_officeId, _agentId, peer, limit = 50) {
        if (isAddress(peer)) {
            return this.directMessages(peer, limit);
        }
        if (!this.config.xmtpGroupId) {
            throw new Error('No office XMTP group configured for this agent');
        }
        return this.groupMessages(this.config.xmtpGroupId, limit);
    }
    async sendGroup(conversationId, body) {
        if (isInternalOfficeGroupId(conversationId)) {
            if (!this.config.officeId) {
                throw new Error('No office id configured for office group chat');
            }
            const result = await this.transport.post(`/api/v1/offices/${this.config.officeId}/xmtp/groups/${encodeURIComponent(conversationId)}/send`, { from: this.config.agentId, body });
            return result.messageId;
        }
        const conversation = await getGroupConversation(this.config, conversationId);
        return conversation.send(body);
    }
    async groupMessages(conversationId, limit = 50) {
        if (isInternalOfficeGroupId(conversationId)) {
            if (!this.config.officeId) {
                throw new Error('No office id configured for office group chat');
            }
            return this.transport.get(`/api/v1/offices/${this.config.officeId}/xmtp/groups/${encodeURIComponent(conversationId)}/messages`, { limit });
        }
        const conversation = await getGroupConversation(this.config, conversationId);
        const messages = await conversation.messages({ limit });
        return messages.map((message) => mapMessage(message, conversationId));
    }
    async sendDirect(peerAddress, body) {
        const conversation = await getDmConversation(this.config, peerAddress);
        return conversation.send(body);
    }
    async directMessages(peerAddress, limit = 50) {
        const conversation = await getDmConversation(this.config, peerAddress);
        const messages = await conversation.messages({ limit });
        return messages.map((message) => mapMessage(message, peerAddress));
    }
    async conversations(_officeId) {
        const client = await getXmtpClient(this.config);
        const conversations = await client.conversations.list();
        return conversations.map((conversation) => ({
            conversationId: conversation.id,
            peerAddress: conversation.peerInboxId ?? conversation.id,
            groupName: 'name' in conversation ? conversation.name : undefined,
            lastMessageAt: conversation.createdAt?.toISOString?.(),
        }));
    }
}
//# sourceMappingURL=chat.js.map