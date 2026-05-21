import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TasksAPI } from '../../src/api/tasks.js';
import { Transport } from '../../src/transport.js';

function mockTransport() {
  const t = new Transport({
    endpoint: 'https://test.example.com',
    auth: { type: 'token', token: 'test-token' },
  });
  vi.spyOn(t, 'get').mockResolvedValue(undefined as any);
  vi.spyOn(t, 'post').mockResolvedValue({} as any);
  vi.spyOn(t, 'patch').mockResolvedValue({} as any);
  vi.spyOn(t, 'put').mockResolvedValue({} as any);
  vi.spyOn(t, 'delete').mockResolvedValue({} as any);
  return t;
}

const OID = 'office-abc';

describe('TasksAPI', () => {
  let transport: Transport;
  let api: TasksAPI;

  beforeEach(() => {
    transport = mockTransport();
    api = new TasksAPI(transport);
  });

  it('create() → POST /tasks', async () => {
    await api.create(OID, { title: 'Do thing', kind: 'general', priority: 50 });
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks`,
      { title: 'Do thing', kind: 'general', priority: 50 },
    );
  });

  it('list() → GET /tasks with query', async () => {
    vi.mocked(transport.get).mockResolvedValue([]);
    await api.list(OID, { status: 'queued', limit: 10 });
    expect(transport.get).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks`,
      { status: 'queued', limit: 10 },
    );
  });

  it('get() → GET /tasks/:id', async () => {
    await api.get(OID, '42');
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/tasks/42`);
  });

  it('stats() → GET /tasks/stats', async () => {
    await api.stats(OID);
    expect(transport.get).toHaveBeenCalledWith(`/api/v1/offices/${OID}/tasks/stats`);
  });

  it('claim() → POST /tasks/claim', async () => {
    await api.claim(OID, 'worker-1', 'code');
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks/claim`,
      { agent: 'worker-1', kind: 'code' },
    );
  });

  it('complete() → PATCH /tasks/:id (status=done)', async () => {
    await api.complete(OID, '42', 'Done successfully');
    expect(transport.patch).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks/42`,
      { status: 'done', result: 'Done successfully' },
    );
  });

  it('fail() → PATCH /tasks/:id (status=failed)', async () => {
    await api.fail(OID, '42', 'Out of memory');
    expect(transport.patch).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks/42`,
      { status: 'failed', error: 'Out of memory' },
    );
  });

  it('comment() → POST /tasks/:id/comments', async () => {
    await api.comment(OID, '42', 'analyst', 'Looks good');
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks/42/comments`,
      { agent: 'analyst', message: 'Looks good' },
    );
  });

  it('addArtifact() → POST /tasks/:id/artifacts (with label default)', async () => {
    await api.addArtifact(OID, '42', { kind: 'file', path: '/shared/report.md' });
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks/42/artifacts`,
      { kind: 'file', path: '/shared/report.md', label: '' },
    );
  });

  it('verify() → POST /tasks/:id/verify', async () => {
    await api.verify(OID, '42', { accepted: true, reviewer: 'lead', comments: 'LGTM' });
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks/42/verify`,
      { accepted: true, reviewer: 'lead', comments: 'LGTM' },
    );
  });

  it('retry() → POST /tasks/:id/retry', async () => {
    await api.retry(OID, '42', { reason: 'flaky network' });
    expect(transport.post).toHaveBeenCalledWith(
      `/api/v1/offices/${OID}/tasks/42/retry`,
      { reason: 'flaky network' },
    );
  });
});
