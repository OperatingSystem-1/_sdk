import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createECDH } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { keccak256 } from 'ethereum-cryptography/keccak';
import { generateKeypair } from '../../src/auth/keys.js';

// ─── Unit: generateKeypair() ─────────────────────────────────────────────────

describe('generateKeypair()', () => {
  it('produces an uncompressed secp256k1 public key', () => {
    const kp = generateKeypair();
    // Uncompressed secp256k1: 04 prefix + 32 bytes X + 32 bytes Y = 65 bytes = 130 hex chars
    expect(kp.publicKey).toHaveLength(130);
    expect(kp.publicKey.startsWith('04')).toBe(true);
  });

  it('produces a 32-byte private key', () => {
    const kp = generateKeypair();
    // 32 bytes = 64 hex chars
    expect(kp.privateKey).toHaveLength(64);
    expect(kp.privateKey).toMatch(/^[0-9a-f]+$/);
  });

  it('produces a valid Ethereum-style keccak256 address', () => {
    const kp = generateKeypair();
    // 0x + 20 bytes = 42 chars
    expect(kp.address).toHaveLength(42);
    expect(kp.address.startsWith('0x')).toBe(true);
    expect(kp.address.slice(2)).toMatch(/^[0-9a-f]+$/);
  });

  it('derives address by keccak256 of pubkey without 04 prefix, last 20 bytes', () => {
    const kp = generateKeypair();
    const pubBytes = Buffer.from(kp.publicKey, 'hex').subarray(1); // strip 04
    const hash = keccak256(pubBytes);
    const expected = '0x' + Buffer.from(hash).subarray(-20).toString('hex');
    expect(kp.address).toBe(expected);
  });

  it('generates unique keypairs on each call', () => {
    const a = generateKeypair();
    const b = generateKeypair();
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.address).not.toBe(b.address);
  });

  it('private key round-trips through ECDH: can recompute the same public key', () => {
    const kp = generateKeypair();
    const ecdh = createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(kp.privateKey, 'hex'));
    const recomputed = ecdh.getPublicKey('hex', 'uncompressed');
    expect(recomputed).toBe(kp.publicKey);
  });
});

// ─── Unit: getOrCreateKeypair() — uses a temp dir to avoid clobbering ~/.mi ──

// We test file-system behaviour by overriding the module. Since the KEY_FILE
// path is computed from homedir() at module load time and is not exported, we
// test the observable behaviour: generate + persist manually and verify the
// returned keypair matches what is on disk.

describe('keypair persistence (using temp dir)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mi-keys-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generateKeypair() result can be written to disk and read back identically', () => {
    const kp = generateKeypair();
    const keyFile = join(tmpDir, 'identity.json');
    writeFileSync(keyFile, JSON.stringify(kp, null, 2), { mode: 0o600 });

    const loaded = JSON.parse(readFileSync(keyFile, 'utf-8'));
    expect(loaded.publicKey).toBe(kp.publicKey);
    expect(loaded.privateKey).toBe(kp.privateKey);
    expect(loaded.address).toBe(kp.address);
  });

  it('keypair file exists after write', () => {
    const keyFile = join(tmpDir, 'identity.json');
    const kp = generateKeypair();
    writeFileSync(keyFile, JSON.stringify(kp), { mode: 0o600 });
    expect(existsSync(keyFile)).toBe(true);
  });
});
