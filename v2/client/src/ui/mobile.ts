import { setSingleFingerPan } from './camera';
import { isAdmin } from '../api/client';

let _paintMode = false;
let _isMobile = false;

const TABS_HEIGHT = 36;
const BAR_HEIGHT = 44;

function detectMobile(): boolean {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth <= 768;
  const mobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
  return (hasTouch && isNarrow) || (mobileUA && isNarrow);
}

function getVisualHeight(): number {
  return window.visualViewport ? window.visualViewport.height : window.innerHeight;
}

export function getMobileContentRect(): { top: number; height: number; width: number } {
  const vh = getVisualHeight();
  return {
    top: TABS_HEIGHT,
    height: vh - TABS_HEIGHT - BAR_HEIGHT,
    width: window.innerWidth,
  };
}

export function isMobile(): boolean {
  return _isMobile;
}

export function isPaintMode(): boolean {
  return _paintMode;
}

export function setPaintMode(v: boolean): void {
  _paintMode = v;
  setSingleFingerPan(_isMobile && !v);
  const fab = document.getElementById('paint-fab');
  if (fab) {
    fab.classList.toggle('active', v);
    fab.textContent = v ? 'Pan' : 'Paint';
  }
}

const MOBILE_STYLES = `
  @media (max-width: 768px) {
    #left-panel, #right-panel { display: none !important; }
    #bottom-bar { display: none !important; }

    #layout {
      position: fixed !important;
      top: ${TABS_HEIGHT}px;
      left: 0;
      right: 0;
      display: block !important;
      overflow: hidden;
    }
    #centre { width: 100%; height: 100%; display: block !important; }
    #canvas-wrap {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
    }
    #grid-canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }

    #mobile-tabs {
      position: fixed; top: 0; left: 0; right: 0; z-index: 790;
      display: flex; height: ${TABS_HEIGHT}px; background: #0a1628; border-bottom: 1px solid #1a3a5c;
    }
    .mob-tab {
      flex: 1; display: flex; align-items: center; justify-content: center;
      color: #5a7a9a; font-size: 0.7rem; cursor: pointer; border-bottom: 2px solid transparent;
      font-family: 'Share Tech Mono', monospace;
    }
    .mob-tab.active { color: #4da6ff; border-color: #4da6ff; }

    #mobile-bar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 900;
      display: flex; height: ${BAR_HEIGHT}px;
      align-items: center; padding: 0 8px; gap: 4px;
      background: #0a1628; border-top: 1px solid #1a3a5c;
    }
    #mobile-bar button {
      font-family: 'Share Tech Mono', monospace; font-size: 0.7rem;
      padding: 6px 10px; border: 1px solid #1a3a5c; background: #0d1f3c; color: #e0e8f0;
      cursor: pointer; border-radius: 3px; white-space: nowrap;
    }
    #mobile-bar .bar-spacer { flex: 1; }
    #mobile-bar .mob-season { color: #22c55e; font-size: 0.7rem; }
    #mobile-bar .mob-gen { color: #4da6ff; font-size: 0.7rem; }

    #mobile-drawer {
      position: fixed; bottom: ${BAR_HEIGHT}px; left: 0; right: 0;
      max-height: 55vh; background: #0a1628; border-top: 1px solid #1a3a5c;
      z-index: 850; overflow-y: auto; padding: 8px;
      display: none;
    }
    #mobile-drawer.open { display: block; }
    #mobile-drawer::-webkit-scrollbar { width: 4px; }
    #mobile-drawer::-webkit-scrollbar-thumb { background: #1a3a5c; border-radius: 2px; }

    #paint-fab {
      position: fixed; bottom: ${BAR_HEIGHT + 12}px; left: 12px; z-index: 810;
      width: 52px; height: 52px; border-radius: 50%;
      background: #0d1f3c; border: 2px solid #1a3a5c; color: #e0e8f0;
      font-family: 'Share Tech Mono', monospace; font-size: 0.6rem;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    #paint-fab.active { background: #162d4a; border-color: #4da6ff; color: #4da6ff; }
  }

  @media (min-width: 769px) {
    #mobile-tabs, #mobile-bar, #mobile-drawer, #paint-fab { display: none !important; }
  }
`;

let drawerOpen = false;
let activeTab: 'species' | 'stats' | 'menu' | null = null;

function applyLayoutHeight(): void {
  if (!_isMobile) return;
  const layout = document.getElementById('layout');
  if (!layout) return;
  const rect = getMobileContentRect();
  layout.style.height = `${rect.height}px`;
}

export function initMobile(): void {
  const style = document.createElement('style');
  style.textContent = MOBILE_STYLES;
  document.head.appendChild(style);

  _isMobile = detectMobile();
  setSingleFingerPan(_isMobile && !_paintMode);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      applyLayoutHeight();
      resizeCanvas();
    });
  }
  window.addEventListener('resize', () => {
    const wasMobile = _isMobile;
    _isMobile = detectMobile();
    setSingleFingerPan(_isMobile && !_paintMode);
    applyLayoutHeight();
    resizeCanvas();
    if (!_isMobile && wasMobile) {
      closeDrawer();
      restorePanels();
    }
    if (_isMobile && !wasMobile && !document.getElementById('mobile-tabs')) {
      buildMobileUI();
    }
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      applyLayoutHeight();
      resizeCanvas();
    }, 150);
  });
}

let _resizeCallback: (() => void) | null = null;

export function setResizeCallback(cb: () => void): void {
  _resizeCallback = cb;
}

function resizeCanvas(): void {
  if (_resizeCallback) _resizeCallback();
}

export function initMobileUI(): void {
  if (_isMobile) {
    buildMobileUI();
    applyLayoutHeight();
  }
}

function buildMobileUI(): void {
  const centre = document.getElementById('centre');
  if (!centre) return;

  const tabs = document.createElement('div');
  tabs.id = 'mobile-tabs';
  tabs.innerHTML = `
    <div class="mob-tab" data-tab="species">Species</div>
    <div class="mob-tab" data-tab="stats">Stats</div>
    <div class="mob-tab" data-tab="menu">Menu</div>
  `;
  document.body.appendChild(tabs);

  const bar = document.createElement('div');
  bar.id = 'mobile-bar';
  bar.innerHTML = `
    <button id="mob-play" title="Start or pause the simulation">Play</button>
    <button id="mob-step" title="Advance one tick while paused">Step</button>
    <button id="mob-speed" title="Simulation speed multiplier">1x</button>
    <div class="bar-spacer"></div>
    <span class="mob-season" id="mob-season">Spring</span>
    <span class="mob-gen" id="mob-gen">GEN 0</span>
  `;
  document.body.appendChild(bar);

  const drawer = document.createElement('div');
  drawer.id = 'mobile-drawer';
  document.body.appendChild(drawer);

  const fab = document.createElement('button');
  fab.id = 'paint-fab';
  fab.textContent = 'Paint';
  document.body.appendChild(fab);

  fab.addEventListener('click', () => {
    setPaintMode(!_paintMode);
  });

  for (const tab of tabs.querySelectorAll('.mob-tab')) {
    tab.addEventListener('click', () => {
      const t = (tab as HTMLElement).dataset.tab as 'species' | 'stats' | 'menu';
      if (activeTab === t && drawerOpen) {
        closeDrawer();
      } else {
        openDrawer(t);
      }
    });
  }
}

function openDrawer(tab: 'species' | 'stats' | 'menu'): void {
  const drawer = document.getElementById('mobile-drawer');
  const tabs = document.getElementById('mobile-tabs');
  if (!drawer || !tabs) return;

  activeTab = tab;
  drawerOpen = true;

  for (const t of tabs.querySelectorAll('.mob-tab')) {
    t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab);
  }

  drawer.innerHTML = '';

  if (tab === 'species') {
    const palette = document.getElementById('palette-list');
    const heatmap = document.getElementById('heatmap-bar');
    const scenario = document.getElementById('scenario-bar');
    if (palette) drawer.appendChild(palette.cloneNode(true));
    if (heatmap) drawer.appendChild(heatmap.cloneNode(true));
    if (scenario) drawer.appendChild(scenario.cloneNode(true));
    wireClonedPalette(drawer);
    wireClonedSelects(drawer);
  } else if (tab === 'stats') {
    const bio = document.getElementById('bio-score');
    const stats = document.getElementById('stats-list');
    const graph = document.getElementById('pop-graph-wrap');
    const evo = document.getElementById('evo-log');
    if (bio) drawer.appendChild(bio.cloneNode(true));
    if (stats) drawer.appendChild(stats.cloneNode(true));
    if (graph) drawer.appendChild(graph.cloneNode(true));
    if (evo) drawer.appendChild(evo.cloneNode(true));
  } else if (tab === 'menu') {
    drawer.innerHTML = buildMenuDrawer();
    wireMenuButtons(drawer);
  }

  drawer.classList.add('open');
}

function closeDrawer(): void {
  const drawer = document.getElementById('mobile-drawer');
  const tabs = document.getElementById('mobile-tabs');
  if (drawer) drawer.classList.remove('open');
  if (tabs) {
    for (const t of tabs.querySelectorAll('.mob-tab')) t.classList.remove('active');
  }
  drawerOpen = false;
  activeTab = null;
}

function restorePanels(): void {
  // Panels are still in the DOM (hidden by CSS on mobile, shown on desktop).
  // Cloned nodes in the drawer don't affect originals.
}

function buildMenuDrawer(): string {
  return `
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;">
      <button class="mob-menu-btn" data-action="seed" title="Populate grid with a balanced random ecosystem">Seed</button>
      <button class="mob-menu-btn" data-action="balance" title="Add rock reef formations">Balance</button>
      <button class="mob-menu-btn" data-action="biome" title="Reset and generate a terrain-driven biome">Biome</button>
      <button class="mob-menu-btn" data-action="clear" style="color:#ef4444;" title="Wipe the entire grid">Clear</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;border-top:1px solid #1a3a5c;margin-top:8px;">
      <button class="mob-menu-btn" data-action="save" title="Save simulation to your account or download">Save</button>
      <button class="mob-menu-btn" data-action="load" title="Load a simulation from file">Load</button>
      <button class="mob-menu-btn" data-action="dashboard" title="Browse your saved simulations">My Sims</button>
      <button class="mob-menu-btn" data-action="leaderboard" title="View top scores leaderboard">Ranks</button>
      <button class="mob-menu-btn" data-action="export" title="Download detailed data export">Export</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;border-top:1px solid #1a3a5c;margin-top:8px;">
      <button class="mob-menu-btn" data-action="tree" title="View phylogenetic tree of species lineages">Tree</button>
      <button class="mob-menu-btn" data-action="settings" title="Adjust simulation parameters">Settings</button>
      <button class="mob-menu-btn" data-action="help" title="Open the comprehensive help guide">Help</button>
      <button class="mob-menu-btn" data-action="account" title="Login, register or manage your account">Account</button>
    </div>
    ${isAdmin() ? `
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 0;border-top:1px solid #1a3a5c;margin-top:8px;">
      <button class="mob-menu-btn" data-action="admin" style="color:#FFD700;" title="Open the admin console">Admin</button>
    </div>
    ` : ''}
    <div style="display:flex;align-items:center;gap:6px;padding:8px 0;border-top:1px solid #1a3a5c;margin-top:8px;">
      <label style="color:#5a7a9a;font-size:0.7rem;display:flex;align-items:center;gap:4px;">
        <input type="checkbox" id="mob-evo" style="accent-color:#4da6ff;"> Evolution
      </label>
    </div>
    <style>
      .mob-menu-btn {
        font-family: 'Share Tech Mono', monospace; font-size: 0.7rem;
        padding: 6px 14px; border: 1px solid #1a3a5c; background: #0d1f3c; color: #e0e8f0;
        cursor: pointer; border-radius: 3px;
      }
      .mob-menu-btn:active { background: #1a3a5c; }
    </style>
  `;
}

type MobileCallbacks = {
  onPlay: () => void;
  onStep: () => void;
  onSpeed: (v: number) => void;
  onAction: (action: string) => void;
  onEvoToggle: (v: boolean) => void;
  getPaletteClickHandler: () => ((id: number) => void) | null;
};

let _callbacks: MobileCallbacks | null = null;

const SPEED_STEPS = [
  { value: 500, label: '0.5x' },
  { value: 100, label: '1x' },
  { value: 50, label: '2x' },
  { value: 25, label: '4x' },
  { value: 8, label: 'MAX' },
];
let _speedIndex = 1;

export function setMobileCallbacks(cb: MobileCallbacks): void {
  _callbacks = cb;

  const playBtn = document.getElementById('mob-play');
  const stepBtn = document.getElementById('mob-step');
  const speedBtn = document.getElementById('mob-speed');

  if (playBtn) playBtn.addEventListener('click', () => cb.onPlay());
  if (stepBtn) stepBtn.addEventListener('click', () => cb.onStep());
  if (speedBtn) speedBtn.addEventListener('click', () => {
    _speedIndex = (_speedIndex + 1) % SPEED_STEPS.length;
    const step = SPEED_STEPS[_speedIndex];
    speedBtn.textContent = step.label;
    cb.onSpeed(step.value);
  });
}

export function updateMobileBar(gen: number, season: string, playing: boolean): void {
  const genEl = document.getElementById('mob-gen');
  const seasonEl = document.getElementById('mob-season');
  const playBtn = document.getElementById('mob-play');
  if (genEl) genEl.textContent = `GEN ${gen}`;
  if (seasonEl) seasonEl.textContent = season;
  if (playBtn) playBtn.textContent = playing ? 'Pause' : 'Play';
}

function wireClonedPalette(container: HTMLElement): void {
  for (const btn of container.querySelectorAll('.sp-btn')) {
    btn.addEventListener('click', () => {
      const sid = parseInt((btn as HTMLElement).dataset.sid || '0');
      if (!isNaN(sid) && _callbacks?.getPaletteClickHandler()) {
        _callbacks.getPaletteClickHandler()!(sid);
      }
    });
  }
}

function wireClonedSelects(container: HTMLElement): void {
  const heatmapSel = container.querySelector('#heatmap-bar select') as HTMLSelectElement | null;
  const scenarioSel = container.querySelector('#scenario-bar select') as HTMLSelectElement | null;
  const origHeatmap = document.querySelector('#left-panel #heatmap-bar select') as HTMLSelectElement | null;
  const origScenario = document.querySelector('#left-panel #scenario-bar select') as HTMLSelectElement | null;

  if (heatmapSel && origHeatmap) {
    heatmapSel.value = origHeatmap.value;
    heatmapSel.addEventListener('change', () => {
      origHeatmap.value = heatmapSel.value;
      origHeatmap.dispatchEvent(new Event('change'));
    });
  }
  if (scenarioSel && origScenario) {
    scenarioSel.value = origScenario.value;
    scenarioSel.addEventListener('change', () => {
      origScenario.value = scenarioSel.value;
      origScenario.dispatchEvent(new Event('change'));
    });
  }
}

function wireMenuButtons(container: HTMLElement): void {
  for (const btn of container.querySelectorAll('.mob-menu-btn')) {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action && _callbacks) {
        closeDrawer();
        _callbacks.onAction(action);
      }
    });
  }

  const evoCheck = container.querySelector('#mob-evo') as HTMLInputElement | null;
  const origEvo = document.getElementById('evo-toggle') as HTMLInputElement | null;
  if (evoCheck && origEvo) {
    evoCheck.checked = origEvo.checked;
    evoCheck.addEventListener('change', () => {
      if (_callbacks) _callbacks.onEvoToggle(evoCheck.checked);
    });
  }
}
