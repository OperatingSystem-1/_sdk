import { authorizationHeader } from './auth/jwt.js';
import { signRequest } from './auth/secp256k1.js';
import { OS1Error } from './types/index.js';
/**
 * Authenticated HTTP transport for the office-manager API.
 *
 * Supports three auth modes:
 *   - token: opaque API key (mi_...) sent as Authorization: Bearer
 *   - jwt:   HS256 token minted from a shared HMAC secret
 *   - agent: secp256k1 request signing for agent-impersonation
 *
 * When token or jwt is set alongside agent, the non-agent mode is used
 * unless the caller explicitly requests asAgent.
 */
export class Transport {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Build auth headers based on configuration.
     */
    async authHeaders(method, path, asAgent) {
        const hasNonAgentAuth = !!(this.config.jwt || (this.config.auth && this.config.auth.token));
        // Agent auth takes priority when explicitly requested or when only agent auth is configured
        if ((asAgent || !hasNonAgentAuth) && this.config.agent) {
            const signed = await signRequest(this.config.agent.agentId, method, path, this.config.agent.signingKey);
            return { ...signed };
        }
        if (this.config.auth && this.config.auth.type === 'token' && this.config.auth.token) {
            return { Authorization: `Bearer ${this.config.auth.token}` };
        }
        if (this.config.jwt) {
            return {
                Authorization: authorizationHeader(this.config.jwt.jwtSecret, this.config.jwt.userId ?? 'admin-sdk'),
            };
        }
        throw new Error('No authentication configured. Provide jwt, agent, or auth.token config.');
    }
    /**
     * Make an authenticated request to the office-manager API.
     */
    async request(method, path, options) {
        let fullPath = path;
        // Append query params
        if (options?.query) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(options.query)) {
                if (v !== undefined)
                    params.set(k, String(v));
            }
            const qs = params.toString();
            if (qs)
                fullPath += `?${qs}`;
        }
        const url = `${this.config.endpoint}${fullPath}`;
        const headers = {
            ...(await this.authHeaders(method, fullPath, options?.asAgent)),
        };
        if (options?.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        const controller = new AbortController();
        const timeout = this.config.timeout ?? 30000;
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body: options?.body
                    ? options.body instanceof FormData
                        ? options.body
                        : JSON.stringify(options.body)
                    : undefined,
                signal: controller.signal,
            });
            if (!response.ok) {
                let message = response.statusText;
                let code;
                try {
                    const err = await response.json();
                    message = err.message ?? err.error ?? message;
                    code = err.code;
                }
                catch { }
                throw new OS1Error(response.status, message, code);
            }
            if (options?.raw) {
                return response;
            }
            const contentType = response.headers.get('content-type') ?? '';
            if (contentType.includes('application/json')) {
                return (await response.json());
            }
            return (await response.text());
        }
        finally {
            clearTimeout(timer);
        }
    }
    /**
     * GET request.
     */
    get(path, query) {
        return this.request('GET', path, { query });
    }
    /**
     * POST request.
     */
    post(path, body) {
        return this.request('POST', path, { body });
    }
    /**
     * PUT request.
     */
    put(path, body) {
        return this.request('PUT', path, { body });
    }
    /**
     * PATCH request.
     */
    patch(path, body) {
        return this.request('PATCH', path, { body });
    }
    /**
     * DELETE request.
     */
    delete(path) {
        return this.request('DELETE', path);
    }
    /**
     * Upload a file via multipart form data.
     */
    async upload(path, filename, data) {
        const form = new FormData();
        form.append('file', new Blob([data]), filename);
        return this.request('POST', path, { body: form });
    }
    /**
     * Stream SSE events from an endpoint.
     */
    async *stream(path, query) {
        const response = await this.request('GET', path, { query, raw: true });
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('No response body for stream');
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                let currentEvent;
                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        currentEvent = line.slice(6).trim();
                    }
                    else if (line.startsWith('data:')) {
                        yield { event: currentEvent, data: line.slice(5).trim() };
                        currentEvent = undefined;
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    /**
     * Get the base endpoint URL (office-manager).
     */
    get endpoint() {
        return this.config.endpoint;
    }
    /**
     * Get the dashboard endpoint URL (CLA-904: SDK creates land in the
     * dashboard's dual-write route so dashboard tables stay in sync).
     *
     * Priority:
     *   1. config.dashboardEndpoint (explicit override)
     *   2. derived from config.endpoint:
     *        m.mitosislabs.ai     → mitosislabs.ai
     *        m.dev.mitosislabs.ai → dev.mitosislabs.ai
     *        localhost:8080       → localhost:3000
     *        anything else        → unchanged (best-effort fallback)
     */
    get dashboardEndpoint() {
        if (this.config.dashboardEndpoint) {
            return this.config.dashboardEndpoint;
        }
        const e = this.config.endpoint;
        // localhost dev: OM on :8080, dashboard on :3000
        if (e.includes('localhost:8080') || e.includes('127.0.0.1:8080')) {
            return e.replace(':8080', ':3000');
        }
        try {
            const url = new URL(e);
            // Strip leading "m." subdomain (m.foo.com → foo.com, m.dev.foo.com → dev.foo.com)
            if (url.hostname.startsWith('m.')) {
                url.hostname = url.hostname.slice(2);
                return url.origin;
            }
        }
        catch { }
        // Fallback: assume same origin (caller can override via dashboardEndpoint).
        return e;
    }
    /**
     * Make an authenticated request to the dashboard host (instead of OM).
     * Used for create/hire flows that must dual-write dashboard tables.
     * Auth: only `auth.token` (mi_*) is supported here — JWT and agent
     * signing target office-manager only.
     */
    async dashboardRequest(method, path, options) {
        if (!this.config.auth || this.config.auth.type !== 'token' || !this.config.auth.token) {
            throw new Error('dashboardRequest requires auth.token (mi_*) — JWT/agent auth not supported by dashboard.');
        }
        let fullPath = path;
        if (options?.query) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(options.query)) {
                if (v !== undefined)
                    params.set(k, String(v));
            }
            const qs = params.toString();
            if (qs)
                fullPath += `?${qs}`;
        }
        const url = `${this.dashboardEndpoint}${fullPath}`;
        const headers = {
            Authorization: `Bearer ${this.config.auth.token}`,
        };
        if (options?.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        const controller = new AbortController();
        const timeout = this.config.timeout ?? 30000;
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body: options?.body
                    ? options.body instanceof FormData
                        ? options.body
                        : JSON.stringify(options.body)
                    : undefined,
                signal: controller.signal,
            });
            if (!response.ok) {
                let message = response.statusText;
                let code;
                try {
                    const err = await response.json();
                    message = err.message ?? err.error ?? message;
                    code = err.code;
                }
                catch { }
                throw new OS1Error(response.status, message, code);
            }
            const contentType = response.headers.get('content-type') ?? '';
            if (contentType.includes('application/json')) {
                return (await response.json());
            }
            return (await response.text());
        }
        finally {
            clearTimeout(timer);
        }
    }
}
//# sourceMappingURL=transport.js.map