#!/usr/bin/env tsx
// Reset a user's password from the command line.
// Usage: npx tsx scripts/reset-password.ts <username> <new-password>
//   Or from Docker: docker compose exec app node scripts/reset-password.js <username> <new-password>

import { db, client } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { hashPassword } from '../src/lib/passwords.js';
import { eq } from 'drizzle-orm';

async function main() {
  const [username, newPassword] = process.argv.slice(2);

  if (!username || !newPassword) {
    console.error('Usage: npx tsx scripts/reset-password.ts <username> <new-password>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    console.error(`No user found with username "${username}".`);
    process.exit(1);
  }

  const hash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash: hash })
    .where(eq(users.id, user.id));

  console.log(`Password reset for ${user.username} (role: ${user.role}).`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
