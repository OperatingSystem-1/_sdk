/**
 * Install the XMTP reply bridge as a systemd service.
 *
 * The clawdbot gateway doesn't send XMTP DM replies natively — it routes
 * responses through web-auto-reply (WhatsApp). This bridge watches the
 * clawdbot session JSONL for assistant responses to XMTP DMs and sends
 * them back via XMTP to the office identity.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

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

const BRIDGE_SCRIPT = (opts: InstallOptions) => `
const { Client } = require("${opts.xmtpNodeModules}/@xmtp/node-sdk");
const { privateKeyToAccount } = require("${opts.xmtpNodeModules}/viem/accounts");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const account = privateKeyToAccount("0x${opts.privateKey.replace(/^0x/, '')}");
const OFFICE = "${opts.officeXmtpAddress}";
const AGENT = "${opts.agentName}";
const SESSIONS_DIR = "${opts.sessionsDir}";
const DB_PATH = "${opts.xmtpDbPath}";

let xmtpClient;
const sentIds = new Set();

async function init() {
  xmtpClient = await Client.build(
    { identifier: account.address.toLowerCase(), identifierKind: 0 },
    { env: "production", dbPath: DB_PATH },
  );
  console.log("[bridge] XMTP ready");
}

async function sendReply(text) {
  await xmtpClient.conversations.sync();
  const dm = await xmtpClient.conversations.createDmWithIdentifier(
    { identifier: OFFICE, identifierKind: 0 }
  );
  await dm.sendText(text);
}

function clean(raw) {
  let t = raw;
  t = t.replace(/<think>[\\s\\S]*?<\\/think>/gi, "");
  t = t.replace(/<think>[\\s\\S]*$/i, "");
  t = t.replace(/<\\/?final[^>]*>/gi, "");
  t = t.replace(/<\\/?final[^>]*$/i, "");
  t = t.replace(/<\\/?\s*$/, "");
  t = t.replace(/\\[\\[reply_to_current\\]\\]\\s*/g, "");
  const prefixRe = new RegExp("^\\\\[" + AGENT.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&") + "\\\\]:\\\\s*", "i");
  t = t.replace(prefixRe, "");
  t = t.replace(/\\n*~\\s.*$/s, "");
  return t.trim();
}

function findSessionFile() {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".jsonl"));
  for (const f of files) {
    try {
      const data = fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8");
      if (data.toLowerCase().includes(OFFICE.toLowerCase().slice(2))) {
        return path.join(SESSIONS_DIR, f);
      }
    } catch {}
  }
  return null;
}

function startTail(sessionFile) {
  const tail = spawn("tail", ["-f", "-n", "0", sessionFile]);
  tail.stdout.on("data", async (chunk) => {
    for (const line of chunk.toString().split("\\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const msg = entry.message;
        if (!msg || msg.role !== "assistant") continue;
        if (sentIds.has(entry.id)) continue;
        sentIds.add(entry.id);
        let text = "";
        if (typeof msg.content === "string") text = msg.content;
        else if (Array.isArray(msg.content))
          text = msg.content.filter(c => c.type === "text").map(c => c.text).join("\\n");
        text = clean(text);
        if (!text || text.length < 3 || text === "NO_REPLY" || text === "NO" || text.startsWith("[CONTEXT]")) return;
        console.log("[bridge] Reply:", text.slice(0, 80));
        try { await sendReply(text); console.log("[bridge] Sent"); }
        catch (err) { console.error("[bridge] Send failed:", err.message); }
      } catch {}
    }
  });
  tail.on("close", () => { setTimeout(() => startTail(sessionFile), 3000); });
}

function watchForSession() {
  const sf = findSessionFile();
  if (sf) { console.log("[bridge] Found session:", sf); startTail(sf); return; }
  // Watch log for first XMTP DM
  const today = new Date().toISOString().slice(0, 10);
  const logFile = "/tmp/clawdbot/clawdbot-" + today + ".log";
  if (!fs.existsSync(logFile)) { setTimeout(watchForSession, 5000); return; }
  const tail = spawn("tail", ["-f", "-n", "0", logFile]);
  tail.stdout.on("data", (chunk) => {
    if (chunk.toString().toLowerCase().includes(OFFICE.toLowerCase().slice(2, 10))) {
      setTimeout(() => {
        const sf2 = findSessionFile();
        if (sf2) { tail.kill(); console.log("[bridge] Session appeared:", sf2); startTail(sf2); }
      }, 3000);
    }
  });
  console.log("[bridge] Waiting for first XMTP DM...");
}

(async () => { await init(); watchForSession(); })();
`;

export async function installReplyBridge(opts: InstallOptions): Promise<InstallResult> {
  const home = homedir();
  const scriptPath = join(home, 'xmtp-reply-bridge.js');

  // Write the bridge script
  writeFileSync(scriptPath, BRIDGE_SCRIPT(opts));

  // Try systemd first
  try {
    const serviceName = 'xmtp-reply-bridge';
    const serviceFile = `/etc/systemd/system/${serviceName}.service`;
    const serviceContent = `[Unit]
Description=XMTP Reply Bridge for Mitosis Office
After=clawdbot.service

[Service]
ExecStart=/usr/bin/node ${scriptPath}
Restart=always
RestartSec=5
User=${process.env.USER || 'ubuntu'}
Environment=HOME=${home}
Environment=NODE_PATH=${opts.xmtpNodeModules}

[Install]
WantedBy=multi-user.target
`;

    execSync(`echo '${serviceContent.replace(/'/g, "'\\''")}' | sudo tee ${serviceFile} > /dev/null`, { stdio: 'pipe' });
    execSync('sudo systemctl daemon-reload', { stdio: 'pipe' });
    execSync(`sudo systemctl enable ${serviceName}`, { stdio: 'pipe' });
    execSync(`sudo systemctl start ${serviceName}`, { stdio: 'pipe' });

    return { success: true, method: 'systemd' };
  } catch {
    // Fall back to nohup
    try {
      execSync(`nohup node ${scriptPath} > /tmp/xmtp-bridge.log 2>&1 &`, { stdio: 'pipe' });
      return { success: true, method: 'nohup (no systemd)' };
    } catch (err: any) {
      return { success: false, method: 'none', error: err.message };
    }
  }
}
