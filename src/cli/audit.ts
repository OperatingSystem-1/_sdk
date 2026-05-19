import { Command } from 'commander';
import { registerDataAccessCommand } from './audit-data-access.js';
import { registerModelProviderCommand } from './audit-model-provider.js';

export function registerAuditCommand(program: Command): void {
  const audit = program
    .command('audit')
    .description('Audit this agent: data access, model provider, identity, safety');

  registerDataAccessCommand(audit);
  registerModelProviderCommand(audit);
}
