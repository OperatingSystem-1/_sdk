import { Command } from 'commander';
import { Keystore } from '../auth/keystore.js';
import { OS1AdminClient } from '../client.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show login status, account info, and recent backups')
    .action(async () => {
      const keystore = new Keystore();
      let config: Record<string, unknown>;

      try {
        config = await keystore.loadConfig();
      } catch {
        console.log('Not logged in. Run: mi login');
        return;
      }

      const apiKey = config.apiKey as string | undefined;
      const endpoint = (config.endpoint as string) || 'https://mitosislabs.ai';

      if (!apiKey) {
        console.log('Not logged in. Run: mi login');
        return;
      }

      console.log(`Endpoint:  ${endpoint}`);
      console.log(`API key:   ${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`);

      // Try to hit the API to verify the key works and get data
      try {
        const client = new OS1AdminClient({ endpoint, token: apiKey });

        // Get backup health (also serves as connectivity + auth check)
        try {
          const health = await client.backups.health('_');
          console.log(`Server:    reachable`);
          console.log(`\nBackups`);
          console.log(`  Subscription:  ${health.configured ? 'active' : 'inactive'}`);
          console.log(`  Snapshots:     ${health.totalSnapshots}`);
          if (health.hoursSinceLastBackup != null) {
            const h = health.hoursSinceLastBackup;
            const ago = h < 1 ? `${Math.round(h * 60)}m ago` : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
            console.log(`  Last backup:   ${ago}`);
          } else {
            console.log(`  Last backup:   never`);
          }
          if (health.schedules.length > 0) {
            console.log(`  Schedules:     ${health.schedules.length} active`);
          }
        } catch (healthErr: any) {
          if (healthErr.status === 401) {
            console.log(`Server:    reachable`);
            console.log(`Auth:      invalid key — run: mi login`);
            return;
          }
          console.log(`Server:    reachable (backups API unavailable)`);
        }

        // Get recent snapshots
        try {
          const { snapshots } = await client.backups.listSnapshots('_', { limit: 5 });
          if (snapshots.length > 0) {
            console.log(`\nRecent snapshots`);
            for (const s of snapshots) {
              const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              }) : '?';
              const agent = s.agentName || 'all';
              const label = s.label ? ` — ${s.label}` : '';
              const size = s.totalCompressedBytes > 0
                ? ` (${formatBytes(s.totalCompressedBytes)})`
                : '';
              console.log(`  ${s.status === 'completed' ? '+' : '!'} ${date}  ${agent}${size}${label}`);
            }
          }
        } catch {
          // List may fail if no snapshots exist
        }
      } catch (err: any) {
        if (err.status === 401 || err.message?.includes('401')) {
          console.log(`Server:    reachable`);
          console.log(`Auth:      invalid key — run: mi login`);
        } else {
          console.log(`Server:    error — ${err.message}`);
        }
      }
    });
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
