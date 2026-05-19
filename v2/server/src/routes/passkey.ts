import { Hono } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';

type RegistrationResponseJSON = VerifyRegistrationResponseOpts['response'];
type AuthenticationResponseJSON = VerifyAuthenticationResponseOpts['response'];
import { db } from '../db/index.js';
import { users, passkeyCredentials } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authRequired } from '../middleware/auth.js';
import { signAccessToken } from '../lib/tokens.js';

const rpName = 'AquaSim';
const rpID = () => {
  const url = process.env.APP_URL || 'https://localhost';
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
};
const origin = () => process.env.APP_URL || 'https://localhost';

const challengeStore = new Map<string, string>();

export const passkeyRoutes = new Hono();

passkeyRoutes.post('/register-options', authRequired, async (c) => {
  const user = c.get('user');

  const existingCreds = await db
    .select({ id: passkeyCredentials.id })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, user.sub));

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpID(),
    userName: user.username,
    attestationType: 'none',
    excludeCredentials: existingCreds.map(cred => ({
      id: cred.id,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  challengeStore.set(user.sub, options.challenge);
  setTimeout(() => challengeStore.delete(user.sub), 5 * 60 * 1000);

  return c.json(options);
});

passkeyRoutes.post('/register', authRequired, async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as RegistrationResponseJSON;

  const expectedChallenge = challengeStore.get(user.sub);
  if (!expectedChallenge) {
    return c.json({ error: 'No registration challenge found' }, 400);
  }

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: origin(),
    expectedRPID: rpID(),
  });

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'Verification failed' }, 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await db.insert(passkeyCredentials).values({
    id: credential.id,
    userId: user.sub,
    publicKey: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: body.response.transports?.join(',') || null,
  });

  challengeStore.delete(user.sub);

  return c.json({ verified: true });
});

passkeyRoutes.post('/auth-options', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string };

  let allowCredentials: Array<{ id: string }> | undefined;

  if (body.username) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);

    if (user) {
      const creds = await db
        .select({ id: passkeyCredentials.id, transports: passkeyCredentials.transports })
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.userId, user.id));

      allowCredentials = creds.map(c => ({ id: c.id }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: rpID(),
    allowCredentials,
    userVerification: 'preferred',
  });

  challengeStore.set(`auth:${options.challenge}`, options.challenge);
  setTimeout(() => challengeStore.delete(`auth:${options.challenge}`), 5 * 60 * 1000);

  return c.json(options);
});

passkeyRoutes.post('/auth', async (c) => {
  const body = await c.req.json() as AuthenticationResponseJSON;

  const [cred] = await db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.id, body.id))
    .limit(1);

  if (!cred) {
    return c.json({ error: 'Unknown credential' }, 401);
  }

  const clientData = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64url').toString());
  const challenge = challengeStore.get(`auth:${clientData.challenge}`);
  if (challenge) {
    challengeStore.delete(`auth:${clientData.challenge}`);
  }

  if (!challenge) {
    return c.json({ error: 'No authentication challenge found' }, 400);
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: challenge,
    expectedOrigin: origin(),
    expectedRPID: rpID(),
    credential: {
      id: cred.id,
      publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64')),
      counter: cred.counter,
    },
  });

  if (!verification.verified) {
    return c.json({ error: 'Authentication failed' }, 401);
  }

  await db.update(passkeyCredentials).set({
    counter: verification.authenticationInfo.newCounter,
    lastUsedAt: new Date(),
  }).where(eq(passkeyCredentials.id, cred.id));

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, cred.userId))
    .limit(1);

  if (!user || user.isBanned) {
    return c.json({ error: 'Account not found or suspended' }, 401);
  }

  await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

  const accessToken = signAccessToken({
    sub: user.id,
    username: user.username,
    role: user.role as 'user' | 'admin' | 'guest',
  });

  return c.json({
    token: accessToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      saveCount: 0,
      saveLimit: user.saveLimit,
      createdAt: user.createdAt.toISOString(),
    },
  });
});
