/**
 * Integration tests against real office-manager.
 *
 * These tests verify the SDK works end-to-end against a live instance.
 * They require RELAY_JWT_SECRET to be set, or ~/.os1/keys/jwt.key to exist.
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { OS1AdminClient } from '../src/client.js';
import { generateJWT, verifyJWT } from '../src/auth/jwt.js';
import { signRequest, verifySignature, generateKeyPair } from '../src/auth/secp256k1.js';

const ENDPOINT = process.env.OS1_ENDPOINT ?? 'https://m.mitosislabs.ai';
const JWT_SECRET = process.env.RELAY_JWT_SECRET ?? '';
const USER_ID = process.env.OS1_USER_ID ?? 'e3991a6b-dd69-462f-ba65-ed78aa5a5974'; // default: owner of 'period' office

// Skip integration tests if no secret is available
const hasSecret = JWT_SECRET.length > 0;

describe.skipIf(!hasSecret)('Integration: Live office-manager', () => {
  let client: OS1AdminClient;

  beforeAll(() => {
    client = new OS1AdminClient({
      endpoint: ENDPOINT,
      jwt: { jwtSecret: JWT_SECRET, userId: USER_ID },
      timeout: 15000,
    });
  });

  it('health check passes', async () => {
    const healthy = await client.health();
    expect(healthy).toBe(true);
  });

  it('auth verification passes', async () => {
    const result = await client.verifyAuth();
    expect(result.ok).toBe(true);
  });

  it('lists offices', async () => {
    const offices = await client.offices.list();
    expect(Array.isArray(offices)).toBe(true);
    // Production should have at least one office
    expect(offices.length).toBeGreaterThan(0);
    console.log(`Found ${offices.length} offices`);
    for (const o of offices.slice(0, 3)) {
      console.log(`  - ${o.name} (${o.id})`);
    }
  });

  it('lists agents in first office', async () => {
    const offices = await client.offices.list();
    if (offices.length === 0) return;

    const officeId = offices[0].id;
    const agents = await client.employees.list(officeId);
    expect(Array.isArray(agents)).toBe(true);
    console.log(`Office "${offices[0].name}" has ${agents.length} agents`);
    for (const a of agents.slice(0, 5)) {
      console.log(`  - ${a.name} (${a.status})`);
    }
  });

  it('gets office status', async () => {
    const offices = await client.offices.list();
    if (offices.length === 0) return;

    const status = await client.offices.status(offices[0].id);
    expect(status).toBeTruthy();
    console.log(`Office status:`, JSON.stringify(status, null, 2));
  });

  it('gets credit balance', async () => {
    const offices = await client.offices.list();
    if (offices.length === 0) return;

    try {
      const balance = await client.credits.balance(offices[0].id);
      console.log(`Credits: ${JSON.stringify(balance)}`);
    } catch (err: any) {
      // Credits may not be enabled on all offices
      console.log(`Credits not available: ${err.message}`);
    }
  });

  it('lists XMTP conversations', async () => {
    const offices = await client.offices.list();
    if (offices.length === 0) return;

    try {
      const convos = await client.xmtpApi.listConversations(offices[0].id);
      expect(Array.isArray(convos)).toBe(true);
      console.log(`XMTP conversations: ${convos.length}`);
    } catch (err: any) {
      // XMTP may not be enabled
      console.log(`XMTP not available: ${err.message}`);
    }
  });

  it('gets agent activity feed', async () => {
    const offices = await client.offices.list();
    if (offices.length === 0) return;

    const agents = await client.employees.list(offices[0].id);
    if (agents.length === 0) return;

    const activity = await client.employees.activity(offices[0].id, agents[0].name, {
      limit: 5,
    });
    expect(Array.isArray(activity)).toBe(true);
    console.log(`${agents[0].name} activity: ${activity.length} events`);
    for (const e of activity.slice(0, 3)) {
      console.log(`  [${e.category}] ${e.summary}`);
    }
  });
});

describe.skipIf(!hasSecret)('Integration: JWT round-trip', () => {
  it('generates token that office-manager accepts', async () => {
    const token = generateJWT(JWT_SECRET, {
      botId: 'sdk-test',
      userId: USER_ID,
      privateIp: 'k8s',
    });

    // Verify locally
    const payload = verifyJWT(token, JWT_SECRET);
    expect(payload.botId).toBe('sdk-test');

    // Use it against real endpoint
    const resp = await fetch(`${ENDPOINT}/api/v1/offices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status).toBe(200);
  });
});

describe.skipIf(!hasSecret)('Integration: secp256k1 signing', () => {
  it('generates signatures that verify locally', async () => {
    const kp = generateKeyPair();
    const headers = await signRequest('test-agent', 'GET', '/api/v1/offices', kp.privateKey);

    const valid = verifySignature(
      headers['X-Timestamp'],
      'GET',
      '/api/v1/offices',
      headers['X-Signature'],
      kp.publicKey,
    );
    expect(valid).toBe(true);
  });

  it('generates consistent key pairs', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey.startsWith('04')).toBe(true);
    expect(kp.publicKey.length).toBe(130); // 65 bytes * 2 hex chars
    expect(kp.privateKey.length).toBe(32);
  });
});
