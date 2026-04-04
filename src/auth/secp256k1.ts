import { createHash } from 'node:crypto';
import * as secp from '@noble/secp256k1';
import type { SignedHeaders, KeyPair } from '../types/index.js';

/**
 * Generate a new secp256k1 key pair.
 * Returns hex-encoded public key (uncompressed, 04-prefixed) and raw 32-byte private key.
 */
export function generateKeyPair(): KeyPair {
  const privateKey = secp.utils.randomPrivateKey();
  const publicKey = secp.getPublicKey(privateKey, false); // uncompressed
  return {
    publicKey: Buffer.from(publicKey).toString('hex'),
    privateKey,
  };
}

/**
 * Sign an HTTP request for secp256k1 pubkey auth.
 *
 * Matches office-manager's pubkey_auth.go verification:
 *   payload = "{timestamp}\n{METHOD}\n{path}"
 *   hash = SHA-256(payload)
 *   signature = ECDSA-secp256k1(hash, privateKey)
 *
 * Returns headers: X-Agent-Id, X-Timestamp, X-Signature
 */
export async function signRequest(
  agentId: string,
  method: string,
  path: string,
  privateKey: Uint8Array,
): Promise<SignedHeaders> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Reconstruct signed payload matching office-manager format
  const payload = `${timestamp}\n${method.toUpperCase()}\n${path}`;

  // SHA-256 hash (matches Go: sha256.Sum256 and Node: crypto.createSign('SHA256'))
  const hash = createHash('sha256').update(payload).digest();

  // Sign with secp256k1 — returns compact r||s signature (64 bytes)
  const signature = await secp.signAsync(hash, privateKey);
  const sigHex = signature.toCompactHex();

  return {
    'X-Agent-Id': agentId,
    'X-Timestamp': timestamp,
    'X-Signature': sigHex,
  };
}

/**
 * Verify a secp256k1 signature (for testing/debugging).
 * Matches office-manager pubkey_auth.go verifyPubkeyRequest.
 */
export function verifySignature(
  timestamp: string,
  method: string,
  path: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  const payload = `${timestamp}\n${method.toUpperCase()}\n${path}`;
  const hash = createHash('sha256').update(payload).digest();

  const sigBytes = Buffer.from(signatureHex, 'hex');
  const pubBytes = Buffer.from(publicKeyHex, 'hex');

  try {
    // Try compact r||s format first (64 bytes — our default output)
    if (sigBytes.length === 64) {
      const sig = secp.Signature.fromCompact(sigBytes);
      return secp.verify(sig, hash, pubBytes);
    }
    // Otherwise try as-is (DER or other format)
    return secp.verify(sigBytes, hash, pubBytes);
  } catch {
    return false;
  }
}

/**
 * Derive public key from private key.
 */
export function publicKeyFromPrivate(privateKey: Uint8Array): string {
  return Buffer.from(secp.getPublicKey(privateKey, false)).toString('hex');
}
