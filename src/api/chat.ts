import type { Transport } from '../transport.js';
import type { ChatMessage, ChatConversation } from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/xmtp`;
}

export class ChatAPI {
  constructor(private transport: Transport) {}

  /** Send a message to another agent. */
  async send(officeId: string, from: string, to: string, body: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/send`, { from, to, body });
  }

  /** Get message history between two agents. */
  async messages(
    officeId: string,
    agentId: string,
    peer: string,
    limit = 50,
  ): Promise<ChatMessage[]> {
    return this.transport.get<ChatMessage[]>(
      `${base(officeId)}/messages/${agentId}/${peer}`,
      { limit },
    );
  }

  /** List XMTP conversations for the office. */
  async conversations(officeId: string): Promise<ChatConversation[]> {
    return this.transport.get<ChatConversation[]>(`${base(officeId)}/conversations`);
  }
}
