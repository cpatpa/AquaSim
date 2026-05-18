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

noiseSeed(Date.now());

const viewW = Math.min(window.innerWidth - 400, MAX_GRID_PX);
const viewH = Math.min(window.innerHeight - 60, MAX_GRID_PX);
const gridW = Math.max(Math.floor(Math.max(viewW, MIN_GRID_PX) / CELL_SIZE), 60);
const gridH = Math.max(Math.floor(Math.max(viewH, MIN_GRID_PX) / CELL_SIZE), 60);

const sim: SimState = createSimState({ gridWidth: gridW, gridHeight: gridH });
const disasterState: DisasterState = createDisasterState();
const activeVents: Vent[] = [];

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
      <button id="btn-export">Export</button>
    </div>
    <div id="species-info" class="info-bar"></div>
    <div id="palette-list"></div>
    <div id="bio-score">Biodiversity: <span id="bio-score-value">0</span></div>
    <div id="pop-graph-wrap"><canvas id="pop-graph"></canvas></div>
    <div id="stats-list"></div>
    <div id="evo-log"><div id="evo-entries"></div></div>
  </div>
  <div id="canvas-wrap">
    <canvas id="grid-canvas"></canvas>
  </div>
</div>`;

const canvasEl = document.getElementById('grid-canvas') as HTMLCanvasElement;
const rs: RendererState = createRenderer(canvasEl);
initCanvas(rs, sim.grid.width, sim.grid.height);

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

function handleDisaster(canvasX: number, canvasY: number): void {
  const cellX = (canvasX / CELL_SIZE) | 0;
  const cellY = (canvasY / CELL_SIZE) | 0;
  const r = 8 + paint.brushSize;
  switch (palette.selectedType) {
    case -1: triggerBomb(sim.grid, cellX, cellY, r); break;
    case -2: triggerOilSpill(sim.grid, cellX, cellY, r); break;
    case -3: triggerHeatwave(sim.grid, sim.evoStats, cellX, cellY, r); break;
    case -4: triggerIceAge(sim.grid, sim.evoStats, cellX, cellY, r); break;
    case -5: triggerToxicBloom(sim.grid, cellX, cellY, r); break;
    case -6: triggerVolcano(sim.grid, disasterState, cellX, cellY, r); break;
  }
  renderFrame();
}

setupPaintHandlers(canvasEl, paint, sim.grid, renderFrame, handleDisaster);

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
  };

  const result: StepResult = step(ctx);

  sim.generation = result.generation;
  sim.radiationBoost = result.radiationBoost;
  sim.prevLivingCount = result.prevLivingCount;
  sim.evoCooldown = result.evoCooldown;
  sim.lastEvoGen = result.lastEvoGen;
}

function renderFrame(): void {
  render(rs, sim.grid, sim.evoStats, sim.season.current, sim.generation);
  tickParticles(rs);
  drawParticles(rs);
}

function updateUI(): void {
  updateGenerationDisplay(genEl, sim.generation);
  updateSeasonDisplay(seasonEl, sim.season.current, sim.season.tick, SEASON_LENGTH);

  const total = sim.grid.width * sim.grid.height;
  const counts: Record<number, number> = {};
  for (let i = 0; i < total; i++) {
    const s = sim.grid.species[i];
    if (s !== 0) counts[s] = (counts[s] || 0) + 1;
  }

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
const btnExport = document.getElementById('btn-export')!;

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
btnExport.addEventListener('click', () => {
  const total = sim.grid.width * sim.grid.height;
  const counts: Record<number, number> = {};
  for (let i = 0; i < total; i++) {
    const s = sim.grid.species[i];
    if (s !== 0) counts[s] = (counts[s] || 0) + 1;
  }
  const bio = calcBiodiversity(counts, sim.evoStats);
  const data = buildExportData(sim.grid, sim.evoStats, sim.generation, sim.evolveEnabled, sim.history.popHistory, sim.history.evoLog, bio);
  downloadExport(data);
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
  showHelp: () => {},
});

renderFrame();
updateUI();

export { sim };
