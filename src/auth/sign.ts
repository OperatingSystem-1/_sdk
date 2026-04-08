import { createSign, createPrivateKey } from 'node:crypto';

export interface SignedHeaders {
  [key: string]: string;
  'X-Agent-Id': string;
  'X-Timestamp': string;
  'X-Signature': string;
}

/**
 * Build a SEC1 DER-encoded private key from a raw hex secp256k1 scalar.
 * Node.js `createPrivateKey` can import this format natively.
 */
function buildSEC1DER(privateKeyHex: string): Buffer {
  const privBytes = Buffer.from(privateKeyHex, 'hex');
  // SEC1 ECPrivateKey: SEQUENCE { INTEGER 1, OCTET STRING <privkey>, [0] OID secp256k1 }
  const version = Buffer.from([0x02, 0x01, 0x01]);
  const privOctet = Buffer.concat([Buffer.from([0x04, privBytes.length]), privBytes]);
  const curveOID = Buffer.from('a00706052b8104000a', 'hex'); // [0] EXPLICIT OID 1.3.132.0.10
  const inner = Buffer.concat([version, privOctet, curveOID]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
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
export function signRequest(
  privateKeyHex: string,
  agentId: string,
  method: string,
  path: string,
): SignedHeaders {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${timestamp}\n${method}\n${path}`;

  const keyDER = buildSEC1DER(privateKeyHex);
  const privateKey = createPrivateKey({ key: keyDER, format: 'der', type: 'sec1' });

  const sign = createSign('SHA256');
  sign.update(payload);
  const signature = sign.sign(privateKey);

  return {
    'X-Agent-Id': agentId,
    'X-Timestamp': timestamp,
    'X-Signature': signature.toString('hex'),
  };
}
