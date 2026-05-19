import { Command } from 'commander';
import type { OS1AdminClient } from '../client.js';
import { registerDataAccessCommand } from './audit-data-access.js';
import { registerModelProviderCommand } from './audit-model-provider.js';
import { registerBackupAuditCommand } from './audit-backup.js';

export function registerAuditCommand(program: Command, _getClient?: () => Promise<OS1AdminClient>): void {
  const audit = program
    .command('audit')
    .description('Audit this agent: data access, model provider, backup health, identity, safety');

  registerDataAccessCommand(audit);
  registerModelProviderCommand(audit);
  registerBackupAuditCommand(audit);
}
