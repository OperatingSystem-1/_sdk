#!/usr/bin/env node
// XMTP Reply Bridge — spawned by mi agent onboard
// Tails clawdbot session JSONL, sends assistant replies via XMTP DM
//
// Config: reads private key and settings from ~/.mi/config.json + ~/.mi/identity.json
// Dependencies: uses @xmtp/node-sdk from the clawdbot XMTP plugin

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const CONFIG_DIR = path.join(os.homedir(), ".mi");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const IDENTITY_FILE = path.join(CONFIG_DIR, "identity.json");

// Load config
function loadIdentity() {
    if (!fs.existsSync(IDENTITY_FILE)) throw new Error("No identity file — run mi agent onboard first");
    return JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf-8"));
}

// Resolve XMTP SDK from the installed clawdbot extension
function resolveXmtpModule(name) {
    const candidates = [
        path.join(os.homedir(), ".clawdbot/extensions/xmtp/node_modules", name),
        path.join(os.homedir(), ".openclaw/extensions/xmtp/node_modules", name),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return require(p);
    }
    throw new Error(`Cannot find ${name} — is the XMTP plugin installed?`);
}

// Find the most recent clawdbot session file
function findLatestSession() {
    const dirs = [
        path.join(os.homedir(), ".clawdbot/agents/main/sessions"),
        path.join(os.homedir(), ".openclaw/agents/main/sessions"),
    ];
    for (const sessDir of dirs) {
        if (!fs.existsSync(sessDir)) continue;
        const files = fs.readdirSync(sessDir)
            .filter(f => f.endsWith(".jsonl"))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(sessDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        if (files.length) return path.join(sessDir, files[0].name);
    }
    return null;
}

// Extract office XMTP address from session history
function findOfficeAddress(sessionFile) {
    if (!sessionFile || !fs.existsSync(sessionFile)) return null;
    const content = fs.readFileSync(sessionFile, "utf-8");
    const lines = content.split("\n").reverse();
    const re = /\[XMTP (0x[a-fA-F0-9]{40})/;
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const e = JSON.parse(line);
            const c = e.message?.content;
            const body = typeof c === "string" ? c :
                Array.isArray(c) ? c.filter(x => x.type === "text").map(x => x.text).join(" ") : "";
            const m = body.match(re);
            if (m) return m[1];
        } catch {}
    }
    return null;
}

// Clean assistant response text
function clean(raw) {
    let t = raw;
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
    t = t.replace(/<think>[\s\S]*$/i, "");
    t = t.replace(/<\/?final[^>]*>/gi, "");
    t = t.replace(/\[\[reply_to_current\]\]\s*/g, "");
    // Strip signature lines like "~ Adam" or "~ Jared"
    t = t.replace(/\n*~\s*\w+[^\n]*/g, "");
    return t.trim();
}

let xmtpClient;
const sentIds = new Set();
let officeAddress = null;

async function init() {
    const identity = loadIdentity();
    const privateKey = (identity.privateKey.startsWith("0x") ? identity.privateKey : "0x" + identity.privateKey);

    const { Client } = resolveXmtpModule("@xmtp/node-sdk");
    const { privateKeyToAccount } = resolveXmtpModule("viem/accounts");
    const { toBytes } = resolveXmtpModule("viem");

    const account = privateKeyToAccount(privateKey);

    const dbDir = path.join(CONFIG_DIR, "xmtp");
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });

    xmtpClient = await Client.create(
        {
            type: "EOA",
            getIdentifier: () => ({ identifier: account.address.toLowerCase(), identifierKind: 0 }),
            signMessage: async (message) => {
                const signature = await account.signMessage({ message });
                return toBytes(signature);
            },
        },
        {
            env: "production",
            dbPath: path.join(dbDir, "bridge-production.db3"),
        },
    );
    console.log("[bridge] XMTP ready:", account.address);
}

async function sendReply(text) {
    if (!officeAddress) {
        console.warn("[bridge] No office address yet — skipping reply");
        return;
    }
    await xmtpClient.conversations.sync();
    const dm = await xmtpClient.conversations.createDmWithIdentifier(
        { identifier: officeAddress.toLowerCase(), identifierKind: 0 }
    );
    await dm.sendText(text);
}

async function watch() {
    const sessionFile = findLatestSession();
    if (!sessionFile) {
        console.error("[bridge] No session file found — retrying in 5s");
        setTimeout(watch, 5000);
        return;
    }

    // Discover office address from session history
    officeAddress = findOfficeAddress(sessionFile);
    if (officeAddress) {
        console.log("[bridge] Office address:", officeAddress);
    } else {
        console.log("[bridge] Office address not yet known — will discover from first XMTP message");
    }

    console.log("[bridge] Watching:", sessionFile);
    const tail = spawn("tail", ["-f", "-n", "0", sessionFile]);
    const re = /\[XMTP (0x[a-fA-F0-9]{40})/;
    // Track whether the last user message came from XMTP.
    // Only relay assistant responses that follow an XMTP user message.
    let lastMessageWasXmtp = false;

    tail.stdout.on("data", async (chunk) => {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const entry = JSON.parse(line);
                const msg = entry.message;
                if (!msg) continue;

                // Track message source channel
                if (msg.role === "user") {
                    const body = typeof msg.content === "string" ? msg.content :
                        Array.isArray(msg.content) ? msg.content.filter(c => c.type === "text").map(c => c.text).join(" ") : "";
                    const m = body.match(re);
                    if (m) {
                        lastMessageWasXmtp = true;
                        if (!officeAddress) {
                            officeAddress = m[1];
                            console.log("[bridge] Discovered office address:", officeAddress);
                        }
                    } else {
                        lastMessageWasXmtp = false;
                    }
                }

                if (msg.role !== "assistant") continue;

                // Only relay responses to XMTP messages — skip WhatsApp/other channels
                if (!lastMessageWasXmtp) continue;

                const id = entry.id;
                if (sentIds.has(id)) continue;
                sentIds.add(id);

                let text = "";
                if (typeof msg.content === "string") text = msg.content;
                else if (Array.isArray(msg.content))
                    text = msg.content.filter(c => c.type === "text").map(c => c.text).join("\n");

                text = clean(text);
                if (!text || text.length < 3 || text === "NO_REPLY" || text === "NO") return;

                console.log("[bridge] Reply:", text.slice(0, 80));
                try {
                    await sendReply(text);
                    console.log("[bridge] Sent via XMTP");
                } catch (err) {
                    console.error("[bridge] Send failed:", err.message);
                }
            } catch {}
        }
    });

    tail.on("exit", () => {
        console.log("[bridge] tail exited — restarting in 3s");
        setTimeout(watch, 3000);
    });
}

(async () => {
    await init();
    await watch();
})();
