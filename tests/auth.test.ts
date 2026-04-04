import { describe, it, expect } from 'vitest';
import { generateJWT, verifyJWT } from '../src/auth/jwt.js';
import { signRequest, verifySignature, generateKeyPair, publicKeyFromPrivate } from '../src/auth/secp256k1.js';

describe('JWT Auth', () => {
  const secret = 'test-secret-for-jwt-signing-32chars!!';

  it('generates and verifies a valid JWT', () => {
    const token = generateJWT(secret, {
      botId: 'test-bot',
      userId: 'user-123',
      privateIp: 'k8s',
    });

    expect(token.split('.')).toHaveLength(3);

    const payload = verifyJWT(token, secret);
    expect(payload.botId).toBe('test-bot');
    expect(payload.userId).toBe('user-123');
    expect(payload.privateIp).toBe('k8s');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('rejects tampered tokens', () => {
    const token = generateJWT(secret, {
      botId: 'test-bot',
      userId: 'user-123',
      privateIp: 'k8s',
    });

    const parts = token.split('.');
    parts[1] = parts[1].slice(0, -2) + 'XX';
    const tampered = parts.join('.');

    expect(() => verifyJWT(tampered, secret)).toThrow();
  });

  it('rejects tokens signed with wrong secret', () => {
    const token = generateJWT(secret, {
      botId: 'test-bot',
      userId: 'user-123',
      privateIp: 'k8s',
    });

    expect(() => verifyJWT(token, 'wrong-secret-xxxxxxxxxxxxxxxxxx')).toThrow('invalid signature');
  });

  it('rejects expired tokens', () => {
    const token = generateJWT(secret, {
      botId: 'test-bot',
      userId: 'user-123',
      privateIp: 'k8s',
    }, -1); // TTL of -1 second = already expired

    expect(() => verifyJWT(token, secret)).toThrow('token expired');
  });

  it('respects custom TTL', () => {
    const token = generateJWT(secret, {
      botId: 'test-bot',
      userId: 'user-123',
      privateIp: 'k8s',
    }, 7200); // 2 hours

    const payload = verifyJWT(token, secret);
    expect(payload.exp - payload.iat).toBe(7200);
  });
});

describe('secp256k1 Auth', () => {
  it('generates valid key pairs', () => {
    const kp = generateKeyPair();
    expect(kp.privateKey).toHaveLength(32);
    expect(kp.publicKey).toMatch(/^04[0-9a-f]{128}$/); // uncompressed point
  });

  it('derives public key from private key', () => {
    const kp = generateKeyPair();
    const derived = publicKeyFromPrivate(kp.privateKey);
    expect(derived).toBe(kp.publicKey);
  });

  it('signs and verifies requests', async () => {
    const kp = generateKeyPair();
    const method = 'POST';
    const path = '/api/v1/offices/test-office/employees';

    const headers = await signRequest('test-agent', method, path, kp.privateKey);

    expect(headers['X-Agent-Id']).toBe('test-agent');
    expect(headers['X-Timestamp']).toMatch(/^\d+$/);
    expect(headers['X-Signature']).toMatch(/^[0-9a-f]+$/);

    // Verify the signature
    const valid = verifySignature(
      headers['X-Timestamp'],
      method,
      path,
      headers['X-Signature'],
      kp.publicKey,
    );
    expect(valid).toBe(true);
  });

  it('rejects signatures with wrong key', async () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const method = 'GET';
    const path = '/api/v1/offices/test/employees';

    const headers = await signRequest('agent', method, path, kp1.privateKey);

    // Verify with wrong public key
    const valid = verifySignature(
      headers['X-Timestamp'],
      method,
      path,
      headers['X-Signature'],
      kp2.publicKey,
    );
    expect(valid).toBe(false);
  });

  it('rejects signatures with modified path', async () => {
    const kp = generateKeyPair();
    const method = 'GET';
    const path = '/api/v1/offices/test/employees';

    const headers = await signRequest('agent', method, path, kp.privateKey);

    const valid = verifySignature(
      headers['X-Timestamp'],
      method,
      '/api/v1/offices/TAMPERED/employees',
      headers['X-Signature'],
      kp.publicKey,
    );
    expect(valid).toBe(false);
  });

  it('rejects signatures with modified method', async () => {
    const kp = generateKeyPair();
    const method = 'GET';
    const path = '/api/v1/offices/test/employees';

    const headers = await signRequest('agent', method, path, kp.privateKey);

    const valid = verifySignature(
      headers['X-Timestamp'],
      'DELETE',
      path,
      headers['X-Signature'],
      kp.publicKey,
    );
    expect(valid).toBe(false);
  });

  it('rejects signatures with modified timestamp', async () => {
    const kp = generateKeyPair();
    const method = 'POST';
    const path = '/api/v1/offices/test/employees';

    const headers = await signRequest('agent', method, path, kp.privateKey);

    const valid = verifySignature(
      '9999999999',
      method,
      path,
      headers['X-Signature'],
      kp.publicKey,
    );
    expect(valid).toBe(false);
  });
});
