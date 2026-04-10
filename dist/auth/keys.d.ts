export interface Keypair {
    /** Uncompressed secp256k1 public key (130 hex chars, 04 prefix) */
    publicKey: string;
    /** Hex-encoded 32-byte private key */
    privateKey: string;
    /** Ethereum address derived via keccak256 (0x-prefixed, 42 chars) */
    address: string;
}
/** Generate a new secp256k1 keypair with Ethereum-compatible address. */
export declare function generateKeypair(): Keypair;
/** Load keypair from disk, or generate and persist one. */
export declare function getOrCreateKeypair(): Keypair;
/** Load keypair from disk, or null if none exists. */
export declare function loadKeypair(): Keypair | null;
//# sourceMappingURL=keys.d.ts.map