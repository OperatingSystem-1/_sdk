import type { ClientConfig } from './types/index.js';
import { makeAuthHeader } from './auth/index.js';
import { OS1Error } from './types/index.js';

let _signRequest: typeof import('./auth/sign.js').signRequest | null = null;

export class Transport {
  readonly endpoint: string;
  private config: ClientConfig;
  private staticHeaders: Record<string, string>;
  private useSignature: boolean;

  constructor(config: ClientConfig) {
    this.config = config;
    this.endpoint = config.endpoint;
    this.useSignature = !!(config.signingKey && config.agentId);

    // Pre-compute static auth headers once at construction.
    // Only the pubkey signature varies per-request (timestamp + path).
    this.staticHeaders = {};
    if (config.agentKey) {
      this.staticHeaders['X-Agent-Api-Key'] = config.agentKey;
    } else if (config.auth.type === 'apiKey' && config.auth.key) {
      this.staticHeaders['Authorization'] = makeAuthHeader(config.auth.key, config.auth.userId);
    } else if (config.auth.type === 'token' && config.auth.token) {
      this.staticHeaders['Authorization'] = `Bearer ${config.auth.token}`;
    }
  }

  private async authHeaders(method: string, path: string): Promise<Record<string, string>> {
    if (this.useSignature) {
      if (!_signRequest) {
        _signRequest = (await import('./auth/sign.js')).signRequest;
      }
      const signed = await _signRequest(this.config.signingKey!, this.config.agentId!, method, path);
      return Object.keys(this.staticHeaders).length
        ? { ...signed, ...this.staticHeaders }
        : signed;
    }

    if (!Object.keys(this.staticHeaders).length) {
      throw new Error('Unsupported auth configuration');
    }
    return this.staticHeaders;
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      raw?: boolean;
    },
  ): Promise<T> {
    let fullPath = path;
    if (options?.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) fullPath += `?${qs}`;
    }

    const url = `${this.config.endpoint}${fullPath}`;
    const headers: Record<string, string> = { ...(await this.authHeaders(method, fullPath)) };

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

      if (options?.raw) return response as unknown as T;

      if (!response.ok) {
        let message = response.statusText;
        let code: string | undefined;
        try {
          const err = (await response.json()) as { error?: string; message?: string; code?: string };
          message = err.error || err.message || message;
          code = err.code;
        } catch { /* non-JSON error body */ }
        throw new OS1Error(response.status, message, code);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }
      return (await response.text()) as unknown as T;
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
