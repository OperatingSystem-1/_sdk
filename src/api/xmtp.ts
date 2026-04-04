import type { Transport } from '../transport.js';
import type {
  XMTPConversation,
  XMTPGroup,
  XMTPMessage,
  SendXMTPMessageRequest,
  CreateGroupRequest,
} from '../types/index.js';

function base(officeId: string) {
  return `/api/v1/offices/${officeId}/xmtp`;
}

export class XMTPAPI {
  constructor(private transport: Transport) {}

  // ─── Conversations (DMs) ──────────────────────────────────────────

  async listConversations(officeId: string): Promise<XMTPConversation[]> {
    return this.transport.get<XMTPConversation[]>(`${base(officeId)}/conversations`);
  }

  async getMessages(
    officeId: string,
    conversationId: string,
    opts?: { limit?: number },
  ): Promise<XMTPMessage[]> {
    return this.transport.get<XMTPMessage[]>(
      `${base(officeId)}/conversations/${conversationId}/messages`,
      opts,
    );
  }

  async sendMessage(
    officeId: string,
    conversationId: string,
    req: SendXMTPMessageRequest,
  ): Promise<void> {
    await this.transport.post(
      `${base(officeId)}/conversations/${conversationId}/messages`,
      req,
    );
  }

  // ─── Groups ───────────────────────────────────────────────────────

  async listGroups(officeId: string): Promise<XMTPGroup[]> {
    return this.transport.get<XMTPGroup[]>(`${base(officeId)}/groups`);
  }

  async createGroup(officeId: string, req: CreateGroupRequest): Promise<XMTPGroup> {
    return this.transport.post<XMTPGroup>(`${base(officeId)}/groups`, req);
  }

  async getGroup(officeId: string, groupId: string): Promise<XMTPGroup> {
    return this.transport.get<XMTPGroup>(`${base(officeId)}/groups/${groupId}`);
  }

  async addMembers(officeId: string, groupId: string, members: string[]): Promise<void> {
    await this.transport.post(`${base(officeId)}/groups/${groupId}/add-members`, { members });
  }

  async removeMembers(officeId: string, groupId: string, members: string[]): Promise<void> {
    await this.transport.post(`${base(officeId)}/groups/${groupId}/remove-members`, { members });
  }

  async postMessage(
    officeId: string,
    groupId: string,
    req: SendXMTPMessageRequest,
  ): Promise<void> {
    await this.transport.post(`${base(officeId)}/groups/${groupId}/post-message`, req);
  }
}
