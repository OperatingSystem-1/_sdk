import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OS1Client } from '../src/client.js';
import { OS1Error } from '../src/types/index.js';

// ─── OS1Client initialisation ────────────────────────────────────────────────

describe('OS1Client', () => {
  it('initializes public API modules', () => {
    const client = new OS1Client({
      endpoint: 'https://api.example.com',
      apiKey: 'test-key',
    });

    expect(client.offices).toBeTruthy();
    expect(client.agents).toBeTruthy();
    expect(client.integrations).toBeTruthy();
  });

  it('initializes heartbeat, files, clone modules', () => {
    const client = new OS1Client({
      endpoint: 'https://api.example.com',
      apiKey: 'test-key',
    });

    expect(client.heartbeat).toBeTruthy();
    expect(client.files).toBeTruthy();
    expect(client.clone).toBeTruthy();
  });
});

// ─── OS1Error ────────────────────────────────────────────────────────────────

describe('OS1Error', () => {
  it('captures status and code', () => {
    const err = new OS1Error(403, 'forbidden', 'forbidden');

    expect(err.name).toBe('OS1Error');
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('forbidden');
  });
});

// ─── API module routing ───────────────────────────────────────────────────────

describe('HeartbeatAPI', () => {
  it('HeartbeatAPI.send() calls POST /api/agents/heartbeat', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new OS1Client({ endpoint: 'http://test', apiKey: 'key' });
    await client.heartbeat.send();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test/api/agents/heartbeat',
      expect.objectContaining({ method: 'POST' })
    );

    vi.unstubAllGlobals();
  });
});

describe('FilesAPI', () => {
  it('FilesAPI.list() calls GET /api/agents/office/files', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new OS1Client({ endpoint: 'http://test', apiKey: 'key' });
    await client.files.list();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test/api/agents/office/files',
      expect.objectContaining({ method: 'GET' })
    );

    vi.unstubAllGlobals();
  });
});

describe('CloneAPI', () => {
  it('CloneAPI.clone() sends code + name to /api/agents/clone', async () => {
    const responsePayload = {
      clone_name: 'jared-2',
      clone_id: 'uuid-clone',
      office_id: 'office-uuid',
      origin_name: 'jared',
      employee_id: null,
      status: 'provisioning',
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new OS1Client({ endpoint: 'http://test', apiKey: 'key' });
    const result = await client.clone.clone({ code: 'ABC123', name: 'meridian' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test/api/agents/clone',
      expect.objectContaining({ method: 'POST' })
    );
    // Verify payload contains code + name
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({ code: 'ABC123', name: 'meridian' });
    expect(result.clone_name).toBe('jared-2');
    expect(result.status).toBe('provisioning');

    vi.unstubAllGlobals();
  });

  it('CloneAPI.clone() works without optional name field', async () => {
    const responsePayload = {
      clone_name: 'jared-2',
      clone_id: 'uuid-clone',
      office_id: 'office-uuid',
      origin_name: 'jared',
      employee_id: null,
      status: 'provisioning',
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new OS1Client({ endpoint: 'http://test', apiKey: 'key' });
    await client.clone.clone({ code: 'XYZ789' });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({ code: 'XYZ789' });

    vi.unstubAllGlobals();
  });
});

describe('JoinAPI', () => {
  it('JoinAPI.join() sends all fields to /api/agents/join', async () => {
    const responsePayload = {
      api_key: 'new-api-key',
      bot_id: 'bot-uuid',
      office_id: 'office-uuid',
      agent_name: 'jared',
      employee_id: null,
      xmtp: { office_group_address: null, members: [] },
    };
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const client = new OS1Client({ endpoint: 'http://test', apiKey: 'key' });
    const result = await client.join.join({ code: 'CODE01', agent_name: 'jared' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test/api/agents/join',
      expect.objectContaining({ method: 'POST' })
    );
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody).toEqual({ code: 'CODE01', agent_name: 'jared' });
    expect(result.api_key).toBe('new-api-key');

    vi.unstubAllGlobals();
  });
});
