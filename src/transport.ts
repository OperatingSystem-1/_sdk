import type { ClientConfig } from './types/index.js';
import { makeAuthHeader } from './auth/index.js';
import { OS1Error } from './types/index.js';

export class Transport {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  private authHeaders(): Record<string, string> {
    // External agent mode: send the raw API key in a custom header
    // instead of wrapping it in a JWT (which is for platform/user API calls)
    if (this.config.agentKey) {
      return { 'X-Agent-Api-Key': this.config.agentKey };
    }
    return { Authorization: makeAuthHeader(this.config.apiKey, this.config.userId) };
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
    const headers: Record<string, string> = { ...this.authHeaders() };

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

      if (!response.ok) {
        let message = response.statusText;
        let code: string | undefined;
        try {
          const err = await response.json() as { message?: string; error?: string; code?: string };
          message = err.message ?? err.error ?? message;
          code = err.code;
        } catch {}
        throw new OS1Error(response.status, message, code);
      }

      if (options?.raw) return response as unknown as T;

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) return (await response.json()) as T;
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

  get endpoint(): string {
    return this.config.endpoint;
  }
}
