import { describe, it, expect, vi } from 'vitest';
import { XMTPSession } from '../src/xmtp/session.js';
import { XMTPChannel } from '../src/xmtp/channel.js';

// Mock transport that simulates the XMTP API
function mockTransport(responses: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];

  return {
    calls,
    get: vi.fn(async (path: string, query?: Record<string, unknown>) => {
      calls.push({ method: 'GET', path });
      if (path.includes('/conversations') && !path.includes('/messages')) {
        return responses.conversations ?? [];
      }
      if (path.includes('/messages')) {
        return responses.messages ?? [];
      }
      return [];
    }),
    post: vi.fn(async (path: string, body?: unknown) => {
      calls.push({ method: 'POST', path, body });
      return responses.post ?? {};
    }),
    endpoint: 'http://test:8080',
  } as any;
}

describe('XMTPSession', () => {
  it('negotiates a session and sends SESSION_START', async () => {
    const ackMessage = {
      from_agent: 'test-agent',
      content: JSON.stringify({
        type: '__SESSION_ACK__',
        session_id: '', // Will be matched after we know the session ID
        capabilities: ['chat', 'tasks'],
      }),
      created_at: new Date().toISOString(),
    };

    // Transport that returns ACK on second message fetch
    let messageCallCount = 0;
    const transport = mockTransport({ conversations: [] });
    transport.get = vi.fn(async (path: string) => {
      if (path.includes('/conversations') && !path.includes('/messages')) {
        return [];
      }
      if (path.includes('/messages')) {
        messageCallCount++;
        if (messageCallCount >= 2) {
          // Return ACK with the session ID from the SESSION_START message
          const startCall = transport.calls.find((c: any) =>
            c.method === 'POST' && c.body?.content?.includes('__SESSION_START__'),
          );
          if (startCall) {
            const startPayload = JSON.parse((startCall.body as any).content);
            ackMessage.content = JSON.stringify({
              type: '__SESSION_ACK__',
              session_id: startPayload.session_id,
              capabilities: ['chat', 'tasks'],
            });
          }
          return [ackMessage];
        }
        return [];
      }
      return [];
    });

    const session = new XMTPSession(transport, 'office-1', 'test-agent');
    const negotiation = await session.negotiate(5000);

    expect(negotiation.officeId).toBe('office-1');
    expect(negotiation.agentName).toBe('test-agent');
    expect(negotiation.sessionId).toBeTruthy();
    expect(negotiation.capabilities).toEqual(['chat', 'tasks']);
  });

  it('falls back gracefully when agent doesnt support session protocol', async () => {
    const transport = mockTransport({ conversations: [], messages: [] });

    const session = new XMTPSession(transport, 'office-1', 'legacy-agent');
    const negotiation = await session.negotiate(2000);

    expect(negotiation.officeId).toBe('office-1');
    expect(negotiation.agentName).toBe('legacy-agent');
    expect(negotiation.capabilities).toEqual([]);
  });

  it('filters out control messages from receive()', async () => {
    const now = new Date();
    const transport = mockTransport();
    transport.get = vi.fn(async (path: string) => {
      if (path.includes('/conversations') && !path.includes('/messages')) return [];
      if (path.includes('/messages')) {
        return [
          {
            from_agent: 'agent',
            content: 'Hello! How can I help?',
            created_at: new Date(now.getTime() + 5000).toISOString(),
          },
          {
            from_agent: 'agent',
            content: JSON.stringify({ type: '__SESSION_ACK__', session_id: 'x' }),
            created_at: new Date(now.getTime() + 1000).toISOString(),
          },
        ];
      }
      return [];
    });

    const session = new XMTPSession(transport, 'office-1', 'agent');
    await session.negotiate(1000);

    const messages = await session.receive();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello! How can I help?');
  });

  it('sends SESSION_END on close', async () => {
    const transport = mockTransport({ conversations: [], messages: [] });
    const session = new XMTPSession(transport, 'office-1', 'agent');
    await session.negotiate(1000);
    await session.close();

    const endCall = transport.calls.find(
      (c: any) => c.method === 'POST' && c.body?.content?.includes('__SESSION_END__'),
    );
    expect(endCall).toBeTruthy();
    expect(session.isOpen).toBe(false);
  });
});

describe('XMTPChannel', () => {
  it('reuses existing sessions', async () => {
    const transport = mockTransport({ conversations: [], messages: [] });
    const channel = new XMTPChannel(transport);

    const s1 = await channel.openSession('office-1', 'agent');
    const s2 = await channel.openSession('office-1', 'agent');

    expect(s1).toBe(s2);
  });

  it('tracks active sessions', async () => {
    const transport = mockTransport({ conversations: [], messages: [] });
    const channel = new XMTPChannel(transport);

    await channel.negotiateSession('office-1', 'agent-a', 1000);
    await channel.negotiateSession('office-1', 'agent-b', 1000);

    const sessions = channel.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it('closes all sessions', async () => {
    const transport = mockTransport({ conversations: [], messages: [] });
    const channel = new XMTPChannel(transport);

    await channel.negotiateSession('office-1', 'agent-a', 1000);
    await channel.negotiateSession('office-1', 'agent-b', 1000);

    await channel.closeAll();
    expect(channel.listSessions()).toHaveLength(0);
  });
});
