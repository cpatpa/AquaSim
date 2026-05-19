/**
 * evolution-engine.ts
 *
 * Core evolution logic extracted from the AquaSim monolith.
 * Contains: evolve(), speciate(), nicheShift() and supporting helpers.
 *
 * All functions take an explicit EvoContext rather than accessing globals.
 */

import type {
  GeneKey,
  GeneSet,
  DiploidGene,
  EvoStats,
  ExpressedGenes,
  PopSnapshot,
  SpeciesDefinition,
  LivingTier,
  Layer,
} from '../types';

import {
  GENE_KEYS,
  GENE_MUTATION_SD,
  GENE_CLUSTER_OF,
  PRESSURE_HIGH,
  OVERPOP_THRESHOLD,
  SPECIATION_MIN_POP,
  SPECIATION_DRIFT,
  SPECIATION_CHANCE,
  SPECIATION_CONVERT,
  MAX_DYNAMIC_SPECIES,
  NOVEL_ADAPT_CHANCE,
  MAX_NOVEL_ADAPTS,
  SELF_PREDATION_CHANCE,
  NICHE_SHIFT_MIN_DEPTH,
  NICHE_SHIFT_MIN_DRIFT,
  NICHE_SHIFT_CHANCE,
  EMPTY_NICHE_THRESHOLD,
  EMPTY_NICHE_SHIFT_BOOST,
  EMPTY_NICHE_MIN_DRIFT,
  GENE_VARIANCE_FLOOR,
  SIZE_DIVERSIFY_MIN_POP,
  SIZE_DIVERSIFY_CHANCE,
  SIZE_DIVERSIFY_CONVERT,
  SIZE_BODYSIZE_SHIFT,
  LAYER_COUNT,
} from '../constants';

import {
  SPECIES,
  getLivingIds,
  getDynamicSpeciesIds,
  allocateSpeciesId,
  registerSpecies,
  COLOR_RGB,
} from '../species/registry';

import {
  TIER_PROMOTE,
  TIER_PROMOTE_EXTENDED,
} from '../species/species-types';

import {
  clamp,
  makeDiploidGene,
  expressAllGenes,
  speciesGeneticDiversity,
  cloneGenes,
  geneDivergence,
  gaussRandom,
  deriveStats,
  geneVal,
  geneHeterozygosity,
} from './genetics';

import {
  NOVEL_ADAPTATIONS,
  NOVEL_ADAPT_KEYS,
  NOVEL_GENE_REQS,
} from './novel-adaptations';

import { generateSpeciesName } from './naming';
import { expressTraits } from './traits';

import type { SimHistory } from '../data/history';
import { addEvoEvent } from '../data/history';

// ---------------------------------------------------------------------------
// Context bundle passed to all public functions
// ---------------------------------------------------------------------------

export interface EvoContext {
  evoStats: Record<number, EvoStats>;
  popHistory: PopSnapshot[];
  species: Uint8Array;
  gridW: number;
  gridH: number;
  generation: number;
  radiationBoost: number;
  mutationRateMult: number;
  speciationRateMult: number;
  maxTraitsPerSpecies: number;
  history: SimHistory;
}

// ---------------------------------------------------------------------------
// Return type for evolve() so the caller can update top-level state
// ---------------------------------------------------------------------------

export interface EvolveResult {
  /** Updated radiationBoost (decremented if it was > 0) */
  radiationBoost: number;
}

export interface SpeciateResult {
  /** IDs of newly created species this cycle */
  newSpeciesIds: number[];
}

export interface NicheShiftResult {
  /** IDs of newly created species via niche shift */
  newSpeciesIds: number[];
}

export interface SizeDiversifyResult {
  newSpeciesIds: number[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FoodWeb {
  predators: Record<number, number[]>;
  preyOf: Record<number, number[]>;
}

/**
 * Build predator-to-prey map: which species eat which.
 * Reads the `eats` list from evoStats for each living species.
 */
function buildFoodWeb(evoStats: Record<number, EvoStats>): FoodWeb {
  const predators: Record<number, number[]> = {};
  const preyOf: Record<number, number[]> = {};
  for (const id of getLivingIds()) {
    const es = evoStats[id];
    if (es && es.eats && es.eats.length) {
      preyOf[id] = es.eats.slice();
      for (const prey of es.eats) {
        if (!predators[prey]) predators[prey] = [];
        predators[prey].push(id);
      }
    }
  }
  return { predators, preyOf };
}

/**
 * Nudge both alleles of a diploid gene in a direction with slight randomisation.
 * Keeps the gene as a local helper (prefixed with _) matching the monolith.
 */
function _nudgeAllele(genes: GeneSet, key: GeneKey, amount: number): void {
  let gene = genes[key];
  if (!gene) return;
  if (typeof gene === 'number') {
    genes[key] = makeDiploidGene(gene, 0);
    gene = genes[key] as DiploidGene;
  }
  const dg = gene as DiploidGene;
  dg.a1 = clamp(dg.a1 + amount * (0.5 + Math.random()), 0.02, 0.98);
  dg.a2 = clamp(dg.a2 + amount * (0.3 + Math.random() * 0.4), 0.02, 0.98);
}

/** Collect all species names currently in use (for deduplication during naming). */
function collectExistingNames(): Set<string> {
  const names = new Set<string>();
  for (const id of getLivingIds()) {
    const sp = SPECIES[id];
    if (sp) names.add(sp.name);
  }
  return names;
}

/** Tier rank lookup used for overpopulation and self-predation scoring. */
const TIER_RANK: Record<string, number> = {
  producer: 0,
  herbivore: 1,
  consumer: 2,
  apex: 3,
  megafauna: 4,
  decomposer: 1,
};

/** Layer lookup for niche-shifted species. */
const TIER_LAYER_MAP: Partial<Record<LivingTier, Layer>> = {
  producer:  4,
  herbivore: 2,
  consumer:  3,
  apex:      5,
  megafauna: 4,
  decomposer: 1,
};

const NICHE_LAYER_REACH: Partial<Record<LivingTier, number>> = {
  herbivore: 1,
  consumer:  2,
  apex:      3,
  megafauna: 4,
};

/**
 * Fisher-Yates in-place shuffle of a number array.
 */
function shuffle(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/**
 * Convert grid cells from `parentId` to `newId`.
 * Shuffles the parent cell list and converts up to `count` cells.
 */
function convertCells(
  grid: Uint8Array,
  total: number,
  parentId: number,
  newId: number,
  count: number,
): number {
  const parentCells: number[] = [];
  for (let i = 0; i < total; i++) {
    if (grid[i] === parentId) parentCells.push(i);
  }
  shuffle(parentCells);
  let converted = 0;
  for (let i = 0; i < parentCells.length && converted < count; i++) {
    grid[parentCells[i]] = newId;
    converted++;
  }
  return converted;
}

/**
 * Generate a hex colour string shifted from a base RGB triple.
 */
function shiftColour(
  baseRGB: [number, number, number],
  maxShift: number,
): { hex: string; rgb: [number, number, number] } {
  const shift = () => Math.round((Math.random() - 0.5) * maxShift);
  const nr = clamp(baseRGB[0] + shift(), 20, 255);
  const ng = clamp(baseRGB[1] + shift(), 20, 255);
  const nb = clamp(baseRGB[2] + shift(), 20, 255);
  const hex =
    '#' +
    ((1 << 24) + (nr << 16) + (ng << 8) + nb)
      .toString(16)
      .slice(1)
      .toUpperCase();
  return { hex, rgb: [nr, ng, nb] };
}

// ---------------------------------------------------------------------------
// reassignPrey() -- fix empty eats lists for predators
// ---------------------------------------------------------------------------

const PREY_TIER_MAP: Record<string, string[]> = {
  herbivore: ['producer'],
  consumer: ['herbivore'],
  apex: ['consumer', 'herbivore'],
  megafauna: ['consumer', 'herbivore', 'apex'],
  decomposer: [],
};

export function reassignPrey(
  evoStats: Record<number, EvoStats>,
  popHistory: PopSnapshot[],
  generation: number,
  history: SimHistory,
): void {
  if (popHistory.length < 2) return;
  const now = popHistory[popHistory.length - 1];
  const livingIds = getLivingIds();

  for (const id of livingIds) {
    const sp = SPECIES[id];
    const es = evoStats[id];
    if (!sp || !es) continue;
    if ((now[id] || 0) === 0) continue;
    if (!sp.hungerMax && !sp.eats?.length) continue;

    const preyTiers = PREY_TIER_MAP[sp.tier];
    if (!preyTiers || !preyTiers.length) continue;

    const hasLivePrey = es.eats.some(pid => (now[pid] || 0) > 0);
    if (hasLivePrey) continue;

    const candidates: number[] = [];
    for (const lid of livingIds) {
      if (lid === id) continue;
      const lsp = SPECIES[lid];
      if (!lsp) continue;
      if (preyTiers.indexOf(lsp.tier) === -1) continue;
      if ((now[lid] || 0) === 0) continue;
      if (es.eats.indexOf(lid) !== -1) continue;
      candidates.push(lid);
    }

    if (candidates.length === 0) continue;

    shuffle(candidates);
    const toAdd = Math.min(candidates.length, 2);
    for (let i = 0; i < toAdd; i++) {
      es.eats.push(candidates[i]);
    }
    const preyNames = candidates.slice(0, toAdd).map(pid => SPECIES[pid]?.name || `#${pid}`).join(', ');
    addEvoEvent(history, generation, sp.name + ' adapted diet to ' + preyNames);
  }
}

// ---------------------------------------------------------------------------
// enforceGeneVarianceFloor() -- retroactive floor on all species
// ---------------------------------------------------------------------------

export function enforceGeneVarianceFloor(evoStats: Record<number, EvoStats>): void {
  for (const id of getLivingIds()) {
    const es = evoStats[id];
    if (!es || !es.geneVar) continue;
    for (let gi = 0; gi < GENE_KEYS.length; gi++) {
      const g = GENE_KEYS[gi];
      if (es.geneVar[g] < GENE_VARIANCE_FLOOR) {
        es.geneVar[g] = GENE_VARIANCE_FLOOR;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// evolve()
// ---------------------------------------------------------------------------

/**
 * Main per-generation evolution pass.
 *
 * Phase 1:  Gene mutation + selection + trait expression + novel adaptations
 * Phase 1b: Competitive exclusion (character displacement)
 * Phase 2:  Overpopulation predation
 * Phase 3:  Self-predation among lineage relatives
 */
export function evolve(ctx: EvoContext): EvolveResult {
  const { evoStats, popHistory, history, generation } = ctx;
  let { radiationBoost } = ctx;
  const mutationRateMult = ctx.mutationRateMult;

  if (popHistory.length < 3) return { radiationBoost };

  const now = popHistory[popHistory.length - 1];
  const prev = popHistory[popHistory.length - 3];
  const { predators, preyOf } = buildFoodWeb(evoStats);
  const livingIds = getLivingIds();

  // Compute average population across living species
  let totalPop = 0;
  let livingCount = 0;
  for (const id of livingIds) {
    const c = now[id] || 0;
    if (c > 0) {
      totalPop += c;
      livingCount++;
    }
  }
  const avgPop = livingCount > 0 ? totalPop / livingCount : 1;

  // ------ Phase 1: Gene mutation + selection + trait expression ------
  for (const id of livingIds) {
    const sp = SPECIES[id];
    const es = evoStats[id];
    if (!sp || !es) continue;
    const popNow = now[id] || 0;
    const popPrev = prev[id] || 0;
    if (popNow === 0 && popPrev === 0) continue;
    if (!es.genes) continue;

    const trend = popPrev > 0 ? (popNow - popPrev) / popPrev : 0;
    const genes = es.genes;
    const gv = es.geneVar;

    // Per-allele diploid mutation with genetic linkage
    const radMul = radiationBoost > 0 ? 2.0 : 1.0;
    const _mutMul = mutationRateMult * radMul;

    for (let gi = 0; gi < GENE_KEYS.length; gi++) {
      const g = GENE_KEYS[gi];
      let gene = genes[g];
      if (typeof gene === 'number') {
        genes[g] = makeDiploidGene(gene, 0);
        gene = genes[g] as DiploidGene;
      }
      const dg = gene as DiploidGene;
      const sd = GENE_MUTATION_SD * (0.5 + gv[g] * 3) * _mutMul;
      const m1 = gaussRandom() * sd;
      const m2 = gaussRandom() * sd;
      dg.a1 = clamp(dg.a1 + m1, 0.02, 0.98);
      dg.a2 = clamp(dg.a2 + m2, 0.02, 0.98);
      if (Math.random() < 0.02) {
        dg.dom = clamp(dg.dom + gaussRandom() * 0.05, 0.1, 0.9);
      }

      // Genetic linkage: correlated mutation within cluster
      if (Math.random() < 0.3) {
        const cluster = GENE_CLUSTER_OF[g];
        const nextGi = gi + 1;
        if (
          nextGi < GENE_KEYS.length &&
          GENE_CLUSTER_OF[GENE_KEYS[nextGi]] === cluster
        ) {
          let ng = genes[GENE_KEYS[nextGi]];
          if (typeof ng === 'number') {
            genes[GENE_KEYS[nextGi]] = makeDiploidGene(ng, 0);
            ng = genes[GENE_KEYS[nextGi]] as DiploidGene;
          }
          (ng as DiploidGene).a1 = clamp(
            (ng as DiploidGene).a1 + m1 * 0.3,
            0.02,
            0.98,
          );
        }
      }
    }

    // Bottleneck: allele fixation in small populations
    if (popNow > 0 && popNow < 15) {
      for (let bgi = 0; bgi < GENE_KEYS.length; bgi++) {
        const bg = GENE_KEYS[bgi];
        const bgene = genes[bg];
        if (typeof bgene !== 'number' && Math.random() < 0.05) {
          const pick = Math.random() < 0.5 ? bgene.a1 : bgene.a2;
          bgene.a1 = pick;
          bgene.a2 = pick;
        }
      }
    }

    // Selection nudge and co-evolution arms race
    if (predators[id] && predators[id].length > 0) {
      let predPop = 0;
      for (const pid of predators[id]) predPop += now[pid] || 0;
      const pressure = popNow > 0 ? predPop / popNow : 0;
      if (pressure > PRESSURE_HIGH || trend < -0.15) {
        _nudgeAllele(genes, 'flightResponse', 0.008);
        _nudgeAllele(genes, 'bodyArmour', 0.006);
        if (trend < -0.25) _nudgeAllele(genes, 'fertility', 0.006);
        // Co-evolution: prey defence nudges predators toward counter-traits
        for (const pid of predators[id]) {
          const pEs = evoStats[pid];
          if (pEs && pEs.genes && (now[pid] || 0) > 0) {
            _nudgeAllele(pEs.genes, 'visionRange', 0.003);
            _nudgeAllele(pEs.genes, 'aggression', 0.003);
          }
        }
      }
    }
    if (preyOf[id] && preyOf[id].length > 0) {
      let totalPreyPop = 0;
      for (const prey of preyOf[id]) totalPreyPop += now[prey] || 0;
      if (totalPreyPop < popNow * 0.5 && popNow > 2) {
        _nudgeAllele(genes, 'aggression', 0.008);
        _nudgeAllele(genes, 'bodyShape', 0.004);
        _nudgeAllele(genes, 'hungerEfficiency', 0.004);
        // Co-evolution: predator aggression nudges prey toward evasion
        for (const prey of preyOf[id]) {
          const prEs = evoStats[prey];
          if (prEs && prEs.genes && (now[prey] || 0) > 0) {
            _nudgeAllele(prEs.genes, 'flightResponse', 0.003);
            _nudgeAllele(prEs.genes, 'pigment', 0.002);
          }
        }
      }
    }
    if (sp.tier === 'producer' && popNow > 0) {
      let grazerPop = 0;
      if (predators[id]) {
        for (const pid of predators[id]) grazerPop += now[pid] || 0;
      }
      if (trend < -0.2 || (popNow > 0 && grazerPop / popNow > 0.8)) {
        _nudgeAllele(genes, 'fertility', 0.01);
        _nudgeAllele(genes, 'bodyArmour', 0.004);
      }
    }

    // Stabilising selection on expressed values
    const expVals = expressAllGenes(genes);
    for (let sg = 0; sg < GENE_KEYS.length; sg++) {
      const sGene = GENE_KEYS[sg];
      const ev = expVals[sGene];
      if (ev > 0.88) _nudgeAllele(genes, sGene, -(ev - 0.88) * 0.04);
      else if (ev < 0.12) _nudgeAllele(genes, sGene, (0.12 - ev) * 0.04);
    }

    // Gene variance: population genetics
    const popRatio = popNow / Math.max(1, avgPop);
    for (let vg = 0; vg < GENE_KEYS.length; vg++) {
      const vGene = GENE_KEYS[vg];
      if (popRatio > 1.0 && popNow > 15) {
        const gain = 0.002 + 0.004 * Math.min(1, popNow / (avgPop * 3));
        gv[vGene] = Math.min(0.35, gv[vGene] + gain);
      } else if (popNow < 10) {
        gv[vGene] = Math.max(GENE_VARIANCE_FLOOR, gv[vGene] - 0.008);
      }
    }

    // Derive stats from expressed genes
    if (sp.breedRate != null) {
      const derived = deriveStats(sp.breedRate, sp.moveRate, sp.hungerMax, expVals);
      es.breedRate = derived.breedRate;
      es.moveRate = derived.moveRate;
      es.hungerMax = derived.hungerMax;
    }

    expressTraits(sp, es, ctx.maxTraitsPerSpecies, expressAllGenes, (msg) =>
      addEvoEvent(history, generation, msg),
    );

    // Novel adaptations: emerge from extreme gene combinations
    if (!es.novelAdapts) es.novelAdapts = [];
    if (es.novelAdapts.length < MAX_NOVEL_ADAPTS) {
      const _nExp: ExpressedGenes = es._expressed || expressAllGenes(genes);
      for (let _ni = 0; _ni < NOVEL_ADAPT_KEYS.length; _ni++) {
        const _nk = NOVEL_ADAPT_KEYS[_ni];
        if (es.novelAdapts.indexOf(_nk) !== -1) continue;
        if (!NOVEL_ADAPTATIONS[_nk].eligible(sp.tier)) continue;
        const _nReq = NOVEL_GENE_REQS[_nk];
        if (!_nReq) {
          if (Math.random() < NOVEL_ADAPT_CHANCE * 0.5) {
            es.novelAdapts.push(_nk);
            addEvoEvent(
              history,
              generation,
              sp.name + ' developed ' + NOVEL_ADAPTATIONS[_nk].name + '!',
            );
            break;
          }
          continue;
        }
        let _nOk = true;
        for (let _nj = 0; _nj < _nReq.length; _nj++) {
          if ((_nExp[_nReq[_nj].g] || 0) < _nReq[_nj].min) {
            _nOk = false;
            break;
          }
        }
        if (_nOk && Math.random() < 0.15) {
          es.novelAdapts.push(_nk);
          addEvoEvent(
            history,
            generation,
            sp.name + ' developed ' + NOVEL_ADAPTATIONS[_nk].name + '!',
          );
          break;
        }
      }
    }
  }

  // ------ Phase 1b: Competitive exclusion (character displacement) ------
  // Same-tier species sharing diet overlap have genes pushed apart
  for (let i = 0; i < livingIds.length; i++) {
    const idA = livingIds[i];
    const spA = SPECIES[idA];
    const esA = evoStats[idA];
    if (!spA || !esA || !esA.genes || !esA.eats || (now[idA] || 0) < 5) continue;
    for (let j = i + 1; j < livingIds.length; j++) {
      const idB = livingIds[j];
      const spB = SPECIES[idB];
      const esB = evoStats[idB];
      if (!spB || !esB || !esB.genes || !esB.eats || (now[idB] || 0) < 5) continue;
      if (spA.tier !== spB.tier) continue;
      const shared = esA.eats.filter(e => esB.eats.indexOf(e) !== -1).length;
      const minLen = Math.min(esA.eats.length, esB.eats.length);
      if (minLen === 0 || shared / minLen < 0.5) continue;
      const expA = expressAllGenes(esA.genes);
      const expB = expressAllGenes(esB.genes);
      let maxDiffGene: GeneKey = GENE_KEYS[0];
      let maxDiff = 0;
      for (const g of GENE_KEYS) {
        const d = Math.abs(expA[g] - expB[g]);
        if (d > maxDiff) {
          maxDiff = d;
          maxDiffGene = g;
        }
      }
      const nudge = 0.012;
      if (expA[maxDiffGene] > expB[maxDiffGene]) {
        _nudgeAllele(esA.genes, maxDiffGene, nudge);
        _nudgeAllele(esB.genes, maxDiffGene, -nudge);
      } else {
        _nudgeAllele(esA.genes, maxDiffGene, -nudge);
        _nudgeAllele(esB.genes, maxDiffGene, nudge);
      }
    }
  }

  if (radiationBoost > 0) radiationBoost--;

  // ------ Phase 2: Overpopulation predation ------
  for (const id of livingIds) {
    const popNow = now[id] || 0;
    if (popNow < avgPop * OVERPOP_THRESHOLD) continue;
    const sp = SPECIES[id];
    if (!sp) continue;
    const myRank = TIER_RANK[sp.tier] ?? -1;
    const candidates: number[] = [];
    for (const cid of livingIds) {
      if (cid === id) continue;
      const csp = SPECIES[cid];
      if (!csp) continue;
      const cRank = TIER_RANK[csp.tier] ?? -1;
      if (cRank <= myRank || !csp.hungerMax) continue;
      const ces = evoStats[cid];
      if (!ces || !ces.eats || ces.eats.indexOf(id) !== -1) continue;
      candidates.push(cid);
    }
    if (candidates.length > 0 && Math.random() < 0.25) {
      const winner = candidates[(Math.random() * candidates.length) | 0];
      if (evoStats[winner] && evoStats[winner].eats) {
        evoStats[winner].eats.push(id);
      }
      addEvoEvent(
        history,
        generation,
        SPECIES[winner].name + ' adapted to eat ' + sp.name + '!',
      );
    }
  }

  // ------ Phase 3: Self-predation among lineage relatives ------
  for (const id of livingIds) {
    const sp = SPECIES[id] as SpeciesDefinition & {
      parentId?: number;
      rootAncestor?: number;
      hungerMax?: number;
    };
    const es = evoStats[id];
    if (!sp.hungerMax || !(sp as any).parentId) continue;
    if (!es || !es.eats) continue;
    const popNow = now[id] || 0;
    if (popNow < 10) continue;
    if (Math.random() > SELF_PREDATION_CHANCE) continue;
    const rootId: number = (sp as any).rootAncestor || id;
    const relatives = (livingIds as readonly number[]).filter((rid) => {
      if (rid === id) return false;
      const rsp = SPECIES[rid] as SpeciesDefinition & { rootAncestor?: number } | undefined;
      if (!rsp) return false;
      const rRoot: number = (rsp as any).rootAncestor || rid;
      return (rRoot === rootId || rid === rootId) && es.eats.indexOf(rid) === -1;
    });
    if (relatives.length === 0) continue;
    const myRank = TIER_RANK[sp.tier] ?? 1;
    const scored = relatives.map((rid) => {
      const rsp = SPECIES[rid];
      const rRank = TIER_RANK[rsp.tier] ?? 1;
      const rPop = now[rid] || 0;
      let score = 1;
      if (rRank < myRank) score += 2;
      if (rRank === myRank) score += 0.5;
      if (rPop > avgPop) score += 1.5;
      return { id: rid, score };
    });
    const totalS = scored.reduce((a, s) => a + s.score, 0);
    let r = Math.random() * totalS;
    let target = scored[scored.length - 1].id;
    for (const s of scored) {
      r -= s.score;
      if (r <= 0) {
        target = s.id;
        break;
      }
    }
    es.eats.push(target);
    addEvoEvent(
      history,
      generation,
      sp.name + ' now preys on ' + SPECIES[target].name + ' (lineage rivalry)!',
    );
  }

  return { radiationBoost };
}

// ---------------------------------------------------------------------------
// speciate()
// ---------------------------------------------------------------------------

/**
 * Speciation: fork species via gene divergence.
 *
 * Checks each living species for sufficient divergence from its baseline genes,
 * performs allopatric detection, meiosis-like recombination, and forks a new
 * species with converted grid cells.
 */
export function speciate(ctx: EvoContext): SpeciateResult {
  const {
    evoStats,
    popHistory,
    species,
    gridW,
    generation,
    radiationBoost,
    speciationRateMult,
    history,
  } = ctx;
  const newSpeciesIds: number[] = [];

  if (getDynamicSpeciesIds().length >= MAX_DYNAMIC_SPECIES) return { newSpeciesIds };
  if (popHistory.length < 3) return { newSpeciesIds };

  const now = popHistory[popHistory.length - 1];
  const total = species.length;
  const livingIds = getLivingIds();

  const _spTierPop: Record<string, number> = {};
  let _spTotalLiving = 0;
  for (const tid of livingIds) {
    const tsp = SPECIES[tid];
    if (!tsp) continue;
    const cnt = now[tid] || 0;
    _spTierPop[tsp.tier] = (_spTierPop[tsp.tier] || 0) + cnt;
    _spTotalLiving += cnt;
  }
  const _adjacentTierEmpty = (tier: string): boolean => {
    const adj: Record<string, string[]> = {
      producer: ['herbivore'],
      herbivore: ['consumer'],
      consumer: ['apex'],
      apex: ['megafauna'],
      decomposer: ['herbivore', 'consumer'],
    };
    const neighbours = adj[tier] || [];
    return _spTotalLiving > 50 && neighbours.some(t => (_spTierPop[t] || 0) < _spTotalLiving * EMPTY_NICHE_THRESHOLD);
  };

  for (const id of livingIds) {
    if (getDynamicSpeciesIds().length >= MAX_DYNAMIC_SPECIES) break;

    const popNow = now[id] || 0;
    const sp = SPECIES[id] as SpeciesDefinition & {
      lineageDepth?: number;
      rootAncestor?: number;
      parentId?: number;
    };
    if (!sp || !sp.breedRate) continue;
    const depth = sp.lineageDepth || 0;
    const minPop = Math.max(15, SPECIATION_MIN_POP - depth * 8);
    if (popNow < minPop) continue;

    const es = evoStats[id];
    if (!es || !es.genes || !es.baseGenes) continue;

    const emptyAdjacentTier = _adjacentTierEmpty(sp.tier);
    const divergence = geneDivergence(es.genes, es.baseGenes);
    const radDiv = radiationBoost > 0 ? 0.5 : 1.0;
    let driftThreshold =
      SPECIATION_DRIFT * Math.max(0.3, 1 - depth * 0.2) * radDiv;
    if (emptyAdjacentTier) driftThreshold *= 0.5;

    // Allopatric speciation: detect spatial separation
    if (popNow > 25 && divergence > driftThreshold * 0.5) {
      const sampleCells: number[] = [];
      const step = Math.max(1, (total / 80) | 0);
      for (
        let si2 = 0;
        si2 < total && sampleCells.length < 40;
        si2 += step
      ) {
        if (species[si2] === id) sampleCells.push(si2);
      }
      if (sampleCells.length >= 6) {
        let cxAvg = 0;
        let cyAvg = 0;
        for (let sci = 0; sci < sampleCells.length; sci++) {
          cxAvg += sampleCells[sci] % gridW;
          cyAvg += (sampleCells[sci] / gridW) | 0;
        }
        cxAvg /= sampleCells.length;
        cyAvg /= sampleCells.length;
        let cluster1 = 0;
        let cluster2 = 0;
        for (let sci2 = 0; sci2 < sampleCells.length; sci2++) {
          const scx = sampleCells[sci2] % gridW;
          const scy = (sampleCells[sci2] / gridW) | 0;
          const sdist = Math.abs(scx - cxAvg) + Math.abs(scy - cyAvg);
          if (sdist > 15) cluster2++;
          else cluster1++;
        }
        if (cluster1 >= 3 && cluster2 >= 3) {
          driftThreshold *= 0.6;
        }
      }
    }

    if (divergence < driftThreshold) continue;

    let speciationChance = Math.min(0.7, SPECIATION_CHANCE + depth * 0.06);
    speciationChance *= speciationRateMult;
    if (radiationBoost > 0) {
      const divScore = speciesGeneticDiversity(es.genes);
      speciationChance *= 1 + divScore * 8;
    }
    if (emptyAdjacentTier) speciationChance = Math.min(0.9, speciationChance * 2.0);
    if (Math.random() > speciationChance) continue;

    // All gates passed: allocate a new species ID
    const newId = allocateSpeciesId();
    if (newId === -1) break;

    const rootId: number = (sp as any).rootAncestor || id;

    // Meiosis-like recombination: pick one allele from parent per gene, mutate
    const newGenes = {} as GeneSet;
    const newGeneVar: Record<GeneKey, number> = {} as Record<GeneKey, number>;
    for (const g of GENE_KEYS) {
      const parentGene = es.genes[g];
      if (typeof parentGene === 'number') {
        newGenes[g] = makeDiploidGene(
          parentGene + gaussRandom() * 0.04,
          gaussRandom() * 0.03,
        );
      } else {
        const parentAllele =
          Math.random() < 0.5 ? parentGene.a1 : parentGene.a2;
        newGenes[g] = {
          a1: clamp(parentAllele + gaussRandom() * 0.03, 0.02, 0.98),
          a2: clamp(parentAllele + gaussRandom() * 0.06, 0.02, 0.98),
          dom: clamp(parentGene.dom + gaussRandom() * 0.03, 0.1, 0.9),
        };
      }
      newGeneVar[g] = Math.max(0.06, (es.geneVar[g] || 0.14) * 0.85);
    }
    // Sexual selection: pigment diverges further
    const pigGene = newGenes.pigment;
    if (pigGene && typeof pigGene !== 'number') {
      pigGene.a1 = clamp(pigGene.a1 + gaussRandom() * 0.08, 0.02, 0.98);
    }

    // Build name
    const rootSp = SPECIES[rootId];
    const rootName = rootSp ? rootSp.name : sp.name;
    const existingNames = collectExistingNames();
    const newName = generateSpeciesName(
      sp.name,
      rootName,
      newGenes,
      es.genes,
      existingNames,
      'speciation',
    );

    // Colour
    const baseRGB = COLOR_RGB[id] || [128, 128, 128];
    const { hex: newHex, rgb: [nr, ng, nb] } = shiftColour(baseRGB, 70);

    // Derived stats from expressed genes
    const newExp = expressAllGenes(newGenes);
    const vigour = 1.05 + Math.random() * 0.1;
    const tmpBR =
      sp.breedRate *
      (0.2 +
        newExp.fertility * 0.35 +
        newExp.metabolicRate * 0.25 +
        newExp.growthRate * 0.15 +
        (1 - newExp.bodySize) * 0.05) *
      vigour;
    const tmpMR = sp.moveRate
      ? clamp(
          sp.moveRate *
            (0.3 +
              newExp.bodyShape * 0.25 +
              newExp.curiosity * 0.2 +
              (1 - newExp.bodySize) * 0.15 +
              (1 - newExp.bodyArmour) * 0.1) *
            vigour,
          0.02,
          0.98,
        )
      : 0;
    const tmpHM = sp.hungerMax
      ? clamp(
          Math.round(
            sp.hungerMax *
              (0.2 +
                newExp.bodySize * 0.25 +
                newExp.hungerEfficiency * 0.25 +
                (1 - newExp.metabolicRate) * 0.2 +
                0.1) *
              vigour,
          ),
          6,
          80,
        )
      : 0;

    // Build diet list
    const newEats = (es.eats || []).slice();
    if (newEats.length > 1 && Math.random() < 0.15) {
      newEats.splice((Math.random() * newEats.length) | 0, 1);
    }
    if (sp.hungerMax && newEats.indexOf(id) === -1 && Math.random() < 0.35) {
      newEats.push(id);
    }

    // Register the new species
    const newSpeciesDef: SpeciesDefinition & {
      parentId: number;
      rootAncestor: number;
      lineageDepth: number;
    } = {
      name: newName,
      color: newHex,
      tier: sp.tier,
      layer: sp.layer,
      breedRate: sp.breedRate,
      moveRate: sp.moveRate || undefined,
      hungerMax: sp.hungerMax || undefined,
      eats: newEats.length ? newEats : undefined,
      layerReach: sp.layerReach,
      desc: 'Evolved from ' + sp.name + ' at gen ' + generation,
      parentId: id,
      rootAncestor: rootId,
      lineageDepth: depth + 1,
    };
    registerSpecies(newId, newSpeciesDef as any);
    COLOR_RGB[newId] = [nr, ng, nb];

    // Create evoStats for the new species
    evoStats[newId] = {
      breedRate: tmpBR,
      moveRate: tmpMR,
      hungerMax: tmpHM,
      eats: newEats.slice(),
      traits: [],
      traitAge: {},
      traitStrengths: {},
      _traitBitmask: 0,
      genes: newGenes,
      geneVar: newGeneVar,
      baseGenes: cloneGenes(newGenes),
      novelAdapts: (es.novelAdapts || []).slice(),
    };

    expressTraits(SPECIES[newId], evoStats[newId], ctx.maxTraitsPerSpecies, expressAllGenes, (msg) =>
      addEvoEvent(history, generation, msg),
    );

    // Graph marker (returned to caller via history)
    ctx.history.graphEventMarkers.push({
      gen: generation,
      type: 'speciation',
      label: newName,
    });

    // Existing predators of the parent also eat the new species
    for (const oid of livingIds) {
      if (oid === newId) continue;
      const oe = evoStats[oid];
      if (
        oe &&
        oe.eats &&
        oe.eats.indexOf(id) !== -1 &&
        oe.eats.indexOf(newId) === -1
      ) {
        oe.eats.push(newId);
      }
    }

    // Convert a fraction of parent cells to the new species
    const convertTarget = (popNow * SPECIATION_CONVERT) | 0;
    convertCells(species, total, id, newId, convertTarget);

    addEvoEvent(
      history,
      generation,
      newName + ' diverged from ' + sp.name + '!',
    );

    newSpeciesIds.push(newId);
  }

  return { newSpeciesIds };
}

// ---------------------------------------------------------------------------
// nicheShift()
// ---------------------------------------------------------------------------

/**
 * Niche shift: animals can change ecological tier under sustained pressure.
 * Also supports convergent evolution: unrelated species fill empty niches.
 */
export function nicheShift(ctx: EvoContext): NicheShiftResult {
  const { evoStats, popHistory, species, generation, history } = ctx;
  const newSpeciesIds: number[] = [];

  if (getDynamicSpeciesIds().length >= MAX_DYNAMIC_SPECIES) return { newSpeciesIds };
  if (popHistory.length < 3) return { newSpeciesIds };

  const now = popHistory[popHistory.length - 1];
  const prev = popHistory[popHistory.length - 3];
  const { predators, preyOf } = buildFoodWeb(evoStats);
  const total = species.length;
  const livingIds = getLivingIds();

  // Calculate per-tier population for empty niche detection
  const tierPop: Record<string, number> = {};
  let totalLiving = 0;
  for (const tid of livingIds) {
    const tsp = SPECIES[tid];
    if (!tsp) continue;
    const cnt = now[tid] || 0;
    tierPop[tsp.tier] = (tierPop[tsp.tier] || 0) + cnt;
    totalLiving += cnt;
  }

  for (const id of livingIds) {
    if (getDynamicSpeciesIds().length >= MAX_DYNAMIC_SPECIES) break;

    const sp = SPECIES[id] as SpeciesDefinition & {
      lineageDepth?: number;
      rootAncestor?: number;
      parentId?: number;
    };
    if (!sp) continue;
    if (sp.tier === 'megafauna') continue;
    if (sp.tier === 'producer' && !sp.breedRate) continue;

    const es = evoStats[id];
    if (!es || !es.genes || !es.baseGenes) continue;
    const popNow = now[id] || 0;
    const depth = sp.lineageDepth || 0;
    const divergence = geneDivergence(es.genes, es.baseGenes);

    // Find target tier: standard promotion first, then scan for empty niches
    let newTier: LivingTier | null =
      (TIER_PROMOTE[sp.tier as LivingTier] as LivingTier) || null;
    let targetEmpty = false;

    // Check if standard target is empty
    if (newTier && totalLiving > 50) {
      const tp = tierPop[newTier] || 0;
      if (tp < totalLiving * EMPTY_NICHE_THRESHOLD) targetEmpty = true;
    }

    // If standard target isn't empty, scan extended paths for empty niches
    if (!targetEmpty) {
      const extended: LivingTier[] =
        (TIER_PROMOTE_EXTENDED[sp.tier as LivingTier] as LivingTier[]) || [];
      let emptiest: LivingTier | null = null;
      let emptiestPop = Infinity;
      for (const ct of extended) {
        const cp = tierPop[ct] || 0;
        if (
          totalLiving > 50 &&
          cp < totalLiving * EMPTY_NICHE_THRESHOLD &&
          cp < emptiestPop
        ) {
          emptiest = ct;
          emptiestPop = cp;
        }
      }
      if (emptiest) {
        newTier = emptiest;
        targetEmpty = true;
      }
    }

    // Radical morphological shift: extreme divergence allows any tier transition
    if (!newTier && sp.tier !== 'producer') {
      const allTiers: LivingTier[] = ['herbivore', 'consumer', 'apex', 'megafauna'];
      for (const candidate of allTiers) {
        if (candidate === sp.tier) continue;
        const cp = tierPop[candidate] || 0;
        if (totalLiving > 50 && cp < totalLiving * EMPTY_NICHE_THRESHOLD) {
          if (divergence > 0.50 && popNow > 40) {
            newTier = candidate;
            targetEmpty = true;
            break;
          }
        }
      }
    }

    if (!newTier) continue;

    // Gate checks: relaxed when target niche is empty (convergent evolution)
    if (targetEmpty) {
      if (popNow < 15) continue;
      if (divergence < EMPTY_NICHE_MIN_DRIFT) continue;
      if (Math.random() > EMPTY_NICHE_SHIFT_BOOST) continue;
    } else {
      if (!sp.hungerMax) continue;
      if (sp.tier === 'producer') continue;
      if (depth < NICHE_SHIFT_MIN_DEPTH) continue;
      if (popNow < 30) continue;
      if (divergence < NICHE_SHIFT_MIN_DRIFT * 0.4) continue;
      if (Math.random() > NICHE_SHIFT_CHANCE) continue;

      let underPressure = false;
      if (predators[id]) {
        let predPop = 0;
        for (const pid of predators[id]) predPop += now[pid] || 0;
        if (popNow > 0 && predPop / popNow > PRESSURE_HIGH * 0.7)
          underPressure = true;
      }
      if (preyOf[id] && preyOf[id].length > 0) {
        let preyPop = 0;
        for (const prey of preyOf[id]) preyPop += now[prey] || 0;
        if (popNow > 0 && preyPop < popNow * 0.8) underPressure = true;
      }
      const popPrev = prev[id] || 0;
      const trend = popPrev > 0 ? (popNow - popPrev) / popPrev : 0;
      if (trend < -0.15) underPressure = true;
      if (!underPressure) continue;
    }

    // All gates passed: allocate ID
    const newId = allocateSpeciesId();
    if (newId === -1) break;

    const rootId: number = (sp as any).rootAncestor || id;

    // Build name
    const rootSp = SPECIES[rootId];
    const rootName = rootSp ? rootSp.name : sp.name;
    const existingNames = collectExistingNames();
    const newName = generateSpeciesName(
      sp.name,
      rootName,
      es.genes,
      es.genes,
      existingNames,
      'niche',
      newTier,
    );

    // Colour (wider shift than speciation)
    const baseRGB = COLOR_RGB[id] || [128, 128, 128];
    const { hex: newHex, rgb: [nr, ng, nb] } = shiftColour(baseRGB, 100);

    // Clone genes and gene variance
    const newGenes = cloneGenes(es.genes);
    const newGeneVar: Record<GeneKey, number> = {} as Record<GeneKey, number>;
    for (const g of GENE_KEYS) {
      newGeneVar[g] = Math.max(0.06, (es.geneVar[g] || 0.14) * 0.85);
    }

    // Tier-specific gene nudges and diet construction
    let newEats: number[] = [];

    if (newTier === 'herbivore') {
      if (sp.tier === 'producer') {
        _nudgeAllele(newGenes, 'bodyShape', 0.25);
        _nudgeAllele(newGenes, 'curiosity', 0.2);
        _nudgeAllele(newGenes, 'fertility', -0.15);
        _nudgeAllele(newGenes, 'aggression', 0.15);
      } else {
        _nudgeAllele(newGenes, 'bodyShape', 0.05);
        _nudgeAllele(newGenes, 'aggression', -0.15);
      }
      const targets = (livingIds as readonly number[]).filter((pid) => {
        const psp = SPECIES[pid];
        return psp && psp.tier === 'producer';
      });
      const sh = targets.slice();
      shuffle(sh as number[]);
      for (
        let i = 0;
        i < Math.min(sh.length, 1 + ((Math.random() * 2) | 0));
        i++
      )
        newEats.push(sh[i]);
    } else if (newTier === 'consumer') {
      _nudgeAllele(newGenes, 'bodyShape', 0.15);
      _nudgeAllele(newGenes, 'fertility', -0.1);
      _nudgeAllele(newGenes, 'aggression', 0.2);
      const targets = (livingIds as readonly number[]).filter((hid) => {
        const hsp = SPECIES[hid];
        return hsp && hsp.tier === 'herbivore' && hid !== id;
      });
      const sh = targets.slice();
      shuffle(sh as number[]);
      for (
        let i = 0;
        i < Math.min(sh.length, 1 + ((Math.random() * 2) | 0));
        i++
      )
        newEats.push(sh[i]);
    } else if (newTier === 'apex') {
      _nudgeAllele(newGenes, 'bodyShape', 0.1);
      _nudgeAllele(newGenes, 'fertility', -0.15);
      _nudgeAllele(newGenes, 'aggression', 0.15);
      _nudgeAllele(newGenes, 'bodySize', 0.1);
      _nudgeAllele(newGenes, 'hungerEfficiency', 0.1);
      const targets = (livingIds as readonly number[]).filter((cid) => {
        const csp = SPECIES[cid];
        return (
          csp &&
          (csp.tier === 'consumer' || csp.tier === 'herbivore') &&
          cid !== id
        );
      });
      const sh = targets.slice();
      shuffle(sh as number[]);
      for (
        let i = 0;
        i < Math.min(sh.length, 1 + ((Math.random() * 3) | 0));
        i++
      )
        newEats.push(sh[i]);
    } else if (newTier === 'megafauna') {
      _nudgeAllele(newGenes, 'bodyShape', -0.1);
      _nudgeAllele(newGenes, 'bodySize', 0.2);
      _nudgeAllele(newGenes, 'fertility', -0.2);
      _nudgeAllele(newGenes, 'hungerEfficiency', 0.15);
      _nudgeAllele(newGenes, 'aggression', 0.1);
      const targets = (livingIds as readonly number[]).filter((pid) => {
        const psp = SPECIES[pid];
        return (
          psp &&
          (psp.tier === 'consumer' || psp.tier === 'herbivore') &&
          pid !== id
        );
      });
      const sh = targets.slice();
      shuffle(sh as number[]);
      for (
        let i = 0;
        i < Math.min(sh.length, 2 + ((Math.random() * 3) | 0));
        i++
      )
        newEats.push(sh[i]);
    }

    // Derived stats
    const nsExp = expressAllGenes(newGenes);
    const tmpBR =
      (sp.breedRate || 0.04) *
      (0.2 +
        nsExp.fertility * 0.35 +
        nsExp.metabolicRate * 0.25 +
        nsExp.growthRate * 0.15 +
        (1 - nsExp.bodySize) * 0.05);
    const tmpMR = clamp(
      (sp.moveRate || 0.35) *
        (0.3 +
          nsExp.bodyShape * 0.25 +
          nsExp.curiosity * 0.2 +
          (1 - nsExp.bodySize) * 0.15 +
          (1 - nsExp.bodyArmour) * 0.1),
      0.02,
      0.98,
    );
    const tmpHM = clamp(
      Math.round(
        (sp.hungerMax || 20) *
          (0.2 +
            nsExp.bodySize * 0.25 +
            nsExp.hungerEfficiency * 0.25 +
            (1 - nsExp.metabolicRate) * 0.2 +
            0.1),
      ),
      6,
      80,
    );

    const newLayer: Layer =
      TIER_LAYER_MAP[newTier] !== undefined
        ? TIER_LAYER_MAP[newTier]!
        : sp.layer;

    // Gene-driven layer drift: species with high pressureAdapt go deeper, high thermalAdapt go shallower
    const nsExpCheck = expressAllGenes(newGenes);
    let adjustedLayer = newLayer as number;
    if (nsExpCheck.pressureAdapt > 0.65) adjustedLayer = Math.max(0, adjustedLayer - 1);
    if (nsExpCheck.thermalAdapt > 0.65) adjustedLayer = Math.min(5, adjustedLayer + 1);

    // Register the new species
    const newSpeciesDef: SpeciesDefinition & {
      parentId: number;
      rootAncestor: number;
      lineageDepth: number;
    } = {
      name: newName,
      color: newHex,
      tier: newTier,
      layer: adjustedLayer as Layer,
      breedRate: sp.breedRate || 0.04,
      moveRate: sp.moveRate || 0.35,
      hungerMax: sp.hungerMax || 20,
      eats: newEats.length ? newEats : undefined,
      layerReach: NICHE_LAYER_REACH[newTier] ?? (sp.layerReach || 1),
      desc:
        sp.name +
        ' shifted to ' +
        newTier +
        ' niche (gen ' +
        generation +
        ')',
      parentId: id,
      rootAncestor: rootId,
      lineageDepth: (sp.lineageDepth || 0) + 1,
    };
    registerSpecies(newId, newSpeciesDef as any);
    COLOR_RGB[newId] = [nr, ng, nb];

    // Create evoStats for the new species
    evoStats[newId] = {
      breedRate: tmpBR,
      moveRate: tmpMR,
      hungerMax: tmpHM,
      eats: newEats.slice(),
      traits: [],
      traitAge: {},
      traitStrengths: {},
      _traitBitmask: 0,
      genes: newGenes,
      geneVar: newGeneVar,
      baseGenes: cloneGenes(newGenes),
      novelAdapts: (es.novelAdapts || []).slice(),
    };

    expressTraits(SPECIES[newId], evoStats[newId], ctx.maxTraitsPerSpecies, expressAllGenes, (msg) =>
      addEvoEvent(history, generation, msg),
    );

    // Convert a fraction of parent cells to the new species
    const convertTarget = (popNow * 0.25) | 0;
    convertCells(species, total, id, newId, convertTarget);

    if (targetEmpty) {
      addEvoEvent(
        history,
        generation,
        newName +
          ' filled empty ' +
          newTier +
          ' niche (convergent evolution)!',
      );
    } else {
      addEvoEvent(
        history,
        generation,
        newName + ' shifted niche: ' + sp.tier + ' -> ' + newTier + '!',
      );
    }

    newSpeciesIds.push(newId);
  }

  return { newSpeciesIds };
}

// ---------------------------------------------------------------------------
// sizeDiversify()
// ---------------------------------------------------------------------------

/**
 * Size diversification: species split into larger or smaller variants
 * that occupy different sub-niches (layers, prey, movement profiles).
 *
 * A large Small Fish becomes a "Greater Small Fish" that is slower, eats
 * bigger prey, and lives in an adjacent layer. A small variant becomes a
 * "Lesser Small Fish" that is faster and breeds more.
 */
export function sizeDiversify(ctx: EvoContext): SizeDiversifyResult {
  const { evoStats, popHistory, species, generation, history } = ctx;
  const newSpeciesIds: number[] = [];

  if (getDynamicSpeciesIds().length >= MAX_DYNAMIC_SPECIES) return { newSpeciesIds };
  if (popHistory.length < 3) return { newSpeciesIds };

  const now = popHistory[popHistory.length - 1];
  const total = species.length;
  const livingIds = getLivingIds();

  for (const id of livingIds) {
    if (getDynamicSpeciesIds().length >= MAX_DYNAMIC_SPECIES) break;

    const sp = SPECIES[id] as SpeciesDefinition & {
      lineageDepth?: number;
      rootAncestor?: number;
      parentId?: number;
    };
    if (!sp || !sp.breedRate || !sp.hungerMax) continue;
    if (sp.tier === 'producer' || sp.tier === 'decomposer') continue;

    const popNow = now[id] || 0;
    if (popNow < SIZE_DIVERSIFY_MIN_POP) continue;

    const es = evoStats[id];
    if (!es || !es.genes) continue;

    const sizeGene = es.genes.bodySize;
    const sizeHetero = geneHeterozygosity(sizeGene);
    const sizeVar = es.geneVar.bodySize || 0.06;
    if (sizeHetero < 0.12 && sizeVar < 0.10) continue;

    if (Math.random() > SIZE_DIVERSIFY_CHANCE) continue;

    const newId = allocateSpeciesId();
    if (newId === -1) break;

    const currentSize = geneVal(sizeGene);
    const goLarger = currentSize < 0.65 && Math.random() < 0.55;
    const sizeDir = goLarger ? 1 : -1;
    const shift = SIZE_BODYSIZE_SHIFT * sizeDir;

    const rootId: number = (sp as any).rootAncestor || id;
    const depth = sp.lineageDepth || 0;

    const newGenes = cloneGenes(es.genes);
    const newGeneVar: Record<GeneKey, number> = {} as Record<GeneKey, number>;
    for (const g of GENE_KEYS) {
      newGeneVar[g] = Math.max(0.06, (es.geneVar[g] || 0.14) * 0.80);
    }

    _nudgeAllele(newGenes, 'bodySize', shift);

    if (goLarger) {
      _nudgeAllele(newGenes, 'bodyShape', -0.08);
      _nudgeAllele(newGenes, 'fertility', -0.12);
      _nudgeAllele(newGenes, 'hungerEfficiency', 0.10);
      _nudgeAllele(newGenes, 'aggression', 0.08);
      _nudgeAllele(newGenes, 'bodyArmour', 0.06);
    } else {
      _nudgeAllele(newGenes, 'bodyShape', 0.10);
      _nudgeAllele(newGenes, 'fertility', 0.10);
      _nudgeAllele(newGenes, 'aggression', -0.06);
      _nudgeAllele(newGenes, 'flightResponse', 0.08);
    }

    const rootSp = SPECIES[rootId];
    const rootName = rootSp ? rootSp.name : sp.name;
    const existingNames = collectExistingNames();
    const sizeLabel = goLarger ? 'large' : 'small';
    const newName = generateSpeciesName(
      sp.name,
      rootName,
      newGenes,
      es.genes,
      existingNames,
      'sizeshift',
      sizeLabel,
    );

    const baseRGB = COLOR_RGB[id] || [128, 128, 128];
    const { hex: newHex, rgb: [nr, ng, nb] } = shiftColour(baseRGB, 55);

    const newExp = expressAllGenes(newGenes);
    const vigour = 1.0 + Math.random() * 0.08;
    const tmpBR = sp.breedRate * (
      0.2 + newExp.fertility * 0.35 + newExp.metabolicRate * 0.25 +
      newExp.growthRate * 0.15 + (1 - newExp.bodySize) * 0.05
    ) * vigour;
    const tmpMR = sp.moveRate ? clamp(
      sp.moveRate * (
        0.3 + newExp.bodyShape * 0.25 + newExp.curiosity * 0.2 +
        (1 - newExp.bodySize) * 0.15 + (1 - newExp.bodyArmour) * 0.1
      ) * vigour,
      0.02, 0.98,
    ) : 0;
    const tmpHM = clamp(Math.round(
      sp.hungerMax * (
        0.2 + newExp.bodySize * 0.25 + newExp.hungerEfficiency * 0.25 +
        (1 - newExp.metabolicRate) * 0.2 + 0.1
      ) * vigour,
    ), 6, 80);

    let newLayer = sp.layer as number;
    if (goLarger) {
      newLayer = Math.min(LAYER_COUNT - 1, newLayer + 1);
    } else {
      newLayer = Math.max(0, newLayer - 1);
    }

    const parentReach = sp.layerReach ?? 1;
    let newReach = parentReach;
    if (goLarger) {
      newReach = Math.min(parentReach + 1, LAYER_COUNT - 1);
    } else {
      newReach = Math.max(1, parentReach - 1);
    }

    const newEats = (es.eats || []).slice();
    if (goLarger) {
      if (newEats.indexOf(id) === -1 && Math.random() < 0.30) {
        newEats.push(id);
      }
    } else {
      if (newEats.length > 1 && Math.random() < 0.25) {
        newEats.splice((Math.random() * newEats.length) | 0, 1);
      }
    }

    const newSpeciesDef: SpeciesDefinition & {
      parentId: number;
      rootAncestor: number;
      lineageDepth: number;
    } = {
      name: newName,
      color: newHex,
      tier: sp.tier,
      layer: newLayer as Layer,
      breedRate: sp.breedRate,
      moveRate: sp.moveRate || undefined,
      hungerMax: sp.hungerMax,
      eats: newEats.length ? newEats : undefined,
      layerReach: newReach,
      desc: (goLarger ? 'Larger' : 'Smaller') + ' variant of ' + sp.name + ' (gen ' + generation + ')',
      parentId: id,
      rootAncestor: rootId,
      lineageDepth: depth + 1,
    };
    registerSpecies(newId, newSpeciesDef as any);
    COLOR_RGB[newId] = [nr, ng, nb];

    evoStats[newId] = {
      breedRate: tmpBR,
      moveRate: tmpMR,
      hungerMax: tmpHM,
      eats: newEats.slice(),
      traits: [],
      traitAge: {},
      traitStrengths: {},
      _traitBitmask: 0,
      genes: newGenes,
      geneVar: newGeneVar,
      baseGenes: cloneGenes(newGenes),
      novelAdapts: (es.novelAdapts || []).slice(),
    };

    expressTraits(SPECIES[newId], evoStats[newId], ctx.maxTraitsPerSpecies, expressAllGenes, (msg) =>
      addEvoEvent(history, generation, msg),
    );

    ctx.history.graphEventMarkers.push({
      gen: generation,
      type: 'speciation',
      label: newName,
    });

    for (const oid of livingIds) {
      if (oid === newId) continue;
      const oe = evoStats[oid];
      if (oe && oe.eats && oe.eats.indexOf(id) !== -1 && oe.eats.indexOf(newId) === -1) {
        oe.eats.push(newId);
      }
    }

    const convertTarget = (popNow * SIZE_DIVERSIFY_CONVERT) | 0;
    convertCells(species, total, id, newId, convertTarget);

    const sizeWord = goLarger ? 'larger' : 'smaller';
    addEvoEvent(
      history,
      generation,
      newName + ' emerged as a ' + sizeWord + ' variant of ' + sp.name + '!',
    );

    newSpeciesIds.push(newId);
  }

  return { newSpeciesIds };
}
