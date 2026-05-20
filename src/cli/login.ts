import { Command } from 'commander';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { Keystore } from '../auth/keystore.js';

/**
 * Open a URL in the user's default browser.
 */
function openBrowser(url: string): void {
  try {
    const cmd = platform() === 'darwin'
      ? `open "${url}"`
      : platform() === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
    execSync(cmd, { stdio: 'ignore' });
  } catch {
    console.log(`\nOpen this URL in your browser:\n  ${url}\n`);
  }
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
        res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Login failed</h2><p>You can close this tab.</p></body></html>');
        clearTimeout(timeout);
        server.close();
        reject(new Error(`Login failed: ${error}`));
        return;
      }

      if (!key) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Login failed</h2><p>No API key received. You can close this tab.</p></body></html>');
        clearTimeout(timeout);
        server.close();
        reject(new Error('No API key received'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;color:#333"><h2>Logged in!</h2><p>You can close this tab and return to your terminal.</p></body></html>');
      clearTimeout(timeout);
      server.close();
      resolve({ key, email });
    });

    server.listen(port, '127.0.0.1');
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

      // Browser OAuth flow
      const port = await findFreePort();
      const loginUrl = `${endpoint}/api/auth/cli-login?port=${port}`;

      console.log('Opening browser to log in...');
      openBrowser(loginUrl);
      console.log(`Waiting for authentication (timeout: 120s)...\n`);

      try {
        const { key, email } = await waitForCallback(port, 120_000);

        // Store the key
        const config = await keystore.loadConfig().catch(() => ({}));
        await keystore.storeConfig({ ...config, endpoint, apiKey: key });

        const who = email ? ` as ${email}` : '';
        console.log(`Logged in${who}. API key stored in ~/.os1/config.json`);
        console.log(`\nYou can now run:\n  mi backup create`);
      } catch (err: any) {
        console.error(`error: ${err.message}`);
        process.exit(1);
      }
    });
}
