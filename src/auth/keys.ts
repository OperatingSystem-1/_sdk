import { createECDH, createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

const KEY_DIR = join(homedir(), '.mi');
const KEY_FILE = join(KEY_DIR, 'identity.json');

export interface Keypair {
  publicKey: string;
  privateKey: string;
  address: string;
}

/** Generate a new secp256k1 keypair. */
export function generateKeypair(): Keypair {
  const ecdh = createECDH('secp256k1');
  ecdh.generateKeys();
  const pub = ecdh.getPublicKey('hex', 'compressed');
  const priv = ecdh.getPrivateKey('hex');
  // Derive address: first 20 bytes of SHA-256 of compressed public key
  const addr =
    '0x' +
    createHash('sha256')
      .update(Buffer.from(pub, 'hex'))
      .digest('hex')
      .slice(0, 40);
  return { publicKey: pub, privateKey: priv, address: addr };
}

/** Load keypair from disk, or generate and persist one. */
export function getOrCreateKeypair(): Keypair {
  if (existsSync(KEY_FILE)) {
    try {
      return JSON.parse(readFileSync(KEY_FILE, 'utf-8'));
    } catch {
      // Corrupt file — regenerate
    }
  }
  const kp = generateKeypair();
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  // Atomic write: write to temp file then rename
  const tmpFile = KEY_FILE + '.' + randomBytes(4).toString('hex');
  writeFileSync(tmpFile, JSON.stringify(kp, null, 2), { mode: 0o600 });
  renameSync(tmpFile, KEY_FILE);
  return kp;
}

/** Load keypair from disk, or null if none exists. */
export function loadKeypair(): Keypair | null {
  if (!existsSync(KEY_FILE)) return null;
  try {
    return JSON.parse(readFileSync(KEY_FILE, 'utf-8'));
  } catch {
    return null;
  }
}
