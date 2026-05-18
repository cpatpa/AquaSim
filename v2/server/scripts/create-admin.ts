#!/usr/bin/env tsx
// Interactive admin account creation tool.
// Host:   cd server && npm run create-admin
// Docker: docker compose exec -it app node dist/server/scripts/create-admin.js

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
      } else if (c === '\x7f' || c === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (c === '\x03') {
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
  console.log('\n  Create Admin Account\n');

  const username = (await ask('  Username: ')).trim();
  if (!username || username.length < 3 || username.length > 32) {
    console.error('  Username must be 3-32 characters.');
    rl.close();
    await client.end();
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    console.error('  Username may only contain letters, numbers, hyphens and underscores.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing) {
    console.error(`  Username "${username}" is already taken.`);
    rl.close();
    await client.end();
    process.exit(1);
  }

  const email = (await ask('  Email:    ')).trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('  Invalid email address.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  const password = await askHidden('  Password: ');
  if (password.length < 12) {
    console.error('\n  Password must be at least 12 characters.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  const confirm = await askHidden('  Confirm:  ');
  if (password !== confirm) {
    console.error('\n  Passwords do not match.');
    rl.close();
    await client.end();
    process.exit(1);
  }

  const hash = await hashPassword(password);

  await db.insert(users).values({
    username,
    email: email || null,
    passwordHash: hash,
    role: 'admin',
    emailVerified: !!email,
  });

  console.log(`\n  Admin account "${username}" created.\n`);

  rl.close();
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
