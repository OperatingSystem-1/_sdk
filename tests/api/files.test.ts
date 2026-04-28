import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilesAPI } from '../../src/api/files.js';
import { Transport } from '../../src/transport.js';

function mockTransport() {
  const t = new Transport({
    endpoint: 'https://test.example.com',
    auth: { type: 'token', token: 'test-token' },
  });
  vi.spyOn(t, 'get').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'post').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'request').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'delete').mockResolvedValue(undefined as any);
  return t;
}

const OID = 'office-abc';

describe('FilesAPI', () => {
  let transport: Transport;
  let api: FilesAPI;

  beforeEach(() => {
    transport = mockTransport();
    api = new FilesAPI(transport);
  });

  it('list() → GET /files', async () => {
    vi.mocked(transport.get).mockResolvedValue([{ name: 'report.md', size: 1024 }]);
    const files = await api.list(OID);
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/files`);
    expect(files).toEqual([{ name: 'report.md', size: 1024 }]);
  });

  it('delete() → DELETE /files/:name', async () => {
    await api.delete(OID, 'report.md');
    expect(transport.delete).toHaveBeenCalledWith(`/api/v1/offices/${OID}/files/report.md`);
  });

  it('changes() → GET /files/_changes with since param', async () => {
    await api.changes(OID, 1000);
    expect(transport.get).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/files/_changes`,
      { since: 1000 },
    );
  });
});
