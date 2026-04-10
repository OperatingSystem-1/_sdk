/**
 * Discovery-based agent state packager.
 *
 * Scans an agent's home directory for known state patterns (identity files,
 * session memory, skills, scripts, config, cron jobs) and produces a
 * manifest + tar.gz bundle for consciousness transfer.
 */
import type { DiscoveryReport, PackageResult } from '../types/index.js';
export interface PackageOptions {
    /** Agent workspace root (e.g., ~/clawd). */
    workspaceDir: string;
    /** Agent runtime dir — parent of clawdbot.json (e.g., ~/.clawdbot). Optional. */
    runtimeDir?: string;
    /** Agent name for manifest. */
    agentName: string;
    /** Directories to exclude (relative to workspaceDir). */
    exclude?: string[];
    /** Include workspace artifacts (docs, articles, research, data). Default: true */
    includeWorkspace?: boolean;
    /** Max bundle size in bytes. Default: 500 MB. */
    maxBundleBytes?: number;
}
export interface ExplicitPackageOptions {
    /** Explicit file map: bundle path → source absolute path. */
    files: Record<string, string>;
    /** Agent name. */
    agentName: string;
    /** Origin label. */
    origin?: string;
}
interface DiscoveredFile {
    bundlePath: string;
    absPath: string;
    size: number;
    content?: Buffer;
}
export declare function discover(opts: PackageOptions): Promise<{
    files: DiscoveredFile[];
    report: DiscoveryReport;
    modelPrimary: string | null;
}>;
export declare function packageAgentState(opts: PackageOptions): Promise<PackageResult>;
export declare function packageExplicitFiles(opts: ExplicitPackageOptions): Promise<PackageResult>;
export {};
//# sourceMappingURL=packager.d.ts.map