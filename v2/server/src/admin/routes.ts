import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users, simulations, leaderboardEntries } from '../db/schema.js';
import { eq, sql, like, desc, ne, and } from 'drizzle-orm';
import { adminOnly, getCsrfToken } from '../middleware/admin.js';
import { getHealthMetrics } from '../lib/health.js';
import { getDailyActiveUsers, getMonthlyActiveUsers, getDauHistory, getLiveUserCount } from '../lib/analytics.js';
import { dashboardView, usersView, healthView, statsView, analyticsView, deployView, updateCheckFragment } from './views.js';
import { BUILD_INFO } from '../lib/build-info.js';
import fs from 'node:fs';

export const adminRoutes = new Hono();
adminRoutes.use('*', adminOnly);

adminRoutes.get('/', async (c) => {
  const [{ count: registeredUsers }] = await db.select({ count: sql<number>`count(*)` }).from(users).where(ne(users.role, 'guest'));
  const [{ count: guestUsers }] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role, 'guest'));
  const [{ count: totalSims }] = await db.select({ count: sql<number>`count(*)` }).from(simulations);
  const dau = await getDailyActiveUsers();
  const mau = await getMonthlyActiveUsers();

  return c.html(dashboardView({
    totalUsers: registeredUsers,
    guestUsers,
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

  const notGuest = ne(users.role, 'guest');
  const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
  const whereClause = search
    ? and(notGuest, like(users.username, `%${escapedSearch}%`))
    : notGuest;

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
    csrf: getCsrfToken(c),
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

function getDeployStatus(): { lastDeploy: string; watcherLog: string } {
  let lastDeploy = '';
  let watcherLog = '';
  try {
    watcherLog = fs.readFileSync('/app/deploy-trigger/deploy.log', 'utf-8');
    const lines = watcherLog.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('Deploy complete')) {
        lastDeploy = lines[i];
        break;
      }
    }
  } catch {}
  return { lastDeploy, watcherLog };
}

async function checkRemoteForUpdate(): Promise<{
  latestHash: string;
  available: boolean;
  branch: string;
  error?: string;
  checkedAt: string;
}> {
  const remoteUrl = process.env.GIT_REMOTE_URL;
  const branch = process.env.GIT_DEPLOY_BRANCH || 'main';
  const checkedAt = new Date().toISOString();

  if (!remoteUrl) {
    return { latestHash: '', available: false, branch, error: 'GIT_REMOTE_URL not configured', checkedAt };
  }

  try {
    const url = remoteUrl.replace(/\/+$/, '') + '/info/refs?service=git-upload-pack';
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const refPattern = `refs/heads/${branch}`;
    for (const line of text.split('\n')) {
      if (line.includes(refPattern)) {
        const match = line.match(/([0-9a-f]{40})\s+refs\/heads\//);
        if (match) {
          const latestHash = match[1].slice(0, 7);
          const runningHash = BUILD_INFO.commitHash.slice(0, 7);
          return {
            latestHash,
            available: latestHash !== runningHash && BUILD_INFO.commitHash !== 'dev',
            branch,
            checkedAt,
          };
        }
      }
    }
    return { latestHash: '', available: false, branch, error: `Branch '${branch}' not found on remote`, checkedAt };
  } catch (e) {
    return { latestHash: '', available: false, branch, error: (e as Error).message, checkedAt };
  }
}

adminRoutes.get('/deploy', async (c) => {
  const status = getDeployStatus();
  const update = await checkRemoteForUpdate();
  return c.html(deployView({
    log: status.watcherLog,
    lastDeploy: status.lastDeploy,
    csrf: getCsrfToken(c),
    update,
  }));
});

adminRoutes.get('/deploy/check-update', async (c) => {
  const update = await checkRemoteForUpdate();
  return c.html(updateCheckFragment(update));
});

adminRoutes.post('/deploy', async (c) => {
  const triggerPath = '/app/deploy-trigger/deploy.trigger';
  const logPath = '/var/log/aquasim-deploy.log';
  const timestamp = new Date().toISOString();

  try {
    fs.writeFileSync(triggerPath, timestamp);
  } catch {
    try {
      fs.mkdirSync('/app/deploy-trigger', { recursive: true });
      fs.writeFileSync(triggerPath, timestamp);
    } catch (err) {
      try { fs.appendFileSync(logPath, `\n--- Deploy trigger failed at ${timestamp}: ${err} ---\n`); } catch {}
      return c.redirect('/admin/deploy');
    }
  }

  try {
    fs.appendFileSync(logPath, `\n--- Manual deploy triggered at ${timestamp} (waiting for host) ---\n`);
  } catch {
    try { fs.writeFileSync(logPath, `--- Manual deploy triggered at ${timestamp} (waiting for host) ---\n`); } catch {}
  }

  return c.redirect('/admin/deploy');
});
