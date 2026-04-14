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
export declare const DEFAULT_PROXY_PORT = 14300;
export interface ProxyAdapterConfig {
    /** Office-manager base URL (e.g., https://m.mitosislabs.ai) */
    omUrl: string;
    /** Office ID for the office-scoped API path */
    officeId: string;
    /** Agent name for X-Agent-Id header */
    agentId: string;
    /** secp256k1 private key hex for request signing */
    signingKey: string;
    /** Local port to listen on. Default: 14300 */
    port?: number;
}
/**
 * Translate an extension path to the OM API path.
 * Returns null if the path doesn't match any known route.
 */
export declare function translatePath(extensionPath: string, officeId: string): string | null;
/**
 * Start the proxy adapter HTTP server.
 * Returns a handle with the server and a stop function.
 */
export declare function startProxyAdapter(config: ProxyAdapterConfig): {
    server: ReturnType<typeof createServer>;
    port: number;
    stop: () => Promise<void>;
};
/**
 * Generate the standalone proxy adapter script that runs as a background process.
 * This is written to disk and executed via node so it survives the CLI process exiting.
 */
export declare function generateProxyScript(config: ProxyAdapterConfig): string;
//# sourceMappingURL=xmtp-proxy-adapter.d.ts.map