import { randomUUID } from 'node:crypto';
import type { Transport } from '../transport.js';
import type {
  XMTPConversation,
  XMTPMessage,
  SessionNegotiation,
} from '../types/index.js';
import { OS1Error } from '../types/index.js';

const SESSION_START = '__SESSION_START__';
const SESSION_ACK = '__SESSION_ACK__';
const SESSION_END = '__SESSION_END__';

/**
 * Active XMTP session with an agent.
 * Handles the session negotiation protocol and provides a clean interface
 * for bidirectional messaging.
 */
export class XMTPSession {
  private transport: Transport;
  private officeId: string;
  private agentName: string;
  private conversationId: string | null = null;
  private sessionId: string;
  private cursor: number = 0;
  private _negotiation: SessionNegotiation | null = null;
  private closed = false;

  constructor(transport: Transport, officeId: string, agentName: string) {
    this.transport = transport;
    this.officeId = officeId;
    this.agentName = agentName;
    this.sessionId = randomUUID();
  }

  /**
   * Negotiate a session with the target agent.
   *
   * Protocol:
   * 1. Find or create a conversation with the agent
   * 2. Send SESSION_START control message
   * 3. Wait for SESSION_ACK response
   * 4. Return session metadata with agent capabilities
   */
  async negotiate(timeoutMs = 30000): Promise<SessionNegotiation> {
    if (this._negotiation) return this._negotiation;

    // Find existing conversation or we'll create one via first message
    const conversations = await this.transport.get<XMTPConversation[]>(
      `/api/v1/offices/${this.officeId}/xmtp/conversations`,
    );

    // Look for existing conversation with this agent
    const existing = conversations.find((c) => c.peer === this.agentName);
    if (existing) {
      this.conversationId = existing.id;
    }

    // If no existing conversation, use the agent name as conversationId
    // The chat-server will create the conversation on first message
    if (!this.conversationId) {
      this.conversationId = this.agentName;
    }

    // Send session start
    this.cursor = Date.now();
    await this.transport.post(
      `/api/v1/offices/${this.officeId}/xmtp/conversations/${this.conversationId}/messages`,
      {
        agent_id: 'admin-sdk',
        content: JSON.stringify({
          type: SESSION_START,
          session_id: this.sessionId,
          capabilities_request: true,
          timestamp: new Date().toISOString(),
        }),
      },
    );

    // Wait for ACK
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const messages = await this.transport.get<XMTPMessage[]>(
        `/api/v1/offices/${this.officeId}/xmtp/conversations/${this.conversationId}/messages`,
        { limit: 10 },
      );

      for (const msg of messages) {
        if (msg.from_agent === this.agentName) {
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.type === SESSION_ACK && parsed.session_id === this.sessionId) {
              this._negotiation = {
                sessionId: this.sessionId,
                officeId: this.officeId,
                agentName: this.agentName,
                conversationId: this.conversationId,
                capabilities: parsed.capabilities ?? [],
                startedAt: new Date().toISOString(),
              };
              this.cursor = Date.now();
              return this._negotiation;
            }
          } catch {
            // Not a control message, skip
          }
        }
      }

      // Poll interval
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Timeout — create session without ACK (agent may not support protocol)
    this._negotiation = {
      sessionId: this.sessionId,
      officeId: this.officeId,
      agentName: this.agentName,
      conversationId: this.conversationId,
      capabilities: [],
      startedAt: new Date().toISOString(),
    };
    return this._negotiation;
  }

  /**
   * Send a message to the agent in this session.
   */
  async send(content: string): Promise<void> {
    if (this.closed) throw new Error('Session is closed');
    if (!this.conversationId) throw new Error('Session not negotiated');

    await this.transport.post(
      `/api/v1/offices/${this.officeId}/xmtp/conversations/${this.conversationId}/messages`,
      {
        agent_id: 'admin-sdk',
        content,
      },
    );
  }

  /**
   * Poll for new messages from the agent.
   */
  async receive(opts?: { limit?: number }): Promise<XMTPMessage[]> {
    if (!this.conversationId) throw new Error('Session not negotiated');

    const messages = await this.transport.get<XMTPMessage[]>(
      `/api/v1/offices/${this.officeId}/xmtp/conversations/${this.conversationId}/messages`,
      { limit: opts?.limit ?? 20 },
    );

    // Filter to only agent messages newer than cursor
    const agentMessages = messages.filter(
      (m) => m.from_agent === this.agentName && new Date(m.created_at).getTime() > this.cursor,
    );

    if (agentMessages.length > 0) {
      const newest = Math.max(...agentMessages.map((m) => new Date(m.created_at).getTime()));
      this.cursor = newest;
    }

    // Filter out control messages
    return agentMessages.filter((m) => {
      try {
        const parsed = JSON.parse(m.content);
        return !parsed.type?.startsWith('__SESSION_');
      } catch {
        return true; // Not JSON = regular message
      }
    });
  }

  /**
   * Stream messages from the agent (polling-based async generator).
   */
  async *stream(pollIntervalMs = 2000): AsyncGenerator<XMTPMessage> {
    while (!this.closed) {
      const messages = await this.receive();
      for (const msg of messages) {
        yield msg;
      }
      if (!this.closed) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }
  }

  /**
   * Close the session.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.conversationId) {
      try {
        await this.transport.post(
          `/api/v1/offices/${this.officeId}/xmtp/conversations/${this.conversationId}/messages`,
          {
            agent_id: 'admin-sdk',
            content: JSON.stringify({
              type: SESSION_END,
              session_id: this.sessionId,
              timestamp: new Date().toISOString(),
            }),
          },
        );
      } catch {
        // Best effort — session end is not critical
      }
    }
  }

  get negotiation(): SessionNegotiation | null {
    return this._negotiation;
  }

  get isOpen(): boolean {
    return !this.closed;
  }
}
