import {
  listSimulations, deleteSimulation, shareSimulation, getUser,
  type SimulationSummary,
} from '../api/client';

const DASH_STYLES = `
  .dash-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:950; display:flex; align-items:center; justify-content:center; }
  .dash-panel { background:#0d1f3c; border:1px solid #1a3a5c; border-radius:8px; width:700px; max-width:90vw; max-height:80vh; display:flex; flex-direction:column; }
  .dash-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #1a3a5c; }
  .dash-header h2 { font-family:'Orbitron',monospace; color:#4da6ff; font-size:1rem; letter-spacing:1px; }
  .dash-save-count { color:#5a7a9a; font-size:0.8rem; }
  .dash-close { background:none; border:none; color:#5a7a9a; font-size:1.5rem; cursor:pointer; }
  .dash-close:hover { color:#ef4444; }
  .dash-body { padding:16px 20px; overflow-y:auto; flex:1; }
  .dash-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px; }
  .dash-card { background:#0d1f3c; border:1px solid #1a3a5c; border-radius:6px; padding:12px; cursor:pointer; transition:border-color 0.2s; }
  .dash-card:hover { border-color:#4da6ff; }
  .dash-card-name { color:#e0e8f0; font-size:0.9rem; font-weight:bold; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .dash-card-meta { color:#5a7a9a; font-size:0.75rem; }
  .dash-card-actions { display:flex; gap:4px; margin-top:8px; }
  .dash-card-actions button { padding:3px 8px; font-size:0.7rem; border-radius:3px; border:1px solid #1a3a5c; background:#0d1f3c; color:#e0e8f0; cursor:pointer; font-family:inherit; }
  .dash-card-actions button:hover { background:#1a3a5c; }
  .dash-card-actions .btn-del { color:#ef4444; border-color:#ef444433; }
  .dash-card-actions .btn-del:hover { background:#ef444422; }
  .dash-empty { text-align:center; color:#5a7a9a; padding:40px 0; }
  .dash-vis-badge { display:inline-block; padding:1px 6px; border-radius:8px; font-size:0.65rem; margin-left:4px; }
  .dash-vis-public { background:#22c55e33; color:#22c55e; }
  .dash-vis-private { background:#1a3a5c; color:#5a7a9a; }
  .dash-vis-link { background:#3b82f633; color:#3b82f6; }
`;

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = DASH_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

export interface DashboardCallbacks {
  onLoad: (simId: string) => void;
  onClose: () => void;
}

export async function openDashboard(callbacks: DashboardCallbacks): Promise<void> {
  injectStyles();

  const user = getUser();
  const overlay = document.createElement('div');
  overlay.className = 'dash-overlay';

  async function renderContent(): Promise<void> {
    let sims: SimulationSummary[] = [];
    try {
      sims = await listSimulations();
    } catch { /* empty */ }

    const saveCount = sims.length;
    const saveLimit = user?.saveLimit ?? 10;

    overlay.innerHTML = `
      <div class="dash-panel">
        <div class="dash-header">
          <h2>My Simulations</h2>
          <span class="dash-save-count">${saveCount}/${saveLimit} saves</span>
          <button class="dash-close">&times;</button>
        </div>
        <div class="dash-body">
          ${sims.length === 0 ? `
            <div class="dash-empty">
              <p>No saved simulations yet.</p>
              <p style="margin-top:8px;font-size:0.8rem;">Use the Save button in the toolbar to save your current simulation.</p>
            </div>
          ` : `
            <div class="dash-grid">
              ${sims.map(s => `
                <div class="dash-card" data-id="${s.id}">
                  <div class="dash-card-name">
                    ${escapeHtml(s.name)}
                    <span class="dash-vis-badge dash-vis-${s.visibility}">${s.visibility}</span>
                  </div>
                  <div class="dash-card-meta">Gen ${s.generation}</div>
                  <div class="dash-card-meta">${formatDate(s.updatedAt)}</div>
                  <div class="dash-card-actions">
                    <button class="btn-load" data-id="${s.id}">Load</button>
                    <button class="btn-share" data-id="${s.id}">Share</button>
                    <button class="btn-del" data-id="${s.id}">Delete</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>`;

    overlay.querySelector('.dash-close')!.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    for (const btn of overlay.querySelectorAll('.btn-load')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id!;
        close();
        callbacks.onLoad(id);
      });
    }

    for (const btn of overlay.querySelectorAll('.btn-share')) {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id!;
        try {
          const result = await shareSimulation(id);
          await navigator.clipboard.writeText(result.shareUrl);
          (btn as HTMLElement).textContent = 'Copied!';
          setTimeout(() => { (btn as HTMLElement).textContent = 'Share'; }, 2000);
        } catch {
          (btn as HTMLElement).textContent = 'Failed';
        }
      });
    }

    for (const btn of overlay.querySelectorAll('.btn-del')) {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id!;
        if (!confirm('Delete this simulation?')) return;
        try {
          await deleteSimulation(id);
          await renderContent();
        } catch { /* empty */ }
      });
    }
  }

  function close(): void {
    overlay.remove();
    callbacks.onClose();
  }

  await renderContent();
  document.body.appendChild(overlay);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
