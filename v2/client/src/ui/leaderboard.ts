import { getLeaderboard, type LeaderboardEntry } from '../api/client';

const LB_STYLES = `
  .lb-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:960; display:flex; align-items:center; justify-content:center; }
  .lb-panel { background:#0d1f3c; border:1px solid #1a3a5c; border-radius:8px; width:640px; max-width:90vw; max-height:80vh; display:flex; flex-direction:column; }
  .lb-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #1a3a5c; }
  .lb-header h2 { font-family:'Orbitron',monospace; color:#4da6ff; font-size:1rem; letter-spacing:1px; }
  .lb-close { background:none; border:none; color:#5a7a9a; font-size:1.5rem; cursor:pointer; }
  .lb-close:hover { color:#ef4444; }
  .lb-tabs { display:flex; gap:0; border-bottom:1px solid #1a3a5c; padding:0 20px; overflow-x:auto; }
  .lb-tab { padding:10px 14px; cursor:pointer; color:#5a7a9a; font-size:0.8rem; white-space:nowrap; border-bottom:2px solid transparent; }
  .lb-tab:hover { color:#e0e8f0; }
  .lb-tab.active { border-color:#4da6ff; color:#4da6ff; }
  .lb-body { padding:16px 20px; overflow-y:auto; flex:1; }
  .lb-table { width:100%; border-collapse:collapse; font-size:0.8rem; }
  .lb-table th { text-align:left; color:#5a7a9a; padding:6px 8px; border-bottom:1px solid #1a3a5c; font-weight:normal; }
  .lb-table td { padding:6px 8px; color:#e0e8f0; border-bottom:1px solid #0d1f3c; }
  .lb-table tr:hover td { background:#0d1f3c; }
  .lb-rank { color:#4da6ff; font-weight:bold; width:40px; }
  .lb-rank-1 { color:#FFD700; }
  .lb-rank-2 { color:#C0C0C0; }
  .lb-rank-3 { color:#CD7F32; }
  .lb-score { color:#22c55e; font-variant-numeric:tabular-nums; }
  .lb-empty { text-align:center; color:#5a7a9a; padding:40px 0; }
  .lb-loading { text-align:center; color:#5a7a9a; padding:40px 0; }
`;

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = LB_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'biodiversity', label: 'Biodiversity' },
  { id: 'speciations', label: 'Speciations' },
  { id: 'longest_species', label: 'Longest Species' },
  { id: 'max_population', label: 'Max Population' },
  { id: 'generations', label: 'Generations' },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function rankClass(rank: number): string {
  if (rank === 1) return 'lb-rank lb-rank-1';
  if (rank === 2) return 'lb-rank lb-rank-2';
  if (rank === 3) return 'lb-rank lb-rank-3';
  return 'lb-rank';
}

export function openLeaderboard(onClose: () => void): void {
  injectStyles();

  const overlay = document.createElement('div');
  overlay.className = 'lb-overlay';

  let activeCategory = CATEGORIES[0].id;

  async function renderEntries(): Promise<void> {
    const body = overlay.querySelector('.lb-body')!;
    body.innerHTML = '<div class="lb-loading">Loading...</div>';

    let entries: LeaderboardEntry[] = [];
    try {
      entries = await getLeaderboard(activeCategory);
    } catch {
      body.innerHTML = '<div class="lb-empty">Failed to load leaderboard.</div>';
      return;
    }

    if (entries.length === 0) {
      body.innerHTML = '<div class="lb-empty">No scores recorded yet.</div>';
      return;
    }

    body.innerHTML = `
      <table class="lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Score</th>
            <th>Gen</th>
            <th>Simulation</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => `
            <tr>
              <td class="${rankClass(e.rank)}">${e.rank}</td>
              <td>${escapeHtml(e.username)}</td>
              <td class="lb-score">${e.score.toLocaleString()}</td>
              <td>${e.generation.toLocaleString()}</td>
              <td>${escapeHtml(e.simulationName)}</td>
              <td>${formatDate(e.achievedAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  function renderPanel(): void {
    overlay.innerHTML = `
      <div class="lb-panel">
        <div class="lb-header">
          <h2>Leaderboard</h2>
          <button class="lb-close">&times;</button>
        </div>
        <div class="lb-tabs">
          ${CATEGORIES.map(c => `
            <div class="lb-tab ${c.id === activeCategory ? 'active' : ''}" data-cat="${c.id}">${c.label}</div>
          `).join('')}
        </div>
        <div class="lb-body"></div>
      </div>`;

    overlay.querySelector('.lb-close')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    for (const tab of overlay.querySelectorAll('.lb-tab')) {
      tab.addEventListener('click', () => {
        activeCategory = (tab as HTMLElement).dataset.cat!;
        for (const t of overlay.querySelectorAll('.lb-tab')) t.classList.remove('active');
        tab.classList.add('active');
        renderEntries();
      });
    }

    renderEntries();
  }

  function close(): void {
    overlay.remove();
    onClose();
  }

  renderPanel();
  document.body.appendChild(overlay);
}
