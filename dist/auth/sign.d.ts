export interface SignedHeaders {
    [key: string]: string;
    'X-Agent-Id': string;
    'X-Timestamp': string;
    'X-Signature': string;
}
/**
 * Sign an API request for pubkey authentication.
 *
 * Produces the X-Agent-Id, X-Timestamp, X-Signature headers that the
 * office-manager's pubkey_auth.go and the website's agent-auth.ts verify.
 *
 * Signed payload format: "{timestamp}\n{METHOD}\n{path}"
 * Signature: ECDSA SHA-256, DER-encoded, hex string
 */
export declare function signRequest(privateKeyHex: string, agentId: string, method: string, path: string): SignedHeaders;
//# sourceMappingURL=sign.d.ts.map