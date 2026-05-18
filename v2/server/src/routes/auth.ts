import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { users, refreshTokens, passwordResetTokens, simulations } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { signAccessToken, getRefreshTokenExpiryDate } from '../lib/tokens.js';
import { sendPasswordResetEmail, sendWelcomeEmail, isEmailConfigured } from '../lib/email.js';
import { authRequired } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import { nanoid } from 'nanoid';
import { TOTP, Secret } from 'otpauth';
import type { Context } from 'hono';

function setAdminCookie(c: Context, accessToken: string, role: string): void {
  if (role === 'admin') {
    c.header('Set-Cookie', `admin_token=${accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${15 * 60}`, { append: true });
  }
}

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(12).max(128),
  _bootstrapAdmin: z.boolean().optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
  mfaCode: z.string().optional(),
});

const promoteSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(12).max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(12).max(128),
});

const mfaVerifySchema = z.object({
  code: z.string().length(6),
});

async function generateRefreshToken(userId: string): Promise<string> {
  const rawToken = nanoid(48);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = getRefreshTokenExpiryDate();

  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });

  return rawToken;
}

export const authRoutes = new Hono();

authRoutes.post('/register', validateBody(registerSchema), async (c) => {
  const body = registerSchema.parse(await c.req.json());

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  if (body.email) {
    const emailExists = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (emailExists.length > 0) {
      return c.json({ error: 'Email already registered' }, 409);
    }
  }

  const passwordHash = await hashPassword(body.password);

  let role = 'user';
  if (body._bootstrapAdmin) {
    const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
    if (userCount[0].count === 0) {
      role = 'admin';
    }
  }

  const [user] = await db.insert(users).values({
    username: body.username,
    email: body.email,
    passwordHash,
    role,
    saveLimit: role === 'guest' ? 3 : 10,
  }).returning({ id: users.id, username: users.username, role: users.role });

  const accessToken = signAccessToken({
    sub: user.id,
    username: user.username,
    role: user.role as 'user' | 'admin' | 'guest',
  });

  const refreshToken = await generateRefreshToken(user.id);

  sendWelcomeEmail(body.email, body.username).catch(() => {});

  c.header('Set-Cookie', `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=${30 * 24 * 60 * 60}`);

  return c.json({
    token: accessToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mfaEnabled: false,
      saveCount: 0,
      saveLimit: role === 'guest' ? 3 : 10,
      createdAt: new Date().toISOString(),
    },
  }, 201);
});

authRoutes.post('/login', loginRateLimit, validateBody(loginSchema), async (c) => {
  const body = loginSchema.parse(await c.req.json());

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  if (user.isBanned) {
    return c.json({ error: 'Account suspended' }, 403);
  }

  const valid = await verifyPassword(user.passwordHash, body.password);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  if (user.mfaEnabled && user.mfaSecret) {
    if (!body.mfaCode) {
      const mfaToken = signAccessToken({
        sub: user.id,
        username: user.username,
        role: user.role as 'user' | 'admin' | 'guest',
      });
      return c.json({ mfaRequired: true, mfaToken }, 200);
    }

    const totp = new TOTP({
      secret: Secret.fromBase32(user.mfaSecret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const valid = totp.validate({ token: body.mfaCode, window: 1 });
    if (valid === null) {
      return c.json({ error: 'Invalid MFA code' }, 401);
    }
  }

  await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

  const simCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(simulations)
    .where(eq(simulations.ownerId, user.id));

  const accessToken = signAccessToken({
    sub: user.id,
    username: user.username,
    role: user.role as 'user' | 'admin' | 'guest',
  });

  const refreshToken = await generateRefreshToken(user.id);

  c.header('Set-Cookie', `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=${30 * 24 * 60 * 60}`);
  setAdminCookie(c, accessToken, user.role);

  return c.json({
    token: accessToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      saveCount: simCount[0]?.count ?? 0,
      saveLimit: user.saveLimit,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

authRoutes.post('/guest', async (c) => {
  const guestName = `guest_${nanoid(8)}`;
  const passwordHash = await hashPassword(nanoid(32));

  const [user] = await db.insert(users).values({
    username: guestName,
    passwordHash,
    role: 'guest',
    saveLimit: 3,
  }).returning({ id: users.id, username: users.username, role: users.role });

  const accessToken = signAccessToken({
    sub: user.id,
    username: user.username,
    role: 'guest',
  });

  const refreshToken = await generateRefreshToken(user.id);

  c.header('Set-Cookie', `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=${30 * 24 * 60 * 60}`);

  return c.json({
    token: accessToken,
    user: {
      id: user.id,
      username: user.username,
      role: 'guest',
      mfaEnabled: false,
      saveCount: 0,
      saveLimit: 3,
      createdAt: new Date().toISOString(),
    },
  }, 201);
});

authRoutes.post('/refresh', async (c) => {
  const cookie = c.req.header('Cookie');
  const match = cookie?.match(/refresh_token=([^;]+)/);
  if (!match) {
    return c.json({ error: 'No refresh token' }, 401);
  }

  const rawToken = match[1];
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!stored || stored.expiresAt < new Date()) {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

  const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
  if (!user || user.isBanned) {
    return c.json({ error: 'Account not found or suspended' }, 401);
  }

  const simCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(simulations)
    .where(eq(simulations.ownerId, user.id));

  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  const accessToken = signAccessToken({
    sub: user.id,
    username: user.username,
    role: user.role as 'user' | 'admin' | 'guest',
  });

  const newRefreshToken = await generateRefreshToken(user.id);

  c.header('Set-Cookie', `refresh_token=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=${30 * 24 * 60 * 60}`);
  setAdminCookie(c, accessToken, user.role);

  return c.json({
    token: accessToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      saveCount: simCount[0]?.count ?? 0,
      saveLimit: user.saveLimit,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

authRoutes.post('/logout', authRequired, async (c) => {
  const cookie = c.req.header('Cookie');
  const match = cookie?.match(/refresh_token=([^;]+)/);
  if (match) {
    const tokenHash = crypto.createHash('sha256').update(match[1]).digest('hex');
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  }

  c.header('Set-Cookie', 'refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=0');
  return c.json({ ok: true });
});

authRoutes.post('/promote', authRequired, validateBody(promoteSchema), async (c) => {
  const user = c.get('user');
  if (user.role !== 'guest') {
    return c.json({ error: 'Only guest accounts can be promoted' }, 400);
  }

  const body = promoteSchema.parse(await c.req.json());
  const passwordHash = await hashPassword(body.password);

  await db.update(users).set({
    username: body.username,
    email: body.email,
    passwordHash,
    role: 'user',
    saveLimit: 10,
  }).where(eq(users.id, user.sub));

  const accessToken = signAccessToken({
    sub: user.sub,
    username: body.username,
    role: 'user',
  });

  return c.json({ token: accessToken });
});

authRoutes.post('/forgot-password', validateBody(forgotPasswordSchema), async (c) => {
  if (!isEmailConfigured()) {
    return c.json({ error: 'Email is not configured on this server' }, 503);
  }

  const { email } = forgotPasswordSchema.parse(await c.req.json());

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (user) {
    const rawToken = nanoid(48);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const appUrl = process.env.APP_URL || 'https://localhost';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(email, resetUrl);
  }

  return c.json({ message: 'If an account with that email exists, a reset link has been sent.' });
});

authRoutes.post('/reset-password', validateBody(resetPasswordSchema), async (c) => {
  const { token, password } = resetPasswordSchema.parse(await c.req.json());
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const [stored] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!stored || stored.used || stored.expiresAt < new Date()) {
    return c.json({ error: 'Invalid or expired reset token' }, 400);
  }

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, stored.userId));
  await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, stored.id));

  return c.json({ message: 'Password reset successfully' });
});

authRoutes.post('/mfa/setup', authRequired, async (c) => {
  const user = c.get('user');

  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: 'AquaSim',
    label: user.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  await db.update(users).set({ mfaSecret: secret.base32 }).where(eq(users.id, user.sub));

  return c.json({
    secret: secret.base32,
    uri: totp.toString(),
  });
});

authRoutes.post('/mfa/verify', authRequired, validateBody(mfaVerifySchema), async (c) => {
  const user = c.get('user');
  const { code } = mfaVerifySchema.parse(await c.req.json());

  const [dbUser] = await db.select({ mfaSecret: users.mfaSecret }).from(users).where(eq(users.id, user.sub)).limit(1);
  if (!dbUser?.mfaSecret) {
    return c.json({ error: 'MFA not set up' }, 400);
  }

  const totp = new TOTP({
    secret: Secret.fromBase32(dbUser.mfaSecret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return c.json({ error: 'Invalid code' }, 400);
  }

  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, user.sub));

  return c.json({ message: 'MFA enabled' });
});

authRoutes.post('/mfa/disable', authRequired, validateBody(mfaVerifySchema), async (c) => {
  const user = c.get('user');
  const { code } = mfaVerifySchema.parse(await c.req.json());

  const [dbUser] = await db.select({ mfaSecret: users.mfaSecret }).from(users).where(eq(users.id, user.sub)).limit(1);
  if (!dbUser?.mfaSecret) {
    return c.json({ error: 'MFA not enabled' }, 400);
  }

  const totp = new TOTP({
    secret: Secret.fromBase32(dbUser.mfaSecret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return c.json({ error: 'Invalid code' }, 400);
  }

  await db.update(users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(users.id, user.sub));

  return c.json({ message: 'MFA disabled' });
});
