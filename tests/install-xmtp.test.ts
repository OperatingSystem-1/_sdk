/**
 * Unit tests for the gateway-binary detection used by `mi agent onboard`.
 *
 * Background: the user's box may have BOTH `clawdbot` (legacy) and `openclaw`
 * (modern) installed. install-xmtp.js patches the cloned plugin source for
 * whichever binary it picks. If it picks the wrong one, the openclaw runtime
 * fails to load the plugin with `Cannot read properties of undefined (reading
 * '_zod')` because the plugin imports a `plugin-sdk` whose zod copy is not
 * the one the runtime owns.
 *
 * The fix probes :18789 to see which binary is actually running.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execSyncMock = vi.fn();

vi.mock('node:child_process', () => ({
  execSync: execSyncMock,
}));

// Import AFTER the mock is set up so the module captures the mocked execSync.
const { detectGatewayBinary } = await import('../dist/agent/install-xmtp.js');

beforeEach(() => {
  execSyncMock.mockReset();
});

/**
 * Build an execSync handler that responds based on the command string. Any
 * unmatched command throws the usual ENOENT-shaped error so the production
 * code's try/catch behaves the same as it would on a real box.
 */
function withCommands(handlers: Record<string, string | (() => string)>) {
  execSyncMock.mockImplementation((cmd: string) => {
    for (const [pattern, response] of Object.entries(handlers)) {
      if (cmd.includes(pattern)) {
        const value = typeof response === 'function' ? response() : response;
        return Buffer.from(value);
      }
    }
    const err = new Error(`Command failed: ${cmd}`) as Error & { status: number };
    err.status = 1;
    throw err;
  });
}

describe('detectGatewayBinary', () => {
  it('returns "openclaw" when port 18789 is owned by an openclaw process', () => {
    withCommands({
      'lsof -i :18789': '17789\n',
      'ps -p 17789': '/opt/homebrew/opt/node/bin/node /opt/homebrew/lib/node_modules/openclaw/dist/index.js gateway --port 18789\n',
    });
    expect(detectGatewayBinary()).toBe('openclaw');
  });

  it('returns "clawdbot" when port 18789 is owned by a clawdbot process', () => {
    withCommands({
      'lsof -i :18789': '12345\n',
      'ps -p 12345': '/usr/bin/node /opt/homebrew/lib/node_modules/clawdbot/dist/index.js gateway\n',
    });
    expect(detectGatewayBinary()).toBe('clawdbot');
  });

  it('prefers the running gateway over both binaries being installed', () => {
    // Both `which openclaw` and `which clawdbot` would succeed, but the
    // running daemon is openclaw — that wins. This is the original bug:
    // pre-fix, install-xmtp picked `clawdbot` from the array order and
    // patched the plugin for the wrong runtime.
    withCommands({
      'lsof -i :18789': '17789\n',
      'ps -p 17789': 'node /opt/homebrew/lib/node_modules/openclaw/dist/index.js gateway\n',
      'which openclaw': '/opt/homebrew/bin/openclaw\n',
      'which clawdbot': '/opt/homebrew/bin/clawdbot\n',
    });
    expect(detectGatewayBinary()).toBe('openclaw');
  });

  it('falls back to which-order when no gateway is running, preferring openclaw', () => {
    // No process on 18789 — lsof returns empty / throws.
    // Both binaries installed. Should pick openclaw (modern), not clawdbot (legacy).
    withCommands({
      'which openclaw': '/opt/homebrew/bin/openclaw\n',
      'which clawdbot': '/opt/homebrew/bin/clawdbot\n',
    });
    expect(detectGatewayBinary()).toBe('openclaw');
  });

  it('falls back to clawdbot when only clawdbot is installed and no gateway runs', () => {
    withCommands({
      'which clawdbot': '/opt/homebrew/bin/clawdbot\n',
    });
    expect(detectGatewayBinary()).toBe('clawdbot');
  });

  it('returns null when neither binary is installed and nothing is listening', () => {
    withCommands({}); // every command throws
    expect(detectGatewayBinary()).toBeNull();
  });

  it('falls through to which-order if lsof exists but the running process is unknown', () => {
    // Port 18789 is bound but the process command line doesn't match either
    // gateway (something else on a colliding port). Don't return that.
    withCommands({
      'lsof -i :18789': '99999\n',
      'ps -p 99999': '/usr/bin/some-other-daemon --listen 18789\n',
      'which openclaw': '/opt/homebrew/bin/openclaw\n',
    });
    expect(detectGatewayBinary()).toBe('openclaw');
  });

  it('handles an empty lsof response (no listener) by falling through', () => {
    withCommands({
      'lsof -i :18789': '',
      'which openclaw': '/opt/homebrew/bin/openclaw\n',
    });
    expect(detectGatewayBinary()).toBe('openclaw');
  });
});
