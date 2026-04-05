import { describe, expect, it } from 'vitest';
import { OS1Client } from '../src/client.js';
import { OS1Error } from '../src/types/index.js';

describe('OS1Client', () => {
  it('initializes public API modules', () => {
    const client = new OS1Client({
      endpoint: 'https://api.example.com',
      auth: { type: 'apiKey', key: 'test-key' },
    });

    expect(client.offices).toBeTruthy();
    expect(client.agents).toBeTruthy();
    expect(client.integrations).toBeTruthy();
  });
});

describe('OS1Error', () => {
  it('captures status and code', () => {
    const err = new OS1Error(403, 'forbidden', 'forbidden');

    expect(err.name).toBe('OS1Error');
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('forbidden');
  });
});
