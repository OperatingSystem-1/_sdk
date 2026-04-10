/**
 * XMTP Channel Installer — installs a direct XMTP channel plugin on an
 * OpenClaw agent during onboarding.
 *
 * The agent connects to the XMTP network directly using its own Ethereum
 * keypair (generated during onboarding). No chat-server, no proxy, no
 * bridge — XMTP is a decentralized protocol and the agent speaks on it
 * as a first-class participant.
 *
 * Steps:
 * 1. Detect the gateway binary (clawdbot or openclaw)
 * 2. Install the @openclaw/xmtp plugin via the gateway CLI
 * 3. Configure the channel with the agent's private key
 * 4. Restart the gateway
 * 5. Wait for health
 */
export interface InstallXmtpOptions {
    /** Agent name */
    agentName: string;
    /** Ethereum private key hex (no 0x prefix) — used for XMTP signing */
    privateKey: string;
    /** Ethereum address (0x-prefixed) — the agent's XMTP identity */
    ethAddress: string;
    /** Office ID (for context) */
    officeId?: string;
    /** XMTP group conversation ID — the office group to join on startup */
    xmtpGroupId?: string;
}
export interface InstallResult {
    success: boolean;
    pluginInstalled: boolean;
    configUpdated: boolean;
    gatewayRestarted: boolean;
    error?: string;
    warnings: string[];
}
/**
 * Install and enable the XMTP channel on the local OpenClaw agent.
 */
export declare function installXmtpChannel(opts: InstallXmtpOptions): Promise<InstallResult>;
//# sourceMappingURL=install-xmtp.d.ts.map