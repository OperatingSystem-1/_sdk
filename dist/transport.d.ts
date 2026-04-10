import type { ClientConfig } from './types/index.js';
export declare class Transport {
    readonly endpoint: string;
    private config;
    private staticHeaders;
    private useSignature;
    constructor(config: ClientConfig);
    private authHeaders;
    request<T>(method: string, path: string, options?: {
        body?: unknown;
        query?: Record<string, string | number | undefined>;
        raw?: boolean;
    }): Promise<T>;
    get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    put<T>(path: string, body?: unknown): Promise<T>;
    patch<T>(path: string, body?: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
}
//# sourceMappingURL=transport.d.ts.map