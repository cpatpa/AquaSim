import { createSimState, startLoop, stopLoop, setSpeed, resetSimulation } from './core/simulation';
import type { SimState } from './core/simulation';
import { step } from './core/scheduler';
import type { StepContext, StepResult, Vent } from './core/scheduler';
import { MIN_GRID_PX, MAX_GRID_PX, CELL_SIZE, SEASON_LENGTH } from './constants';
import { noiseSeed } from './environment/terrain';
import { createRenderer, initCanvas, render, spawnDeathParticles, tickParticles, drawParticles } from './renderer/canvas-renderer';
import type { RendererState } from './renderer/canvas-renderer';
import { seedGrid, seedBalancedRockReefs, seedBiome } from './environment/seeding';
import { createPaintState, setupPaintHandlers, setupKeyboardShortcuts } from './ui/toolbar';
import { createPaletteState, buildPalette, selectType, updateGenerationDisplay, updateSeasonDisplay, updateEvoLog } from './ui/panels';
import { calcBiodiversity, scoreColour, drawPopGraph, buildStatsHtml } from './ui/graphs';
import { recordGraphSnapshot, addEvoEvent } from './data/history';
import { triggerBomb, triggerOilSpill, triggerHeatwave, triggerIceAge, triggerToxicBloom, triggerVolcano, createDisasterState } from './environment/disasters';
import type { DisasterState } from './environment/disasters';
import { buildExportData, downloadExport } from './data/export';
import { evolve, speciate, nicheShift } from './evolution/evolution-engine';
import type { EvoContext } from './evolution/evolution-engine';
import { serialise, deserialise, downloadSave, uploadSave } from './data/serialisation';
import { createCamera, setupCameraHandlers, updateCamera, drawMinimap, fitToView } from './ui/camera';
import type { CameraState } from './ui/camera';
import { createUndoState, beginStroke, commitStroke, undo, redo } from './ui/undo';
import { COLOR_RGB, SPECIES, getDynamicSpeciesIds } from './species/registry';
import { createSpeciesInfoState, openSpeciesInfo, injectSpeciesInfoStyles } from './ui/species-info';
import { buildPhyloTree, layoutPhyloTree, createPhyloView, setupPhyloInteraction, renderPhyloView } from './ui/phylo-tree';
import type { PhyloViewState } from './ui/phylo-tree';
import { openSettings, injectSettingsStyles } from './ui/settings';
import { openHelp, closeHelp, injectHelpStyles } from './ui/help';
import { setupCellTooltip, injectTooltipStyles } from './ui/cell-tooltip';
import { SCENARIOS, getScenario } from './environment/scenarios';
import { drawHeatmapOverlay, HEATMAP_MODES } from './renderer/heatmap';
import type { HeatmapMode } from './renderer/heatmap';
import { tierImmigration } from './evolution/immigration';
import type { ImmigrationContext } from './evolution/immigration';
import { generateCreaturePortrait, clearPortraitCache } from './renderer/portraits';
import { showAuthModal } from './ui/auth';
import { openDashboard } from './ui/dashboard';
import { openLeaderboard } from './ui/leaderboard';
import { openAccount } from './ui/account';
import { initMobile, initMobileUI, isMobile, getMobileContentRect, setResizeCallback, setMobileCallbacks, updateMobileBar } from './ui/mobile';
import {
  isLoggedIn, getUser, tryRestoreSession,
  saveSimulation, loadSimulation, updateSimulation, submitScore,
} from './api/client';

noiseSeed(Date.now());
initMobile();

const mobileView = isMobile();
let viewW: number;
let viewH: number;
if (mobileView) {
  const rect = getMobileContentRect();
  viewW = rect.width;
  viewH = rect.height;
} else {
  viewW = Math.min(window.innerWidth - 400, MAX_GRID_PX);
  viewH = Math.min(window.innerHeight - 60, MAX_GRID_PX);
}
const mobileGridMult = mobileView ? 2 : 1;
const gridW = Math.max(Math.floor(Math.max(viewW, MIN_GRID_PX) / CELL_SIZE), 60) * mobileGridMult;
const gridH = Math.max(Math.floor(Math.max(viewH, MIN_GRID_PX) / CELL_SIZE), 60) * mobileGridMult;

const sim: SimState = createSimState({ gridWidth: gridW, gridHeight: gridH });
const _disasterState: DisasterState = createDisasterState();
const activeVents: Vent[] = [];
const undoState = createUndoState();
const speciesInfoState = createSpeciesInfoState();
injectSpeciesInfoStyles();
injectSettingsStyles();
injectHelpStyles();
injectTooltipStyles();

seedGrid(sim.grid);
seedBalancedRockReefs(sim.grid);

const app = document.getElementById('app')!;
app.innerHTML = `
<div id="layout">
  <div id="left-panel">
    <h1>AQUASIM</h1>
    <div id="user-bar">
      <span id="user-label"></span>
      <span style="flex:1;"></span>
      <button id="btn-account" title="Login, register or manage your account">Acct</button>
    </div>
    <div id="species-info"></div>
    <div id="palette-list"></div>
    <div id="heatmap-bar">
      <select id="heatmap-select" title="Overlay a heatmap showing hunger, age, traits or other data">
        ${HEATMAP_MODES.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
      </select>
    </div>
    <div id="scenario-bar">
      <select id="scenario-select" title="Load a preset scenario with different starting conditions">
        <option value="">Scenario...</option>
        ${SCENARIOS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="centre">
    <div id="canvas-wrap">
      <canvas id="grid-canvas"></canvas>
      <canvas id="minimap-canvas" width="136" height="136"></canvas>
    </div>
    <div id="bottom-bar">
      <button id="btn-play" title="Start or pause the simulation (Space)">Play</button>
      <button id="btn-step" title="Advance one tick while paused (Right Arrow)">Step</button>
      <select id="speed-select" title="Simulation speed multiplier">
        <option value="500">0.5x</option>
        <option value="100" selected>1x</option>
        <option value="50">2x</option>
        <option value="25">4x</option>
        <option value="8">MAX</option>
      </select>
      <label title="Enable evolution, mutation and speciation"><input type="checkbox" id="evo-toggle" checked> Evo</label>
      <div class="bar-divider"></div>
      <button id="btn-seed" title="Populate grid with a balanced random ecosystem (S)">Seed</button>
      <button id="btn-balance" title="Add rock reef formations without clearing life (B)">Balance</button>
      <button id="btn-biome" title="Reset and generate a terrain-driven biome (G)">Biome</button>
      <button class="btn-danger" id="btn-clear" title="Wipe the entire grid (C)">Clear</button>
      <div class="bar-divider"></div>
      <button id="btn-save" title="Save simulation to your account or download as file">Save</button>
      <button id="btn-load" title="Load a simulation from a .json save file">Load</button>
      <button id="btn-dashboard" title="Browse and load your saved simulations">My Sims</button>
      <button id="btn-leaderboard" title="View leaderboard of top scores">Ranks</button>
      <button id="btn-export" title="Download a detailed data export of the current state">Export</button>
      <div class="bar-divider"></div>
      <button id="btn-tree" title="View the phylogenetic tree of all species lineages">Tree</button>
      <button id="btn-settings" title="Adjust mutation rate, speciation rate, trait limits and grid size">Settings</button>
      <button id="btn-help" title="Open the comprehensive help guide (?)">?</button>
      <div class="bar-spacer"></div>
      <span id="season-display">Spring</span>
      <span id="gen-counter">GEN 0</span>
    </div>
  </div>
  <div id="right-panel">
    <h2 class="rp-heading-pop">POPULATION</h2>
    <div id="bio-score">
      <span id="bio-score-label">BIODIVERSITY</span>
      <span id="bio-score-value">0</span>
    </div>
    <div id="stats-list"></div>
    <div id="pop-graph-wrap"><canvas id="pop-graph"></canvas></div>
    <h2 class="rp-heading-evo">EVOLUTION</h2>
    <div id="evo-log"><div id="evo-entries"></div></div>
  </div>
</div>
<div id="phylo-overlay" class="overlay-hidden">
  <div id="phylo-panel">
    <div id="phylo-header">
      <span>Phylogenetic Tree</span>
      <button id="phylo-close">&times;</button>
    </div>
    <canvas id="phylo-canvas"></canvas>
  </div>
</div>`;

initMobileUI();

const canvasEl = document.getElementById('grid-canvas') as HTMLCanvasElement;
const rs: RendererState = createRenderer(canvasEl);
initCanvas(rs, sim.grid.width, sim.grid.height);

const worldW = sim.grid.width * CELL_SIZE;
const worldH = sim.grid.height * CELL_SIZE;
const cam: CameraState = createCamera(worldW, worldH, viewW, viewH);

const canvasWrap = document.getElementById('canvas-wrap')!;
const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
const minimapCtx = minimapCanvas.getContext('2d')!;

function syncCanvasSize(): void {
  let w: number, h: number;
  if (mobileView) {
    const rect = getMobileContentRect();
    w = rect.width;
    h = rect.height;
  } else {
    w = canvasWrap.clientWidth;
    h = canvasWrap.clientHeight;
  }
  if (w > 0 && h > 0) {
    cam.viewW = w;
    cam.viewH = h;
  }
}

function applyCamera(): void {
  const tx = -cam.x * cam.zoom;
  const ty = -cam.y * cam.zoom;
  canvasEl.style.transform = `translate(${tx}px, ${ty}px) scale(${cam.zoom})`;
}

syncCanvasSize();
applyCamera();
setupCameraHandlers(canvasEl, canvasWrap, cam, () => renderFrame());

window.addEventListener('resize', () => {
  syncCanvasSize();
  renderFrame();
});

setResizeCallback(() => {
  syncCanvasSize();
  renderFrame();
});

const paint = createPaintState();
const palette = createPaletteState();

setupCellTooltip(canvasEl, canvasWrap, cam, sim.grid, sim.evoStats, () => paint.painting || cam.isDragging);

const genEl = document.getElementById('gen-counter')!;
const seasonEl = document.getElementById('season-display')!;
const statsEl = document.getElementById('stats-list')!;
const evoEntriesEl = document.getElementById('evo-entries')!;
const bioScoreEl = document.getElementById('bio-score-value')!;
const speciesInfoEl = document.getElementById('species-info')!;
const paletteListEl = document.getElementById('palette-list')!;
const popGraphCanvas = document.getElementById('pop-graph') as HTMLCanvasElement;
const popGraphCtx = popGraphCanvas.getContext('2d')!;

buildPalette(paletteListEl, palette, (id) => {
  palette.selectedType = id;
  paint.selectedType = id;
  selectType(palette, id, speciesInfoEl);
});

let _cachedCounts: Record<number, number> = {};
let _cachedCountsGen = -1;

function getCellCounts(): Record<number, number> {
  if (_cachedCountsGen === sim.generation) return _cachedCounts;
  const total = sim.grid.width * sim.grid.height;
  const counts: Record<number, number> = {};
  for (let i = 0; i < total; i++) {
    const s = sim.grid.species[i];
    if (s !== 0) counts[s] = (counts[s] || 0) + 1;
  }
  _cachedCounts = counts;
  _cachedCountsGen = sim.generation;
  return counts;
}

function handleDisaster(worldX: number, worldY: number): void {
  const cellX = (worldX / CELL_SIZE) | 0;
  const cellY = (worldY / CELL_SIZE) | 0;
  const r = 8 + paint.brushSize;
  switch (palette.selectedType) {
    case -1: triggerBomb(sim.grid, cellX, cellY, r); break;
    case -2: triggerOilSpill(sim.grid, cellX, cellY, r); break;
    case -3: triggerHeatwave(sim.grid, sim.evoStats, cellX, cellY, r); break;
    case -4: triggerIceAge(sim.grid, sim.evoStats, cellX, cellY, r); break;
    case -5: triggerToxicBloom(sim.grid, cellX, cellY, r); break;
    case -6: triggerVolcano(sim.grid, _disasterState, cellX, cellY, r); break;
  }
  renderFrame();
}

setupPaintHandlers(canvasEl, canvasWrap, cam, paint, sim.grid, renderFrame, handleDisaster);

canvasEl.addEventListener('mousedown', () => {
  if (paint.selectedType >= 0) {
    beginStroke(undoState, sim.grid, []);
  }
});
window.addEventListener('mouseup', () => {
  commitStroke(undoState);
});

statsEl.addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest('.stat-row') as HTMLElement | null;
  if (!row) return;
  const sid = parseInt(row.dataset.sid!);
  if (isNaN(sid) || sid < 10) return;
  const sp = SPECIES[sid];
  const portrait = sp ? generateCreaturePortrait(sid, sp, sim.evoStats[sid], COLOR_RGB[sid] || [128, 128, 128]) : null;
  openSpeciesInfo(speciesInfoState, sid, sim.evoStats, getCellCounts(), portrait);
});

function buildEvoContext(): EvoContext {
  return {
    evoStats: sim.evoStats,
    popHistory: sim.history.popHistory,
    species: sim.grid.species,
    gridW: sim.grid.width,
    gridH: sim.grid.height,
    generation: sim.generation,
    radiationBoost: sim.radiationBoost,
    mutationRateMult: sim.config.mutationRateMult,
    speciationRateMult: sim.config.speciationRateMult,
    maxTraitsPerSpecies: sim.maxTraitsPerSpecies,
    history: sim.history,
  };
}

function buildImmigrationContext(): ImmigrationContext {
  return {
    evoStats: sim.evoStats,
    popHistory: sim.history.popHistory,
    species: sim.grid.species,
    hunger: sim.grid.hunger,
    age: sim.grid.age,
    gridW: sim.grid.width,
    gridH: sim.grid.height,
    generation: sim.generation,
    maxTraitsPerSpecies: sim.maxTraitsPerSpecies,
    history: sim.history,
  };
}

function doStep(): void {
  const ctx: StepContext = {
    grid: sim.grid,
    evoStats: sim.evoStats,
    season: sim.season,
    history: sim.history,
    generation: sim.generation,
    evolveEnabled: sim.evolveEnabled,
    radiationBoost: sim.radiationBoost,
    prevLivingCount: sim.prevLivingCount,
    mutationRateMult: sim.config.mutationRateMult,
    speciationRateMult: sim.config.speciationRateMult,
    maxTraitsPerSpecies: sim.maxTraitsPerSpecies,
    activeVents,
    evoCooldown: sim.evoCooldown,
    lastEvoGen: sim.lastEvoGen,
    onSpawnDeathParticles: (idx, sid) => spawnDeathParticles(rs, idx, sid, sim.grid.width),
    onEvolve: () => {
      const ectx = buildEvoContext();
      const result = evolve(ectx);
      sim.radiationBoost = result.radiationBoost;
    },
    onSpeciate: () => { speciate(buildEvoContext()); },
    onNicheShift: () => { nicheShift(buildEvoContext()); },
    onTierImmigration: () => { tierImmigration(buildImmigrationContext()); },
    onClearCreatureCache: () => { clearPortraitCache(); },
  };

  const result: StepResult = step(ctx);

  sim.generation = result.generation;
  sim.radiationBoost = result.radiationBoost;
  sim.prevLivingCount = result.prevLivingCount;
  sim.evoCooldown = result.evoCooldown;
  sim.lastEvoGen = result.lastEvoGen;
  trySubmitScores();
}

function renderFrame(): void {
  updateCamera(cam);
  render(rs, sim.grid, sim.evoStats, sim.season.current, sim.generation);
  if (currentHeatmap !== 'none') {
    drawHeatmapOverlay(rs.ctx, sim.grid, sim.evoStats, currentHeatmap);
  }
  tickParticles(rs);
  drawParticles(rs);
  applyCamera();
  minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  drawMinimap(minimapCtx, cam, sim.grid.species, sim.grid.width, sim.grid.height, COLOR_RGB);
}

function updateUI(): void {
  updateGenerationDisplay(genEl, sim.generation);
  updateSeasonDisplay(seasonEl, sim.season.current, sim.season.tick, SEASON_LENGTH);

  const counts = getCellCounts();
  statsEl.innerHTML = buildStatsHtml(counts, sim.evoStats, sim.evolveEnabled);
  const bio = calcBiodiversity(counts, sim.evoStats);
  bioScoreEl.textContent = String(bio);
  bioScoreEl.style.color = scoreColour(bio);

  if (sim.generation % 2 === 0) {
    recordGraphSnapshot(sim.history, counts);
    drawPopGraph(popGraphCanvas, popGraphCtx, sim.history.graphHistory);
  }

  updateEvoLog(evoEntriesEl, sim.history.evoLog, sim.evolveEnabled);
  updateMobileBar(sim.generation, sim.season.current, sim.running);
}

function tick(): void {
  doStep();
  renderFrame();
  updateUI();
}

const btnPlay = document.getElementById('btn-play')!;
const btnStep = document.getElementById('btn-step')!;
const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
const evoToggle = document.getElementById('evo-toggle') as HTMLInputElement;
const btnSeed = document.getElementById('btn-seed')!;
const btnBalance = document.getElementById('btn-balance')!;
const btnBiome = document.getElementById('btn-biome')!;
const btnClear = document.getElementById('btn-clear')!;
const btnSave = document.getElementById('btn-save')!;
const btnLoad = document.getElementById('btn-load')!;
const btnDashboard = document.getElementById('btn-dashboard')!;
const btnLeaderboard = document.getElementById('btn-leaderboard')!;
const btnAccount = document.getElementById('btn-account')!;
const userLabel = document.getElementById('user-label')!;
const btnExport = document.getElementById('btn-export')!;
const btnTree = document.getElementById('btn-tree')!;
const btnSettings = document.getElementById('btn-settings')!;
const btnHelp = document.getElementById('btn-help')!;
const scenarioSelect = document.getElementById('scenario-select') as HTMLSelectElement;
const heatmapSelect = document.getElementById('heatmap-select') as HTMLSelectElement;
let currentHeatmap: HeatmapMode = 'none';

function togglePlay(): void {
  if (sim.running) {
    stopLoop(sim);
    btnPlay.textContent = 'Play';
  } else {
    startLoop(sim, tick);
    btnPlay.textContent = 'Pause';
  }
}

btnPlay.addEventListener('click', togglePlay);
btnStep.addEventListener('click', () => { if (!sim.running) tick(); });
speedSelect.addEventListener('change', () => {
  setSpeed(sim, parseInt(speedSelect.value), tick);
});
evoToggle.addEventListener('change', () => {
  sim.evolveEnabled = evoToggle.checked;
  sim.config.evolveEnabled = evoToggle.checked;
});

btnSeed.addEventListener('click', () => {
  seedGrid(sim.grid);
  seedBalancedRockReefs(sim.grid);
  renderFrame();
  updateUI();
});
btnBalance.addEventListener('click', () => {
  seedBalancedRockReefs(sim.grid);
  renderFrame();
  updateUI();
});
btnBiome.addEventListener('click', () => {
  resetSimulation(sim);
  seedBiome(sim.grid);
  renderFrame();
  updateUI();
});
btnClear.addEventListener('click', () => {
  resetSimulation(sim);
  activeVents.length = 0;
  renderFrame();
  updateUI();
  btnPlay.textContent = 'Play';
});

let currentSimId: string | null = null;
let _lastScoreGen = 0;

function trySubmitScores(): void {
  if (!currentSimId || !isLoggedIn()) return;
  const user = getUser();
  if (!user || user.role === 'guest') return;
  if (sim.generation - _lastScoreGen < 50) return;
  _lastScoreGen = sim.generation;

  const counts = getCellCounts();
  const bio = calcBiodiversity(counts, sim.evoStats);
  const gen = sim.generation;

  let maxPop = 0;
  for (const k in counts) {
    if (counts[k] > maxPop) maxPop = counts[k];
  }

  const speciations = getDynamicSpeciesIds().length;

  let maxDepth = 0;
  for (const id of getDynamicSpeciesIds()) {
    const d = (SPECIES[id] as unknown as Record<string, unknown>)?.lineageDepth;
    if (typeof d === 'number' && d > maxDepth) maxDepth = d;
  }

  const sid = currentSimId;
  submitScore(sid, 'biodiversity', bio, gen).catch(() => {});
  submitScore(sid, 'speciations', speciations, gen).catch(() => {});
  submitScore(sid, 'max_population', maxPop, gen).catch(() => {});
  submitScore(sid, 'generations', gen, gen).catch(() => {});
  if (maxDepth > 0) submitScore(sid, 'longest_species', maxDepth, gen).catch(() => {});
}

btnSave.addEventListener('click', async () => {
  const data = serialise(sim);
  if (isLoggedIn()) {
    if (currentSimId) {
      try {
        await updateSimulation(currentSimId, data);
        btnSave.textContent = 'Saved!';
        setTimeout(() => { btnSave.textContent = 'Save'; }, 1500);
      } catch {
        btnSave.textContent = 'Failed';
        setTimeout(() => { btnSave.textContent = 'Save'; }, 1500);
      }
    } else {
      const name = prompt('Simulation name:');
      if (!name) return;
      try {
        const { id } = await saveSimulation(name, data);
        currentSimId = id;
        btnSave.textContent = 'Saved!';
        setTimeout(() => { btnSave.textContent = 'Save'; }, 1500);
      } catch (e) {
        alert((e as Error).message);
      }
    }
  } else {
    await downloadSave(data);
  }
});

btnLoad.addEventListener('click', async () => {
  try {
    const data = await uploadSave();
    const wasRunning = sim.running;
    if (wasRunning) { stopLoop(sim); btnPlay.textContent = 'Play'; }
    deserialise(data, sim);
    currentSimId = null;
    initCanvas(rs, sim.grid.width, sim.grid.height);
    fitToView(cam);
    renderFrame();
    updateUI();
  } catch {
    // user cancelled or invalid file
  }
});

btnDashboard.addEventListener('click', () => {
  if (!isLoggedIn()) { alert('Login to access your saved simulations.'); return; }
  openDashboard({
    onLoad: async (simId) => {
      try {
        const { state } = await loadSimulation(simId);
        const wasRunning = sim.running;
        if (wasRunning) { stopLoop(sim); btnPlay.textContent = 'Play'; }
        deserialise(state as ReturnType<typeof serialise>, sim);
        currentSimId = simId;
        initCanvas(rs, sim.grid.width, sim.grid.height);
        fitToView(cam);
        renderFrame();
        updateUI();
      } catch (e) {
        alert((e as Error).message);
      }
    },
    onClose: () => {},
  });
});

btnLeaderboard.addEventListener('click', () => {
  openLeaderboard(() => {});
});

btnAccount.addEventListener('click', async () => {
  const user = getUser();
  if (isLoggedIn() && user && user.role !== 'guest') {
    openAccount({
      onLogout: () => {
        currentSimId = null;
        updateUserBar();
      },
      onClose: () => { updateUserBar(); },
    });
  } else {
    const result = await showAuthModal();
    if (result.action !== 'skip') {
      updateUserBar();
    }
  }
});

function updateUserBar(): void {
  const u = getUser();
  if (u) {
    userLabel.textContent = u.username + (u.role === 'guest' ? ' (guest)' : '');
    btnAccount.textContent = 'Acct';
  } else {
    userLabel.textContent = '';
    btnAccount.textContent = 'Login';
  }
}

btnExport.addEventListener('click', () => {
  const counts = getCellCounts();
  const bio = calcBiodiversity(counts, sim.evoStats);
  const data = buildExportData(sim.grid, sim.evoStats, sim.generation, sim.evolveEnabled, sim.history.popHistory, sim.history.evoLog, bio);
  downloadExport(data);
});

btnSettings.addEventListener('click', () => {
  openSettings(sim.config, sim.maxTraitsPerSpecies, {
    onMutationRateChange: (v) => { sim.config.mutationRateMult = v; },
    onSpeciationRateChange: (v) => { sim.config.speciationRateMult = v; },
    onTraitLimitChange: (v) => { sim.maxTraitsPerSpecies = v; sim.config.maxTraitsPerSpecies = v; },
    onGridResize: (w, h) => {
      if (sim.running) { stopLoop(sim); btnPlay.textContent = 'Play'; }
      Object.assign(sim, createSimState({ ...sim.config, gridWidth: w, gridHeight: h }));
      initCanvas(rs, sim.grid.width, sim.grid.height);
      fitToView(cam);
      seedGrid(sim.grid);
      seedBalancedRockReefs(sim.grid);
      renderFrame();
      updateUI();
    },
  });
});

btnHelp.addEventListener('click', () => openHelp());

scenarioSelect.addEventListener('change', () => {
  const id = scenarioSelect.value;
  if (!id) return;
  const scenario = getScenario(id);
  if (!scenario) return;
  if (sim.running) { stopLoop(sim); btnPlay.textContent = 'Play'; }
  scenario.apply(sim.grid);
  renderFrame();
  updateUI();
  scenarioSelect.value = '';
});

heatmapSelect.addEventListener('change', () => {
  currentHeatmap = heatmapSelect.value as HeatmapMode;
  renderFrame();
});

const phyloOverlay = document.getElementById('phylo-overlay')!;
const phyloCanvas = document.getElementById('phylo-canvas') as HTMLCanvasElement;
const phyloCloseBtn = document.getElementById('phylo-close')!;
let phyloView: PhyloViewState | null = null;
let phyloCleanup: (() => void) | null = null;

function openPhyloTree(): void {
  phyloOverlay.classList.remove('overlay-hidden');
  const counts = getCellCounts();
  const roots = buildPhyloTree(sim.evoStats, counts);
  const layout = layoutPhyloTree(roots);
  phyloView = createPhyloView();
  if (phyloCleanup) phyloCleanup();
  phyloCleanup = setupPhyloInteraction(phyloCanvas, phyloView, layout, (id) => {
    const psp = SPECIES[id];
    const pp = psp ? generateCreaturePortrait(id, psp, sim.evoStats[id], COLOR_RGB[id] || [128, 128, 128]) : null;
    openSpeciesInfo(speciesInfoState, id, sim.evoStats, counts, pp);
  }, () => {
    renderPhyloView(phyloCanvas, phyloView!, layout);
  });
  renderPhyloView(phyloCanvas, phyloView, layout);
}

function closePhyloTree(): void {
  phyloOverlay.classList.add('overlay-hidden');
  if (phyloCleanup) { phyloCleanup(); phyloCleanup = null; }
  phyloView = null;
}

btnTree.addEventListener('click', openPhyloTree);
phyloCloseBtn.addEventListener('click', closePhyloTree);
phyloOverlay.addEventListener('click', (e) => {
  if (e.target === phyloOverlay) closePhyloTree();
});

setupKeyboardShortcuts({
  togglePlay,
  step: () => { if (!sim.running) tick(); },
  setSpeed: (interval) => {
    setSpeed(sim, interval, tick);
    speedSelect.value = String(interval);
  },
  toggleEvo: () => {
    evoToggle.checked = !evoToggle.checked;
    sim.evolveEnabled = evoToggle.checked;
    sim.config.evolveEnabled = evoToggle.checked;
  },
  triggerMutation: () => {
    sim.radiationBoost = 5;
    addEvoEvent(sim.history, sim.generation, 'Mutation storm triggered!');
    updateUI();
  },
  seed: () => {
    seedGrid(sim.grid);
    seedBalancedRockReefs(sim.grid);
    renderFrame();
    updateUI();
  },
  balance: () => {
    seedBalancedRockReefs(sim.grid);
    renderFrame();
    updateUI();
  },
  biome: () => {
    resetSimulation(sim);
    seedBiome(sim.grid);
    renderFrame();
    updateUI();
  },
  clear: () => {
    resetSimulation(sim);
    activeVents.length = 0;
    renderFrame();
    updateUI();
    btnPlay.textContent = 'Play';
  },
  showHelp: () => openHelp(),
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (undo(undoState, sim.grid)) { renderFrame(); updateUI(); }
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    if (redo(undoState, sim.grid)) { renderFrame(); updateUI(); }
  }
  if (e.key === 'Escape') {
    closePhyloTree();
    closeHelp();
  }
});

setMobileCallbacks({
  onPlay: togglePlay,
  onStep: () => { if (!sim.running) tick(); },
  onSpeed: (v) => { setSpeed(sim, v, tick); speedSelect.value = String(v); },
  onAction: (action) => {
    switch (action) {
      case 'seed': btnSeed.click(); break;
      case 'balance': btnBalance.click(); break;
      case 'biome': btnBiome.click(); break;
      case 'clear': btnClear.click(); break;
      case 'save': btnSave.click(); break;
      case 'load': btnLoad.click(); break;
      case 'dashboard': btnDashboard.click(); break;
      case 'leaderboard': btnLeaderboard.click(); break;
      case 'export': btnExport.click(); break;
      case 'tree': btnTree.click(); break;
      case 'settings': btnSettings.click(); break;
      case 'help': btnHelp.click(); break;
      case 'account': btnAccount.click(); break;
      case 'admin': window.open('/admin', '_blank'); break;
    }
  },
  onEvoToggle: (v) => {
    evoToggle.checked = v;
    sim.evolveEnabled = v;
    sim.config.evolveEnabled = v;
  },
  getPaletteClickHandler: () => (id: number) => {
    palette.selectedType = id;
    paint.selectedType = id;
    selectType(palette, id, speciesInfoEl);
  },
});

renderFrame();
updateUI();

(async () => {
  let restored = false;
  try {
    restored = await tryRestoreSession();
  } catch {
    // session restore failed, show login
  }
  if (!restored) {
    try {
      const result = await showAuthModal();
      if (result.action === 'skip') {
        // continue without login
      }
    } catch {
      // auth modal error, continue as guest
    }
  }
  updateUserBar();
})();

export { sim };
