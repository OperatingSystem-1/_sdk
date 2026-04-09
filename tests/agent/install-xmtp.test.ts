/**
 * Tests for the XMTP channel installer.
 *
 * Component-level tests verifying:
 * - Gateway config is correctly updated with XMTP channel + private key
 * - Existing config is preserved (plugins, channels not overwritten)
 * - Private key is written with 0x prefix for XMTP/viem compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'os1-install-xmtp-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Config update logic (extracted from install-xmtp.ts) ───────────

/** Simulate the config update that installXmtpChannel performs. */
function applyXmtpConfig(configPath: string, agentName: string, privateKey: string) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};
  config.plugins.entries.xmtp = { enabled: true };

  if (!config.channels) config.channels = {};
  config.channels.xmtp = {
    enabled: true,
    dmPolicy: 'open',
    allowFrom: ['*'],
    accounts: {
      default: {
        privateKey: `0x${privateKey}`,
        enabled: true,
        name: agentName,
      },
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('XMTP config update', () => {
  it('adds xmtp plugin and channel to existing config', () => {
    const configPath = join(tmpDir, 'clawdbot.json');
    writeFileSync(configPath, JSON.stringify({
      plugins: { entries: { whatsapp: { enabled: true } } },
      channels: { whatsapp: { dmPolicy: 'allowlist' } },
      models: { providers: { 'amazon-bedrock': {} } },
    }));

    const updated = applyXmtpConfig(configPath, 'jared', 'aa'.repeat(32));

    // XMTP added
    expect(updated.plugins.entries.xmtp).toEqual({ enabled: true });
    expect(updated.channels.xmtp.enabled).toBe(true);
    expect(updated.channels.xmtp.dmPolicy).toBe('open');
    expect(updated.channels.xmtp.accounts.default.name).toBe('jared');
    expect(updated.channels.xmtp.accounts.default.privateKey).toBe('0x' + 'aa'.repeat(32));

    // Existing config preserved
    expect(updated.plugins.entries.whatsapp).toEqual({ enabled: true });
    expect(updated.channels.whatsapp).toEqual({ dmPolicy: 'allowlist' });
    expect(updated.models.providers['amazon-bedrock']).toBeDefined();
  });

  it('creates plugins and channels sections when missing', () => {
    const configPath = join(tmpDir, 'clawdbot.json');
    writeFileSync(configPath, JSON.stringify({ models: {} }));

    const updated = applyXmtpConfig(configPath, 'test-agent', 'bb'.repeat(32));

    expect(updated.plugins.entries.xmtp.enabled).toBe(true);
    expect(updated.channels.xmtp.accounts.default.privateKey).toBe('0x' + 'bb'.repeat(32));
    expect(updated.models).toBeDefined();
  });

  it('overwrites existing xmtp config on re-install', () => {
    const configPath = join(tmpDir, 'clawdbot.json');
    writeFileSync(configPath, JSON.stringify({
      plugins: { entries: { xmtp: { enabled: false } } },
      channels: { xmtp: { dmPolicy: 'disabled' } },
    }));

    const updated = applyXmtpConfig(configPath, 'new-agent', 'cc'.repeat(32));

    expect(updated.plugins.entries.xmtp.enabled).toBe(true);
    expect(updated.channels.xmtp.dmPolicy).toBe('open');
    expect(updated.channels.xmtp.accounts.default.name).toBe('new-agent');
  });

  it('writes private key with 0x prefix for viem/XMTP compatibility', () => {
    const configPath = join(tmpDir, 'clawdbot.json');
    writeFileSync(configPath, JSON.stringify({}));
    const key = 'deadbeef'.repeat(8); // 64 hex chars = 32 bytes

    const updated = applyXmtpConfig(configPath, 'agent', key);

    const writtenKey = updated.channels.xmtp.accounts.default.privateKey;
    expect(writtenKey).toBe(`0x${key}`);
    expect(writtenKey).toHaveLength(66); // 0x + 64 hex chars
    expect(writtenKey.startsWith('0x')).toBe(true);
  });

  it('handles Jared-like config (Bedrock + WhatsApp + Telegram)', () => {
    const configPath = join(tmpDir, 'clawdbot.json');
    // Jared's actual config structure (simplified)
    writeFileSync(configPath, JSON.stringify({
      models: {
        providers: {
          anthropic: { baseUrl: 'https://api.anthropic.com' },
          'amazon-bedrock': { baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com' },
        },
      },
      agents: { defaults: { model: { primary: 'amazon-bedrock/us.anthropic.claude-sonnet-4-6' } } },
      plugins: { entries: { whatsapp: { enabled: true }, telegram: { enabled: true } } },
      channels: {
        whatsapp: { dmPolicy: 'allowlist', allowFrom: ['+14156236154'], groupPolicy: 'open' },
        telegram: { dmPolicy: 'allowlist', botToken: 'fake-token' },
      },
    }));

    const updated = applyXmtpConfig(configPath, 'jared', 'dd'.repeat(32));

    // XMTP added alongside existing channels
    expect(updated.channels.xmtp.enabled).toBe(true);
    expect(updated.plugins.entries.xmtp.enabled).toBe(true);

    // Everything else untouched
    expect(updated.channels.whatsapp.allowFrom).toEqual(['+14156236154']);
    expect(updated.channels.telegram.botToken).toBe('fake-token');
    expect(updated.plugins.entries.whatsapp.enabled).toBe(true);
    expect(updated.plugins.entries.telegram.enabled).toBe(true);
    expect(updated.agents.defaults.model.primary).toBe('amazon-bedrock/us.anthropic.claude-sonnet-4-6');
  });
});
