import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAPI } from '../src/api/chat.js';

const {
  getGroupConversation,
  getDmConversation,
  getXmtpClient,
} = vi.hoisted(() => ({
  getGroupConversation: vi.fn(),
  getDmConversation: vi.fn(),
  getXmtpClient: vi.fn(),
}));

vi.mock('../src/xmtp/client.js', () => ({
  getGroupConversation,
  getDmConversation,
  getXmtpClient,
}));

describe('ChatAPI XMTP transport', () => {
  const transport = {
    post: vi.fn(),
    get: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends non-address peers through the saved XMTP group conversation', async () => {
    const send = vi.fn().mockResolvedValue('msg-1');
    getGroupConversation.mockResolvedValue({ send });

    const chat = new ChatAPI(transport, {
      endpoint: 'http://localhost:3000',
      auth: { type: 'token', token: 't' },
      signingKey: '1'.repeat(64),
      agentId: 'jared',
      officeId: 'office-1',
      xmtpGroupId: 'group-123',
    });

    await chat.send('office-1', 'jared', 'user', 'hello group');

    expect(getGroupConversation).toHaveBeenCalledWith(expect.anything(), 'group-123');
    expect(send).toHaveBeenCalledWith('hello group');
    expect(getDmConversation).not.toHaveBeenCalled();
  });

  it('sends hex-address peers through a direct XMTP conversation', async () => {
    const send = vi.fn().mockResolvedValue('msg-2');
    getDmConversation.mockResolvedValue({ send });

    const chat = new ChatAPI(transport, {
      endpoint: 'http://localhost:3000',
      auth: { type: 'token', token: 't' },
      signingKey: '1'.repeat(64),
      agentId: 'jared',
      officeId: 'office-1',
      xmtpGroupId: 'group-123',
    });

    await chat.send(
      'office-1',
      'jared',
      '0x1111111111111111111111111111111111111111',
      'hello dm',
    );

    expect(getDmConversation).toHaveBeenCalledWith(
      expect.anything(),
      '0x1111111111111111111111111111111111111111',
    );
    expect(send).toHaveBeenCalledWith('hello dm');
    expect(getGroupConversation).not.toHaveBeenCalled();
  });

  it('lists conversations from the XMTP client', async () => {
    getXmtpClient.mockResolvedValue({
      conversations: {
        list: vi.fn().mockResolvedValue([
          { id: 'group-123', name: 'Office Group', createdAt: new Date('2026-04-08T20:00:00Z') },
        ]),
      },
    });

    const chat = new ChatAPI(transport, {
      endpoint: 'http://localhost:3000',
      auth: { type: 'token', token: 't' },
      signingKey: '1'.repeat(64),
      agentId: 'jared',
      officeId: 'office-1',
      xmtpGroupId: 'group-123',
    });

    await expect(chat.conversations()).resolves.toEqual([
      {
        conversationId: 'group-123',
        peerAddress: 'group-123',
        groupName: 'Office Group',
        lastMessageAt: '2026-04-08T20:00:00.000Z',
      },
    ]);
  });

  it('uses the office bridge for UUID office-group ids', async () => {
    transport.post.mockResolvedValue({ messageId: 'bridge-msg-1' });
    transport.get.mockResolvedValue([
      { id: 'bridge-msg-1', from_agent: 'jared', to_agent: 'group', body: 'hello', created_at: 1 },
    ]);

    const chat = new ChatAPI(transport, {
      endpoint: 'http://localhost:3000',
      auth: { type: 'token', token: 't' },
      signingKey: '1'.repeat(64),
      agentId: 'jared',
      officeId: 'office-1',
      xmtpGroupId: 'd18f2488-c29c-4bec-b01b-8cf23bf3e12e',
    });

    await expect(chat.sendGroup('d18f2488-c29c-4bec-b01b-8cf23bf3e12e', 'hello')).resolves.toBe('bridge-msg-1');
    await expect(chat.groupMessages('d18f2488-c29c-4bec-b01b-8cf23bf3e12e', 5)).resolves.toHaveLength(1);

    expect(transport.post).toHaveBeenCalledWith(
      '/api/v1/offices/office-1/xmtp/groups/d18f2488-c29c-4bec-b01b-8cf23bf3e12e/send',
      { from: 'jared', body: 'hello' },
    );
    expect(transport.get).toHaveBeenCalledWith(
      '/api/v1/offices/office-1/xmtp/groups/d18f2488-c29c-4bec-b01b-8cf23bf3e12e/messages',
      { limit: 5 },
    );
  });
});
