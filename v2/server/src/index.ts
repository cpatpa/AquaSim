import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import { authRoutes } from './routes/auth.js';
import { passkeyRoutes } from './routes/passkey.js';
import { simulationRoutes } from './routes/simulations.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { roomRoutes } from './routes/rooms.js';
import { adminRoutes } from './admin/routes.js';
import { webhookRoutes } from './admin/github-webhook.js';
import { apiRateLimit } from './middleware/rate-limit.js';
import { BUILD_INFO } from './lib/build-info.js';
import { getHealthMetrics } from './lib/health.js';
import { getLiveUserCount } from './lib/analytics.js';
import { getRoomCount } from './ws/rooms.js';
import { handleWsConnection } from './ws/handler.js';
import { users } from './db/schema.js';
import { eq, lt, and } from 'drizzle-orm';

const app = new Hono();

import { createMiddleware } from 'hono/factory';

const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

app.use('*', securityHeaders);

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use('/api/*', cors({ origin: corsOrigin, credentials: true }));
app.use('/api/*', apiRateLimit);
app.use('/api/*', logger());

app.route('/api/auth', authRoutes);
app.route('/api/auth/passkey', passkeyRoutes);
app.route('/api/simulations', simulationRoutes);
app.route('/api/leaderboard', leaderboardRoutes);
app.route('/api/rooms', roomRoutes);
app.route('/api/webhooks', webhookRoutes);

app.get('/api/health', async (c) => {
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {}

  const metrics = getHealthMetrics();

  return c.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    uptime: metrics.uptime,
    activeRooms: getRoomCount(),
    liveUsers: getLiveUserCount(),
    wsConnections: metrics.wsConnections,
    buildCommit: BUILD_INFO.commitHash,
    buildTime: BUILD_INFO.buildTime,
  });
});

app.route('/admin', adminRoutes);

app.use('/*', serveStatic({ root: './public' }));
app.get('*', serveStatic({ root: './public', path: '/index.html' }));

const port = parseInt(process.env.PORT || '3000', 10);

async function start(): Promise<void> {
  try {
    console.log('Running database migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`AquaSim server running on port ${info.port}`);
    console.log(`Build: ${BUILD_INFO.commitHash} (${BUILD_INFO.buildTime})`);
  });

  const wss = new WebSocketServer({ server: server as never, path: '/ws' });
  wss.on('connection', (ws) => {
    handleWsConnection(ws);
  });
}

async function cleanupStaleGuests(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    await db.delete(users).where(
      and(eq(users.role, 'guest'), lt(users.createdAt, cutoff))
    );
  } catch {}
}

setInterval(cleanupStaleGuests, 6 * 60 * 60 * 1000);

start();
