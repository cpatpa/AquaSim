import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { simulations, users } from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';
import { authRequired, authOptional } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { nanoid } from 'nanoid';

const MAX_STATE_BYTES = 5 * 1024 * 1024;

const createSimSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  visibility: z.enum(['private', 'public', 'link']).optional(),
  state: z.record(z.unknown()),
});

const updateSimSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['private', 'public', 'link']).optional(),
  state: z.record(z.unknown()).optional(),
});

export const simulationRoutes = new Hono();

simulationRoutes.get('/', authRequired, async (c) => {
  const user = c.get('user');

  const sims = await db
    .select({
      id: simulations.id,
      name: simulations.name,
      description: simulations.description,
      visibility: simulations.visibility,
      generation: simulations.generation,
      createdAt: simulations.createdAt,
      updatedAt: simulations.updatedAt,
    })
    .from(simulations)
    .where(eq(simulations.ownerId, user.sub))
    .orderBy(desc(simulations.updatedAt));

  return c.json(sims.map(s => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    ownerUsername: user.username,
  })));
});

simulationRoutes.post('/', authRequired, validateBody(createSimSchema), async (c) => {
  const user = c.get('user');
  const body = createSimSchema.parse(await c.req.json());

  if (JSON.stringify(body.state).length > MAX_STATE_BYTES) {
    return c.json({ error: 'Simulation state too large (max 5 MB)' }, 413);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(simulations)
    .where(eq(simulations.ownerId, user.sub));

  const [dbUser] = await db
    .select({ saveLimit: users.saveLimit })
    .from(users)
    .where(eq(users.id, user.sub))
    .limit(1);

  const limit = dbUser?.saveLimit ?? 10;
  if (count >= limit) {
    return c.json({
      error: `Save limit reached (${limit} simulations). Delete an existing save to create a new one.`,
    }, 403);
  }

  const generation = (body.state as Record<string, unknown>).generation as number ?? 0;

  const [sim] = await db.insert(simulations).values({
    ownerId: user.sub,
    name: body.name,
    description: body.description || null,
    visibility: body.visibility || 'private',
    state: body.state,
    generation,
  }).returning({
    id: simulations.id,
    name: simulations.name,
    createdAt: simulations.createdAt,
  });

  return c.json({
    id: sim.id,
    name: sim.name,
    createdAt: sim.createdAt.toISOString(),
  }, 201);
});

simulationRoutes.get('/public', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  const sims = await db
    .select({
      id: simulations.id,
      name: simulations.name,
      description: simulations.description,
      generation: simulations.generation,
      createdAt: simulations.createdAt,
      updatedAt: simulations.updatedAt,
      ownerUsername: users.username,
    })
    .from(simulations)
    .innerJoin(users, eq(simulations.ownerId, users.id))
    .where(eq(simulations.visibility, 'public'))
    .orderBy(desc(simulations.updatedAt))
    .limit(limit)
    .offset(offset);

  return c.json(sims.map(s => ({
    ...s,
    visibility: 'public' as const,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  })));
});

simulationRoutes.get('/:id', authOptional, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const shareToken = c.req.query('token');

  const [sim] = await db
    .select()
    .from(simulations)
    .where(eq(simulations.id, id))
    .limit(1);

  if (!sim) {
    return c.json({ error: 'Simulation not found' }, 404);
  }

  const isOwner = user?.sub === sim.ownerId;
  const isPublic = sim.visibility === 'public';
  const hasShareToken = sim.visibility === 'link' && sim.shareToken && shareToken === sim.shareToken;

  if (!isOwner && !isPublic && !hasShareToken) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const [owner] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, sim.ownerId))
    .limit(1);

  return c.json({
    id: sim.id,
    name: sim.name,
    description: sim.description,
    visibility: sim.visibility,
    generation: sim.generation,
    state: sim.state,
    shareToken: isOwner ? sim.shareToken : null,
    createdAt: sim.createdAt.toISOString(),
    updatedAt: sim.updatedAt.toISOString(),
    ownerUsername: owner?.username ?? 'unknown',
  });
});

simulationRoutes.put('/:id', authRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const body = updateSimSchema.parse(await c.req.json());

  if (body.state && JSON.stringify(body.state).length > MAX_STATE_BYTES) {
    return c.json({ error: 'Simulation state too large (max 5 MB)' }, 413);
  }

  const [sim] = await db
    .select({ ownerId: simulations.ownerId })
    .from(simulations)
    .where(eq(simulations.id, id))
    .limit(1);

  if (!sim || sim.ownerId !== user.sub) {
    return c.json({ error: 'Not found or not authorised' }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.visibility) updates.visibility = body.visibility;
  if (body.state) {
    updates.state = body.state;
    updates.generation = (body.state as Record<string, unknown>).generation ?? 0;
  }

  await db.update(simulations).set(updates).where(eq(simulations.id, id));

  return c.json({ ok: true });
});

simulationRoutes.delete('/:id', authRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const [sim] = await db
    .select({ ownerId: simulations.ownerId })
    .from(simulations)
    .where(eq(simulations.id, id))
    .limit(1);

  if (!sim || sim.ownerId !== user.sub) {
    return c.json({ error: 'Not found or not authorised' }, 404);
  }

  await db.delete(simulations).where(eq(simulations.id, id));

  return c.json({ ok: true });
});

simulationRoutes.post('/:id/share', authRequired, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const [sim] = await db
    .select({ ownerId: simulations.ownerId, shareToken: simulations.shareToken })
    .from(simulations)
    .where(eq(simulations.id, id))
    .limit(1);

  if (!sim || sim.ownerId !== user.sub) {
    return c.json({ error: 'Not found or not authorised' }, 404);
  }

  const token = sim.shareToken || nanoid(32);

  await db.update(simulations).set({
    shareToken: token,
    visibility: 'link',
  }).where(eq(simulations.id, id));

  const appUrl = process.env.APP_URL || 'https://localhost';

  return c.json({
    shareToken: token,
    shareUrl: `${appUrl}/sim/${id}?token=${token}`,
  });
});
