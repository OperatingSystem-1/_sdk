import type { Transport } from '../transport.js';
import { EventEmitter } from 'node:events';

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
 * Connects to the chat-server's SSE stream via the office-manager proxy.
 * Emits 'message' events for incoming direct and group messages.
 */
export class MessageListener extends EventEmitter {
  private transport: Transport;
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  constructor(transport: Transport) {
    super();
    this.transport = transport;
  }

  /**
   * Start listening for messages.
   * Uses the OM XMTP proxy to reach the chat-server SSE stream.
   */
  async connect(officeId: string, agentId: string): Promise<void> {
    this.disconnect();
    this.abortController = new AbortController();

    const url = `${this.transport.endpoint}/api/v1/offices/${officeId}/xmtp/stream?agentId=${agentId}`;

    try {
      const headers: Record<string, string> = {};
      // Use agentKey if available, otherwise bearer token
      const config = (this.transport as any).config;
      if (config?.agentKey) {
        headers['X-Agent-Api-Key'] = config.agentKey;
      } else if (config?.auth?.type === 'token') {
        headers['Authorization'] = `Bearer ${config.auth.token}`;
      }

      const response = await fetch(url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connect failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body for SSE stream');
      }

      this.reconnectDelay = 1000; // Reset on successful connect
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
          if (line.startsWith('data: ')) {
            try {
              const msg: XMTPMessage = JSON.parse(line.slice(6));
              if (msg.type === 'direct_message' || msg.type === 'group_message') {
                this.emit('message', msg);
              }
            } catch {
              // Ignore malformed SSE data
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return; // Intentional disconnect
      this.emit('error', err);
    }

    // Auto-reconnect with exponential backoff
    if (this.abortController && !this.abortController.signal.aborted) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        this.connect(officeId, agentId).catch(() => {});
      }, this.reconnectDelay);
    }
  }

  /** Stop listening. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
