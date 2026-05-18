import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
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

const app = new Hono();

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
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`AquaSim server running on port ${info.port}`);
  console.log(`Build: ${BUILD_INFO.commitHash} (${BUILD_INFO.buildTime})`);
});

const wss = new WebSocketServer({ server: server as never, path: '/ws' });
wss.on('connection', (ws) => {
  handleWsConnection(ws);
});
