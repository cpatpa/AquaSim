#!/usr/bin/env tsx
// Interactive admin password reset tool.
// Usage: npx tsx scripts/reset-password.ts
//   Or from Docker: docker compose exec -it app npx tsx scripts/reset-password.ts

import * as readline from 'readline';
import { db, client } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { hashPassword } from '../src/lib/passwords.js';
import { eq } from 'drizzle-orm';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    let input = '';
    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        process.stdout.write('\n');
        if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false);
        process.stdin.removeListener('data', onData);
        resolve(input);
      } else if (c === '' || c === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (c === '') {
        process.stdout.write('\n');
        process.exit(0);
      } else {
        input += c;
        process.stdout.write('*');
      }
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function main() {
  const admins = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, 'admin'))
    .orderBy(users.username);

  if (admins.length === 0) {
    console.error('No admin accounts found.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  console.log('\n  Admin accounts:\n');
  for (let i = 0; i < admins.length; i++) {
    const a = admins[i];
    const email = a.email || 'no email';
    const created = a.createdAt.toISOString().split('T')[0];
    console.log(`  [${i + 1}]  ${a.username}  (${email})  created ${created}`);
  }
  console.log();

  const choice = await ask('  Select account number: ');
  const idx = parseInt(choice, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= admins.length) {
    console.error('Invalid selection.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  const selected = admins[idx];
  console.log(`\n  Resetting password for: ${selected.username}\n`);

  const password = await askHidden('  New password:     ');

  if (password.length < 8) {
    console.error('\n  Password must be at least 8 characters.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  const confirm = await askHidden('  Confirm password: ');

  if (password !== confirm) {
    console.error('\n  Passwords do not match.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  const hash = await hashPassword(password);

  await db
    .update(users)
    .set({ passwordHash: hash })
    .where(eq(users.id, selected.id));

  console.log(`\n  Password reset for ${selected.username}. Done.\n`);

  rl.close();
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
