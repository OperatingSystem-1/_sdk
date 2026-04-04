import { createHmac } from 'node:crypto';
import type { JWTPayload } from '../types/index.js';

/**
 * Base64url encode (no padding, URL-safe).
 * Mirrors office-manager internal/auth/jwt.go Base64UrlEncode.
 */
function base64UrlEncode(data: Buffer): string {
  return data
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64url decode.
 */
function base64UrlDecode(str: string): Buffer {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const mod = padded.length % 4;
  if (mod === 2) padded += '==';
  else if (mod === 3) padded += '=';
  return Buffer.from(padded, 'base64');
}

/**
 * HMAC-SHA256 sign and return base64url signature.
 * Mirrors office-manager internal/auth/jwt.go HmacSign.
 */
function hmacSign(data: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(data).digest();
  return base64UrlEncode(sig);
}

/**
 * Constant-time string comparison.
 * Mirrors office-manager internal/auth/jwt.go safeCompare.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return require('node:crypto').timingSafeEqual(aBuf, bBuf);
}

/**
 * Generate a JWT token compatible with the relay-server / office-manager.
 *
 * Token format: base64url(header).base64url(payload).hmac_signature
 * Uses HMAC-SHA256 with RELAY_JWT_SECRET.
 */
export function generateJWT(secret: string, payload: Omit<JWTPayload, 'iat' | 'exp'>, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerEncoded = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = hmacSign(signingInput, secret);

  return `${signingInput}.${signature}`;
}

/**
 * Verify a JWT token and return the payload.
 * Mirrors office-manager VerifyToken.
 */
export function verifyJWT(token: string, secret: string): JWTPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid token format');

  const [headerEncoded, payloadEncoded, signature] = parts;
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = hmacSign(signingInput, secret);

  if (!safeCompare(signature, expectedSignature)) {
    throw new Error('invalid signature');
  }

  const payloadJSON = base64UrlDecode(payloadEncoded).toString('utf-8');
  const payload: JWTPayload = JSON.parse(payloadJSON);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error('token expired');
  }

  return payload;
}

/**
 * Generate an Authorization header value.
 */
export function authorizationHeader(secret: string, userId: string, botId = ''): string {
  const token = generateJWT(secret, { botId, userId, privateIp: 'k8s' });
  return `Bearer ${token}`;
}
