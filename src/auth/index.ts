import { createHmac } from 'node:crypto';

/**
 * Generate an authorization header from an API key.
 */
export function makeAuthHeader(apiKey: string, userId?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(Buffer.from(JSON.stringify({
    botId: '',
    userId: userId ?? '',
    privateIp: 'k8s',
    iat: now,
    exp: now + 3600,
  })));
  const sig = b64url(createHmac('sha256', apiKey).update(`${header}.${payload}`).digest());
  return `Bearer ${header}.${payload}.${sig}`;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
