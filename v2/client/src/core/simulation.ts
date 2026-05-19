import type { GridState, EvoStats, GeneSet, SimConfig } from '../types';
import {
  CELL_SIZE,
  GENE_KEYS,
  TIER_DEFAULT_GENES,
  DEFAULT_MAX_TRAITS_PER_SPECIES,
} from '../constants';
import { allocGrid, clearGrid } from './grid';
import { SPECIES, getLivingIds, resetDynamicSpecies } from '../species/registry';
import { makeDiploidGene, cloneGenes } from '../evolution/genetics';
import { createSeasonState, resetSeason, type SeasonState } from '../environment/seasons';
import { createHistory, resetHistory, type SimHistory } from '../data/history';
import { resetTierEmptyGens } from '../evolution/immigration';

export interface SimState {
  grid: GridState;
  config: SimConfig;
  generation: number;
  season: SeasonState;
  history: SimHistory;
  evoStats: Record<number, EvoStats>;
  evolveEnabled: boolean;
  evoCooldown: number;
  lastEvoGen: number;
  radiationBoost: number;
  prevLivingCount: number;
  maxTraitsPerSpecies: number;
  running: boolean;
  tickTimer: ReturnType<typeof setInterval> | null;
}

export function createDefaultConfig(): SimConfig {
  return {
    gridWidth: 60,
    gridHeight: 60,
    cellSize: CELL_SIZE,
    gridGap: 1,
    evolveEnabled: true,
    tickInterval: 100,
    maxTraitsPerSpecies: DEFAULT_MAX_TRAITS_PER_SPECIES,
    mutationRateMult: 1.0,
    speciationRateMult: 1.0,
  };
}

export function createSimState(config?: Partial<SimConfig>): SimState {
  const cfg = { ...createDefaultConfig(), ...config };
  const grid = allocGrid(cfg.gridWidth, cfg.gridHeight);

  const state: SimState = {
    grid,
    config: cfg,
    generation: 0,
    season: createSeasonState(),
    history: createHistory(),
    evoStats: {},
    evolveEnabled: cfg.evolveEnabled,
    evoCooldown: 0,
    lastEvoGen: 0,
    radiationBoost: 0,
    prevLivingCount: 0,
    maxTraitsPerSpecies: cfg.maxTraitsPerSpecies,
    running: false,
    tickTimer: null,
  };

  initEvoStats(state);
  return state;
}

export function initEvoStats(state: SimState): void {
  resetDynamicSpecies();
  state.evoStats = {};

  for (const id of getLivingIds()) {
    const sp = SPECIES[id];
    if (!sp) continue;
    const tierGenes = TIER_DEFAULT_GENES[sp.tier as keyof typeof TIER_DEFAULT_GENES]
      ?? TIER_DEFAULT_GENES.herbivore;

    const noise = (seed: number) => {
      const x = Math.sin(seed * 127.1 + id * 311.7) * 43758.5453;
      return (x - Math.floor(x)) * 0.08 - 0.04;
    };

    const genes = {} as GeneSet;
    const geneVar: Record<string, number> = {};
    for (let gi = 0; gi < GENE_KEYS.length; gi++) {
      const g = GENE_KEYS[gi];
      const n = noise(gi + 1);
      genes[g] = makeDiploidGene(tierGenes[g], n);
      geneVar[g] = 0.14;
    }

    state.evoStats[id] = {
      breedRate: sp.breedRate!,
      moveRate: sp.moveRate ?? 0,
      hungerMax: sp.hungerMax ?? 0,
      eats: sp.eats ? sp.eats.slice() : [],
      traits: [],
      traitAge: {},
      traitStrengths: {},
      _traitBitmask: 0,
      genes,
      geneVar: geneVar as Record<any, number>,
      baseGenes: cloneGenes(genes),
      novelAdapts: [],
    };
  }

  state.evoCooldown = 0;
  state.lastEvoGen = 0;
  state.radiationBoost = 0;
  state.prevLivingCount = 0;
  resetHistory(state.history);
}

export function resetSimulation(state: SimState): void {
  clearGrid(state.grid);
  state.generation = 0;
  resetSeason(state.season);
  initEvoStats(state);
  resetTierEmptyGens();
}

export function startLoop(state: SimState, tickFn: () => void): void {
  if (state.running) return;
  state.running = true;
  state.tickTimer = setInterval(tickFn, state.config.tickInterval);
}

export function stopLoop(state: SimState): void {
  if (!state.running) return;
  state.running = false;
  if (state.tickTimer) {
    clearInterval(state.tickTimer);
    state.tickTimer = null;
  }
}

export function setSpeed(state: SimState, interval: number, tickFn: () => void): void {
  state.config.tickInterval = interval;
  if (state.running) {
    stopLoop(state);
    startLoop(state, tickFn);
  }
}
