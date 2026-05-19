import { createMiddleware } from 'hono/factory';
import { verifyAccessToken, type TokenPayload } from '../lib/tokens.js';
import { trackActivity, trackLiveUser } from '../lib/analytics.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: TokenPayload;
  }
}

export const authRequired = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (payload.purpose === 'mfa') {
    return c.json({ error: 'MFA verification required' }, 401);
  }

  c.set('user', payload);

  trackActivity(payload.sub).catch(() => {});
  trackLiveUser(payload.sub);

  await next();
});

export const authOptional = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      c.set('user', payload);
      trackActivity(payload.sub).catch(() => {});
      trackLiveUser(payload.sub);
    }
  }
  await next();
});
