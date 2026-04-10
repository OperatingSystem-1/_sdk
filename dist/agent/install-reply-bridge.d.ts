/**
 * Install the XMTP reply bridge as a systemd service.
 *
 * The clawdbot gateway doesn't send XMTP DM replies natively — it routes
 * responses through web-auto-reply (WhatsApp). This bridge watches the
 * clawdbot session JSONL for assistant responses to XMTP DMs and sends
 * them back via XMTP to the office identity.
 */
interface InstallOptions {
    privateKey: string;
    officeXmtpAddress: string;
    agentName: string;
    xmtpDbPath: string;
    sessionsDir: string;
    xmtpNodeModules: string;
}
interface InstallResult {
    success: boolean;
    method: string;
    error?: string;
}
export declare function installReplyBridge(opts: InstallOptions): Promise<InstallResult>;
export {};
//# sourceMappingURL=install-reply-bridge.d.ts.map