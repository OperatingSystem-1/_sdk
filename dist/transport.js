import { makeAuthHeader } from './auth/index.js';
import { OS1Error } from './types/index.js';
let _signRequest = null;
export class Transport {
    endpoint;
    config;
    staticHeaders;
    useSignature;
    constructor(config) {
        this.config = config;
        this.endpoint = config.endpoint;
        this.useSignature = !!(config.signingKey && config.agentId);
        // Pre-compute static auth headers once at construction.
        // Only the pubkey signature varies per-request (timestamp + path).
        this.staticHeaders = {};
        if (config.agentKey) {
            this.staticHeaders['X-Agent-Api-Key'] = config.agentKey;
        }
        else if (config.auth.type === 'apiKey' && config.auth.key) {
            this.staticHeaders['Authorization'] = makeAuthHeader(config.auth.key, config.auth.userId);
        }
        else if (config.auth.type === 'token' && config.auth.token) {
            this.staticHeaders['Authorization'] = `Bearer ${config.auth.token}`;
        }
    }
    async authHeaders(method, path) {
        if (this.useSignature) {
            if (!_signRequest) {
                _signRequest = (await import('./auth/sign.js')).signRequest;
            }
            const signed = await _signRequest(this.config.signingKey, this.config.agentId, method, path);
            return Object.keys(this.staticHeaders).length
                ? { ...signed, ...this.staticHeaders }
                : signed;
        }
        if (!Object.keys(this.staticHeaders).length) {
            throw new Error('Unsupported auth configuration');
        }
        return this.staticHeaders;
    }
    async request(method, path, options) {
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
        const url = `${this.config.endpoint}${fullPath}`;
        const headers = { ...(await this.authHeaders(method, fullPath)) };
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
                    ? options.body instanceof FormData ? options.body : JSON.stringify(options.body)
                    : undefined,
                signal: controller.signal,
            });
            if (options?.raw)
                return response;
            if (!response.ok) {
                let message = response.statusText;
                let code;
                try {
                    const err = (await response.json());
                    message = err.error || err.message || message;
                    code = err.code;
                }
                catch { /* non-JSON error body */ }
                throw new OS1Error(response.status, message, code);
            }
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                return (await response.json());
            }
            return (await response.text());
        }
        finally {
            clearTimeout(timer);
        }
    }
    get(path, query) {
        return this.request('GET', path, { query });
    }
    post(path, body) {
        return this.request('POST', path, { body });
    }
    put(path, body) {
        return this.request('PUT', path, { body });
    }
    patch(path, body) {
        return this.request('PATCH', path, { body });
    }
    delete(path) {
        return this.request('DELETE', path);
    }
}
//# sourceMappingURL=transport.js.map