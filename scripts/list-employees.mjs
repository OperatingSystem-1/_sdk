import { OS1AdminClient } from '../dist/index.js';

const jwtSecret = process.env.RELAY_JWT_SECRET;
const endpoint = process.env.OS1_ENDPOINT ?? 'https://m.mitosislabs.ai';

if (!jwtSecret) {
  console.error('RELAY_JWT_SECRET not set');
  process.exit(1);
}

const client = new OS1AdminClient({ endpoint, jwt: { jwtSecret } });

const offices = await client.offices.list();
if (offices.length === 0) {
  console.log('(no offices)');
  process.exit(0);
}

for (const office of offices) {
  const employees = await client.employees.list(office.id);
  console.log(`\n[${office.id}] ${office.name ?? ''} — ${employees.length} employee(s)`);
  for (const e of employees) {
    console.log(`  • ${e.name}${e.role ? ` (${e.role})` : ''}${e.status ? ` — ${e.status}` : ''}`);
  }
}

await client.close();
