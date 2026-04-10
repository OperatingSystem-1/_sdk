/**
 * XMTP Proxy Adapter — bridges the XMTP channel extension to the office-manager API.
 *
 * The XMTP channel extension (agent-kit) expects to talk to a chat-server at
 * CHAT_SERVER_URL. For external agents (not in K8s), the chat-server isn't
 * directly reachable. This adapter runs a tiny HTTP server on localhost that
 * translates:
 *
 *   Extension calls:  http://localhost:{port}/internal/xmtp/send
 *   Adapter forwards: POST {omUrl}/api/v1/offices/{officeId}/xmtp/send
 *                     (with secp256k1 signed auth headers)
 *
 * The adapter is started as a child process during onboarding and runs
 * alongside the agent's gateway. The extension's CHAT_SERVER_URL env var
 * points to http://localhost:{port}.
 *
 * Also exposes /api/health so the extension's health checks work.
 */
import { createServer } from 'node:http';
import { signRequest } from '../auth/sign.js';
export const DEFAULT_PROXY_PORT = 14300;
/** Route map: extension path prefix → OM path prefix */
const ROUTE_MAP = [
    // Group operations (must come before /internal/xmtp/ catch-all)
    { from: '/internal/xmtp/groups/', to: '/xmtp/groups/' },
    { from: '/internal/xmtp/groups', to: '/xmtp/groups' },
    // Conversations
    { from: '/internal/xmtp/conversations', to: '/xmtp/conversations' },
    // Messages
    { from: '/internal/xmtp/messages/', to: '/xmtp/messages/' },
    // Send
    { from: '/internal/xmtp/send', to: '/xmtp/send' },
    // Stream (SSE)
    { from: '/internal/xmtp/stream', to: '/xmtp/stream' },
    // Register — already done during join, but extension may retry
    { from: '/internal/xmtp/register', to: '/xmtp/register' },
    // Office context
    { from: '/internal/xmtp/office-context', to: '/xmtp/office-context' },
];
/**
 * Translate an extension path to the OM API path.
 * Returns null if the path doesn't match any known route.
 */
export function translatePath(extensionPath, officeId) {
    for (const route of ROUTE_MAP) {
        if (extensionPath.startsWith(route.from)) {
            const remainder = extensionPath.slice(route.from.length);
            return `/api/v1/offices/${officeId}${route.to}${remainder}`;
        }
    }
    return null;
}
/**
 * Start the proxy adapter HTTP server.
 * Returns a handle with the server and a stop function.
 */
export function startProxyAdapter(config) {
    const { omUrl, officeId, agentId, signingKey, port = DEFAULT_PROXY_PORT } = config;
    const server = createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${port}`);
        const extensionPath = url.pathname + url.search;
        // Health endpoint — extension checks /api/health
        if (url.pathname === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', proxy: true }));
            return;
        }
        // Translate extension path → OM path
        const omPath = translatePath(url.pathname, officeId);
        if (!omPath) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'unmapped_path', path: url.pathname }));
            return;
        }
        // Build full OM URL (preserve query string)
        const fullOmPath = url.search ? `${omPath}${url.search}` : omPath;
        const targetUrl = `${omUrl}${fullOmPath}`;
        // Read request body (if any)
        const bodyChunks = [];
        for await (const chunk of req) {
            bodyChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : null;
        // Sign the request
        const method = (req.method || 'GET').toUpperCase();
        const authHeaders = signRequest(signingKey, agentId, method, fullOmPath);
        // Forward to OM
        try {
            const headers = {
                ...authHeaders,
                'Content-Type': req.headers['content-type'] || 'application/json',
            };
            const fetchOpts = {
                method,
                headers,
            };
            if (body && method !== 'GET' && method !== 'HEAD') {
                fetchOpts.body = body;
            }
            const omRes = await fetch(targetUrl, fetchOpts);
            // Check if this is an SSE stream
            const contentType = omRes.headers.get('content-type') || '';
            if (contentType.includes('text/event-stream')) {
                // Stream SSE responses directly
                res.writeHead(omRes.status, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                });
                if (omRes.body) {
                    const reader = omRes.body.getReader();
                    const pump = async () => {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done)
                                break;
                            res.write(value);
                        }
                        res.end();
                    };
                    pump().catch(() => res.end());
                }
                else {
                    res.end();
                }
                return;
            }
            // Regular response — forward status + body
            const responseBody = await omRes.text();
            res.writeHead(omRes.status, {
                'Content-Type': contentType || 'application/json',
            });
            res.end(responseBody);
        }
        catch (err) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'proxy_error',
                message: err.message || String(err),
                target: targetUrl,
            }));
        }
    });
    server.listen(port);
    return {
        server,
        port,
        stop: () => new Promise((resolve) => {
            server.close(() => resolve());
        }),
    };
}
/**
 * Generate the standalone proxy adapter script that runs as a background process.
 * This is written to disk and executed via node so it survives the CLI process exiting.
 */
export function generateProxyScript(config) {
    // Inline the sign function so the script has no external dependencies
    return `#!/usr/bin/env node
/**
 * XMTP Proxy Adapter — auto-generated by mi agent onboard.
 * Bridges the XMTP channel extension to the office-manager API.
 * Runs as a background daemon alongside the agent's gateway.
 *
 * Kill with: kill $(cat /tmp/os1-xmtp-proxy.pid)
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const CONFIG = ${JSON.stringify({
        omUrl: config.omUrl,
        officeId: config.officeId,
        agentId: config.agentId,
        signingKey: config.signingKey,
        port: config.port || DEFAULT_PROXY_PORT,
    }, null, 2)};

// ── secp256k1 request signing (matches SDK auth/sign.ts) ────────────

function buildSEC1DER(privHex) {
  const priv = Buffer.from(privHex, 'hex');
  const ver = Buffer.from([0x02, 0x01, 0x01]);
  const oct = Buffer.concat([Buffer.from([0x04, priv.length]), priv]);
  const oid = Buffer.from('a00706052b8104000a', 'hex');
  const inner = Buffer.concat([ver, oct, oid]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}

function signRequest(method, path) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = ts + '\\n' + method + '\\n' + path;
  const der = buildSEC1DER(CONFIG.signingKey);
  const key = crypto.createPrivateKey({ key: der, format: 'der', type: 'sec1' });
  const sign = crypto.createSign('SHA256');
  sign.update(payload);
  return {
    'X-Agent-Id': CONFIG.agentId,
    'X-Timestamp': ts,
    'X-Signature': sign.sign(key).toString('hex'),
  };
}

// ── Route translation ───────────────────────────────────────────────

const ROUTES = [
  ['/internal/xmtp/groups/', '/xmtp/groups/'],
  ['/internal/xmtp/groups', '/xmtp/groups'],
  ['/internal/xmtp/conversations', '/xmtp/conversations'],
  ['/internal/xmtp/messages/', '/xmtp/messages/'],
  ['/internal/xmtp/send', '/xmtp/send'],
  ['/internal/xmtp/stream', '/xmtp/stream'],
  ['/internal/xmtp/register', '/xmtp/register'],
  ['/internal/xmtp/office-context', '/xmtp/office-context'],
];

function translatePath(extPath) {
  for (const [from, to] of ROUTES) {
    if (extPath.startsWith(from)) {
      return '/api/v1/offices/' + CONFIG.officeId + to + extPath.slice(from.length);
    }
  }
  return null;
}

// ── HTTP Server ─────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost:' + CONFIG.port);

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', proxy: true }));
    return;
  }

  const omPath = translatePath(url.pathname);
  if (!omPath) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unmapped', path: url.pathname }));
    return;
  }

  const fullPath = url.search ? omPath + url.search : omPath;
  const targetUrl = CONFIG.omUrl + fullPath;
  const method = (req.method || 'GET').toUpperCase();

  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

  // Sign
  const auth = signRequest(method, fullPath);

  try {
    const fetchOpts = {
      method,
      headers: { ...auth, 'Content-Type': req.headers['content-type'] || 'application/json' },
    };
    if (body && method !== 'GET' && method !== 'HEAD') fetchOpts.body = body;

    const omRes = await fetch(targetUrl, fetchOpts);
    const ct = omRes.headers.get('content-type') || '';

    if (ct.includes('text/event-stream')) {
      res.writeHead(omRes.status, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      if (omRes.body) {
        const reader = omRes.body.getReader();
        (async () => { while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); } res.end(); })().catch(() => res.end());
      } else { res.end(); }
      return;
    }

    const responseBody = await omRes.text();
    res.writeHead(omRes.status, { 'Content-Type': ct || 'application/json' });
    res.end(responseBody);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
  }
});

server.listen(CONFIG.port, () => {
  console.log('[xmtp-proxy] Listening on port ' + CONFIG.port);
  // Write PID for cleanup
  fs.writeFileSync('/tmp/os1-xmtp-proxy.pid', process.pid.toString());
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
`;
}
//# sourceMappingURL=xmtp-proxy-adapter.js.map