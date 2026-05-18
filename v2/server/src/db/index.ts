import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgres://aquasim:aquasim@localhost:5432/aquasim';

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema });
export { client };
