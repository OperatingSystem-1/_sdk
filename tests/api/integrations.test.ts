import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationsAPI } from '../../src/api/integrations.js';
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
  vi.spyOn(t, 'request').mockResolvedValue(undefined as any);
  return t;
}

const OID = 'office-abc';

describe('IntegrationsAPI', () => {
  let transport: Transport;
  let api: IntegrationsAPI;

  beforeEach(() => {
    transport = mockTransport();
    api = new IntegrationsAPI(transport);
  });

  it('listOffice() → GET /integrations', async () => {
    vi.mocked(transport.get).mockResolvedValue([{ id: 'github', enabled: true }]);
    const result = await api.listOffice(OID);
    expect(transport.get).toHaveBeenCalledWith(`/api/offices/${OID}/integrations`);
    expect(result).toEqual([{ id: 'github', enabled: true }]);
  });

  it('listModels() → GET /provider-models', async () => {
    await api.listModels(OID);
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/provider-models`);
  });

  it('setSecret() → POST /integrations/:id/secret', async () => {
    await api.setSecret(OID, 'github', 'ghp_abc123');
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/integrations/github/secret`,
      { key: 'ghp_abc123' },
    );
  });

  it('deleteSecret() → DELETE /integrations/:id/secret', async () => {
    await api.deleteSecret(OID, 'github');
    expect(transport.delete).toHaveBeenCalledWith(`/api/v1/offices/${OID}/integrations/github/secret`);
  });

  it('toggleAgent() → POST /integrations/:id/agents/:name', async () => {
    await api.toggleAgent(OID, 'github', 'analyst', true);
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/integrations/github/agents/analyst`,
      { enabled: true },
    );
  });
});
