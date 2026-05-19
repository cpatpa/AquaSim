import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { leaderboardEntries, users, simulations } from '../db/schema.js';
import { eq, desc, sql, ne, and } from 'drizzle-orm';
import { authRequired } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const submitScoreSchema = z.object({
  simulationId: z.string().uuid(),
  scoreType: z.enum(['biodiversity', 'speciations', 'longest_species', 'max_population', 'generations']),
  score: z.number().int().min(0),
  generation: z.number().int().min(0),
});

export const leaderboardRoutes = new Hono();

leaderboardRoutes.get('/:type', async (c) => {
  const type = c.req.param('type');
  const validTypes = ['biodiversity', 'speciations', 'longest_species', 'max_population', 'generations'];
  if (!validTypes.includes(type)) {
    return c.json({ error: 'Invalid leaderboard type' }, 400);
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);

  const entries = await db
    .select({
      score: leaderboardEntries.score,
      generation: leaderboardEntries.generation,
      achievedAt: leaderboardEntries.achievedAt,
      username: users.username,
      simulationName: simulations.name,
    })
    .from(leaderboardEntries)
    .innerJoin(users, eq(leaderboardEntries.userId, users.id))
    .innerJoin(simulations, eq(leaderboardEntries.simulationId, simulations.id))
    .where(and(eq(leaderboardEntries.scoreType, type), ne(users.role, 'guest')))
    .orderBy(desc(leaderboardEntries.score))
    .limit(limit);

  return c.json(entries.map((e, i) => ({
    rank: i + 1,
    username: e.username,
    score: e.score,
    generation: e.generation,
    achievedAt: e.achievedAt.toISOString(),
    simulationName: e.simulationName,
  })));
});

leaderboardRoutes.post('/', authRequired, validateBody(submitScoreSchema), async (c) => {
  const user = c.get('user');
  if (user.role === 'guest') {
    return c.json({ error: 'Guests cannot submit scores' }, 403);
  }
  const body = submitScoreSchema.parse(await c.req.json());

  const [sim] = await db
    .select({ ownerId: simulations.ownerId })
    .from(simulations)
    .where(eq(simulations.id, body.simulationId))
    .limit(1);

  if (!sim || sim.ownerId !== user.sub) {
    return c.json({ error: 'Simulation not found or not yours' }, 404);
  }

  await db
    .insert(leaderboardEntries)
    .values({
      userId: user.sub,
      simulationId: body.simulationId,
      scoreType: body.scoreType,
      score: body.score,
      generation: body.generation,
    })
    .onConflictDoUpdate({
      target: [leaderboardEntries.userId, leaderboardEntries.simulationId, leaderboardEntries.scoreType],
      set: {
        score: sql`GREATEST(${leaderboardEntries.score}, excluded.score)`,
        generation: body.generation,
        achievedAt: new Date(),
      },
    });

  return c.json({ ok: true });
});
