import { createMiddleware } from 'hono/factory';
import { verifyAccessToken } from '../lib/tokens.js';

export const adminOnly = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  let isAdmin = false;

  if (authHeader?.startsWith('Bearer ')) {
    const payload = verifyAccessToken(authHeader.slice(7));
    if (payload?.role === 'admin') {
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
        if (payload?.role === 'admin') {
          c.set('user', payload);
          isAdmin = true;
        }
      }
    }
  }

  if (!isAdmin) {
    return c.text('Forbidden', 403);
  }

  await next();
});
