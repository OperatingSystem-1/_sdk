import { EventEmitter } from 'node:events';
import type { ClientConfig } from '../types/index.js';
import type { Transport } from '../transport.js';
import { getGroupConversation, getXmtpClient } from '../xmtp/client.js';

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
export class MessageListener extends EventEmitter {
  private isClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private stream: { next(): Promise<{ done: boolean; value: any }>; end(): Promise<unknown> } | null = null;
  private abortController: AbortController | null = null;
  private groupNames = new Map<string, string>();

  constructor(private transport: Transport, private config: ClientConfig) {
    super();
  }

  private isInternalOfficeGroupId(value?: string | null): boolean {
    return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async connectBridgeStream(officeId: string, agentId: string): Promise<void> {
    this.abortController = new AbortController();
    const url = `${this.transport.endpoint}/api/v1/offices/${officeId}/xmtp/stream?agentId=${encodeURIComponent(agentId)}`;

    const response = await fetch(url, {
      headers: this.config.agentKey
        ? { 'X-Agent-Api-Key': this.config.agentKey }
        : this.config.auth.type === 'token'
          ? { Authorization: `Bearer ${this.config.auth.token}` }
          : {},
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connect failed: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('No response body for SSE stream');
    }

    this.reconnectDelay = 1000;
    this.emit('connected');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const msg: XMTPMessage = JSON.parse(line.slice(6));
          this.emit('message', msg);
        } catch {
          // ignore malformed data
        }
      }
    }
  }

  async connect(officeId: string, agentId: string): Promise<void> {
    this.disconnect();
    this.isClosed = false;

    try {
      if (this.isInternalOfficeGroupId(this.config.xmtpGroupId)) {
        await this.connectBridgeStream(officeId, agentId);
        return;
      }

      const client = await getXmtpClient(this.config);
      if (this.config.xmtpGroupId) {
        try {
          const group = await getGroupConversation(this.config, this.config.xmtpGroupId);
          if ('name' in group && typeof group.name === 'string') {
            this.groupNames.set(group.id, group.name);
          }
        } catch {
          // Group chat is optional for DM-only usage.
        }
      }

      this.stream = await client.conversations.streamAllMessages();
      this.reconnectDelay = 1000;
      this.emit('connected');

      while (true) {
        if (!this.stream) break;
        const { done, value } = await this.stream.next();
        if (done) break;
        if (!value) continue;

        const isGroup = value.conversationId === this.config.xmtpGroupId;
        const msg: XMTPMessage = {
          type: isGroup ? 'group_message' : 'direct_message',
          id: value.id,
          body: typeof value.content === 'string' ? value.content : JSON.stringify(value.content),
          from_agent: value.senderInboxId,
          conversation_id: value.conversationId,
          group_id: isGroup ? value.conversationId : undefined,
          group_name: this.groupNames.get(value.conversationId),
          created_at: value.sentAt.getTime(),
          agentId,
          metadata: { officeId },
        };
        this.emit('message', msg);
      }
    } catch (err: any) {
      if (this.isClosed) return;
      this.emit('error', err);
    }

    if (!this.isClosed) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        this.connect(officeId, agentId).catch(() => {});
      }, this.reconnectDelay);
    }
  }

  disconnect(): void {
    this.isClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stream) {
      this.stream.end().catch(() => {});
      this.stream = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
