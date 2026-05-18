import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, simulations, leaderboardEntries } from '../db/schema.js';
import { eq, sql, like, desc } from 'drizzle-orm';
import { adminOnly } from '../middleware/admin.js';
import { getHealthMetrics } from '../lib/health.js';
import { getDailyActiveUsers, getMonthlyActiveUsers, getDauHistory, getLiveUserCount } from '../lib/analytics.js';
import { dashboardView, usersView, healthView, statsView, analyticsView, deployView } from './views.js';
import fs from 'node:fs';

export const adminRoutes = new Hono();
adminRoutes.use('*', adminOnly);

adminRoutes.get('/', async (c) => {
  const [{ count: totalUsers }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [{ count: totalSims }] = await db.select({ count: sql<number>`count(*)` }).from(simulations);
  const dau = await getDailyActiveUsers();
  const mau = await getMonthlyActiveUsers();

  return c.html(dashboardView({
    totalUsers,
    dau,
    mau,
    liveUsers: getLiveUserCount(),
    activeRooms: 0,
    totalSimulations: totalSims,
  }));
});

adminRoutes.get('/users', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const search = c.req.query('search') || '';
  const limit = 20;
  const offset = (page - 1) * limit;

  const whereClause = search
    ? like(users.username, `%${search}%`)
    : undefined;

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(whereClause);

  const userList = await db
    .select()
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return c.html(usersView({
    users: userList.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      isBanned: u.isBanned,
      mfaEnabled: u.mfaEnabled,
      createdAt: u.createdAt.toISOString().split('T')[0],
      lastLogin: u.lastLogin?.toISOString().split('T')[0] ?? null,
    })),
    page,
    total,
    search,
  }));
});

adminRoutes.post('/users/:id/ban', async (c) => {
  const id = c.req.param('id');
  const [user] = await db.select({ isBanned: users.isBanned }).from(users).where(eq(users.id, id)).limit(1);
  if (user) {
    await db.update(users).set({ isBanned: !user.isBanned }).where(eq(users.id, id));
  }
  return c.redirect('/admin/users');
});

adminRoutes.post('/users/:id/delete', async (c) => {
  const id = c.req.param('id');
  const admin = c.get('user');
  if (id === admin.sub) {
    return c.text('Cannot delete yourself', 400);
  }
  await db.delete(users).where(eq(users.id, id));
  return c.redirect('/admin/users');
});

adminRoutes.post('/users/:id/promote', async (c) => {
  const id = c.req.param('id');
  const admin = c.get('user');
  if (id === admin.sub) {
    return c.text('Cannot change your own role', 400);
  }

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (!user) return c.text('User not found', 404);

  const newRole = user.role === 'admin' ? 'user' : 'admin';
  await db.update(users).set({ role: newRole }).where(eq(users.id, id));

  return c.redirect('/admin/users');
});

adminRoutes.get('/stats', async (c) => {
  const [{ count: totalSims }] = await db.select({ count: sql<number>`count(*)` }).from(simulations);
  const [{ count: publicSims }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(simulations)
    .where(eq(simulations.visibility, 'public'));
  const [{ total: totalGens }] = await db
    .select({ total: sql<number>`coalesce(sum(generation), 0)` })
    .from(simulations);

  const lbCounts = await db
    .select({
      scoreType: leaderboardEntries.scoreType,
      count: sql<number>`count(*)`,
    })
    .from(leaderboardEntries)
    .groupBy(leaderboardEntries.scoreType);

  const leaderboardCounts: Record<string, number> = {};
  for (const row of lbCounts) {
    leaderboardCounts[row.scoreType] = row.count;
  }

  return c.html(statsView({
    totalSimulations: totalSims,
    totalGenerations: totalGens,
    publicSimulations: publicSims,
    leaderboardCounts,
  }));
});

adminRoutes.get('/analytics', async (c) => {
  const dau = await getDailyActiveUsers();
  const mau = await getMonthlyActiveUsers();
  const dauHistory = await getDauHistory(90);

  return c.html(analyticsView({ dauHistory, dau, mau }));
});

adminRoutes.get('/health', async (c) => {
  const metrics = getHealthMetrics();
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {}

  return c.html(healthView({ db: dbOk, ...metrics }));
});

adminRoutes.get('/deploy', async (_c) => {
  let log = '';
  try {
    log = fs.readFileSync('/var/log/aquasim-deploy.log', 'utf-8');
  } catch {}
  return _c.html(deployView(log));
});
