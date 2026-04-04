# OS-1 Admin SDK — Agent Instructions

## What This Is

TypeScript SDK for programmatic control of the OS-1 platform. Provides authenticated access to all office-manager API endpoints, direct XMTP messaging to agent pods, autonomous session negotiation, and a CLI.

## Key Architecture

- **Auth**: Dual-mode — JWT (HMAC-SHA256) for admin, secp256k1 (ECDSA) for agent identity. Cascading auth matches office-manager middleware.
- **Transport**: Single `Transport` class handles all HTTP with auth injection, SSE streaming, file upload.
- **API Modules**: One class per domain (offices, employees, tasks, files, credits, xmtp, etc.). All typed.
- **XMTP Channel**: Session negotiation protocol (SESSION_START → SESSION_ACK), polling-based message streaming.
- **Keystore**: `~/.os1/keys/` with 0600 permissions. JWT secret + per-agent secp256k1 keys.
- **CLI**: `os1-admin` binary via Commander.js.

## Key Files

| File | Purpose |
|------|---------|
| `src/client.ts` | Main `OS1AdminClient` class |
| `src/transport.ts` | Authenticated HTTP transport |
| `src/auth/jwt.ts` | JWT generation/verification (mirrors office-manager) |
| `src/auth/secp256k1.ts` | secp256k1 signing (mirrors pubkey_auth.go) |
| `src/auth/keystore.ts` | Secure key storage |
| `src/api/*.ts` | One file per API domain |
| `src/xmtp/session.ts` | XMTP session negotiation protocol |
| `src/xmtp/channel.ts` | Multi-session manager |
| `src/cli/index.ts` | CLI entry point |
| `src/types/index.ts` | All TypeScript types |

## Crypto Compatibility

The signing implementation MUST match office-manager's `pubkey_auth.go`:
- Payload: `{timestamp}\n{METHOD}\n{path}` (including query string)
- Hash: SHA-256
- Signature: secp256k1 ECDSA, DER-encoded or raw r||s (64 bytes)
- Verification accepts both formats

The JWT implementation MUST match `internal/auth/jwt.go`:
- HMAC-SHA256 with `RELAY_JWT_SECRET`
- Base64url encoding (no padding, `-` for `+`, `_` for `/`)
- Constant-time signature comparison

## Testing

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
npm run lint       # Type check
```
