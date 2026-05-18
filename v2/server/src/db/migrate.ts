import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from './index.js';

async function runMigrations() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await client.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
