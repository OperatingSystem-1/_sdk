import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Transport } from '../src/transport.js';
import { OS1Error } from '../src/types/index.js';

describe('Transport', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown, contentType = 'application/json') {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Headers({ 'content-type': contentType }),
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    });
  }

  it('sends GET with Bearer token', async () => {
    mockFetch(200, { id: '1' });
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'my-jwt' },
    });
    await t.get('/api/v1/offices');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/offices',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt' }),
      }),
    );
  });

  it('sends POST with JSON body', async () => {
    mockFetch(200, { id: '1' });
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    await t.post('/api/v1/offices', { name: 'test' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/offices',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"test"}',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('appends query params', async () => {
    mockFetch(200, []);
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    await t.get('/api/v1/tasks', { status: 'queued', limit: 10 });
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toContain('status=queued');
    expect(url).toContain('limit=10');
  });

  it('skips undefined query params', async () => {
    mockFetch(200, []);
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    await t.get('/api/v1/tasks', { status: undefined, limit: 5 });
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).not.toContain('status');
    expect(url).toContain('limit=5');
  });

  it('throws OS1Error on non-2xx', async () => {
    mockFetch(404, { error: 'not found' });
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    await expect(t.get('/api/v1/offices/bad')).rejects.toThrow(OS1Error);
    try {
      await t.get('/api/v1/offices/bad');
    } catch (e) {
      expect(e).toBeInstanceOf(OS1Error);
      expect((e as OS1Error).status).toBe(404);
      expect((e as OS1Error).message).toBe('not found');
    }
  });

  it('throws OS1Error with code when present', async () => {
    mockFetch(409, { error: 'duplicate', code: 'CONFLICT' });
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    try {
      await t.post('/api/v1/offices', { name: 'dup' });
    } catch (e) {
      expect((e as OS1Error).code).toBe('CONFLICT');
    }
  });

  it('returns text for non-JSON responses', async () => {
    mockFetch(200, 'plain text', 'text/plain');
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    const result = await t.get<string>('/health');
    expect(result).toBe('plain text');
  });

  it('sends PATCH requests', async () => {
    mockFetch(200, { ok: true });
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    await t.patch('/api/v1/offices/o1/settings', { maxEmployees: 5 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/offices/o1/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"maxEmployees":5}',
      }),
    );
  });

  it('sends DELETE requests', async () => {
    mockFetch(200, {});
    const t = new Transport({
      endpoint: 'https://api.test.com',
      auth: { type: 'token', token: 'tok' },
    });
    await t.delete('/api/v1/offices/o1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/v1/offices/o1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
