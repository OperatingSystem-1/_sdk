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

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

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

/** Detect the gateway binary name. */
function detectGatewayBinary(): string | null {
  for (const name of ['clawdbot', 'openclaw']) {
    try {
      execSync(`which ${name}`, { stdio: 'pipe' });
      return name;
    } catch { /* not found */ }
  }
  return null;
}

/** Find the gateway config file. */
function findConfigPath(): string | null {
  const candidates = [
    pathJoin(homedir(), '.clawdbot', 'clawdbot.json'),
    pathJoin(homedir(), '.openclaw', 'openclaw.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Install and enable the XMTP channel on the local OpenClaw agent.
 */
export async function installXmtpChannel(opts: InstallXmtpOptions): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    pluginInstalled: false,
    configUpdated: false,
    gatewayRestarted: false,
    warnings: [],
  };

  // ── Step 1: Detect gateway ─────────────────────────────────────
  const binary = detectGatewayBinary();
  if (!binary) {
    result.error = 'No OpenClaw gateway found (tried clawdbot, openclaw)';
    return result;
  }

  const configPath = findConfigPath();
  if (!configPath) {
    result.error = 'No gateway config found';
    return result;
  }

  // ── Step 2: Install the XMTP plugin ────────────────────────────
  // Clone from GitHub and install from local path. The plugin needs
  // compat patching for clawdbot (pre-rename) gateways.
  const tmpPluginDir = pathJoin(homedir(), '.os1', 'openclaw-xmtp');
  try {
    // Clone if not already present
    if (!existsSync(pathJoin(tmpPluginDir, 'package.json'))) {
      mkdirSync(pathJoin(homedir(), '.os1'), { recursive: true });
      execSync(`git clone https://github.com/flooredApe/openclaw-xmtp.git "${tmpPluginDir}"`, {
        stdio: 'pipe',
        timeout: 30000,
      });
    }

    // Install npm deps
    execSync('npm install', { cwd: tmpPluginDir, stdio: 'pipe', timeout: 60000 });

    // Compat: add clawdbot.extensions alias for older gateways
    const pkgPath = pathJoin(tmpPluginDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (!pkg.clawdbot && pkg.openclaw) {
      pkg.clawdbot = pkg.openclaw;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }

    // Compat: copy openclaw.plugin.json → clawdbot.plugin.json
    const oclawManifest = pathJoin(tmpPluginDir, 'openclaw.plugin.json');
    const clawdManifest = pathJoin(tmpPluginDir, 'clawdbot.plugin.json');
    if (existsSync(oclawManifest) && !existsSync(clawdManifest)) {
      writeFileSync(clawdManifest, readFileSync(oclawManifest, 'utf8'));
    }

    // Compat: patch openclaw/plugin-sdk → clawdbot/plugin-sdk for older gateways
    if (binary === 'clawdbot') {
      const filesToPatch = ['index.ts', 'src/channel.ts', 'src/config-schema.ts',
        'src/runtime.ts', 'src/types.ts', 'src/xmtp-client.ts'];
      for (const f of filesToPatch) {
        const fp = pathJoin(tmpPluginDir, f);
        if (existsSync(fp)) {
          let content = readFileSync(fp, 'utf8');
          content = content.replace(/openclaw\/plugin-sdk/g, 'clawdbot/plugin-sdk');
          content = content.replace(/OpenClawPluginApi/g, 'ClawdbotPluginApi');
          content = content.replace(/OpenClawConfig/g, 'ClawdbotConfig');
          writeFileSync(fp, content);
        }
      }
    }

    // Install via gateway CLI
    execSync(`${binary} plugins install "${tmpPluginDir}"`, {
      stdio: 'pipe',
      timeout: 30000,
    });
    result.pluginInstalled = true;
  } catch (err: any) {
    const stderr = err.stderr?.toString() || err.message || '';
    if (stderr.includes('already') || stderr.includes('exists')) {
      result.pluginInstalled = true;
      result.warnings.push('XMTP plugin already installed');
    } else {
      result.warnings.push(`XMTP plugin install: ${stderr.substring(0, 200)}`);
    }
  }

  // ── Step 3: Update gateway config ──────────────────────────────
  // Add the XMTP channel with the agent's private key for direct
  // network access. The agent signs XMTP messages with this key.
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));

    // Enable the plugin
    if (!config.plugins) config.plugins = {};
    if (!config.plugins.entries) config.plugins.entries = {};
    config.plugins.entries.xmtp = { enabled: true };

    // Configure the XMTP channel with the agent's own key.
    // The agent connects directly to the XMTP network — no bridge, no relay.
    if (!config.channels) config.channels = {};
    // Determine the correct db path for the agent's home directory
    const configDir = configPath.includes('.clawdbot')
      ? pathJoin(homedir(), '.clawdbot')
      : pathJoin(homedir(), '.openclaw');
    const dbPath = pathJoin(configDir, 'agents', 'default', 'xmtp-db');
    mkdirSync(pathJoin(configDir, 'agents', 'default'), { recursive: true });

    config.channels.xmtp = {
      enabled: true,
      dmPolicy: 'open',
      allowFrom: ['*'],
      accounts: {
        default: {
          // The agent's secp256k1 private key (same one used for request signing).
          // XMTP uses this to derive the Ethereum address and sign messages.
          privateKey: `0x${opts.privateKey}`,
          enabled: true,
          name: opts.agentName,
          // XMTP local database path — must be writable by the agent process
          dbPath,
        },
      },
      // The office group conversation ID — the plugin joins this group on startup
      // so the agent can participate in office-wide chat.
      ...(opts.xmtpGroupId ? { officeGroupId: opts.xmtpGroupId } : {}),
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    result.configUpdated = true;
  } catch (err: any) {
    result.error = `Failed to update config: ${err.message}`;
    return result;
  }

  // ── Step 4: Restart the gateway ────────────────────────────────
  try {
    // Try HUP signal first (graceful reload)
    execSync('pkill -HUP -f "clawdbot-gateway\\|openclaw-gateway" 2>/dev/null || true', {
      stdio: 'pipe',
      timeout: 5000,
    });
    result.gatewayRestarted = true;
  } catch {
    // Try systemctl
    try {
      execSync('systemctl restart clawdbot 2>/dev/null || systemctl restart openclaw 2>/dev/null || true', {
        stdio: 'pipe',
        timeout: 10000,
      });
      result.gatewayRestarted = true;
    } catch {
      result.warnings.push('Could not restart gateway — restart manually to enable XMTP');
    }
  }

  // ── Step 5: Wait for gateway health ────────────────────────────
  if (result.gatewayRestarted) {
    const maxWait = 60000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch('http://localhost:18789/healthz', {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) break;
      } catch { /* not ready */ }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  result.success = result.configUpdated;
  return result;
}
