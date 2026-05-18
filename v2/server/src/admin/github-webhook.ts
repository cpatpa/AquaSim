import { Hono } from 'hono';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export const webhookRoutes = new Hono();

webhookRoutes.post('/github-deploy', async (c) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: 'Webhook not configured' }, 503);
  }

  const signature = c.req.header('X-Hub-Signature-256');
  if (!signature) {
    return c.json({ error: 'Missing signature' }, 401);
  }

  const rawBody = await c.req.text();
  const expectedSig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody);
  const ref = payload.ref;
  if (ref !== 'refs/heads/main' && ref !== 'refs/heads/master') {
    return c.json({ message: `Ignored push to ${ref}` }, 200);
  }

  const logPath = '/var/log/aquasim-deploy.log';
  const timestamp = new Date().toISOString();

  fs.appendFileSync(logPath, `\n--- Deploy triggered at ${timestamp} ---\n`);

  const child = spawn('bash', ['-c', 'git pull && docker compose up -d --build'], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (child.stdout) {
    child.stdout.on('data', (data: Buffer) => {
      fs.appendFileSync(logPath, data.toString());
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (data: Buffer) => {
      fs.appendFileSync(logPath, data.toString());
    });
  }

  child.unref();

  return c.json({ message: 'Deploy triggered', timestamp }, 200);
});
