import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentsAPI } from '../../src/api/agents.js';
import { Transport } from '../../src/transport.js';

function mockTransport() {
  const t = new Transport({
    endpoint: 'https://test.example.com',
    auth: { type: 'token', token: 'test-token' },
  });
  vi.spyOn(t, 'get').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'post').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'patch').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'delete').mockResolvedValue(undefined as any);
  return t;
}

const OID = 'office-abc';

describe('AgentsAPI', () => {
  let transport: Transport;
  let api: AgentsAPI;

  beforeEach(() => {
    transport = mockTransport();
    api = new AgentsAPI(transport);
  });

  it('hire() → POST /api/v1/offices/:id/employees', async () => {
    await api.hire(OID, { name: 'analyst' });
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/employees`,
      { name: 'analyst' },
    );
  });

  it('list() → GET /api/v1/offices/:id/employees', async () => {
    vi.mocked(transport.get).mockResolvedValue([{ name: 'a1' }]);
    const result = await api.list(OID);
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/employees`);
    expect(result).toEqual([{ name: 'a1' }]);
  });

  it('get() → GET /api/v1/offices/:id/employees/:name', async () => {
    await api.get(OID, 'analyst');
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/employees/analyst`);
  });

  it('update() → PATCH /api/v1/offices/:id/employees/:name', async () => {
    await api.update(OID, 'analyst', { modelTier: 'opus' });
    expect(transport.patch).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/employees/analyst`,
      { modelTier: 'opus' },
    );
  });

  it('fire() → DELETE /api/v1/offices/:id/employees/:name', async () => {
    await api.fire(OID, 'analyst');
    expect(transport.delete).toHaveBeenCalledWith(`/api/v1/offices/${OID}/employees/analyst`);
  });

  it('logs() → GET with tail param', async () => {
    await api.logs(OID, 'analyst', { tail: 50 });
    expect(transport.get).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/employees/analyst/logs`,
      { tail: 50 },
    );
  });

  it('activity() → GET with query params', async () => {
    await api.activity(OID, 'analyst', { limit: 10 });
    expect(transport.get).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/employees/analyst/activity`,
      { limit: 10 },
    );
  });

  it('promote() → POST /employees/:name/promote', async () => {
    await api.promote(OID, 'analyst', { modelTier: 'opus', provider: 'anthropic' });
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/employees/analyst/promote`,
      { modelTier: 'opus', provider: 'anthropic' },
    );
  });

  it('lifecycle() → POST with action', async () => {
    await api.lifecycle(OID, 'analyst', 'restart');
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/employees/analyst/lifecycle`,
      { action: 'restart' },
    );
  });

  it('archive() → POST /employees/:name/archive', async () => {
    await api.archive(OID, 'analyst');
    expect(transport.post).toHaveBeenCalledWith(`/api/v1/offices/${OID}/employees/analyst/archive`);
  });

  it('restore() → POST /employees/:name/restore', async () => {
    await api.restore(OID, 'analyst');
    expect(transport.post).toHaveBeenCalledWith(`/api/v1/offices/${OID}/employees/analyst/restore`);
  });

  it('debug() → POST /employees/:name/debug/:target', async () => {
    await api.debug(OID, 'analyst', 'worker', 'ls -la');
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/employees/analyst/debug/worker`,
      { command: 'ls -la' },
    );
  });
});
