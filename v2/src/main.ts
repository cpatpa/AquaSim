import { createSimState, startLoop, stopLoop, setSpeed, resetSimulation } from './core/simulation';
import type { SimState } from './core/simulation';
import { step } from './core/scheduler';
import type { StepContext, StepResult, Vent } from './core/scheduler';
import { MIN_GRID_PX, MAX_GRID_PX, CELL_SIZE, SEASON_LENGTH } from './constants';
import { noiseSeed } from './environment/terrain';
import { createRenderer, initCanvas, render, spawnDeathParticles, tickParticles, drawParticles } from './renderer/canvas-renderer';
import type { RendererState } from './renderer/canvas-renderer';
import { seedGrid, seedBalancedRockReefs } from './environment/seeding';
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
import { createCamera, setupCameraHandlers, updateCamera, screenToWorld, drawMinimap, fitToView } from './ui/camera';
import type { CameraState } from './ui/camera';
import { createUndoState, beginStroke, commitStroke, undo, redo } from './ui/undo';
import { COLOR_RGB } from './species/registry';
import { createSpeciesInfoState, openSpeciesInfo, injectSpeciesInfoStyles } from './ui/species-info';
import { buildPhyloTree, layoutPhyloTree, createPhyloView, setupPhyloInteraction, renderPhyloView } from './ui/phylo-tree';
import type { PhyloViewState } from './ui/phylo-tree';
import { openSettings, injectSettingsStyles } from './ui/settings';
import { openHelp, closeHelp, injectHelpStyles } from './ui/help';
import { SCENARIOS, getScenario } from './environment/scenarios';
import { drawHeatmapOverlay, HEATMAP_MODES } from './renderer/heatmap';
import type { HeatmapMode } from './renderer/heatmap';
import { tierImmigration } from './evolution/immigration';
import type { ImmigrationContext } from './evolution/immigration';

noiseSeed(Date.now());

const viewW = Math.min(window.innerWidth - 400, MAX_GRID_PX);
const viewH = Math.min(window.innerHeight - 60, MAX_GRID_PX);
const gridW = Math.max(Math.floor(Math.max(viewW, MIN_GRID_PX) / CELL_SIZE), 60);
const gridH = Math.max(Math.floor(Math.max(viewH, MIN_GRID_PX) / CELL_SIZE), 60);

const sim: SimState = createSimState({ gridWidth: gridW, gridHeight: gridH });
const _disasterState: DisasterState = createDisasterState();
const activeVents: Vent[] = [];
const undoState = createUndoState();
const speciesInfoState = createSpeciesInfoState();
injectSpeciesInfoStyles();
injectSettingsStyles();
injectHelpStyles();

seedGrid(sim.grid);
seedBalancedRockReefs(sim.grid);

const app = document.getElementById('app')!;
app.innerHTML = `
<div id="layout">
  <div id="sidebar">
    <div id="title-bar">
      <h1 id="title">AquaSim <span style="font-size:0.6em;opacity:0.5;">v2</span></h1>
      <span id="gen-counter">GEN 0</span>
      <span id="season-display">Spring</span>
    </div>
    <div id="controls">
      <button id="btn-play" title="Space">Play</button>
      <button id="btn-step" title="Right Arrow">Step</button>
      <select id="speed-select">
        <option value="500">0.5x</option>
        <option value="100" selected>1x</option>
        <option value="50">2x</option>
        <option value="25">4x</option>
        <option value="8">MAX</option>
      </select>
      <label><input type="checkbox" id="evo-toggle"> Evo</label>
    </div>
    <div id="tools">
      <button id="btn-seed" title="S">Seed</button>
      <button id="btn-balance" title="B">Balance</button>
      <button id="btn-clear" title="C">Clear</button>
      <button id="btn-save">Save</button>
      <button id="btn-load">Load</button>
      <button id="btn-export">Export</button>
      <button id="btn-tree">Tree</button>
      <button id="btn-settings">Settings</button>
      <button id="btn-help" title="?">?</button>
    </div>
    <div id="scenario-bar">
      <select id="scenario-select">
        <option value="">Scenario...</option>
        ${SCENARIOS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select>
    </div>
    <div id="species-info" class="info-bar"></div>
    <div id="palette-list"></div>
    <div id="heatmap-bar">
      <select id="heatmap-select">
        ${HEATMAP_MODES.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
      </select>
    </div>
    <div id="bio-score">Biodiversity: <span id="bio-score-value">0</span></div>
    <div id="pop-graph-wrap"><canvas id="pop-graph"></canvas></div>
    <div id="stats-list"></div>
    <div id="evo-log"><div id="evo-entries"></div></div>
  </div>
  <div id="canvas-wrap">
    <canvas id="grid-canvas"></canvas>
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

const canvasEl = document.getElementById('grid-canvas') as HTMLCanvasElement;
const rs: RendererState = createRenderer(canvasEl);
initCanvas(rs, sim.grid.width, sim.grid.height);

const worldW = sim.grid.width * CELL_SIZE;
const worldH = sim.grid.height * CELL_SIZE;
const cam: CameraState = createCamera(worldW, worldH, viewW, viewH);

const canvasWrap = document.getElementById('canvas-wrap')!;
canvasEl.style.width = canvasWrap.clientWidth + 'px';
canvasEl.style.height = canvasWrap.clientHeight + 'px';

setupCameraHandlers(canvasEl, cam, () => renderFrame());

const paint = createPaintState();
const palette = createPaletteState();

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

function getCellCounts(): Record<number, number> {
  const total = sim.grid.width * sim.grid.height;
  const counts: Record<number, number> = {};
  for (let i = 0; i < total; i++) {
    const s = sim.grid.species[i];
    if (s !== 0) counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

function handleDisaster(canvasX: number, canvasY: number): void {
  const [wx, wy] = screenToWorld(cam, canvasX, canvasY);
  const cellX = (wx / CELL_SIZE) | 0;
  const cellY = (wy / CELL_SIZE) | 0;
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

setupPaintHandlers(canvasEl, paint, sim.grid, renderFrame, handleDisaster);

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
  openSpeciesInfo(speciesInfoState, sid, sim.evoStats, getCellCounts());
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
  };

  const result: StepResult = step(ctx);

  sim.generation = result.generation;
  sim.radiationBoost = result.radiationBoost;
  sim.prevLivingCount = result.prevLivingCount;
  sim.evoCooldown = result.evoCooldown;
  sim.lastEvoGen = result.lastEvoGen;
}

function renderFrame(): void {
  updateCamera(cam);
  render(rs, sim.grid, sim.evoStats, sim.season.current, sim.generation);
  if (currentHeatmap !== 'none') {
    drawHeatmapOverlay(rs.ctx, sim.grid, sim.evoStats, currentHeatmap);
  }
  drawMinimap(rs.ctx, cam, sim.grid.species, sim.grid.width, sim.grid.height, COLOR_RGB);
  tickParticles(rs);
  drawParticles(rs);
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
const btnClear = document.getElementById('btn-clear')!;
const btnSave = document.getElementById('btn-save')!;
const btnLoad = document.getElementById('btn-load')!;
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
btnClear.addEventListener('click', () => {
  resetSimulation(sim);
  activeVents.length = 0;
  renderFrame();
  updateUI();
  btnPlay.textContent = 'Play';
});

btnSave.addEventListener('click', () => {
  const data = serialise(sim);
  downloadSave(data);
});
btnLoad.addEventListener('click', async () => {
  try {
    const data = await uploadSave();
    const wasRunning = sim.running;
    if (wasRunning) { stopLoop(sim); btnPlay.textContent = 'Play'; }
    deserialise(data, sim);
    initCanvas(rs, sim.grid.width, sim.grid.height);
    fitToView(cam);
    renderFrame();
    updateUI();
  } catch (_e) {
    // user cancelled or invalid file
  }
});

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
    openSpeciesInfo(speciesInfoState, id, sim.evoStats, counts);
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
  biome: () => {},
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

renderFrame();
updateUI();

export { sim };
