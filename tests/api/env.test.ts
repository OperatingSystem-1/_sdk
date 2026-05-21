import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnvAPI } from '../../src/api/env.js';
import { Transport } from '../../src/transport.js';

function mockTransport() {
  const t = new Transport({
    endpoint: 'https://test.example.com',
    auth: { type: 'token', token: 'test-token' },
  });
  vi.spyOn(t, 'get').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'post').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'put').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'delete').mockResolvedValue(undefined as any);
  return t;
}

const OID = 'office-abc';

describe('EnvAPI', () => {
  let transport: Transport;
  let api: EnvAPI;

  beforeEach(() => {
    transport = mockTransport();
    api = new EnvAPI(transport);
  });

  it('list() → GET /env', async () => {
    vi.mocked(transport.get).mockResolvedValue([{ key: 'FOO' }]);
    const vars = await api.list(OID);
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/env`);
    expect(vars).toEqual([{ key: 'FOO' }]);
  });

  it('set() with office scope → PUT /env', async () => {
    await api.set(OID, 'FOO', 'bar');
    expect(transport.put).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/env`,
      { key: 'FOO', value: 'bar', scope: 'office', agentName: undefined },
    );
  });

  it('set() with agent scope → PUT /env with agentName', async () => {
    await api.set(OID, 'FOO', 'bar', { scope: 'agent', agentName: 'worker' });
    expect(transport.put).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/env`,
      { key: 'FOO', value: 'bar', scope: 'agent', agentName: 'worker' },
    );
  });

  it('delete() → DELETE /env/:key', async () => {
    await api.delete(OID, 'FOO');
    expect(transport.delete).toHaveBeenCalledWith(`/api/v1/offices/${OID}/env/FOO`);
  });

  it('getAgentEnv() → GET /employees/:name/env', async () => {
    await api.getAgentEnv(OID, 'worker');
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/employees/worker/env`);
  });
});
