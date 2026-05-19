import { createMiddleware } from 'hono/factory';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipBuckets = new Map<string, RateLimitEntry>();
const loginBuckets = new Map<string, RateLimitEntry>();

function cleanup(map: Map<string, RateLimitEntry>) {
  const now = Date.now();
  for (const [key, entry] of map) {
    if (entry.resetAt <= now) map.delete(key);
  }
}

setInterval(() => {
  cleanup(ipBuckets);
  cleanup(loginBuckets);
}, 60_000);

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('X-Real-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || '0.0.0.0';
}

export const apiRateLimit = createMiddleware(async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 100;

  let entry = ipBuckets.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    ipBuckets.set(ip, entry);
  }

  entry.count++;
  if (entry.count > maxRequests) {
    c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: 'Too many requests' }, 429);
  }

  await next();
});

const sensitiveBuckets = new Map<string, RateLimitEntry>();

setInterval(() => cleanup(sensitiveBuckets), 60_000);

export const sensitiveRateLimit = createMiddleware(async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();
  const windowMs = 60 * 60_000;
  const maxAttempts = 10;

  let entry = sensitiveBuckets.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    sensitiveBuckets.set(ip, entry);
  }

  entry.count++;
  if (entry.count > maxAttempts) {
    c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: 'Too many requests. Try again later.' }, 429);
  }

  await next();
});

const accountBuckets = new Map<string, RateLimitEntry>();

setInterval(() => cleanup(accountBuckets), 60_000);

export function checkAccountLockout(username: string): string | null {
  const key = `acct:${username.toLowerCase()}`;
  const now = Date.now();
  const entry = accountBuckets.get(key);
  if (entry && entry.resetAt > now && entry.count > 10) {
    return 'Account temporarily locked due to too many failed attempts. Try again later.';
  }
  return null;
}

export function recordFailedLogin(username: string): void {
  const key = `acct:${username.toLowerCase()}`;
  const now = Date.now();
  const windowMs = 60 * 60_000;
  let entry = accountBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    accountBuckets.set(key, entry);
  }
  entry.count++;
}

export const loginRateLimit = createMiddleware(async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();
  const windowMs = 15 * 60_000;
  const maxAttempts = 5;

  let entry = loginBuckets.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    loginBuckets.set(ip, entry);
  }

  entry.count++;
  if (entry.count > maxAttempts) {
    c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
  }

  await next();
});
