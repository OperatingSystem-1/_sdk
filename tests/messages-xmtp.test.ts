import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageListener } from '../src/api/messages.js';

const {
  getGroupConversation,
  getXmtpClient,
} = vi.hoisted(() => ({
  getGroupConversation: vi.fn(),
  getXmtpClient: vi.fn(),
}));

vi.mock('../src/xmtp/client.js', () => ({
  getGroupConversation,
  getXmtpClient,
}));

describe('MessageListener XMTP stream', () => {
  const transport = {
    endpoint: 'http://localhost:3000',
    auth: { type: 'token', token: 't' },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits group messages from the XMTP stream', async () => {
    getGroupConversation.mockResolvedValue({ id: 'group-123', name: 'Office Group' });

    let streamClosed = false;
    getXmtpClient.mockResolvedValue({
      conversations: {
        streamAllMessages: vi.fn().mockResolvedValue({
          next: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: {
                id: 'msg-1',
                content: 'hello group',
                senderInboxId: 'inbox-peer',
                conversationId: 'group-123',
                sentAt: new Date('2026-04-08T20:05:00Z'),
              },
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          end: vi.fn().mockImplementation(async () => {
            streamClosed = true;
          }),
        }),
      },
    });

    const listener = new MessageListener(transport, {
      endpoint: 'http://localhost:3000',
      auth: { type: 'token', token: 't' },
      signingKey: '1'.repeat(64),
      agentId: 'jared',
      xmtpGroupId: 'group-123',
    });

    const messagePromise = new Promise<any>((resolve) => {
      listener.once('message', resolve);
    });

    await listener.connect('office-1', 'jared');
    const message = await messagePromise;

    expect(message).toMatchObject({
      type: 'group_message',
      id: 'msg-1',
      body: 'hello group',
      from_agent: 'inbox-peer',
      group_id: 'group-123',
      group_name: 'Office Group',
    });

    listener.disconnect();
    expect(streamClosed).toBe(true);
  });

  it('falls back to the office bridge stream for UUID office-group ids', async () => {
    const chunks = [
      new TextEncoder().encode('data: {"type":"group_message","id":"m1","from_agent":"jared","body":"hello"}\n\n'),
    ];
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: true, value: undefined });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({ read }),
      },
    } as any));

    const listener = new MessageListener(transport, {
      endpoint: 'http://localhost:3000',
      auth: { type: 'token', token: 't' },
      agentKey: 'raw-api-key',
      xmtpGroupId: 'd18f2488-c29c-4bec-b01b-8cf23bf3e12e',
    });

    const messagePromise = new Promise<any>((resolve) => listener.once('message', resolve));
    await listener.connect('office-1', 'jared');
    await expect(messagePromise).resolves.toMatchObject({ id: 'm1', from_agent: 'jared', body: 'hello' });
  });
});
