import crypto from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { verifyAccessToken } from '../lib/tokens.js';

function generateCsrfToken(sessionId: string): string {
  const secret = process.env.JWT_SECRET || 'dev';
  return crypto.createHmac('sha256', secret).update(sessionId).digest('hex').slice(0, 32);
}

export function getCsrfToken(c: { get: (key: string) => unknown }): string {
  const user = c.get('user') as { sub: string } | undefined;
  return generateCsrfToken(user?.sub || 'anon');
}

export const adminOnly = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  let isAdmin = false;

  if (authHeader?.startsWith('Bearer ')) {
    const payload = verifyAccessToken(authHeader.slice(7));
    if (payload?.role === 'admin' && payload.purpose !== 'mfa') {
      c.set('user', payload);
      isAdmin = true;
    }
  }

  if (!isAdmin) {
    const cookie = c.req.header('Cookie');
    if (cookie) {
      const match = cookie.match(/admin_token=([^;]+)/);
      if (match) {
        const payload = verifyAccessToken(match[1]);
        if (payload?.role === 'admin' && payload.purpose !== 'mfa') {
          c.set('user', payload);
          isAdmin = true;
        }
      }
    }
  }

  if (!isAdmin) {
    return c.text('Forbidden', 403);
  }

  if (c.req.method === 'POST') {
    const contentType = c.req.header('Content-Type') || '';
    let csrfToken: string | undefined;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await c.req.parseBody();
      csrfToken = body['_csrf'] as string;
    }
    const expected = getCsrfToken(c);
    if (csrfToken !== expected) {
      return c.text('Invalid CSRF token', 403);
    }
  }

  await next();
});
