import { html } from 'hono/html';
import { BUILD_INFO } from '../lib/build-info.js';

type Html = ReturnType<typeof html>;

export function layout(title: string, content: Html): Html {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - AquaSim Admin</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a1628; color: #e0e8f0; line-height: 1.6; }
    .header { background: #0d1f3c; border-bottom: 1px solid #1a3a5c; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 1.25rem; color: #4da6ff; }
    .build-info { font-size: 0.75rem; color: #5a7a9a; }
    .nav { display: flex; gap: 1rem; padding: 0.75rem 2rem; background: #0d1a2e; border-bottom: 1px solid #1a3a5c; }
    .nav a { color: #8ab4e0; text-decoration: none; padding: 0.5rem 1rem; border-radius: 0.25rem; transition: background 0.2s; }
    .nav a:hover, .nav a.active { background: #1a3a5c; color: #fff; }
    .content { padding: 2rem; max-width: 1200px; margin: 0 auto; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #0d1f3c; border: 1px solid #1a3a5c; border-radius: 0.5rem; padding: 1.5rem; }
    .card .label { font-size: 0.8rem; color: #5a7a9a; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 2rem; font-weight: 700; color: #4da6ff; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #1a3a5c; }
    th { color: #5a7a9a; font-size: 0.8rem; text-transform: uppercase; }
    .btn { padding: 0.4rem 0.8rem; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.8rem; transition: background 0.2s; }
    .btn-danger { background: #cc3333; color: #fff; }
    .btn-danger:hover { background: #e04040; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #3b82f6; }
    .btn-warn { background: #d97706; color: #fff; }
    .btn-warn:hover { background: #f59e0b; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 1rem; font-size: 0.7rem; font-weight: 600; }
    .badge-admin { background: #7c3aed; color: #fff; }
    .badge-user { background: #1a3a5c; color: #8ab4e0; }
    .badge-guest { background: #374151; color: #9ca3af; }
    .badge-banned { background: #dc2626; color: #fff; }
    .health-ok { color: #22c55e; }
    .health-bad { color: #ef4444; }
    pre { background: #0d1a2e; border: 1px solid #1a3a5c; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; font-size: 0.85rem; max-height: 400px; overflow-y: auto; }
    .search { padding: 0.5rem 1rem; background: #0d1a2e; border: 1px solid #1a3a5c; border-radius: 0.25rem; color: #e0e8f0; width: 300px; }
    .pagination { display: flex; gap: 0.5rem; margin-top: 1rem; }
    .pagination a { padding: 0.4rem 0.8rem; background: #0d1f3c; border: 1px solid #1a3a5c; border-radius: 0.25rem; color: #8ab4e0; text-decoration: none; }
    .pagination a.active { background: #2563eb; border-color: #2563eb; color: #fff; }
  </style>
</head>
<body>
  <div class="header">
    <h1>AquaSim Admin</h1>
    <span class="build-info">Build: ${BUILD_INFO.commitHash} | ${BUILD_INFO.buildTime}</span>
  </div>
  <nav class="nav">
    <a href="/admin">Dashboard</a>
    <a href="/admin/users">Users</a>
    <a href="/admin/stats">Stats</a>
    <a href="/admin/analytics">Analytics</a>
    <a href="/admin/health">Health</a>
    <a href="/admin/deploy">Deploy</a>
  </nav>
  <div class="content">
    ${content}
  </div>
</body>
</html>`;
}

export function dashboardView(data: {
  totalUsers: number;
  dau: number;
  mau: number;
  liveUsers: number;
  activeRooms: number;
  totalSimulations: number;
}): Html {
  return layout('Dashboard', html`
    <h2 style="margin-bottom: 1.5rem;">Dashboard</h2>
    <div class="cards">
      <div class="card">
        <div class="label">Total Users</div>
        <div class="value">${data.totalUsers}</div>
      </div>
      <div class="card">
        <div class="label">DAU (Today)</div>
        <div class="value">${data.dau}</div>
      </div>
      <div class="card">
        <div class="label">MAU (30 Days)</div>
        <div class="value">${data.mau}</div>
      </div>
      <div class="card">
        <div class="label">Live Users</div>
        <div class="value">${data.liveUsers}</div>
      </div>
      <div class="card">
        <div class="label">Active Rooms</div>
        <div class="value">${data.activeRooms}</div>
      </div>
      <div class="card">
        <div class="label">Total Simulations</div>
        <div class="value">${data.totalSimulations}</div>
      </div>
    </div>
  `);
}

export function usersView(data: {
  users: Array<{
    id: string;
    username: string;
    email: string | null;
    role: string;
    isBanned: boolean;
    mfaEnabled: boolean;
    createdAt: string;
    lastLogin: string | null;
  }>;
  page: number;
  total: number;
  search: string;
}): Html {
  const totalPages = Math.ceil(data.total / 20);
  return layout('Users', html`
    <h2 style="margin-bottom: 1.5rem;">User Management</h2>
    <form method="get" action="/admin/users" style="margin-bottom: 1rem;">
      <input type="text" name="search" class="search" placeholder="Search by username..." value="${data.search}">
    </form>
    <p style="color: #5a7a9a; margin-bottom: 0.5rem;">${data.total} users total</p>
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Email</th>
          <th>Role</th>
          <th>MFA</th>
          <th>Created</th>
          <th>Last Login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${data.users.map(u => html`
          <tr>
            <td>${u.username}</td>
            <td>${u.email || '-'}</td>
            <td>
              <span class="badge badge-${u.role}">${u.role}</span>
              ${u.isBanned ? html`<span class="badge badge-banned">banned</span>` : ''}
            </td>
            <td>${u.mfaEnabled ? 'Yes' : 'No'}</td>
            <td>${u.createdAt}</td>
            <td>${u.lastLogin || 'Never'}</td>
            <td style="display: flex; gap: 0.25rem;">
              <form method="post" action="/admin/users/${u.id}/ban" style="display:inline;">
                <button class="btn ${u.isBanned ? 'btn-primary' : 'btn-warn'}" type="submit">
                  ${u.isBanned ? 'Unban' : 'Ban'}
                </button>
              </form>
              ${u.role !== 'admin' ? html`
                <form method="post" action="/admin/users/${u.id}/promote" style="display:inline;">
                  <button class="btn btn-primary" type="submit">Promote</button>
                </form>
              ` : html`
                <form method="post" action="/admin/users/${u.id}/promote" style="display:inline;">
                  <button class="btn btn-warn" type="submit">Demote</button>
                </form>
              `}
              <form method="post" action="/admin/users/${u.id}/delete" style="display:inline;"
                    onsubmit="return confirm('Delete this user? This cannot be undone.')">
                <button class="btn btn-danger" type="submit">Delete</button>
              </form>
            </td>
          </tr>
        `)}
      </tbody>
    </table>
    ${totalPages > 1 ? html`
      <div class="pagination">
        ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p => html`
          <a href="/admin/users?page=${p}&search=${data.search}"
             class="${p === data.page ? 'active' : ''}">${p}</a>
        `)}
      </div>
    ` : ''}
  `);
}

export function healthView(data: {
  db: boolean;
  uptime: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  system: { loadAvg: number[]; freeMemMB: number; totalMemMB: number };
  wsConnections: number;
}): Html {
  const uptimeHours = Math.floor(data.uptime / 3600);
  const uptimeMin = Math.floor((data.uptime % 3600) / 60);

  return layout('Health', html`
    <h2 style="margin-bottom: 1.5rem;">Infrastructure Health</h2>
    <div class="cards">
      <div class="card">
        <div class="label">Database</div>
        <div class="value ${data.db ? 'health-ok' : 'health-bad'}">${data.db ? 'Connected' : 'Down'}</div>
      </div>
      <div class="card">
        <div class="label">Uptime</div>
        <div class="value">${uptimeHours}h ${uptimeMin}m</div>
      </div>
      <div class="card">
        <div class="label">WS Connections</div>
        <div class="value">${data.wsConnections}</div>
      </div>
      <div class="card">
        <div class="label">System Load (1m)</div>
        <div class="value">${data.system.loadAvg[0].toFixed(2)}</div>
      </div>
    </div>
    <h3 style="margin-bottom: 1rem;">Memory</h3>
    <div class="cards">
      <div class="card">
        <div class="label">Process RSS</div>
        <div class="value">${data.memory.rss} MB</div>
      </div>
      <div class="card">
        <div class="label">Heap Used / Total</div>
        <div class="value">${data.memory.heapUsed} / ${data.memory.heapTotal} MB</div>
      </div>
      <div class="card">
        <div class="label">System Free / Total</div>
        <div class="value">${data.system.freeMemMB} / ${data.system.totalMemMB} MB</div>
      </div>
    </div>
  `);
}

export function statsView(data: {
  totalSimulations: number;
  totalGenerations: number;
  publicSimulations: number;
  leaderboardCounts: Record<string, number>;
}): Html {
  return layout('Stats', html`
    <h2 style="margin-bottom: 1.5rem;">Game Statistics</h2>
    <div class="cards">
      <div class="card">
        <div class="label">Total Simulations</div>
        <div class="value">${data.totalSimulations}</div>
      </div>
      <div class="card">
        <div class="label">Total Generations</div>
        <div class="value">${data.totalGenerations.toLocaleString()}</div>
      </div>
      <div class="card">
        <div class="label">Public Simulations</div>
        <div class="value">${data.publicSimulations}</div>
      </div>
    </div>
    <h3 style="margin: 1.5rem 0 1rem;">Leaderboard Entries</h3>
    <table>
      <thead><tr><th>Category</th><th>Entries</th></tr></thead>
      <tbody>
        ${Object.entries(data.leaderboardCounts).map(([type, count]) => html`
          <tr><td>${type}</td><td>${count}</td></tr>
        `)}
      </tbody>
    </table>
  `);
}

export function analyticsView(data: {
  dauHistory: Array<{ date: string; count: number }>;
  dau: number;
  mau: number;
}): Html {
  return layout('Analytics', html`
    <h2 style="margin-bottom: 1.5rem;">Analytics</h2>
    <div class="cards">
      <div class="card">
        <div class="label">DAU (Today)</div>
        <div class="value">${data.dau}</div>
      </div>
      <div class="card">
        <div class="label">MAU (30 Days)</div>
        <div class="value">${data.mau}</div>
      </div>
    </div>
    <h3 style="margin: 1.5rem 0 1rem;">Daily Active Users (Last 90 Days)</h3>
    <table>
      <thead><tr><th>Date</th><th>Active Users</th></tr></thead>
      <tbody>
        ${data.dauHistory.slice(-30).map(d => html`
          <tr><td>${d.date}</td><td>${d.count}</td></tr>
        `)}
      </tbody>
    </table>
  `);
}

export function deployView(log: string): Html {
  return layout('Deploy', html`
    <h2 style="margin-bottom: 1.5rem;">Deploy Log</h2>
    <p style="color: #5a7a9a; margin-bottom: 1rem;">
      Webhook URL: <code>${process.env.APP_URL || 'https://localhost'}/api/webhooks/github-deploy</code>
    </p>
    <pre>${log || 'No deploy log found.'}</pre>
  `);
}
