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
