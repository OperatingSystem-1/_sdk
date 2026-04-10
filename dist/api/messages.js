import { EventEmitter } from 'node:events';
import { getGroupConversation, getXmtpClient } from '../xmtp/client.js';
/**
 * Real-time XMTP message listener.
 *
 * Connects directly to the public XMTP network and emits decoded messages.
 */
export class MessageListener extends EventEmitter {
    transport;
    config;
    isClosed = false;
    reconnectTimer = null;
    reconnectDelay = 1000;
    stream = null;
    abortController = null;
    groupNames = new Map();
    constructor(transport, config) {
        super();
        this.transport = transport;
        this.config = config;
    }
    isInternalOfficeGroupId(value) {
        return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }
    async connectBridgeStream(officeId, agentId) {
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
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.startsWith('data: '))
                    continue;
                try {
                    const msg = JSON.parse(line.slice(6));
                    this.emit('message', msg);
                }
                catch {
                    // ignore malformed data
                }
            }
        }
    }
    async connect(officeId, agentId) {
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
                }
                catch {
                    // Group chat is optional for DM-only usage.
                }
            }
            this.stream = await client.conversations.streamAllMessages();
            this.reconnectDelay = 1000;
            this.emit('connected');
            while (true) {
                if (!this.stream)
                    break;
                const { done, value } = await this.stream.next();
                if (done)
                    break;
                if (!value)
                    continue;
                const isGroup = value.conversationId === this.config.xmtpGroupId;
                const msg = {
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
        }
        catch (err) {
            if (this.isClosed)
                return;
            this.emit('error', err);
        }
        if (!this.isClosed) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
                this.connect(officeId, agentId).catch(() => { });
            }, this.reconnectDelay);
        }
    }
    disconnect() {
        this.isClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.stream) {
            this.stream.end().catch(() => { });
            this.stream = null;
        }
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
//# sourceMappingURL=messages.js.map