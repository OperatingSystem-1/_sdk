import { createECDH } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { keccak256 } from 'ethereum-cryptography/keccak';
const KEY_DIR = join(homedir(), '.mi');
const KEY_FILE = join(KEY_DIR, 'identity.json');
/** Generate a new secp256k1 keypair with Ethereum-compatible address. */
export function generateKeypair() {
    const ecdh = createECDH('secp256k1');
    ecdh.generateKeys();
    const pub = ecdh.getPublicKey('hex', 'uncompressed'); // 130 hex, 04 prefix
    const priv = ecdh.getPrivateKey('hex');
    // Ethereum address: keccak256 of uncompressed pubkey (without 04 prefix), last 20 bytes
    const pubBytes = Buffer.from(pub, 'hex').subarray(1); // strip 04 prefix
    const hash = keccak256(pubBytes);
    const addr = '0x' + Buffer.from(hash).subarray(-20).toString('hex');
    return { publicKey: pub, privateKey: priv, address: addr };
}
/** Load keypair from disk, or generate and persist one. */
export function getOrCreateKeypair() {
    if (existsSync(KEY_FILE)) {
        try {
            return JSON.parse(readFileSync(KEY_FILE, 'utf-8'));
        }
        catch {
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
export function loadKeypair() {
    if (!existsSync(KEY_FILE))
        return null;
    try {
        return JSON.parse(readFileSync(KEY_FILE, 'utf-8'));
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=keys.js.map