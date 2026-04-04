import { describe, it, expect } from 'vitest';
import { OS1AdminClient } from '../src/client.js';
import { Keystore } from '../src/auth/keystore.js';
import { generateKeyPair } from '../src/auth/secp256k1.js';

describe('OS1AdminClient', () => {
  it('initializes with JWT config', () => {
    const client = new OS1AdminClient({
      endpoint: 'http://localhost:8080',
      jwt: { jwtSecret: 'test-secret-for-jwt-signing-32chars!!' },
    });

    expect(client.offices).toBeTruthy();
    expect(client.employees).toBeTruthy();
    expect(client.tasks).toBeTruthy();
    expect(client.files).toBeTruthy();
    expect(client.credits).toBeTruthy();
    expect(client.xmtpApi).toBeTruthy();
    expect(client.integrations).toBeTruthy();
    expect(client.extensions).toBeTruthy();
    expect(client.events).toBeTruthy();
    expect(client.callbacks).toBeTruthy();
    expect(client.backups).toBeTruthy();
    expect(client.env).toBeTruthy();
    expect(client.delegates).toBeTruthy();
    expect(client.messages).toBeTruthy();
    expect(client.workspace).toBeTruthy();
    expect(client.roles).toBeTruthy();
    expect(client.transfer).toBeTruthy();
    expect(client.llmPing).toBeTruthy();
    expect(client.whatsapp).toBeTruthy();
    expect(client.chromium).toBeTruthy();
    expect(client.xmtp).toBeTruthy();
    expect(client.keystore).toBeInstanceOf(Keystore);
  });

  it('initializes with agent config', () => {
    const kp = generateKeyPair();
    const client = new OS1AdminClient({
      endpoint: 'http://localhost:8080',
      agent: { agentId: 'test-agent', signingKey: kp.privateKey },
    });

    expect(client.offices).toBeTruthy();
  });

  it('initializes with dual auth', () => {
    const kp = generateKeyPair();
    const client = new OS1AdminClient({
      endpoint: 'http://localhost:8080',
      jwt: { jwtSecret: 'test-secret-for-jwt-signing-32chars!!' },
      agent: { agentId: 'test-agent', signingKey: kp.privateKey },
    });

    expect(client.offices).toBeTruthy();
  });

  it('health check fails for unreachable endpoint', async () => {
    const client = new OS1AdminClient({
      endpoint: 'http://localhost:99999',
      jwt: { jwtSecret: 'test' },
      timeout: 1000,
    });

    const healthy = await client.health();
    expect(healthy).toBe(false);
  });
});

describe('Keystore', () => {
  it('generates and stores keys', async () => {
    const keystore = new Keystore({ basePath: '/tmp/os1-sdk-test-keys' });
    const kp = await keystore.generateAndStore('test-office', 'test-agent');

    expect(kp.publicKey).toMatch(/^04[0-9a-f]{128}$/);
    expect(kp.privateKey).toHaveLength(32);

    // Verify we can load it back
    const loaded = await keystore.loadAgentKey('test-office', 'test-agent');
    expect(Buffer.from(loaded).toString('hex')).toBe(Buffer.from(kp.privateKey).toString('hex'));

    // Verify public key derivation
    const pubkey = await keystore.getPublicKey('test-office', 'test-agent');
    expect(pubkey).toBe(kp.publicKey);

    // Verify listing
    const agents = await keystore.listAgentKeys('test-office');
    expect(agents).toContain('test-agent');

    // Verify has
    expect(await keystore.hasAgentKey('test-office', 'test-agent')).toBe(true);
    expect(await keystore.hasAgentKey('test-office', 'nonexistent')).toBe(false);

    // Cleanup
    await keystore.deleteAgentKey('test-office', 'test-agent');
    expect(await keystore.hasAgentKey('test-office', 'test-agent')).toBe(false);
  });

  it('stores and loads JWT secret', async () => {
    const keystore = new Keystore({ basePath: '/tmp/os1-sdk-test-keys-jwt' });
    await keystore.storeJWTSecret('my-super-secret');
    const loaded = await keystore.loadJWTSecret();
    expect(loaded).toBe('my-super-secret');
  });

  it('stores and loads config', async () => {
    const keystore = new Keystore({ basePath: '/tmp/os1-sdk-test-keys-config' });
    await keystore.storeConfig({ endpoint: 'http://test:8080', custom: true });
    const config = await keystore.loadConfig();
    expect(config.endpoint).toBe('http://test:8080');
    expect(config.custom).toBe(true);
  });

  it('throws descriptive error for missing key', async () => {
    const keystore = new Keystore({ basePath: '/tmp/os1-sdk-test-keys-missing' });
    await expect(keystore.loadAgentKey('no-office', 'no-agent')).rejects.toThrow(
      /No signing key found/,
    );
  });
});
