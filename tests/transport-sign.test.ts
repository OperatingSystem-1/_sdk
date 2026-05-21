import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { generateKeypair } from '../src/auth/keys.js';
import { Transport } from '../src/transport.js';

/**
 * Starts a one-shot HTTP server that captures the first request and resolves
 * with the headers it received. Returns [url, captured-promise].
 */
function captureServer(): Promise<{ url: string; headersPromise: Promise<Record<string, string>> }> {
  return new Promise((resolve) => {
    let resolveHeaders: (h: Record<string, string>) => void;
    const headersPromise = new Promise<Record<string, string>>((r) => {
      resolveHeaders = r;
    });

    const server = createServer((req, res) => {
      resolveHeaders(req.headers as Record<string, string>);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      server.close();
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${addr.port}`, headersPromise });
    });
  });
}

describe('Transport with signingKey', () => {
  it('sends X-Agent-Id, X-Timestamp, X-Signature on every request', async () => {
    const kp = generateKeypair();
    const { url, headersPromise } = await captureServer();

    const transport = new Transport({
      endpoint: url,
      auth: { type: 'token', token: 'irrelevant' },
      signingKey: kp.privateKey,
      agentId: 'jared',
    });

    await transport.get('/api/agents/self');
    const headers = await headersPromise;

    expect(headers['x-agent-id']).toBe('jared');
    expect(headers['x-timestamp']).toMatch(/^\d+$/);
    expect(headers['x-signature']).toMatch(/^[0-9a-f]+$/);
  });

  it('sends BOTH pubkey signature AND API key when both are configured', async () => {
    const kp = generateKeypair();
    const { url, headersPromise } = await captureServer();

    const transport = new Transport({
      endpoint: url,
      auth: { type: 'token', token: 'irrelevant' },
      signingKey: kp.privateKey,
      agentId: 'jared',
      agentKey: 'legacy-key',
    });

    await transport.get('/api/agents/self');
    const headers = await headersPromise;

    // Pubkey auth for office-manager
    expect(headers['x-agent-id']).toBe('jared');
    expect(headers['x-signature']).toMatch(/^[0-9a-f]+$/);
    // API key for dashboard
    expect(headers['x-agent-api-key']).toBe('legacy-key');
  });

  it('signs different paths with different signatures', async () => {
    const kp = generateKeypair();
    const sigs: string[] = [];

    for (const path of ['/api/agents/self', '/api/agents/heartbeat']) {
      const { url, headersPromise } = await captureServer();
      const transport = new Transport({
        endpoint: url,
        auth: { type: 'token', token: 'irrelevant' },
        signingKey: kp.privateKey,
        agentId: 'jared',
      });
      await transport.get(path);
      const headers = await headersPromise;
      sigs.push(headers['x-signature']!);
    }

    expect(sigs[0]).not.toBe(sigs[1]);
  });
});

describe('Transport without signingKey', () => {
  it('falls back to X-Agent-Api-Key when agentKey is set', async () => {
    const { url, headersPromise } = await captureServer();

    const transport = new Transport({
      endpoint: url,
      auth: { type: 'token', token: 'fallback-token' },
      agentKey: 'raw-api-key-abc',
    });

    await transport.get('/api/agents/self');
    const headers = await headersPromise;

    expect(headers['x-agent-api-key']).toBe('raw-api-key-abc');
    expect(headers['x-agent-id']).toBeUndefined();
    expect(headers['x-signature']).toBeUndefined();
  });

  it('falls back to Authorization: Bearer when only auth.token is set', async () => {
    const { url, headersPromise } = await captureServer();

    const transport = new Transport({
      endpoint: url,
      auth: { type: 'token', token: 'my-bearer-token' },
    });

    await transport.get('/api/agents/self');
    const headers = await headersPromise;

    expect(headers['authorization']).toBe('Bearer my-bearer-token');
    expect(headers['x-agent-id']).toBeUndefined();
  });
});
