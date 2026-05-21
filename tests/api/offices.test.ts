import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfficesAPI } from '../../src/api/offices.js';
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

describe('OfficesAPI', () => {
  let transport: Transport;
  let api: OfficesAPI;

  beforeEach(() => {
    transport = mockTransport();
    api = new OfficesAPI(transport);
  });

  it('list() → GET /api/v1/offices', async () => {
    vi.mocked(transport.get).mockResolvedValue([{ id: 'o1', name: 'test' }]);
    const result = await api.list();
    expect(transport.get).toHaveBeenCalledWith('/api/v1/offices');
    expect(result).toEqual([{ id: 'o1', name: 'test' }]);
  });

  it('create() → POST /api/v1/offices', async () => {
    vi.mocked(transport.post).mockResolvedValue({ id: 'o1', name: 'new' });
    const result = await api.create({ name: 'new' });
    expect(transport.post).toHaveBeenCalledWith('/api/v1/offices', { name: 'new' });
    expect(result.name).toBe('new');
  });

  it('get() → GET /api/v1/offices/:id', async () => {
    await api.get('office-1');
    expect(transport.get).toHaveBeenCalledWith('/api/v1/offices/office-1');
  });

  it('status() → GET /api/v1/offices/:id/status', async () => {
    await api.status('office-1');
    expect(transport.get).toHaveBeenCalledWith('/api/v1/offices/office-1/status');
  });

  it('getSettings() → GET /api/v1/offices/:id/settings', async () => {
    await api.getSettings('office-1');
    expect(transport.get).toHaveBeenCalledWith('/api/v1/offices/office-1/settings');
  });

  it('updateSettings() → PATCH /api/v1/offices/:id/settings', async () => {
    await api.updateSettings('office-1', { allowAgentHiring: false });
    expect(transport.patch).toHaveBeenCalledWith('/api/v1/offices/office-1/settings', { allowAgentHiring: false });
  });

  it('delete() → DELETE /api/v1/offices/:id', async () => {
    await api.delete('office-1');
    expect(transport.delete).toHaveBeenCalledWith('/api/v1/offices/office-1');
  });

  it('suspend() → POST /api/v1/offices/:id/suspend', async () => {
    await api.suspend('office-1');
    expect(transport.post).toHaveBeenCalledWith('/api/v1/offices/office-1/suspend');
  });

  it('resume() → POST /api/v1/offices/:id/resume', async () => {
    await api.resume('office-1');
    expect(transport.post).toHaveBeenCalledWith('/api/v1/offices/office-1/resume');
  });
});
