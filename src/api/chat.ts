import type { ClientConfig, ChatConversation, ChatMessage } from '../types/index.js';
import type { Transport } from '../transport.js';
import { getDmConversation, getGroupConversation, getXmtpClient } from '../xmtp/client.js';

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isInternalOfficeGroupId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  return JSON.stringify(content);
}

function mapMessage(message: any, target: string): ChatMessage {
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
  constructor(private transport: Transport, private config: ClientConfig) {}

  /**
   * Compatibility wrapper used by the CLI.
   * Non-address peers resolve to the saved office group conversation.
   */
  async send(_officeId: string, _from: string, to: string, body: string): Promise<void> {
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
  async messages(
    _officeId: string,
    _agentId: string,
    peer: string,
    limit = 50,
  ): Promise<ChatMessage[]> {
    if (isAddress(peer)) {
      return this.directMessages(peer, limit);
    }

    if (!this.config.xmtpGroupId) {
      throw new Error('No office XMTP group configured for this agent');
    }
    return this.groupMessages(this.config.xmtpGroupId, limit);
  }

  async sendGroup(conversationId: string, body: string): Promise<string> {
    if (isInternalOfficeGroupId(conversationId)) {
      if (!this.config.officeId) {
        throw new Error('No office id configured for office group chat');
      }
      const result = await this.transport.post<{ messageId: string }>(
        `/api/v1/offices/${this.config.officeId}/xmtp/groups/${encodeURIComponent(conversationId)}/send`,
        { from: this.config.agentId, body },
      );
      return result.messageId;
    }

    const conversation = await getGroupConversation(this.config, conversationId);
    return conversation.send(body);
  }

  async groupMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
    if (isInternalOfficeGroupId(conversationId)) {
      if (!this.config.officeId) {
        throw new Error('No office id configured for office group chat');
      }
      return this.transport.get<ChatMessage[]>(
        `/api/v1/offices/${this.config.officeId}/xmtp/groups/${encodeURIComponent(conversationId)}/messages`,
        { limit },
      );
    }

    const conversation = await getGroupConversation(this.config, conversationId);
    const messages = await conversation.messages({ limit });
    return messages.map((message) => mapMessage(message, conversationId));
  }

  async sendDirect(peerAddress: string, body: string): Promise<string> {
    const conversation = await getDmConversation(this.config, peerAddress);
    return conversation.send(body);
  }

  async directMessages(peerAddress: string, limit = 50): Promise<ChatMessage[]> {
    const conversation = await getDmConversation(this.config, peerAddress);
    const messages = await conversation.messages({ limit });
    return messages.map((message) => mapMessage(message, peerAddress));
  }

  async conversations(_officeId?: string): Promise<ChatConversation[]> {
    const client = await getXmtpClient(this.config);
    const conversations = await client.conversations.list();
    return conversations.map((conversation: any) => ({
      conversationId: conversation.id,
      peerAddress: conversation.peerInboxId ?? conversation.id,
      groupName: 'name' in conversation ? conversation.name : undefined,
      lastMessageAt: conversation.createdAt?.toISOString?.(),
    }));
  }
}
