import os from 'node:os';

let wsConnectionCount = 0;

export function incrementWsConnections(): void {
  wsConnectionCount++;
}

export function decrementWsConnections(): void {
  wsConnectionCount = Math.max(0, wsConnectionCount - 1);
}

export function getWsConnectionCount(): number {
  return wsConnectionCount;
}

export function getHealthMetrics() {
  const mem = process.memoryUsage();
  return {
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.floor(mem.rss / 1024 / 1024),
      heapUsed: Math.floor(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.floor(mem.heapTotal / 1024 / 1024),
    },
    system: {
      loadAvg: os.loadavg(),
      freeMemMB: Math.floor(os.freemem() / 1024 / 1024),
      totalMemMB: Math.floor(os.totalmem() / 1024 / 1024),
    },
    wsConnections: wsConnectionCount,
  };
}
