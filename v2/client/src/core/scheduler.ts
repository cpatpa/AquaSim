/**
 * scheduler.ts -- Main simulation step (faithful extraction from aquasim.html)
 *
 * This is a Phase 1 extraction: the ~1,300-line step() function is kept as one
 * function for behavioural fidelity.  All former global accesses now go through
 * StepContext / GridState / EvoStats.
 */

import type {
  GridState,
  EvoStats,
  SpeciesDefinition,
  PopSnapshot,
  LivingTier,
} from '../types';

import {
  DEAD_DECAY_AGE,
  DEAD_FOSSILIZE_AGE,
  OIL_SPREAD_RATE,
  OIL_SPREAD_MAX_AGE,
  OIL_DECAY_AGE,
  ICE_THAW_AGE,
  TOXIC_BLOOM_SPREAD,
  TOXIC_BLOOM_DECAY,
  LAVA_COOL_AGE,
  LAVA_SPREAD_MAX_AGE,
  LAVA_HEAT_RADIUS,
  METABOLISM,
  HUNGER_RESTORE_FRACTION,
  HUNGER_RESTORE_BY_TIER,
  DOMINANCE_THRESHOLD,
  DOMINANCE_DEATH_BASE,
  DOMINANCE_HARD_CAP,
  DECOMPOSER_BREED_CAP,
  SCAVENGE_RESTORE_BY_TIER,
  LITHIVORE_RESTORE_BY_TIER,
  DIETARY_POVERTY_PENALTY,
  ROCK_EROSION_CHANCE,
  ROCK_ISOLATED_EROSION_CHANCE,
  TIER_DOMINANCE_THRESHOLD,
  TIER_DOMINANCE_BREED_PENALTY,
  CARDINAL,
  NEIGHBOURS_8,
  POP_SNAPSHOT_INTERVAL,
  EVO_CHANCE_PER_GEN,
  EVO_COOLDOWN_MIN,
  EVO_COOLDOWN_MAX,
  LAYER_LIGHT,
  LAYER_TEMPERATURE,
  LAYER_PRESSURE,
} from '../constants';

import {
  SPECIES,
  LIVING_IDS,
  getLivingIds,
  getDynamicSpeciesIds,
  layerOf,
  layersCanReach,
  removeFromTierGroups,
  removeDynamicSpeciesId,
} from '../species/registry';

import { getSpeciesSynergies, hasSynergy, TRAIT_BITS } from '../evolution/traits';

import type { SeasonState } from '../environment/seasons';
import { advanceSeason, getSeasonModifiers } from '../environment/seasons';

import type { SimHistory } from '../data/history';
import {
  recordPopSnapshot,
  addEvoEvent,
  addGraphEventMarker,
} from '../data/history';

import { BIO_TIERS } from '../species/species-types';

// ---------------------------------------------------------------------------
// Vent type (volcanic eruption sites active during a step)
// ---------------------------------------------------------------------------
export interface Vent {
  x: number;
  y: number;
  ticksLeft: number;
  coreR: number;
  angles: number[];
}

// ---------------------------------------------------------------------------
// StepContext -- everything the step function needs
// ---------------------------------------------------------------------------
export interface StepContext {
  grid: GridState;
  evoStats: Record<number, EvoStats>;
  season: SeasonState;
  history: SimHistory;
  generation: number;
  evolveEnabled: boolean;
  radiationBoost: number;
  prevLivingCount: number;
  mutationRateMult: number;
  speciationRateMult: number;
  maxTraitsPerSpecies: number;
  activeVents: Vent[];
  evoCooldown: number;
  lastEvoGen: number;
  /** External hooks -- provided by the caller so step() stays pure-logic. */
  onEvolve?: () => void;
  onSpeciate?: () => void;
  onNicheShift?: () => void;
  onTierImmigration?: () => void;
  onReassignPrey?: () => void;
  onEnforceGeneVarianceFloor?: () => void;
  onClearCreatureCache?: () => void;
  onSpawnDeathParticles?: (idx: number, sid: number) => void;
}

// ---------------------------------------------------------------------------
// StepResult -- values mutated / returned after one step
// ---------------------------------------------------------------------------
export interface StepResult {
  generation: number;
  radiationBoost: number;
  prevLivingCount: number;
  evoCooldown: number;
  lastEvoGen: number;
}

// ---------------------------------------------------------------------------
// Shuffle utilities
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle in place, returns the same array. */
export function shuffleSmall<T extends { length: number; [i: number]: any }>(arr: T): T {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Pre-allocated shuffle buffers (avoids per-cell allocations)
const _dirs4 = new Uint8Array([0, 1, 2, 3]);
const _dirs8 = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

export function shuffleDirs4(): Uint8Array {
  shuffleSmall(_dirs4);
  return _dirs4;
}

export function shuffleDirs8(): Uint8Array {
  shuffleSmall(_dirs8);
  return _dirs8;
}

// Pre-allocated scan-range buffers for the hunt inner-loop
const _scanRange1: [number, number][] = [];
const _scanRange2: [number, number][] = [];
for (let dy = -1; dy <= 1; dy++) {
  for (let dx = -1; dx <= 1; dx++) {
    if (dx || dy) _scanRange1.push([dx, dy]);
  }
}
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    if (dx || dy) _scanRange2.push([dx, dy]);
  }
}

// Pre-allocated step buffers (resized lazily)
let _stepProcessed: Uint8Array | null = null;
let _stepIndices: Uint32Array | null = null;
let _stepPopCounts: Uint32Array | null = null;

// ---------------------------------------------------------------------------
// Grid wrapping helpers (inlined for performance -- no GridState lookup)
// ---------------------------------------------------------------------------
function wrapX(x: number, w: number): number {
  return ((x % w) + w) % w;
}

function wrapY(y: number, h: number): number {
  return ((y % h) + h) % h;
}

// ---------------------------------------------------------------------------
// evo() -- returns effective stats for a species
// ---------------------------------------------------------------------------
function evo(
  sid: number,
  evolveEnabled: boolean,
  evoStats: Record<number, EvoStats>,
): EvoStats | SpeciesDefinition {
  return evolveEnabled && evoStats[sid] ? evoStats[sid] : SPECIES[sid];
}

// ---------------------------------------------------------------------------
// hasNovelAdapt -- check if species has a novel adaptation
// ---------------------------------------------------------------------------
function hasNovelAdapt(
  sid: number,
  key: string,
  evoStats: Record<number, EvoStats>,
): boolean {
  const es = evoStats[sid];
  return !!es && !!es.novelAdapts && es.novelAdapts.indexOf(key) !== -1;
}

// ---------------------------------------------------------------------------
// calcBiodiversity
// ---------------------------------------------------------------------------
export function calcBiodiversity(
  counts: PopSnapshot,
  evoStats: Record<number, EvoStats>,
  dynamicIds: readonly number[],
): number {
  let score = 0;
  const livePops: number[] = [];
  const tiersPresent = new Set<string>();
  const allTraits = new Set<string>();
  let totalPop = 0;

  for (const id of getLivingIds()) {
    const c = counts[id] || 0;
    if (c <= 0) continue;
    livePops.push(c);
    totalPop += c;
    const sp = SPECIES[id];
    if (sp && BIO_TIERS.indexOf(sp.tier as LivingTier) !== -1) tiersPresent.add(sp.tier);
    score += dynamicIds.indexOf(id) !== -1 ? 15 : 10;
    const es = evoStats[id];
    if (es && es.traits) {
      for (let t = 0; t < es.traits.length; t++) allTraits.add(es.traits[t]);
    }
  }

  score += allTraits.size * 5;
  score += tiersPresent.size * 25;

  if (livePops.length >= 2 && totalPop > 0) {
    let H = 0;
    for (let i = 0; i < livePops.length; i++) {
      const pi = livePops[i] / totalPop;
      if (pi > 0) H -= pi * Math.log(pi);
    }
    const J = H / Math.log(livePops.length);
    score += (J * 100) | 0;
  }

  return score;
}

// ---------------------------------------------------------------------------
// step() -- main simulation tick
// ---------------------------------------------------------------------------
export function step(ctx: StepContext): StepResult {
  const {
    grid,
    evoStats: ctxEvoStats,
    season,
    history,
    evolveEnabled,
    activeVents,
    onSpawnDeathParticles,
  } = ctx;

  let {
    generation,
    radiationBoost,
    prevLivingCount,
    evoCooldown,
    lastEvoGen,
  } = ctx;

  const { species, hunger, age, currents } = grid;
  const cw = grid.width;
  const ch = grid.height;
  const layers = grid.layers;
  const planeSize = cw * ch;
  const total = planeSize * layers;

  // Lazily allocate / resize step buffers
  if (!_stepProcessed || _stepProcessed.length !== total) {
    _stepProcessed = new Uint8Array(total);
    _stepIndices = new Uint32Array(total);
    _stepPopCounts = new Uint32Array(256);
  }
  const processed = _stepProcessed;
  processed.fill(0);

  // --- Season advancement ---
  advanceSeason(season);
  const sMod = getSeasonModifiers(season.current);

  // --- Build shuffled index list of occupied cells ---
  const indices = _stepIndices!;
  let indexCount = 0;
  for (let i = 0; i < total; i++) {
    if (species[i] !== 0) indices[indexCount++] = i;
  }
  // Fisher-Yates on the populated portion
  for (let i = indexCount - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }

  // --- Pre-count living populations for dominance checks ---
  const popCounts = _stepPopCounts!;
  popCounts.fill(0);
  let totalLiving = 0;
  for (let i = 0; i < indexCount; i++) {
    const _s = species[indices[i]];
    if (_s >= 10) {
      popCounts[_s]++;
      totalLiving++;
    }
  }
  const dominantThreshold = totalLiving * DOMINANCE_THRESHOLD;

  // --- Pre-count tier populations for tier-level dominance ---
  const tierPops: Record<string, number> = {};
  for (let i = 0; i < indexCount; i++) {
    const _ts = species[indices[i]];
    if (_ts >= 10) {
      const _tsp = SPECIES[_ts];
      if (_tsp) tierPops[_tsp.tier] = (tierPops[_tsp.tier] || 0) + 1;
    }
  }

  // =========================================================================
  // Main entity processing loop
  // =========================================================================
  for (let k = 0; k < indexCount; k++) {
    const idx = indices[k];
    if (processed[idx]) continue;
    const sid = species[idx];
    if (sid === 0) continue;
    processed[idx] = 1;

    const cz = (idx / planeSize) | 0;
    const xyIdx = idx - cz * planeSize;
    const cx = xyIdx % cw;
    const cy = (xyIdx / cw) | 0;
    const zOff = cz * planeSize;
    const sp = SPECIES[sid];

    if (sid === 1) {
      let adjRock = 0;
      let adjEmpty = 0;
      for (let n = 0; n < 4; n++) {
        const dir = CARDINAL[n];
        const ns = species[zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw)];
        if (ns === 1) adjRock++;
        else if (ns === 0) adjEmpty++;
      }
      if ((adjRock === 0 && Math.random() < ROCK_ISOLATED_EROSION_CHANCE) || (adjRock <= 1 && Math.random() < 0.008) || (adjEmpty >= 3 && Math.random() < ROCK_EROSION_CHANCE)) {
        species[idx] = 0;
        hunger[idx] = 0;
        age[idx] = 0;
      }
      // Rock buildup: dense rock clusters grow upward into the next layer
      if (cz < layers - 1 && adjRock >= 3 && Math.random() < 0.003) {
        const aboveIdx = (cz + 1) * planeSize + xyIdx;
        if (species[aboveIdx] === 0) {
          species[aboveIdx] = 1;
          hunger[aboveIdx] = 0;
          age[aboveIdx] = 0;
        }
      }
      // Rock sinks: rock above z=0 without rock below it erodes downward
      if (cz > 0) {
        const belowIdx = (cz - 1) * planeSize + xyIdx;
        if (species[belowIdx] === 0 && Math.random() < 0.01) {
          species[belowIdx] = 1;
          species[idx] = 0;
          hunger[idx] = 0;
          age[idx] = 0;
        }
      }
      continue;
    }

    // Current overlay is handled separately (no species ID 2 in grid)

    // ----- Dead cell: sink toward abyssal, decay, rare fossilisation -----
    if (sid === 3) {
      age[idx]++;
      // Sink: dead matter falls one layer per tick until it reaches z=0
      if (cz > 0) {
        const belowXY = (cz - 1) * planeSize + xyIdx;
        if (species[belowXY] === 0) {
          species[belowXY] = 3;
          hunger[belowXY] = 0;
          age[belowXY] = age[idx];
          species[idx] = 0;
          hunger[idx] = 0;
          age[idx] = 0;
          processed[belowXY] = 1;
          continue;
        }
      }
      if (age[idx] >= DEAD_FOSSILIZE_AGE) {
        let adjRockD = 0;
        for (let n = 0; n < 4; n++) {
          const dir = CARDINAL[n];
          if (species[zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw)] === 1) adjRockD++;
        }
        species[idx] = adjRockD >= 2 ? 1 : 0;
        hunger[idx] = 0;
        age[idx] = 0;
      } else if (age[idx] >= DEAD_DECAY_AGE) {
        species[idx] = 0;
        hunger[idx] = 0;
        age[idx] = 0;
      }
      continue;
    }

    // ----- Oil: spread while young, then decay -----
    if (sid === 4) {
      age[idx]++;
      if (age[idx] >= OIL_DECAY_AGE) {
        species[idx] = 0;
        hunger[idx] = 0;
        age[idx] = 0;
        continue;
      }
      if (age[idx] <= OIL_SPREAD_MAX_AGE) {
        const dirs = shuffleDirs4();
        for (let d = 0; d < 4; d++) {
          const dir = CARDINAL[dirs[d]];
          const nx = wrapX(cx + dir[0], cw);
          const ny = wrapY(cy + dir[1], ch);
          const ni = zOff + ny * cw + nx;
          const nSid = species[ni];
          if (nSid === 0 || nSid === 1 || nSid === 4) continue;
          if (Math.random() < OIL_SPREAD_RATE) {
            species[ni] = 4;
            hunger[ni] = 0;
            age[ni] = 0;
            processed[ni] = 1;
            break;
          }
        }
      }
      continue;
    }

    // ----- Ice: thaw over time -----
    if (sid === 5) {
      age[idx]++;
      if (age[idx] >= ICE_THAW_AGE) {
        species[idx] = 0;
        hunger[idx] = 0;
        age[idx] = 0;
      }
      continue;
    }

    // ----- Toxic Bloom: spread, damage neighbours, decay -----
    if (sid === 6) {
      age[idx]++;
      if (age[idx] >= TOXIC_BLOOM_DECAY) {
        species[idx] = 0;
        hunger[idx] = 0;
        age[idx] = 0;
        continue;
      }
      const tdirs = shuffleDirs4();
      for (let d = 0; d < 4; d++) {
        const dir = CARDINAL[tdirs[d]];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ni = zOff + ny * cw + nx;
        const nSid = species[ni];
        if (nSid === 0 || nSid === 1 || nSid === 5 || nSid === 6) continue;
        const nSp = SPECIES[nSid];
        if (!nSp) continue;
        // Toxic trait species are immune
        const nTraits = ctxEvoStats[nSid] ? ctxEvoStats[nSid].traits || [] : [];
        if (nTraits.indexOf('toxic') !== -1) continue;
        // Biofilm clusters resist
        if (nTraits.indexOf('biofilm') !== -1 && Math.random() < 0.35) continue;
        if (Math.random() < TOXIC_BLOOM_SPREAD) {
          if (nSp.hungerMax) {
            hunger[ni] += 8;
            if (hunger[ni] >= (ctxEvoStats[nSid] ? ctxEvoStats[nSid].hungerMax : nSp.hungerMax!)) {
              species[ni] = 3;
              hunger[ni] = 0;
              age[ni] = 0;
            }
          } else {
            species[ni] = 6;
            hunger[ni] = 0;
            age[ni] = 0;
            processed[ni] = 1;
          }
          break;
        }
      }
      continue;
    }

    // ----- Lava: kill adjacent, flow, radiant heat, cool into rock -----
    if (sid === 7) {
      age[idx]++;
      if (age[idx] >= LAVA_COOL_AGE) {
        let adjLava = 0;
        for (let d = 0; d < 4; d++) {
          const dir = CARDINAL[d];
          const ni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          if (species[ni] === 7 || species[ni] === 1) adjLava++;
        }
        species[idx] = adjLava >= 2 ? 1 : 0;
        hunger[idx] = 0;
        age[idx] = 0;
        continue;
      }
      const ldirs = shuffleDirs4();
      // Kill all adjacent life
      for (let d = 0; d < 4; d++) {
        const dir = CARDINAL[ldirs[d]];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ni = zOff + ny * cw + nx;
        const nSid = species[ni];
        if (nSid <= 1 || nSid === 5 || nSid === 7 || nSid === 0) continue;
        const nSp = SPECIES[nSid];
        if (!nSp) continue;
        const nTraits = ctxEvoStats[nSid] ? ctxEvoStats[nSid].traits || [] : [];
        if (nTraits.indexOf('warmadapt') !== -1 && Math.random() < 0.5) continue;
        if (nTraits.indexOf('shell') !== -1 && Math.random() < 0.25) continue;
        if (onSpawnDeathParticles) onSpawnDeathParticles(ni, nSid);
        species[ni] = 3;
        hunger[ni] = 0;
        age[ni] = 0;
      }
      // Lava flow
      const spreadChance = age[idx] < 6 ? 0.12 : age[idx] < LAVA_SPREAD_MAX_AGE ? 0.03 : 0;
      if (spreadChance > 0 && Math.random() < spreadChance) {
        let adjLava = 0;
        for (let d = 0; d < 4; d++) {
          const dir = CARDINAL[ldirs[d]];
          const ni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          if (species[ni] === 7 || species[ni] === 1) adjLava++;
        }
        if (adjLava < 3) {
          let bestD = -1;
          let bestScore = -1;
          for (let d = 0; d < 4; d++) {
            const dir = CARDINAL[ldirs[d]];
            const nx = wrapX(cx + dir[0], cw);
            const ny = wrapY(cy + dir[1], ch);
            const ni = zOff + ny * cw + nx;
            const nSid = species[ni];
            if (nSid === 1 || nSid === 7) continue;
            let score = Math.random();
            for (let vi = 0; vi < activeVents.length; vi++) {
              const v = activeVents[vi];
              const dxV = nx - v.x;
              const dyV = ny - v.y;
              score += Math.sqrt(dxV * dxV + dyV * dyV) * 0.02;
            }
            if (score > bestScore) {
              bestScore = score;
              bestD = d;
            }
          }
          if (bestD >= 0) {
            const dir = CARDINAL[ldirs[bestD]];
            const nx = wrapX(cx + dir[0], cw);
            const ny = wrapY(cy + dir[1], ch);
            const ni = zOff + ny * cw + nx;
            species[ni] = 7;
            hunger[ni] = 0;
            age[ni] = 0;
            processed[ni] = 1;
          }
        }
      }
      // Radiant heat
      if (age[idx] < 25 && Math.random() < 0.08) {
        for (let dy = -LAVA_HEAT_RADIUS; dy <= LAVA_HEAT_RADIUS; dy++) {
          for (let dx = -LAVA_HEAT_RADIUS; dx <= LAVA_HEAT_RADIUS; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (Math.abs(dx) + Math.abs(dy) > LAVA_HEAT_RADIUS) continue;
            const hx = wrapX(cx + dx, cw);
            const hy = wrapY(cy + dy, ch);
            const hi = zOff + hy * cw + hx;
            const hSid = species[hi];
            if (hSid < 10) continue;
            const hSp = SPECIES[hSid];
            if (!hSp) continue;
            const hTraits = ctxEvoStats[hSid] ? ctxEvoStats[hSid].traits || [] : [];
            if (hTraits.indexOf('warmadapt') !== -1) continue;
            if (hTraits.indexOf('thermosensing') !== -1 && Math.random() < 0.6) continue;
            if (Math.random() < 0.35) {
              if (onSpawnDeathParticles) onSpawnDeathParticles(hi, hSid);
              species[hi] = 3;
              hunger[hi] = 0;
              age[hi] = 0;
            }
          }
        }
      }
      // Lava melts ice on contact
      for (let d = 0; d < 4; d++) {
        const dir = CARDINAL[ldirs[d]];
        const ni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
        if (species[ni] === 5) {
          species[ni] = 0;
          hunger[ni] = 0;
          age[ni] = 0;
        }
      }
      continue;
    }

    // =======================================================================
    // Producer behaviour
    // =======================================================================
    if (sp.tier === 'producer') {
      const _pPop = popCounts[sid] || 0;
      if (_pPop > dominantThreshold) {
        const _domRatio = _pPop / Math.max(1, totalLiving);
        const _excess = _domRatio - DOMINANCE_THRESHOLD;
        let _domChance = DOMINANCE_DEATH_BASE * (1 + _excess * 8);
        if (_domRatio > DOMINANCE_HARD_CAP) {
          _domChance += _excess * _excess * 20;
        }
        if (Math.random() < _domChance) {
          species[idx] = 0;
          hunger[idx] = 0;
          age[idx] = 0;
          continue;
        }
      }

      const pes = evo(sid, evolveEnabled, ctxEvoStats) as any;
      const pTraits: string[] = pes.traits || [];
      let breedChance = pes.breedRate * sMod.producerBreedMult;
      // Light affects producer growth: surface layers grow faster
      const layerLight = cz < LAYER_LIGHT.length ? LAYER_LIGHT[cz] : 0.5;
      breedChance *= (0.3 + 0.7 * layerLight);

      if (pTraits.indexOf('warmadapt') !== -1 && (season.current === 'Summer' || season.current === 'Spring')) {
        breedChance = pes.breedRate * 1.4;
      }
      if (pTraits.indexOf('coldadapt') !== -1 && (season.current === 'Winter' || season.current === 'Autumn')) {
        breedChance = pes.breedRate * 1.0;
      }

      // Coral grows faster near rock
      let nearRock = false;
      if (sid === 12) {
        for (let n = 0; n < 4; n++) {
          const dir = CARDINAL[n];
          const ni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          if (species[ni] === 1) {
            nearRock = true;
            break;
          }
        }
        if (nearRock) breedChance *= 3;
      }

      // Nitrogen Fix: breed 2x faster near dead matter
      if (pTraits.indexOf('nitrofix') !== -1) {
        for (let n = 0; n < 4; n++) {
          const dir = CARDINAL[n];
          const ni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          if (species[ni] === 3) {
            breedChance *= 2;
            break;
          }
        }
      }

      // Allelopathy: inhibit other producer species within 2 tiles
      if (pTraits.indexOf('allelopathy') !== -1 && Math.random() < 0.08) {
        for (let ady = -2; ady <= 2; ady++) {
          for (let adx = -2; adx <= 2; adx++) {
            if (adx === 0 && ady === 0) continue;
            const ani = zOff + wrapY(cy + ady, ch) * cw + wrapX(cx + adx, cw);
            const aSid = species[ani];
            if (aSid !== sid && aSid !== 0 && SPECIES[aSid] && SPECIES[aSid].tier === 'producer') {
              if (Math.random() < 0.15) {
                species[ani] = 0;
                hunger[ani] = 0;
                age[ani] = 0;
                processed[ani] = 1;
              }
            }
          }
        }
      }

      // Nocturnal/diurnal for producers
      if (pTraits.indexOf('nocturnal') !== -1) {
        if (season.current === 'Winter' || season.current === 'Autumn') breedChance *= 1.4;
        else breedChance *= 0.8;
      }
      if (pTraits.indexOf('diurnal') !== -1) {
        if (season.current === 'Summer' || season.current === 'Spring') breedChance *= 1.4;
        else breedChance *= 0.8;
      }

      // Tier-level dominance penalty for producers
      const _prodTierTotal = tierPops['producer'] || 0;
      if (_prodTierTotal > totalLiving * TIER_DOMINANCE_THRESHOLD) {
        breedChance *= TIER_DOMINANCE_BREED_PENALTY;
      }
      // Endangered producer boost
      const _prodFrac = totalLiving > 0 ? _prodTierTotal / totalLiving : 0;
      if (_prodFrac < 0.05 && _prodFrac > 0) breedChance *= 2.0;
      else if (_prodFrac < 0.10 && _prodFrac > 0) breedChance *= 1.5;

      // Density-dependent growth: count adjacent producers (light competition)
      let adjProducers = 0;
      for (let n = 0; n < 8; n++) {
        const dir = NEIGHBOURS_8[n];
        const nsi = species[zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw)];
        if (nsi > 0 && SPECIES[nsi] && SPECIES[nsi].tier === 'producer') adjProducers++;
      }
      if (adjProducers >= 7) breedChance *= 0.05;
      else if (adjProducers >= 6) breedChance *= 0.2;
      else if (adjProducers >= 5) breedChance *= 0.4;

      if (Math.random() < breedChance) {
        // Spore Burst: can spread 2 tiles away
        const maxDist = pTraits.indexOf('spore') !== -1 ? 2 : 1;
        const dirs = shuffleDirs4();
        let bred = false;
        for (let dist = 1; dist <= maxDist && !bred; dist++) {
          for (let d = 0; d < 4; d++) {
            const dir = CARDINAL[dirs[d]];
            const nx = wrapX(cx + dir[0] * dist, cw);
            const ny = wrapY(cy + dir[1] * dist, ch);
            const ni = zOff + ny * cw + nx;
            // Coral can grow on rock
            if (species[ni] === 0 || (sid === 12 && species[ni] === 1)) {
              species[ni] = sid;
              hunger[ni] = 0;
              age[ni] = 0;
              processed[ni] = 1;
              bred = true;
              break;
            }
          }
        }
      }
      continue;
    }

    // =======================================================================
    // Animal behaviour (herbivore, consumer, apex, megafauna, decomposer)
    // =======================================================================
    if (!sp.hungerMax) continue;

    const es = evo(sid, evolveEnabled, ctxEvoStats) as any;
    const traits: string[] = es.traits || [];
    const traitBM = es._traitBitmask || 0;
    const hasTrait = (t: string): boolean => {
      const bit = TRAIT_BITS[t];
      return bit ? (traitBM & bit) !== 0 : traits.indexOf(t) !== -1;
    };
    const restoreFrac = (HUNGER_RESTORE_BY_TIER as any)[sp.tier] || HUNGER_RESTORE_FRACTION;

    // Compute synergies once per entity
    const synergies = getSpeciesSynergies(traits);

    // --- Trait strength helper (closure over ctx) ---
    const tStr = (targetSid: number, trait: string): number => {
      if (!evolveEnabled) return 1;
      const targetEs = ctxEvoStats[targetSid];
      return (targetEs && targetEs.traitStrengths && targetEs.traitStrengths[trait]) || 1;
    };

    // --- Seasonal adaptation ---
    const isColdAdapt = hasTrait('coldadapt');
    const isWarmAdapt = hasTrait('warmadapt');
    const isMigratory = hasTrait('migratory');
    let seasonHungerMult = sMod.hungerMult;
    let seasonBreedMult = sMod.breedMult;
    let seasonMoveMult = sMod.moveMult;

    if (isColdAdapt && (season.current === 'Winter' || season.current === 'Autumn')) {
      seasonHungerMult = 1.0;
      seasonBreedMult = 1.0;
      seasonMoveMult = 1.0;
    }
    if (isWarmAdapt && (season.current === 'Summer' || season.current === 'Spring')) {
      seasonBreedMult = 1.4;
      seasonHungerMult = 0.85;
    }
    if (isMigratory) seasonMoveMult = Math.min(1.5, seasonMoveMult * 1.3);
    // Nocturnal
    if (hasTrait('nocturnal')) {
      if (season.current === 'Winter' || season.current === 'Autumn') {
        seasonBreedMult *= 1.4;
        seasonMoveMult *= 1.4;
      } else {
        seasonBreedMult *= 0.8;
        seasonMoveMult *= 0.8;
      }
    }
    // Diurnal
    if (hasTrait('diurnal')) {
      if (season.current === 'Summer' || season.current === 'Spring') {
        seasonBreedMult *= 1.4;
        seasonMoveMult *= 1.4;
      } else {
        seasonBreedMult *= 0.8;
        seasonMoveMult *= 0.8;
      }
    }

    // --- 1. Increment hunger (metabolic scaling + seasonal + temperature) ---
    const metab = (METABOLISM as any)[sp.tier] || 1.0;
    const layerTemp = cz < LAYER_TEMPERATURE.length ? LAYER_TEMPERATURE[cz] : 1.0;
    let hungerChance = metab * seasonHungerMult * layerTemp;
    if (hasTrait('hypermetabolism')) hungerChance *= 1.8;
    if (Math.random() < hungerChance) hunger[idx]++;

    // Symbiosis: heal hunger if adjacent to a producer
    if (hasTrait('symbiosis') && hunger[idx] > 2) {
      for (let n = 0; n < 4; n++) {
        const dir = CARDINAL[n];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ns = species[zOff + ny * cw + nx];
        const nsp = SPECIES[ns];
        if (nsp && nsp.tier === 'producer') {
          hunger[idx] = Math.max(0, hunger[idx] - 2);
          break;
        }
      }
    }

    // Regeneration: heal 1 hunger every 3 ticks
    if (hasTrait('regen') && age[idx] % 3 === 0 && hunger[idx] > 0) {
      hunger[idx]--;
    }

    // Photosynthetic: slowly restore hunger in open water
    if (hasTrait('photosyn') && hunger[idx] > 0 && age[idx] % 4 === 0) {
      let hasRock = false;
      for (let n = 0; n < 4; n++) {
        const dir = CARDINAL[n];
        if (species[zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw)] === 1) {
          hasRock = true;
          break;
        }
      }
      if (!hasRock) hunger[idx]--;
    }

    // Parasitic: steal 2 hunger from adjacent non-same species
    if (hasTrait('parasite') && hunger[idx] > 3) {
      for (let n = 0; n < 4; n++) {
        const dir = CARDINAL[n];
        const pnx = wrapX(cx + dir[0], cw);
        const pny = wrapY(cy + dir[1], ch);
        const pni = zOff + pny * cw + pnx;
        const pSid = species[pni];
        if (pSid > 0 && pSid !== sid && SPECIES[pSid] && SPECIES[pSid].hungerMax) {
          hunger[idx] = Math.max(0, hunger[idx] - 2);
          hunger[pni] = Math.min(hunger[pni] + 2, (ctxEvoStats[pSid] || {} as any).hungerMax || 30);
          break;
        }
      }
    }

    // Filter Feeder: passively feeds from any producer within 2 tiles
    if (hasTrait('filterfeeder') && hunger[idx] > 2 && Math.random() < 0.3) {
      for (let fdy = -2; fdy <= 2; fdy++) {
        let fed = false;
        for (let fdx = -2; fdx <= 2; fdx++) {
          if (fdx === 0 && fdy === 0) continue;
          const fni = zOff + wrapY(cy + fdy, ch) * cw + wrapX(cx + fdx, cw);
          const fsp = SPECIES[species[fni]];
          if (fsp && fsp.tier === 'producer') {
            hunger[idx] = Math.max(0, hunger[idx] - 2);
            fed = true;
            break;
          }
        }
        if (fed) break;
      }
    }

    // Colonial: average hunger with adjacent same-species (once per 2 ticks)
    if (hasTrait('colonial') && age[idx] % 2 === 0) {
      let totalH = hunger[idx];
      let cnt = 1;
      for (let n = 0; n < 8; n++) {
        const dir = NEIGHBOURS_8[n];
        const cni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
        if (species[cni] === sid) {
          totalH += hunger[cni];
          cnt++;
        }
      }
      if (cnt > 1) {
        const avg = (totalH / cnt) | 0;
        hunger[idx] = avg;
        for (let n = 0; n < 8; n++) {
          const dir = NEIGHBOURS_8[n];
          const cni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          if (species[cni] === sid) hunger[cni] = avg;
        }
      }
    }

    // Novel: Kleptoplasty
    if (hasNovelAdapt(sid, 'kleptoplasty', ctxEvoStats) && hunger[idx] > 0 && age[idx] % 5 === 0) {
      hunger[idx] = Math.max(0, hunger[idx] - 1);
    }
    // Novel: Chemosynthesis
    if (hasNovelAdapt(sid, 'chemosynthesis', ctxEvoStats) && hunger[idx] > 0) {
      for (let n = 0; n < 4; n++) {
        const dir = CARDINAL[n];
        const cni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
        const ns = species[cni];
        if (ns === 2 || ns === 7) {
          hunger[idx] = Math.max(0, hunger[idx] - 2);
          break;
        }
      }
    }
    // Novel: Hive Mind
    if (hasNovelAdapt(sid, 'hivemind', ctxEvoStats) && age[idx] % 2 === 0) {
      let hiveCount = 0;
      let totalH = hunger[idx];
      let cnt = 1;
      for (let n = 0; n < 8; n++) {
        const dir = NEIGHBOURS_8[n];
        const cni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
        if (species[cni] === sid) {
          hiveCount++;
          totalH += hunger[cni];
          cnt++;
        }
      }
      if (hiveCount >= 4 && cnt > 1) {
        const avg = (totalH / cnt) | 0;
        hunger[idx] = avg;
        for (let n = 0; n < 8; n++) {
          const dir = NEIGHBOURS_8[n];
          const cni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          if (species[cni] === sid) hunger[cni] = avg;
        }
      }
    }

    // Torpor: enter low-metabolism dormancy when near starvation
    if (hasTrait('torpor') && hunger[idx] >= Math.round(es.hungerMax * 0.7)) {
      if (Math.random() < 0.6 * tStr(sid, 'torpor')) {
        hunger[idx] = Math.max(hunger[idx] - 1, Math.round(es.hungerMax * 0.6));
        processed[idx] = 1;
        continue;
      }
    }

    // --- 2. Starvation check ---
    // Novel: Aestivation
    if (hasNovelAdapt(sid, 'aestivation', ctxEvoStats) && hunger[idx] >= Math.round(es.hungerMax * 0.8)) {
      let foodAdj = false;
      const aeEats = es.eats;
      if (aeEats && aeEats.length) {
        for (let n = 0; n < 4; n++) {
          const dir = CARDINAL[n];
          const cni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          if (aeEats.indexOf(species[cni]) !== -1) {
            foodAdj = true;
            break;
          }
        }
      }
      if (!foodAdj) {
        if (Math.random() > 0.25) hunger[idx] = Math.max(hunger[idx] - 1, Math.round(es.hungerMax * 0.8));
        processed[idx] = 1;
        continue;
      }
    }

    if (hunger[idx] >= es.hungerMax) {
      if (onSpawnDeathParticles) onSpawnDeathParticles(idx, sid);
      if (hasNovelAdapt(sid, 'calcification', ctxEvoStats) && Math.random() < 0.5) {
        species[idx] = 1;
        hunger[idx] = 0;
        age[idx] = 0;
      } else {
        species[idx] = 3;
        hunger[idx] = 0;
        age[idx] = 0;
      }
      continue;
    }

    const _aPop = popCounts[sid] || 0;
    if (_aPop > dominantThreshold) {
      const _aRatio = _aPop / Math.max(1, totalLiving);
      const _aExcess = _aRatio - DOMINANCE_THRESHOLD;
      let _aChance = DOMINANCE_DEATH_BASE * (1 + _aExcess * 8);
      if (_aRatio > DOMINANCE_HARD_CAP) {
        _aChance += _aExcess * _aExcess * 20;
      }
      if (Math.random() < _aChance) {
        species[idx] = 3;
        hunger[idx] = 0;
        age[idx] = 0;
        processed[idx] = 1;
        continue;
      }
    }

    // --- 3. Eat: scan neighbours for food (layer-aware) ---
    const eats = es.eats;
    const eatsSet = eats;
    let ate = false;
    const _satiated = es.hungerMax > 0 && hunger[idx] < Math.round(es.hungerMax * 0.25);
    const huntRange = (sp.tier === 'apex' || sp.tier === 'megafauna') ? 2 : 1;
    const isPackHunter = hasTrait('packhunter');
    const isTrapJaw = hasTrait('trapjaw');
    const isVenomous = hasTrait('venomous');
    let trapJawUsed = false;

    if (eats && eats.length && !_satiated) {
      const scanCells = huntRange >= 2 ? _scanRange2 : _scanRange1;
      shuffleSmall(scanCells);

      // Pack hunter: count allies near self (same layer)
      let packAllyCount = 0;
      if (isPackHunter) {
        for (let pn = 0; pn < 8; pn++) {
          const pdir = NEIGHBOURS_8[pn];
          const pni = zOff + wrapY(cy + pdir[1], ch) * cw + wrapX(cx + pdir[0], cw);
          if (species[pni] === sid) packAllyCount++;
        }
      }
      const packActive = isPackHunter && packAllyCount >= 2;
      const huntSynMul = hasSynergy(synergies, 'hunt');
      const layerReachVal = sp.layerReach ?? 1;
      // Low-light layers reduce hunt success (unless echolocation/chemosensory)
      const huntLight = cz < LAYER_LIGHT.length ? LAYER_LIGHT[cz] : 0.5;
      const hasLowLightSense = hasTrait('echoloc') || hasTrait('thermosensing');
      const darkMissFrac = hasLowLightSense ? 0 : (1 - huntLight) * 0.35;

      zHunt: for (let dz = -layerReachVal; dz <= layerReachVal && !ate; dz++) {
        const nz = cz + dz;
        if (nz < 0 || nz >= layers) continue;
        const nzOff = nz * planeSize;
        // First check own xy column at different z (vertical strike)
        if (dz !== 0) {
          const ni = nzOff + cy * cw + cx;
          const foodId = species[ni];
          if (eatsSet.indexOf(foodId) !== -1) {
            // simple vertical kill: no defence checks for column strike
            const _preyPop = popCounts[foodId] || 0;
            if (totalLiving === 0 || _preyPop / totalLiving >= 0.01 || Math.random() >= 0.6) {
              if (onSpawnDeathParticles) onSpawnDeathParticles(ni, foodId);
              species[ni] = 0;
              hunger[ni] = 0;
              age[ni] = 0;
              hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac) | 0));
              processed[ni] = 1;
              ate = true;
              break zHunt;
            }
          }
        }
        // Then xy neighbours at this z
        for (let n = 0; n < scanCells.length; n++) {
          const [dx, dy] = scanCells[n];
          const nx = wrapX(cx + dx, cw);
          const ny = wrapY(cy + dy, ch);
          const ni = nzOff + ny * cw + nx;
          const foodId = species[ni];
          if (eatsSet.indexOf(foodId) !== -1) {
          // Darkness miss: low-light layers reduce hunt success
          if (darkMissFrac > 0 && Math.random() < darkMissFrac) continue;
          // Density-dependent predation: scarce prey is harder to find
          const _preyPop = popCounts[foodId] || 0;
          if (totalLiving > 0 && _preyPop < totalLiving * 0.01 && _preyPop > 0) {
            if (Math.random() < 0.6) continue;
          } else if (totalLiving > 0 && _preyPop < totalLiving * 0.03 && _preyPop > 0) {
            if (Math.random() < 0.3) continue;
          }
          const preyEs = evo(foodId, evolveEnabled, ctxEvoStats) as any;
          const preyTraits: string[] = preyEs.traits || [];
          const preySynergies = getSpeciesSynergies(preyTraits);

          // Trap Jaw: first attack ignores ALL prey defences
          if (isTrapJaw && !trapJawUsed) {
            trapJawUsed = true;
            // Skip all defensive checks
          } else {
            // Prey flight response: gene-based escape chance for all prey
            const preyExpressed = preyEs._expressed || preyEs;
            const _flightVal = preyExpressed.flightResponse ?? 0;
            if (_flightVal > 0.2 && Math.random() < _flightVal * 0.4) continue;
            // Aposematic Warning synergy
            if (hasSynergy(preySynergies, 'avoid') && Math.random() < 0.4) continue;
            // Mimicry
            if (preyTraits.indexOf('mimicry') !== -1 && !packActive && Math.random() < 0.45 * tStr(foodId, 'mimicry')) continue;
            // Chromatophores
            if (preyTraits.indexOf('chromatophores') !== -1 && !packActive && Math.random() < 0.55 * tStr(foodId, 'chromatophores') * (huntSynMul ? 1 / huntSynMul : 1)) continue;
            // Camouflage
            if (preyTraits.indexOf('camouflage') !== -1 && !packActive && Math.random() < 0.4 * tStr(foodId, 'camouflage') * (huntSynMul ? 1 / huntSynMul : 1)) continue;
            // Pod Defence
            if (preyTraits.indexOf('poddefense') !== -1 && !packActive) {
              let podCount = 0;
              for (let pn = 0; pn < 8; pn++) {
                const pdir = NEIGHBOURS_8[pn];
                const pni = zOff + wrapY(ny + pdir[1], ch) * cw + wrapX(nx + pdir[0], cw);
                if (species[pni] === foodId) podCount++;
              }
              if (podCount >= 2 && Math.random() < 0.5 * tStr(foodId, 'poddefense')) continue;
            }
            // Gigantism
            if (preyTraits.indexOf('gigantism') !== -1 && Math.random() < 0.3 * tStr(foodId, 'gigantism')) continue;
            // Novel: Burrowing
            if (hasNovelAdapt(foodId, 'burrowing', ctxEvoStats) && Math.random() < 0.4) continue;
            // Novel: Mucus Coating
            if (hasNovelAdapt(foodId, 'mucuscoat', ctxEvoStats) && Math.random() < 0.35) {
              ate = true;
              break zHunt;
            }
            // Ink Cloud
            if (preyTraits.indexOf('inkcloud') !== -1 && Math.random() < 0.5 * tStr(foodId, 'inkcloud')) {
              const tDir = CARDINAL[(Math.random() * 4) | 0];
              const tnx = wrapX(nx + tDir[0] * 2, cw);
              const tny = wrapY(ny + tDir[1] * 2, ch);
              const tni = zOff + tny * cw + tnx;
              if (species[tni] === 0) {
                species[tni] = foodId;
                hunger[tni] = hunger[ni];
                age[tni] = age[ni];
                species[ni] = 0;
                hunger[ni] = 0;
                age[ni] = 0;
                processed[tni] = 1;
              }
              continue;
            }
            // Biofilm
            if (preyTraits.indexOf('biofilm') !== -1 && sp.tier !== 'herbivore') {
              let bfCount = 0;
              for (let bn = 0; bn < 8; bn++) {
                const bdir = NEIGHBOURS_8[bn];
                if (species[zOff + wrapY(ny + bdir[1], ch) * cw + wrapX(nx + bdir[0], cw)] === foodId) bfCount++;
              }
              if (bfCount >= 3 && Math.random() < 0.35 * tStr(foodId, 'biofilm')) continue;
            }
          }

          // Toxic: predator takes hunger damage
          if (preyTraits.indexOf('toxic') !== -1) {
            const toxDmg = Math.round(4 * tStr(foodId, 'toxic'));
            hunger[idx] += sp.tier === 'herbivore' ? ((toxDmg * 0.25) | 0) : toxDmg;
          }
          // Thorns
          if (preyTraits.indexOf('thorns') !== -1) {
            const thDmg = Math.round(7 * tStr(foodId, 'thorns'));
            hunger[idx] += sp.tier === 'herbivore' ? ((thDmg * 0.25) | 0) : thDmg;
          }
          // Venomous predator: extra damage to prey's neighbours
          if (isVenomous) {
            for (let vn = 0; vn < 4; vn++) {
              const vdir = CARDINAL[vn];
              const vni = zOff + wrapY(ny + vdir[1], ch) * cw + wrapX(nx + vdir[0], cw);
              const vSid = species[vni];
              if (vSid === foodId && SPECIES[vSid] && SPECIES[vSid].hungerMax) {
                hunger[vni] = Math.min(hunger[vni] + 3, (ctxEvoStats[vSid] || {} as any).hungerMax || 30);
              }
            }
          }
          // Deep Root
          const _drChance = sp.tier === 'herbivore' ? 0.15 : 0.35;
          if (preyTraits.indexOf('deeproot') !== -1 && Math.random() < _drChance * tStr(foodId, 'deeproot')) {
            hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac * 0.4) | 0));
            ate = true;
            break zHunt;
          }
          // Fortress Mode synergy
          if (hasSynergy(preySynergies, 'defence') && Math.random() < 0.6) {
            hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac * 0.3) | 0));
            ate = true;
            break zHunt;
          }
          // Armored
          if (preyTraits.indexOf('armored') !== -1 && Math.random() < 0.3 * tStr(foodId, 'armored')) {
            hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac * 0.4) | 0));
            ate = true;
            break zHunt;
          }
          // Rapid Regrowth
          if (preyTraits.indexOf('regrowth') !== -1) {
            let rg = 0;
            for (let rd = 0; rd < 4 && rg < 2; rd++) {
              const rdir = CARDINAL[rd];
              const rx = wrapX(nx + rdir[0], cw);
              const ry = wrapY(ny + rdir[1], ch);
              const ri = zOff + ry * cw + rx;
              if (species[ri] === 0) {
                species[ri] = foodId;
                hunger[ri] = 0;
                age[ri] = 0;
                processed[ri] = 1;
                rg++;
              }
            }
          }
          // Novel: Autotomy
          if (hasNovelAdapt(foodId, 'autotomy', ctxEvoStats) && Math.random() < 0.45) {
            hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac * 0.5) | 0));
            for (let ad = 0; ad < 4; ad++) {
              const adir = CARDINAL[ad];
              const ari = zOff + wrapY(ny + adir[1], ch) * cw + wrapX(nx + adir[0], cw);
              if (species[ari] === 0) {
                species[ari] = 3;
                age[ari] = 0;
                break;
              }
            }
            ate = true;
            break zHunt;
          }
          // Novel: Electric Organ on prey
          if (hasNovelAdapt(foodId, 'electricorgan', ctxEvoStats)) {
            hunger[idx] += 5;
          }
          // Novel: Jet Propulsion
          if (hasNovelAdapt(foodId, 'jetpropulsion', ctxEvoStats) && Math.random() < 0.3) {
            const jDir = CARDINAL[(Math.random() * 4) | 0];
            const jx = wrapX(nx + jDir[0] * 3, cw);
            const jy = wrapY(ny + jDir[1] * 3, ch);
            const ji = zOff + jy * cw + jx;
            if (species[ji] === 0) {
              species[ji] = foodId;
              hunger[ji] = hunger[ni];
              age[ji] = age[ni];
              species[ni] = 0;
              hunger[ni] = 0;
              age[ni] = 0;
              processed[ji] = 1;
            }
            continue;
          }
          if (onSpawnDeathParticles) onSpawnDeathParticles(ni, foodId);
          const _preySpec = SPECIES[foodId];
          // Producer regrowth: grazed plants have a chance to regrow nearby
          if (_preySpec && _preySpec.tier === 'producer' && Math.random() < 0.35) {
            const _rd = CARDINAL[(Math.random() * 4) | 0];
            const _rx = wrapX(nx + _rd[0], cw);
            const _ry = wrapY(ny + _rd[1], ch);
            const _ri = _ry * cw + _rx;
            if (species[_ri] === 0) {
              species[_ri] = foodId;
              hunger[_ri] = 0;
              age[_ri] = 0;
              processed[_ri] = 1;
            }
          }
          // Novel: Calcification
          if (hasNovelAdapt(foodId, 'calcification', ctxEvoStats) && Math.random() < 0.5) {
            species[ni] = 1;
            hunger[ni] = 0;
            age[ni] = 0;
          } else {
            species[ni] = 0;
            hunger[ni] = 0;
            age[ni] = 0;
          }
          // Streamlined bonus
          const streamBonus = hasTrait('streamlined') ? 1.15 * tStr(sid, 'streamlined') : 1;
          hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac * streamBonus) | 0));
          // Cooperative hunt: feed adjacent same-species allies
          if (hasTrait('cooperativehunt')) {
            const coopRestore = ((es.hungerMax * restoreFrac * 0.5 * tStr(sid, 'cooperativehunt')) | 0);
            for (let cn = 0; cn < 8; cn++) {
              const cdir = NEIGHBOURS_8[cn];
              const cni = zOff + wrapY(cy + cdir[1], ch) * cw + wrapX(cx + cdir[0], cw);
              if (species[cni] === sid) hunger[cni] = Math.max(0, hunger[cni] - coopRestore);
            }
          }
          processed[ni] = 1;
          ate = true;
          break zHunt;
        }
      }
    }
    }

    // Softshell / Dwarfism: same-tier species can eat vulnerable neighbours
    if (!ate && sp.hungerMax) {
      const nbrs2 = shuffleDirs8();
      for (let n = 0; n < 8 && !ate; n++) {
        const dir = NEIGHBOURS_8[nbrs2[n]];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ni = zOff + ny * cw + nx;
        const nSid = species[ni];
        if (nSid === 0 || nSid === sid) continue;
        const nSp = SPECIES[nSid];
        if (!nSp || !nSp.hungerMax) continue;
        const nEs = evo(nSid, evolveEnabled, ctxEvoStats) as any;
        const nTraits: string[] = nEs.traits || [];
        const vulnerable = nTraits.indexOf('softshell') !== -1 || nTraits.indexOf('dwarfism') !== -1;
        if (vulnerable && nSp.tier === sp.tier && layersCanReach(sid, nSp.layer)) {
          species[ni] = 0;
          hunger[ni] = 0;
          age[ni] = 0;
          hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac) | 0));
          processed[ni] = 1;
          ate = true;
        }
      }
    }

    // Bulk Feeder: megafauna eats up to 3 prey in one tick
    if (ate && hasTrait('bulkfeeder') && eats && eats.length) {
      let extraEats = 0;
      const nbrs3 = shuffleDirs8();
      for (let n = 0; n < 8 && extraEats < 2; n++) {
        const dir = NEIGHBOURS_8[nbrs3[n]];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ni = zOff + ny * cw + nx;
        if (eatsSet.indexOf(species[ni]) !== -1 && layersCanReach(sid, layerOf(species[ni]))) {
          species[ni] = 0;
          hunger[ni] = 0;
          age[ni] = 0;
          hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * 0.3) | 0));
          processed[ni] = 1;
          extraEats++;
        }
      }
    }

    if (!ate && hasTrait('lithivore')) {
      const _lithRestore = LITHIVORE_RESTORE_BY_TIER[sp.tier as LivingTier] ?? 0.45;
      const rdirs = shuffleDirs4();
      for (let d = 0; d < 4; d++) {
        const dir = CARDINAL[rdirs[d]];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ni = zOff + ny * cw + nx;
        if (species[ni] === 1) {
          species[ni] = 0;
          hunger[ni] = 0;
          age[ni] = 0;
          hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * _lithRestore) | 0));
          processed[ni] = 1;
          ate = true;
          break;
        }
      }
    }

    if (!ate && hasTrait('scavenger')) {
      const _scavRestore = SCAVENGE_RESTORE_BY_TIER[sp.tier as LivingTier] ?? 0.55;
      const _scavChance = sp.tier === 'megafauna' ? 0.3 : sp.tier === 'apex' ? 0.5 : sp.tier === 'consumer' ? 0.7 : 1.0;
      if (Math.random() < _scavChance) {
      const sdirs = shuffleDirs8();
      for (let d = 0; d < 8; d++) {
        const dir = NEIGHBOURS_8[sdirs[d]];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ni = zOff + ny * cw + nx;
        if (species[ni] === 3) {
          species[ni] = 0;
          hunger[ni] = 0;
          age[ni] = 0;
          hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * _scavRestore) | 0));
          processed[ni] = 1;
          ate = true;
          break;
        }
      }
      }
    }

    // Ambush: check 2-tile range on cardinal axes
    if (!ate && hasTrait('ambush') && eats && eats.length) {
      for (let d = 0; d < 4; d++) {
        const dir = CARDINAL[d];
        const nx = wrapX(cx + dir[0] * 2, cw);
        const ny = wrapY(cy + dir[1] * 2, ch);
        const ni = zOff + ny * cw + nx;
        const foodId = species[ni];
        if (eatsSet.indexOf(foodId) !== -1 && layersCanReach(sid, layerOf(foodId))) {
          const preyEs = evo(foodId, evolveEnabled, ctxEvoStats) as any;
          const aPT: string[] = preyEs.traits || [];
          if (aPT.indexOf('mimicry') !== -1 && Math.random() < 0.45) continue;
          if (aPT.indexOf('camouflage') !== -1 && Math.random() < 0.4) continue;
          if (aPT.indexOf('gigantism') !== -1 && Math.random() < 0.3) continue;
          if (aPT.indexOf('inkcloud') !== -1 && Math.random() < 0.5) {
            const tDir2 = CARDINAL[(Math.random() * 4) | 0];
            const tnx2 = wrapX(nx + tDir2[0] * 2, cw);
            const tny2 = wrapY(ny + tDir2[1] * 2, ch);
            const tni2 = tny2 * cw + tnx2;
            if (species[tni2] === 0) {
              species[tni2] = foodId;
              hunger[tni2] = hunger[ni];
              age[tni2] = age[ni];
              species[ni] = 0;
              hunger[ni] = 0;
              age[ni] = 0;
              processed[tni2] = 1;
            }
            continue;
          }
          if (aPT.indexOf('toxic') !== -1) hunger[idx] += 4;
          if (aPT.indexOf('thorns') !== -1) hunger[idx] += 7;
          if (aPT.indexOf('deeproot') !== -1 && Math.random() < 0.35) {
            hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac * 0.4) | 0));
            ate = true;
            break;
          }
          if (aPT.indexOf('armored') !== -1 && Math.random() < 0.3) {
            hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac * 0.4) | 0));
            ate = true;
            break;
          }
          if (aPT.indexOf('regrowth') !== -1) {
            let rg = 0;
            for (let rd = 0; rd < 4 && rg < 2; rd++) {
              const rdir = CARDINAL[rd];
              const rx = wrapX(nx + rdir[0], cw);
              const ry = wrapY(ny + rdir[1], ch);
              const ri = zOff + ry * cw + rx;
              if (species[ri] === 0) {
                species[ri] = foodId;
                hunger[ri] = 0;
                age[ri] = 0;
                processed[ri] = 1;
                rg++;
              }
            }
          }
          if (onSpawnDeathParticles) onSpawnDeathParticles(ni, foodId);
          species[ni] = 0;
          hunger[ni] = 0;
          age[ni] = 0;
          hunger[idx] = Math.max(0, hunger[idx] - ((es.hungerMax * restoreFrac) | 0));
          processed[ni] = 1;
          ate = true;
          break;
        }
      }
    }

    // Bioluminescent: attract prey within 3 tiles toward self
    if (hasTrait('bioluminesc') && eats && eats.length && Math.random() < 0.3) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (dx * dx + dy * dy > 9) continue;
          const px = wrapX(cx + dx, cw);
          const py = wrapY(cy + dy, ch);
          const pi = zOff + py * cw + px;
          if (eatsSet.indexOf(species[pi]) !== -1 && !processed[pi] && layersCanReach(sid, layerOf(species[pi]))) {
            const stepX = dx > 0 ? -1 : dx < 0 ? 1 : 0;
            const stepY = dy > 0 ? -1 : dy < 0 ? 1 : 0;
            const tnx = wrapX(px + stepX, cw);
            const tny = wrapY(py + stepY, ch);
            const tni = zOff + tny * cw + tnx;
            if (species[tni] === 0) {
              species[tni] = species[pi];
              hunger[tni] = hunger[pi];
              age[tni] = age[pi];
              species[pi] = 0;
              hunger[pi] = 0;
              age[pi] = 0;
              processed[tni] = 1;
            }
            break;
          }
        }
      }
    }

    // --- 4. Current sweep ---
    const curDir = currents[idx];
    if (curDir) {
      const cd = CARDINAL[curDir - 1];
      const sx = wrapX(cx + cd[0], cw);
      const sy = wrapY(cy + cd[1], ch);
      const si = zOff + sy * cw + sx;
      if (species[si] === 0) {
        species[si] = sid;
        hunger[si] = hunger[idx];
        age[si] = age[idx];
        species[idx] = 0;
        hunger[idx] = 0;
        age[idx] = 0;
        processed[si] = 1;
        continue; // swept -- skip voluntary movement
      }
    }

    // --- 5. Movement (with seasonal modifier) ---
    // Pressure slows movement at deeper layers
    const layerPressure = cz < LAYER_PRESSURE.length ? LAYER_PRESSURE[cz] : 1.0;
    let effectiveMoveRate = Math.min(0.98, es.moveRate * seasonMoveMult / layerPressure);
    if (hasTrait('streamlined')) effectiveMoveRate = Math.min(0.98, effectiveMoveRate * (1 + 0.3 * tStr(sid, 'streamlined')));
    const speedSyn = hasSynergy(synergies, 'speed');
    if (speedSyn) effectiveMoveRate = Math.min(0.98, effectiveMoveRate * speedSyn);

    if (Math.random() < effectiveMoveRate) {
      let moved = false;

      // Echolocation: directed movement toward nearest prey within 4 tiles
      if (!moved && hasTrait('echoloc') && eats && eats.length) {
        let bestDist = 999;
        let bestDx = 0;
        let bestDy = 0;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (dx === 0 && dy === 0) continue;
            const dist = dx * dx + dy * dy;
            if (dist > 16 || dist >= bestDist) continue;
            const px = wrapX(cx + dx, cw);
            const py = wrapY(cy + dy, ch);
            const echoSid = species[zOff + py * cw + px];
            if (eatsSet.indexOf(echoSid) !== -1 && layersCanReach(sid, layerOf(echoSid))) {
              bestDist = dist;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
        if (bestDist < 999) {
          const stepXE = bestDx > 0 ? 1 : bestDx < 0 ? -1 : 0;
          const stepYE = bestDy > 0 ? 1 : bestDy < 0 ? -1 : 0;
          const tnx = wrapX(cx + stepXE, cw);
          const tny = wrapY(cy + stepYE, ch);
          const tni = zOff + tny * cw + tnx;
          if (species[tni] === 0) {
            species[tni] = sid;
            hunger[tni] = hunger[idx];
            age[tni] = age[idx];
            species[idx] = 0;
            hunger[idx] = 0;
            age[idx] = 0;
            processed[tni] = 1;
            moved = true;
          }
        }
      }

      // Thermosensing: detect warm-blooded prey within 4 tiles
      if (!moved && hasTrait('thermosensing') && eats && eats.length) {
        let bestDist = 999;
        let bestDx = 0;
        let bestDy = 0;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (dx === 0 && dy === 0) continue;
            const dist = dx * dx + dy * dy;
            if (dist > 16 || dist >= bestDist) continue;
            const px = wrapX(cx + dx, cw);
            const py = wrapY(cy + dy, ch);
            const tsSid = species[zOff + py * cw + px];
            if (eatsSet.indexOf(tsSid) !== -1 && layersCanReach(sid, layerOf(tsSid))) {
              const tsTier = SPECIES[tsSid] && SPECIES[tsSid].tier;
              if (tsTier === 'consumer' || tsTier === 'apex' || tsTier === 'herbivore') {
                bestDist = dist;
                bestDx = dx;
                bestDy = dy;
              }
            }
          }
        }
        if (bestDist < 999) {
          const stepXT = bestDx > 0 ? 1 : bestDx < 0 ? -1 : 0;
          const stepYT = bestDy > 0 ? 1 : bestDy < 0 ? -1 : 0;
          const tnx = wrapX(cx + stepXT, cw);
          const tny = wrapY(cy + stepYT, ch);
          const tni = zOff + tny * cw + tnx;
          if (species[tni] === 0) {
            species[tni] = sid;
            hunger[tni] = hunger[idx];
            age[tni] = age[idx];
            species[idx] = 0;
            hunger[idx] = 0;
            age[idx] = 0;
            processed[tni] = 1;
            moved = true;
          }
        }
      }

      // Lateral line: detect movement within 3 tiles
      if (!moved && hasTrait('lateralline') && eats && eats.length) {
        let bestDist = 999;
        let bestDx = 0;
        let bestDy = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (dx === 0 && dy === 0) continue;
            const dist = dx * dx + dy * dy;
            if (dist > 9 || dist >= bestDist) continue;
            const px = wrapX(cx + dx, cw);
            const py = wrapY(cy + dy, ch);
            const llSid = species[zOff + py * cw + px];
            if (eatsSet.indexOf(llSid) !== -1 && layersCanReach(sid, layerOf(llSid))) {
              bestDist = dist;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
        if (bestDist < 999) {
          const stepXL = bestDx > 0 ? 1 : bestDx < 0 ? -1 : 0;
          const stepYL = bestDy > 0 ? 1 : bestDy < 0 ? -1 : 0;
          const tnx = wrapX(cx + stepXL, cw);
          const tny = wrapY(cy + stepYL, ch);
          const tni = zOff + tny * cw + tnx;
          if (species[tni] === 0) {
            species[tni] = sid;
            hunger[tni] = hunger[idx];
            age[tni] = age[idx];
            species[idx] = 0;
            hunger[idx] = 0;
            age[idx] = 0;
            processed[tni] = 1;
            moved = true;
          }
        }
      }

      // Novel: Electroreception: detect prey within 5 tiles
      if (!moved && hasNovelAdapt(sid, 'electroreception', ctxEvoStats) && eats && eats.length) {
        let bestDist = 999;
        let bestDx = 0;
        let bestDy = 0;
        for (let dy = -5; dy <= 5; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            if (dx === 0 && dy === 0) continue;
            const dist = dx * dx + dy * dy;
            if (dist > 25 || dist >= bestDist) continue;
            const px = wrapX(cx + dx, cw);
            const py = wrapY(cy + dy, ch);
            const erSid = species[zOff + py * cw + px];
            if (eatsSet.indexOf(erSid) !== -1 && layersCanReach(sid, layerOf(erSid))) {
              bestDist = dist;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
        if (bestDist < 999) {
          const stepXR = bestDx > 0 ? 1 : bestDx < 0 ? -1 : 0;
          const stepYR = bestDy > 0 ? 1 : bestDy < 0 ? -1 : 0;
          const tnx = wrapX(cx + stepXR, cw);
          const tny = wrapY(cy + stepYR, ch);
          const tni = zOff + tny * cw + tnx;
          if (species[tni] === 0) {
            species[tni] = sid;
            hunger[tni] = hunger[idx];
            age[tni] = age[idx];
            species[idx] = 0;
            hunger[idx] = 0;
            age[idx] = 0;
            processed[tni] = 1;
            moved = true;
          }
        }
      }

      // Stalker: move 2 tiles toward nearest prey
      if (!moved && hasTrait('stalker') && eats && eats.length) {
        let bestDist = 999;
        let bestDx = 0;
        let bestDy = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (dx === 0 && dy === 0) continue;
            const dist = dx * dx + dy * dy;
            if (dist > 9 || dist >= bestDist) continue;
            const px = wrapX(cx + dx, cw);
            const py = wrapY(cy + dy, ch);
            const stSid = species[zOff + py * cw + px];
            if (eatsSet.indexOf(stSid) !== -1 && layersCanReach(sid, layerOf(stSid))) {
              bestDist = dist;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
        if (bestDist < 999) {
          const s1x = bestDx > 0 ? 1 : bestDx < 0 ? -1 : 0;
          const s1y = bestDy > 0 ? 1 : bestDy < 0 ? -1 : 0;
          const m1x = wrapX(cx + s1x, cw);
          const m1y = wrapY(cy + s1y, ch);
          const m1i = zOff + m1y * cw + m1x;
          if (species[m1i] === 0) {
            const m2x = wrapX(m1x + s1x, cw);
            const m2y = wrapY(m1y + s1y, ch);
            const m2i = zOff + m2y * cw + m2x;
            const dest = species[m2i] === 0 ? m2i : m1i;
            species[dest] = sid;
            hunger[dest] = hunger[idx];
            age[dest] = age[idx];
            species[idx] = 0;
            hunger[idx] = 0;
            age[idx] = 0;
            processed[dest] = 1;
            moved = true;
          }
        }
      }

      // Random movement (fallback)
      if (!moved) {
        const dirs = shuffleDirs4();
        for (let d = 0; d < 4; d++) {
          const dir = CARDINAL[dirs[d]];
          const nx = wrapX(cx + dir[0], cw);
          const ny = wrapY(cy + dir[1], ch);
          const ni = zOff + ny * cw + nx;
          const targetSid = species[ni];

          if (targetSid === 0) {
            species[ni] = sid;
            hunger[ni] = hunger[idx];
            age[ni] = age[idx];
            species[idx] = 0;
            hunger[idx] = 0;
            age[idx] = 0;
            processed[ni] = 1;
            break;
          } else if (hasNovelAdapt(sid, 'flyingfish', ctxEvoStats) && Math.random() < 0.25) {
            // Flying Fish: leap over 1 occupied tile
            const fx = wrapX(nx + dir[0], cw);
            const fy = wrapY(ny + dir[1], ch);
            const fi = zOff + fy * cw + fx;
            if (species[fi] === 0) {
              species[fi] = sid;
              hunger[fi] = hunger[idx];
              age[fi] = age[idx];
              species[idx] = 0;
              hunger[idx] = 0;
              age[idx] = 0;
              processed[fi] = 1;
              break;
            }
          }
        }
      }
    }

    // --- 5b. Predation pressure vertical flight ---
    // Animals with a predator in their layer can flee to an adjacent z-layer.
    // Higher flightResponse gene increases the chance. This drives vertical
    // dispersal and layer diversity.
    if (species[idx] === sid && sp.hungerMax) {
      let predatorNearby = false;
      for (let n = 0; n < 8; n++) {
        const dir = NEIGHBOURS_8[n];
        const nSid = species[zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw)];
        if (nSid < 10) continue;
        const nEs = ctxEvoStats[nSid];
        const nEats = nEs ? nEs.eats : (SPECIES[nSid]?.eats as number[] | undefined);
        if (!nEats) continue;
        if (nEats.indexOf(sid) !== -1) { predatorNearby = true; break; }
      }
      if (predatorNearby) {
        const expressed = es._expressed || es;
        const flightGene = expressed.flightResponse ?? 0;
        const fleeChance = 0.04 + flightGene * 0.12;
        if (Math.random() < fleeChance) {
          // Try fleeing up or down (prefer direction away from more predators)
          const tryDirs = Math.random() < 0.5 ? [cz - 1, cz + 1] : [cz + 1, cz - 1];
          for (const targetZ of tryDirs) {
            if (targetZ < 0 || targetZ >= layers) continue;
            const destIdx = targetZ * planeSize + xyIdx;
            if (species[destIdx] === 0) {
              species[destIdx] = sid;
              hunger[destIdx] = hunger[idx];
              age[destIdx] = age[idx];
              species[idx] = 0;
              hunger[idx] = 0;
              age[idx] = 0;
              processed[destIdx] = 1;
              break;
            }
          }
        }
      }
    }

    // --- 6. Breed (with seasonal modifier) ---
    let breedRate = es.breedRate * seasonBreedMult;
    if (sp.tier === 'decomposer' && breedRate > DECOMPOSER_BREED_CAP) {
      breedRate = DECOMPOSER_BREED_CAP;
    }
    const _tierTotal = tierPops[sp.tier] || 0;
    if (_tierTotal > totalLiving * TIER_DOMINANCE_THRESHOLD) {
      breedRate *= TIER_DOMINANCE_BREED_PENALTY;
    }
    const _tierFrac = totalLiving > 0 ? _tierTotal / totalLiving : 0;
    if (_tierFrac < 0.02 && _tierFrac > 0) breedRate *= 2.0;
    else if (_tierFrac < 0.05 && _tierFrac > 0) breedRate *= 1.5;
    if (es.eats && es.eats.length > 0) {
      let hasLivePrey = false;
      for (let ei = 0; ei < es.eats.length; ei++) {
        const preyId = es.eats[ei];
        if (preyId !== 3 && (popCounts[preyId] || 0) > 0) {
          hasLivePrey = true;
          break;
        }
      }
      if (!hasLivePrey) breedRate *= DIETARY_POVERTY_PENALTY;
    }
    let sameAdjacentCount = 0;
    for (let n = 0; n < 8; n++) {
      const dir = NEIGHBOURS_8[n];
      const ni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
      if (species[ni] === sid) sameAdjacentCount++;
    }
    if (hasTrait('schooling') && sameAdjacentCount >= 3) breedRate *= 1 + 0.5 * tStr(sid, 'schooling');
    if (hasTrait('hypermetabolism')) breedRate *= 1 + 0.8 * tStr(sid, 'hypermetabolism');
    if (hasTrait('parentalinvest')) breedRate *= 0.7;
    const breedSyn = hasSynergy(synergies, 'breed');
    if (breedSyn) breedRate *= breedSyn;
    if (hasNovelAdapt(sid, 'neoteny', ctxEvoStats)) breedRate *= 1.5;
    if (hasNovelAdapt(sid, 'hivemind', ctxEvoStats) && sameAdjacentCount >= 4) breedRate *= 1.3;

    // Territorial
    if (hasTrait('territorial')) {
      if (sameAdjacentCount >= 4 && Math.random() < 0.3) {
        const tNbrs = shuffleDirs8();
        for (let tn = 0; tn < 8; tn++) {
          const tdir = NEIGHBOURS_8[tNbrs[tn]];
          const tni = zOff + wrapY(cy + tdir[1], ch) * cw + wrapX(cx + tdir[0], cw);
          if (species[tni] === sid) {
            species[tni] = 3;
            hunger[tni] = 0;
            age[tni] = 0;
            processed[tni] = 1;
            break;
          }
        }
      } else if (sameAdjacentCount <= 1) {
        breedRate *= 1 + 0.6 * tStr(sid, 'territorial');
      }
    }

    if (Math.random() < breedRate) {
      // Novel: Brood Parasite
      let broodDone = false;
      if (hasNovelAdapt(sid, 'broodparasite', ctxEvoStats) && Math.random() < 0.15) {
        const bNbrs = shuffleDirs8();
        for (let n = 0; n < 8; n++) {
          const dir = NEIGHBOURS_8[bNbrs[n]];
          const bni = zOff + wrapY(cy + dir[1], ch) * cw + wrapX(cx + dir[0], cw);
          const bsid = species[bni];
          if (bsid >= 10 && bsid !== sid && SPECIES[bsid] && SPECIES[bsid].tier === sp.tier) {
            species[bni] = sid;
            hunger[bni] = 0;
            age[bni] = 0;
            processed[bni] = 1;
            broodDone = true;
            break;
          }
        }
      }
      if (!broodDone) {
        let bred = false;
        const nbrs = shuffleDirs8();
        for (let n = 0; n < 8; n++) {
          const dir = NEIGHBOURS_8[nbrs[n]];
          const nx = wrapX(cx + dir[0], cw);
          const ny = wrapY(cy + dir[1], ch);
          const ni = zOff + ny * cw + nx;
          if (species[ni] === 0) {
            species[ni] = sid;
            hunger[ni] = (hasTrait('maternal') || hasTrait('parentalinvest'))
              ? 0
              : Math.min(hunger[idx], ((es.hungerMax * 0.3) | 0));
            age[ni] = 0;
            processed[ni] = 1;
            bred = true;
            // Novel: Budding
            if (hasNovelAdapt(sid, 'budding', ctxEvoStats) && Math.random() < 0.3) {
              for (let b = n + 1; b < 8; b++) {
                const bdir = NEIGHBOURS_8[nbrs[b]];
                const bnx = wrapX(cx + bdir[0], cw);
                const bny = wrapY(cy + bdir[1], ch);
                const bni = zOff + bny * cw + bnx;
                if (species[bni] === 0) {
                  species[bni] = sid;
                  hunger[bni] = 0;
                  age[bni] = 0;
                  processed[bni] = 1;
                  break;
                }
              }
            }
            break;
          }
        }
        // Overflow breeding: if same-layer is full, try placing offspring
        // into an adjacent z-layer at the same xy position
        if (!bred && species[idx] === sid) {
          const tryUp = cz + 1 < layers ? (cz + 1) * planeSize + xyIdx : -1;
          const tryDown = cz - 1 >= 0 ? (cz - 1) * planeSize + xyIdx : -1;
          const first = Math.random() < 0.5 ? tryUp : tryDown;
          const second = first === tryUp ? tryDown : tryUp;
          for (const dest of [first, second]) {
            if (dest < 0) continue;
            if (species[dest] === 0) {
              species[dest] = sid;
              hunger[dest] = Math.min(hunger[idx], ((es.hungerMax * 0.3) | 0));
              age[dest] = 0;
              processed[dest] = 1;
              break;
            }
          }
        }
      }
    }

    // --- 7. Competitive displacement ---
    if ((sp as any).parentId !== undefined && evolveEnabled && Math.random() < 0.06) {
      const parentId = (sp as any).parentId;
      const rootId = (sp as any).rootAncestor || parentId;
      const nbrs4 = shuffleDirs8();
      for (let n = 0; n < 8; n++) {
        const dir = NEIGHBOURS_8[nbrs4[n]];
        const nx = wrapX(cx + dir[0], cw);
        const ny = wrapY(cy + dir[1], ch);
        const ni = zOff + ny * cw + nx;
        const nSid = species[ni];
        if (nSid === parentId || nSid === rootId) {
          if (hunger[idx] < hunger[ni] || hunger[ni] > es.hungerMax * 0.5) {
            species[ni] = sid;
            hunger[ni] = 0;
            age[ni] = 0;
            processed[ni] = 1;
            break;
          }
        }
      }
    }
  }
  // =========================================================================
  // End of main entity loop
  // =========================================================================

  // Active volcanic vents: emit lava across multiple layers (cone eruption)
  for (let vi = activeVents.length - 1; vi >= 0; vi--) {
    const v = activeVents[vi];
    v.ticksLeft--;
    if (v.ticksLeft <= 0) {
      activeVents.splice(vi, 1);
      continue;
    }
    const emitCount = v.ticksLeft > 60 ? 3 : v.ticksLeft > 30 ? 2 : 1;
    for (let e = 0; e < emitCount; e++) {
      const a = v.angles[(Math.random() * v.angles.length) | 0] + (Math.random() - 0.5) * 0.8;
      const dist = v.coreR + 1 + ((Math.random() * 3) | 0);
      const lx = wrapX(v.x + Math.round(Math.cos(a) * dist), cw);
      const ly = wrapY(v.y + Math.round(Math.sin(a) * dist), ch);
      // Emit lava at a random layer, biased towards lower layers
      const emitZ = Math.min(layers - 1, ((Math.random() * Math.random() * layers) | 0));
      const li = emitZ * planeSize + ly * cw + lx;
      if (species[li] !== 1 && species[li] !== 7) {
        if (species[li] >= 10 && onSpawnDeathParticles) onSpawnDeathParticles(li, species[li]);
        species[li] = 7;
        hunger[li] = 0;
        age[li] = 0;
      }
    }
  }

  generation++;

  // Adaptive radiation: detect mass death events (>15% population loss in one gen)
  if (evolveEnabled) {
    let livingNow = 0;
    for (let i = 0; i < total; i++) {
      if (species[i] >= 10) livingNow++;
    }
    if (prevLivingCount > 0 && livingNow < prevLivingCount * 0.85) {
      radiationBoost = 5;
      addEvoEvent(history, generation, 'Mass extinction detected: adaptive radiation triggered!');
    }
    prevLivingCount = livingNow;
  }

  // Record population snapshots periodically
  if (evolveEnabled && generation % POP_SNAPSHOT_INTERVAL === 0) {
    recordPopSnapshot(history, species, total);
  }

  // Evolution: random trigger with cooldown
  if (evolveEnabled) {
    if (evoCooldown > 0) {
      evoCooldown--;
    } else if (history.popHistory.length >= 3 && Math.random() < EVO_CHANCE_PER_GEN) {
      if (ctx.onEvolve) ctx.onEvolve();
      if (ctx.onSpeciate) ctx.onSpeciate();
      if (ctx.onNicheShift) ctx.onNicheShift();
      if (ctx.onClearCreatureCache) ctx.onClearCreatureCache();
      lastEvoGen = generation;
      evoCooldown = EVO_COOLDOWN_MIN + ((Math.random() * (EVO_COOLDOWN_MAX - EVO_COOLDOWN_MIN)) | 0);
    }

    // Immigration: reintroduce species into empty tiers
    if (generation % 10 === 0) {
      if (ctx.onTierImmigration) ctx.onTierImmigration();
    }

    // Reassign prey for predators with empty food webs
    if (generation % 50 === 0) {
      if (ctx.onReassignPrey) ctx.onReassignPrey();
    }

    // Enforce gene variance floor on all species
    if (generation % 20 === 0) {
      if (ctx.onEnforceGeneVarianceFloor) ctx.onEnforceGeneVarianceFloor();
    }

    // Extinction cleanup: free slots for extinct evolved species
    if (generation % 50 === 0 && history.popHistory.length >= 2) {
      const now = history.popHistory[history.popHistory.length - 1];
      const prev = history.popHistory.length >= 2 ? history.popHistory[history.popHistory.length - 2] : {};
      const dynamicIds = getDynamicSpeciesIds().slice(); // snapshot to allow mutation
      for (let di = dynamicIds.length - 1; di >= 0; di--) {
        const did = dynamicIds[di];
        if ((now[did] || 0) === 0 && (prev[did] || 0) === 0) {
          const deadSp = SPECIES[did];
          if (deadSp) {
            (deadSp as any)._extinct = true;
          }
          const li = LIVING_IDS.indexOf(did);
          if (li !== -1) LIVING_IDS.splice(li, 1);
          removeDynamicSpeciesId(did);
          removeFromTierGroups(did);
          // Remove from all species' eats lists
          for (const oid of getLivingIds()) {
            if (ctxEvoStats[oid] && ctxEvoStats[oid].eats) {
              const ei = ctxEvoStats[oid].eats.indexOf(did);
              if (ei !== -1) ctxEvoStats[oid].eats.splice(ei, 1);
            }
          }
          addEvoEvent(history, generation, (deadSp ? deadSp.name : `Species ${did}`) + ' went extinct');
          addGraphEventMarker(history, generation, 'extinction', deadSp ? deadSp.name : `Species ${did}`);
        }
      }
    }
  }

  return {
    generation,
    radiationBoost,
    prevLivingCount,
    evoCooldown,
    lastEvoGen,
  };
}
