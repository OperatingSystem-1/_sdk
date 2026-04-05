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

/**
 * XMTP API matching office-manager router.go routes:
 *   GET  /xmtp/conversations
 *   GET  /xmtp/messages/{agentName}/{peerName}
 *   POST /xmtp/send
 *   GET  /xmtp/groups
 *   POST /xmtp/groups
 *   GET  /xmtp/groups/{groupId}/messages
 *   POST /xmtp/groups/{groupId}/send
 *   POST /xmtp/groups/{groupId}/members
 *   DELETE /xmtp/groups/{groupId}/members/{agentName}
 *   PATCH /xmtp/groups/{groupId}
 */
export class XMTPAPI {
  constructor(private transport: Transport) {}

  // ─── Conversations (DMs) ──────────────────────────────────────────

  async listConversations(officeId: string): Promise<XMTPConversation[]> {
    return this.transport.get<XMTPConversation[]>(`${base(officeId)}/conversations`);
  }

  async getMessages(
    officeId: string,
    agentName: string,
    peerName: string,
    opts?: { limit?: number },
  ): Promise<XMTPMessage[]> {
    return this.transport.get<XMTPMessage[]>(
      `${base(officeId)}/messages/${agentName}/${peerName}`,
      opts,
    );
  }

  async send(officeId: string, req: SendXMTPMessageRequest): Promise<void> {
    await this.transport.post(`${base(officeId)}/send`, req);
  }

  // ─── Groups ───────────────────────────────────────────────────────

  async listGroups(officeId: string): Promise<XMTPGroup[]> {
    return this.transport.get<XMTPGroup[]>(`${base(officeId)}/groups`);
  }

  async createGroup(officeId: string, req: CreateGroupRequest): Promise<XMTPGroup> {
    return this.transport.post<XMTPGroup>(`${base(officeId)}/groups`, req);
  }

  async getGroupMessages(
    officeId: string,
    groupId: string,
    opts?: { limit?: number },
  ): Promise<XMTPMessage[]> {
    return this.transport.get<XMTPMessage[]>(
      `${base(officeId)}/groups/${groupId}/messages`,
      opts,
    );
  }

  async sendGroupMessage(
    officeId: string,
    groupId: string,
    req: SendXMTPMessageRequest,
  ): Promise<void> {
    await this.transport.post(`${base(officeId)}/groups/${groupId}/send`, req);
  }

  async addMember(officeId: string, groupId: string, agentName: string): Promise<void> {
    await this.transport.post(`${base(officeId)}/groups/${groupId}/members`, { agentName });
  }

  async removeMember(officeId: string, groupId: string, agentName: string): Promise<void> {
    await this.transport.delete(`${base(officeId)}/groups/${groupId}/members/${agentName}`);
  }

  async renameGroup(officeId: string, groupId: string, name: string): Promise<void> {
    await this.transport.patch(`${base(officeId)}/groups/${groupId}`, { name });
  }
}
