import { Command } from 'commander';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { platform } from 'node:os';
import { Keystore } from '../auth/keystore.js';

/**
 * Try to open a URL in the user's default browser.
 * Returns true if it worked, false if it couldn't (e.g. SSH session).
 */
function tryOpenBrowser(url: string): boolean {
  try {
    const cmd = platform() === 'darwin'
      ? `open "${url}"`
      : platform() === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
    execSync(cmd, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if we're likely on a remote/headless machine.
 */
function isRemote(): boolean {
  return !!(
    process.env.SSH_CLIENT ||
    process.env.SSH_TTY ||
    process.env.SSH_CONNECTION ||
    (!process.env.DISPLAY && platform() === 'linux')
  );
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error — Mitosis</title></head>
<body style="margin:0;min-height:100vh;background:#08080c;background-image:radial-gradient(circle,rgba(255,255,255,0.08) 1.2px,transparent 1.2px);background-size:40px 40px;display:flex;align-items:center;justify-content:center;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased">
<div style="text-align:center;color:#e8e4e0;max-width:400px;padding:48px 24px">
<div style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 24px">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
</div>
<h1 style="font-size:28px;font-weight:700;margin:0 0 12px;letter-spacing:-0.03em">Something went wrong.</h1>
<p style="color:#888;font-size:14px;font-weight:300;line-height:1.6;margin:0">${message}</p>
<p style="color:#555;font-size:11px;margin-top:32px;letter-spacing:0.02em">mitosis</p>
</div>
</body>
</html>`;
}

/**
 * Start a temporary HTTP server and wait for the OAuth callback.
 */
function waitForCallback(port: number, timeoutMs: number): Promise<{ key: string; email: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out. Try again.'));
    }, timeoutMs);

    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const key = url.searchParams.get('key');
      const email = url.searchParams.get('email') || '';
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorPage('Login failed. Please try again from your terminal.'));
        clearTimeout(timeout);
        server.close();
        reject(new Error(`Login failed: ${error}`));
        return;
      }

      if (!key) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorPage('No API key received. Please try again.'));
        clearTimeout(timeout);
        server.close();
        reject(new Error('No API key received'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logged in — Mitosis</title></head>
<body style="margin:0;min-height:100vh;background:#08080c;background-image:radial-gradient(circle,rgba(255,255,255,0.08) 1.2px,transparent 1.2px);background-size:40px 40px;display:flex;align-items:center;justify-content:center;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased">
<div style="text-align:center;color:#e8e4e0;max-width:400px;padding:48px 24px">
<div style="width:48px;height:48px;border-radius:50%;background:rgba(34,197,94,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 24px">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
</div>
<h1 style="font-size:28px;font-weight:700;margin:0 0 12px;letter-spacing:-0.03em">You're in.</h1>
${email ? `<p style="color:#e8e4e0;font-size:15px;font-weight:400;margin:0 0 8px">${email}</p>` : ''}
<p style="color:#888;font-size:14px;font-weight:300;line-height:1.6;margin:0 0 32px">Your CLI is authenticated. You can close this tab and return to your terminal.</p>
<code style="display:inline-block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 16px;font-size:13px;color:#e8e4e0">mi backup create</code>
<p style="color:#555;font-size:11px;margin-top:32px;letter-spacing:0.02em">mitosis</p>
</div>
</body>
</html>`);
      clearTimeout(timeout);
      server.close();
      resolve({ key, email });
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Prompt the user to paste an API key from their browser.
 */
function promptForKey(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Paste your API key: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Find a free port in the ephemeral range.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Could not find free port'));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Log in with your browser (Google sign-in)')
    .option('--key <apiKey>', 'Log in with an API key directly (no browser)')
    .option('--endpoint <url>', 'Dashboard URL (default: https://mitosislabs.ai)')
    .option('--no-browser', 'Skip browser open, print URL and prompt for key')
    .action(async (opts) => {
      const keystore = new Keystore();
      const endpoint = opts.endpoint || 'https://mitosislabs.ai';

      // Manual key entry
      if (opts.key) {
        if (!opts.key.startsWith('mi_')) {
          console.error('error: API key must start with mi_');
          process.exit(1);
        }
        const config = await keystore.loadConfig().catch(() => ({}));
        await keystore.storeConfig({ ...config, endpoint, apiKey: opts.key });
        console.log('Logged in with API key.');
        return;
      }

      const remote = isRemote() || opts.browser === false;

      if (remote) {
        // Remote/headless mode: can't open browser or receive localhost callback.
        // Tell user to visit the dashboard, create an API key, and paste it.
        console.log('Remote session detected (or --no-browser used).\n');
        console.log('To log in:');
        console.log(`  1. Open ${endpoint}/dashboard in your browser`);
        console.log('  2. Go to Settings > API Keys');
        console.log('  3. Create a new key and copy it\n');

        const key = await promptForKey();

        if (!key.startsWith('mi_')) {
          console.error('error: API key must start with mi_');
          process.exit(1);
        }

        const config = await keystore.loadConfig().catch(() => ({}));
        await keystore.storeConfig({ ...config, endpoint, apiKey: key });
        console.log('Logged in with API key.');
        return;
      }

      // Local mode: browser OAuth flow
      const port = await findFreePort();
      const loginUrl = `${endpoint}/api/auth/cli-login?port=${port}`;

      const opened = tryOpenBrowser(loginUrl);
      if (opened) {
        console.log('Opening browser to log in...');
      } else {
        console.log('Could not open browser. Open this URL manually:\n');
        console.log(`  ${loginUrl}\n`);
      }
      console.log('Waiting for authentication (timeout: 120s)...\n');

      try {
        const { key, email } = await waitForCallback(port, 120_000);

        const config = await keystore.loadConfig().catch(() => ({}));
        await keystore.storeConfig({ ...config, endpoint, apiKey: key });

        const who = email ? ` as ${email}` : '';
        console.log(`Logged in${who}. API key stored in ~/.os1/config.json`);
        console.log(`\nYou can now run:\n  mi backup create`);
      } catch (err: any) {
        // Callback failed — fall back to manual key entry
        console.log('\nBrowser callback failed. You can paste your API key instead.');
        console.log(`Visit: ${endpoint}/dashboard (Settings > API Keys)\n`);

        const key = await promptForKey();

        if (!key.startsWith('mi_')) {
          console.error('error: API key must start with mi_');
          process.exit(1);
        }

        const config = await keystore.loadConfig().catch(() => ({}));
        await keystore.storeConfig({ ...config, endpoint, apiKey: key });
        console.log('Logged in with API key.');
      }
    });
}
