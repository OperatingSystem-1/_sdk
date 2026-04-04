import type { Transport } from '../transport.js';
import { XMTPSession } from './session.js';
import type { SessionNegotiation } from '../types/index.js';

/**
 * High-level XMTP channel manager.
 * Creates and manages sessions with agents, handles reconnection,
 * and provides a clean interface for multi-agent communication.
 */
export class XMTPChannel {
  private transport: Transport;
  private sessions: Map<string, XMTPSession> = new Map();

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /**
   * Session key for deduplication.
   */
  private key(officeId: string, agentName: string): string {
    return `${officeId}:${agentName}`;
  }

  /**
   * Open a session with an agent. Returns existing session if already open.
   */
  async openSession(officeId: string, agentName: string): Promise<XMTPSession> {
    const k = this.key(officeId, agentName);
    const existing = this.sessions.get(k);
    if (existing?.isOpen) return existing;

    const session = new XMTPSession(this.transport, officeId, agentName);
    this.sessions.set(k, session);
    return session;
  }

  /**
   * Negotiate and open a session in one call.
   */
  async negotiateSession(
    officeId: string,
    agentName: string,
    timeoutMs?: number,
  ): Promise<SessionNegotiation> {
    const session = await this.openSession(officeId, agentName);
    return session.negotiate(timeoutMs);
  }

  /**
   * Send a message to an agent. Opens/negotiates session if needed.
   */
  async send(officeId: string, agentName: string, content: string): Promise<void> {
    const session = await this.openSession(officeId, agentName);
    if (!session.negotiation) {
      await session.negotiate();
    }
    await session.send(content);
  }

  /**
   * Get an active session.
   */
  getSession(officeId: string, agentName: string): XMTPSession | undefined {
    return this.sessions.get(this.key(officeId, agentName));
  }

  /**
   * Close a specific session.
   */
  async closeSession(officeId: string, agentName: string): Promise<void> {
    const k = this.key(officeId, agentName);
    const session = this.sessions.get(k);
    if (session) {
      await session.close();
      this.sessions.delete(k);
    }
  }

  /**
   * Close all sessions.
   */
  async closeAll(): Promise<void> {
    const closures = [...this.sessions.values()].map((s) => s.close());
    await Promise.allSettled(closures);
    this.sessions.clear();
  }

  /**
   * List active sessions.
   */
  listSessions(): Array<{ officeId: string; agentName: string; sessionId: string }> {
    const result: Array<{ officeId: string; agentName: string; sessionId: string }> = [];
    for (const [key, session] of this.sessions) {
      if (session.isOpen && session.negotiation) {
        const [officeId, agentName] = key.split(':');
        result.push({
          officeId,
          agentName,
          sessionId: session.negotiation.sessionId,
        });
      }
    }
    return result;
  }
}
