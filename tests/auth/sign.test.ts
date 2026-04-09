import { describe, it, expect } from 'vitest';
import { createVerify, createPublicKey } from 'node:crypto';
import { generateKeypair } from '../../src/auth/keys.js';
import { signRequest } from '../../src/auth/sign.js';

/**
 * Reconstruct a Node.js KeyObject from raw secp256k1 public key bytes.
 * Mirrors the logic in _website/src/lib/agent-auth.ts buildSPKIPublicKey().
 * This is the SAME verification path the server uses — not a mock.
 */
function buildSPKIPublicKey(pubHex: string) {
  const pubBytes = Buffer.from(pubHex, 'hex');
  const ecPublicKeyOID = Buffer.from('06072a8648ce3d0201', 'hex');
  const secp256k1OID = Buffer.from('06052b8104000a', 'hex');
  const algorithmSeq = Buffer.concat([
    Buffer.from([0x30, ecPublicKeyOID.length + secp256k1OID.length]),
    ecPublicKeyOID,
    secp256k1OID,
  ]);
  const bitString = Buffer.concat([
    Buffer.from([0x03, pubBytes.length + 1, 0x00]),
    pubBytes,
  ]);
  const spki = Buffer.concat([
    Buffer.from([0x30, algorithmSeq.length + bitString.length]),
    algorithmSeq,
    bitString,
  ]);
  return createPublicKey({ key: spki, format: 'der', type: 'spki' });
}

describe('signRequest()', () => {
  it('returns X-Agent-Id, X-Timestamp, X-Signature headers', () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, 'jared', 'GET', '/api/agents/self');
    expect(headers['X-Agent-Id']).toBe('jared');
    expect(headers['X-Timestamp']).toMatch(/^\d+$/);
    expect(headers['X-Signature']).toMatch(/^[0-9a-f]+$/);
  });

  it('timestamp is within 5 seconds of now', () => {
    const kp = generateKeypair();
    const headers = signRequest(kp.privateKey, 'agent', 'POST', '/api/agents/heartbeat');
    const ts = parseInt(headers['X-Timestamp'], 10);
    expect(Math.abs(Date.now() / 1000 - ts)).toBeLessThan(5);
  });

  it('signature verifies with matching public key (same path the server takes)', () => {
    const kp = generateKeypair();
    const method = 'GET';
    const path = '/api/agents/self';

    const headers = signRequest(kp.privateKey, 'jared', method, path);

    const payload = `${headers['X-Timestamp']}\n${method}\n${path}`;
    const pubKey = buildSPKIPublicKey(kp.publicKey);
    const sigBuf = Buffer.from(headers['X-Signature'], 'hex');

    const verify = createVerify('SHA256');
    verify.update(payload);
    expect(verify.verify(pubKey, sigBuf)).toBe(true);
  });

  it('signature does NOT verify with a different keypair', () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    const method = 'GET';
    const path = '/api/agents/self';

    const headers = signRequest(kp1.privateKey, 'jared', method, path);

    const payload = `${headers['X-Timestamp']}\n${method}\n${path}`;
    const wrongPubKey = buildSPKIPublicKey(kp2.publicKey);
    const sigBuf = Buffer.from(headers['X-Signature'], 'hex');

    const verify = createVerify('SHA256');
    verify.update(payload);
    expect(verify.verify(wrongPubKey, sigBuf)).toBe(false);
  });

  it('different paths produce different signatures', () => {
    const kp = generateKeypair();
    const h1 = signRequest(kp.privateKey, 'jared', 'GET', '/api/agents/self');
    const h2 = signRequest(kp.privateKey, 'jared', 'GET', '/api/agents/heartbeat');
    expect(h1['X-Signature']).not.toBe(h2['X-Signature']);
  });

  it('signature covers method — GET and POST on same path differ', () => {
    const kp = generateKeypair();
    const h1 = signRequest(kp.privateKey, 'jared', 'GET', '/api/agents/self');
    const h2 = signRequest(kp.privateKey, 'jared', 'POST', '/api/agents/self');
    expect(h1['X-Signature']).not.toBe(h2['X-Signature']);
  });

  it('tampering with the path invalidates the signature', () => {
    const kp = generateKeypair();
    const method = 'GET';
    const realPath = '/api/agents/self';
    const tamperedPath = '/api/agents/admin';

    const headers = signRequest(kp.privateKey, 'jared', method, realPath);

    // Verify against the tampered path — should fail
    const tamperedPayload = `${headers['X-Timestamp']}\n${method}\n${tamperedPath}`;
    const pubKey = buildSPKIPublicKey(kp.publicKey);
    const sigBuf = Buffer.from(headers['X-Signature'], 'hex');

    const verify = createVerify('SHA256');
    verify.update(tamperedPayload);
    expect(verify.verify(pubKey, sigBuf)).toBe(false);
  });
});
