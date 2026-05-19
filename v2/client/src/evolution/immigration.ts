import type {
  EvoStats,
  GeneSet,
  PopSnapshot,
  SpeciesDefinition,
  LivingTier,
  GeneKey,
} from '../types';
import {
  GENE_KEYS,
  TIER_DEFAULT_GENES,
  MAX_DYNAMIC_SPECIES,
  IMMIGRATION_ESTABLISHMENT_TICKS,
  IMMIGRATION_SCALE_GENS,
  IMMIGRATION_MAX_CLUSTER,
} from '../constants';
import {
  SPECIES,
  getLivingIds,
  getDynamicSpeciesIds,
  allocateSpeciesId,
  registerSpecies,
  COLOR_RGB,
  addToTierGroup,
  removeFromTierGroups,
} from '../species/registry';
import {
  clamp,
  makeDiploidGene,
  expressAllGenes,
  cloneGenes,
  gaussRandom,
} from './genetics';
import { NOVEL_ADAPTATIONS, NOVEL_ADAPT_KEYS } from './novel-adaptations';
import { expressTraits, TRAITS } from './traits';
import type { SimHistory } from '../data/history';
import { addEvoEvent } from '../data/history';

export interface ImmigrationContext {
  evoStats: Record<number, EvoStats>;
  popHistory: PopSnapshot[];
  species: Uint8Array;
  hunger: Int16Array;
  age: Uint16Array;
  gridW: number;
  gridH: number;
  generation: number;
  maxTraitsPerSpecies: number;
  history: SimHistory;
}

const TIER_BASE_SPECIES: Record<string, number[]> = {
  producer:  [10, 11, 12],
  herbivore: [20, 21, 22, 23],
  consumer:  [30, 31, 32],
  apex:      [40, 41],
  megafauna: [42, 43],
  decomposer:[50, 51],
};

const IMMIGRATION_TIER_INTERVAL: Record<string, number> = {
  producer: 5, herbivore: 8, consumer: 6, apex: 6, megafauna: 10, decomposer: 15,
};

const IMMIGRATION_PREY_SEED: Record<string, number[]> = {
  herbivore: [10, 11],
  consumer:  [20, 21, 22],
  apex:      [30, 31, 32],
};

const IMMIGRATION_NAMES: Record<string, string[]> = {
  producer:   ['Floating', 'Pelagic', 'Drifting', 'Bloom', 'Spore'],
  herbivore:  ['Migratory', 'Pelagic', 'Drifting', 'Oceanic', 'Wayward'],
  consumer:   ['Roaming', 'Vagrant', 'Nomadic', 'Invasive', 'Colonist'],
  apex:       ['Ranging', 'Territorial', 'Dominant', 'Marauding', 'Alpha'],
  megafauna:  ['Wandering', 'Titan', 'Colossal', 'Deep-sea', 'Leviathan'],
  decomposer: ['Drifting', 'Benthic', 'Abyssal', 'Settling', 'Foreign'],
};

const IMMIGRATION_CHECK_INTERVAL = 150;
const IMMIGRATION_CLUSTER_SIZE = 20;

const CARDINAL: readonly [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const _tierEmptyGens: Record<string, number> = {
  producer: 0, herbivore: 0, consumer: 0, apex: 0, megafauna: 0, decomposer: 0,
};

export function getTierEmptyGens(): Record<string, number> {
  return { ..._tierEmptyGens };
}

export function setTierEmptyGens(data: Record<string, number>): void {
  for (const tier of Object.keys(_tierEmptyGens)) {
    _tierEmptyGens[tier] = data[tier] || 0;
  }
}

export function resetTierEmptyGens(): void {
  for (const tier of Object.keys(_tierEmptyGens)) {
    _tierEmptyGens[tier] = 0;
  }
}

function wrapX(x: number, gridW: number): number {
  return ((x % gridW) + gridW) % gridW;
}

function wrapY(y: number, gridH: number): number {
  return ((y % gridH) + gridH) % gridH;
}

export function createImmigrantSpecies(
  tier: LivingTier,
  ctx: ImmigrationContext,
): number | null {
  const { evoStats, popHistory, generation, maxTraitsPerSpecies, history } = ctx;
  const dynamicIds = getDynamicSpeciesIds();
  const livingIds = getLivingIds();

  if (dynamicIds.length >= MAX_DYNAMIC_SPECIES && popHistory.length >= 2) {
    const now = popHistory[popHistory.length - 1];
    const mutableDynamic = dynamicIds.slice();
    for (let di = mutableDynamic.length - 1; di >= 0; di--) {
      const did = mutableDynamic[di];
      if ((now[did] || 0) === 0) {
        (SPECIES[did] as any)._extinct = true;
        removeFromTierGroups(did);
      }
      if (getDynamicSpeciesIds().length < MAX_DYNAMIC_SPECIES) break;
    }
  }
  if (getDynamicSpeciesIds().length >= MAX_DYNAMIC_SPECIES) return null;

  const candidates = TIER_BASE_SPECIES[tier];
  if (!candidates || !candidates.length) return null;
  const templateId = candidates[(Math.random() * candidates.length) | 0];
  const templateSp = SPECIES[templateId];
  if (!templateSp) return null;

  const newId = allocateSpeciesId();
  if (newId < 0) return null;

  const tierGenes = TIER_DEFAULT_GENES[tier] || TIER_DEFAULT_GENES.herbivore;
  const genes = {} as GeneSet;
  const geneVar = {} as Record<GeneKey, number>;
  for (const g of GENE_KEYS) {
    const base = clamp(tierGenes[g] + gaussRandom() * 0.15, 0.08, 0.92);
    genes[g] = makeDiploidGene(base, gaussRandom() * 0.06);
    geneVar[g] = 0.10 + Math.random() * 0.08;
  }

  const namePool = IMMIGRATION_NAMES[tier] || ['Foreign'];
  const adj = namePool[(Math.random() * namePool.length) | 0];
  const existingNames = new Set(
    (livingIds as readonly number[]).map(id => SPECIES[id] ? SPECIES[id].name : ''),
  );
  let newName = adj + ' ' + templateSp.name;
  if (existingNames.has(newName)) {
    let suffix = 2;
    while (existingNames.has(newName + ' ' + suffix)) suffix++;
    newName = newName + ' ' + suffix;
  }

  const baseRGB = COLOR_RGB[templateId];
  const shift = () => Math.round((Math.random() - 0.5) * 80);
  const nr = clamp(baseRGB[0] + shift(), 20, 255);
  const ng = clamp(baseRGB[1] + shift(), 20, 255);
  const nb = clamp(baseRGB[2] + shift(), 20, 255);
  const newHex = '#' + ((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1).toUpperCase();

  const vigour = 1.05 + Math.random() * 0.15;
  const immExp = expressAllGenes(genes);
  const tmpBR = (templateSp.breedRate ?? 0) * (
    0.2 + immExp.fertility * 0.35 + immExp.metabolicRate * 0.25 +
    immExp.growthRate * 0.15 + (1 - immExp.bodySize) * 0.05
  ) * vigour;
  const tmpMR = templateSp.moveRate
    ? clamp(
        templateSp.moveRate * (
          0.3 + immExp.bodyShape * 0.25 + immExp.curiosity * 0.20 +
          (1 - immExp.bodySize) * 0.15 + (1 - immExp.bodyArmour) * 0.10
        ) * vigour,
        0.02,
        0.98,
      )
    : 0;
  const tmpHM = templateSp.hungerMax
    ? clamp(
        Math.round(
          templateSp.hungerMax * (
            0.2 + immExp.bodySize * 0.25 + immExp.hungerEfficiency * 0.25 +
            (1 - immExp.metabolicRate) * 0.20 + 0.10
          ) * vigour,
        ),
        6,
        80,
      )
    : 0;

  let newEats: number[] = templateSp.eats ? templateSp.eats.slice() : [];
  const liveTierSpecies = (livingIds as readonly number[]).filter(lid => {
    const lsp = SPECIES[lid];
    return lsp && lsp.tier && newEats.indexOf(lid) === -1;
  });

  if (tier === 'herbivore') {
    const prods = liveTierSpecies.filter(lid => SPECIES[lid].tier === 'producer');
    if (prods.length > 0) {
      for (let i = 0; i < Math.min(prods.length, 2); i++) {
        const pick = prods[(Math.random() * prods.length) | 0];
        if (newEats.indexOf(pick) === -1) newEats.push(pick);
      }
    }
  } else if (tier === 'consumer') {
    const herbs = liveTierSpecies.filter(lid => SPECIES[lid].tier === 'herbivore');
    for (let i = 0; i < Math.min(herbs.length, 2); i++) {
      const pick = herbs[(Math.random() * herbs.length) | 0];
      if (newEats.indexOf(pick) === -1) newEats.push(pick);
    }
  } else if (tier === 'apex') {
    const prey = liveTierSpecies.filter(lid => {
      const t = SPECIES[lid].tier;
      return t === 'consumer' || t === 'herbivore';
    });
    for (let i = 0; i < Math.min(prey.length, 3); i++) {
      const pick = prey[(Math.random() * prey.length) | 0];
      if (newEats.indexOf(pick) === -1) newEats.push(pick);
    }
  }

  const depth = 1 + ((Math.random() * 2) | 0);

  const newSpeciesDef: SpeciesDefinition & {
    parentId: null;
    rootAncestor: number;
    lineageDepth: number;
  } = {
    name: newName,
    color: newHex,
    tier: tier,
    layer: templateSp.layer,
    breedRate: templateSp.breedRate,
    moveRate: templateSp.moveRate || undefined,
    hungerMax: templateSp.hungerMax || undefined,
    eats: newEats.length ? newEats : undefined,
    desc: 'Immigrated from distant waters at gen ' + generation,
    parentId: null,
    rootAncestor: newId,
    lineageDepth: depth,
  };
  registerSpecies(newId, newSpeciesDef as any);
  COLOR_RGB[newId] = [nr, ng, nb];

  const novelAdapts: string[] = [];
  if (Math.random() < 0.35) {
    const eligible = NOVEL_ADAPT_KEYS.filter(k => NOVEL_ADAPTATIONS[k].eligible(tier));
    if (eligible.length > 0) {
      novelAdapts.push(eligible[(Math.random() * eligible.length) | 0]);
    }
  }

  evoStats[newId] = {
    breedRate: tmpBR,
    moveRate: tmpMR,
    hungerMax: tmpHM,
    eats: newEats.slice(),
    traits: [],
    traitAge: {},
    traitStrengths: {},
    _traitBitmask: 0,
    genes: genes,
    geneVar: geneVar,
    baseGenes: cloneGenes(genes),
    novelAdapts: novelAdapts,
  };

  expressTraits(
    SPECIES[newId],
    evoStats[newId],
    maxTraitsPerSpecies,
    expressAllGenes,
    (msg) => addEvoEvent(history, generation, msg),
  );

  addToTierGroup(newId, tier);

  for (const oid of livingIds) {
    if (oid === newId) continue;
    const osp = SPECIES[oid];
    if (!osp || !osp.eats) continue;
    if (osp.tier === tier) continue;
    const oe = evoStats[oid];
    if (!oe || !oe.eats) continue;
    for (const baseCandidate of candidates) {
      if (oe.eats.indexOf(baseCandidate) !== -1 && oe.eats.indexOf(newId) === -1) {
        oe.eats.push(newId);
        break;
      }
    }
  }

  return newId;
}

export function tierImmigration(ctx: ImmigrationContext): void {
  const {
    evoStats, popHistory, species, hunger, age,
    gridW, gridH, generation, history,
  } = ctx;

  if (popHistory.length < 2) return;
  const now = popHistory[popHistory.length - 1];
  const total = gridW * gridH;
  const livingIds = getLivingIds();

  const tierPop: Record<string, number> = {};
  for (const tid of livingIds) {
    const tsp = SPECIES[tid];
    if (!tsp) continue;
    const cnt = now[tid] || 0;
    tierPop[tsp.tier] = (tierPop[tsp.tier] || 0) + cnt;
  }

  for (const tier in _tierEmptyGens) {
    if ((tierPop[tier] || 0) > 0) {
      _tierEmptyGens[tier] = 0;
      continue;
    }
    _tierEmptyGens[tier]++;
    const interval = IMMIGRATION_TIER_INTERVAL[tier] || IMMIGRATION_CHECK_INTERVAL;
    if (_tierEmptyGens[tier] < interval) continue;
    const _emptyDuration = _tierEmptyGens[tier];
    _tierEmptyGens[tier] = 0;

    const newId = createImmigrantSpecies(tier as LivingTier, ctx);
    if (!newId) continue;
    const bsp = SPECIES[newId];

    let bestIdx = -1;
    let attempts = 0;
    while (bestIdx === -1 && attempts < 200) {
      const ri = (Math.random() * total) | 0;
      if (species[ri] === 0) {
        const rx = ri % gridW;
        const ry = (ri / gridW) | 0;
        let nearFood = false;
        for (let n = 0; n < 4; n++) {
          const dir = CARDINAL[n];
          const nsi = species[wrapY(ry + dir[1], gridH) * gridW + wrapX(rx + dir[0], gridW)];
          if (nsi >= 10 && SPECIES[nsi]) {
            nearFood = true;
            break;
          }
        }
        if (nearFood) bestIdx = ri;
      }
      attempts++;
    }
    if (bestIdx === -1) continue;

    const scaleFactor = Math.min(IMMIGRATION_MAX_CLUSTER, IMMIGRATION_CLUSTER_SIZE + Math.floor(_emptyDuration / IMMIGRATION_SCALE_GENS) * IMMIGRATION_CLUSTER_SIZE);
    const spreadRadius = scaleFactor <= 20 ? 2 : scaleFactor <= 40 ? 3 : 4;
    const hungerBuffer = -IMMIGRATION_ESTABLISHMENT_TICKS;

    const ox = bestIdx % gridW;
    const oy = (bestIdx / gridW) | 0;
    let placed = 0;
    for (let dy = -spreadRadius; dy <= spreadRadius && placed < scaleFactor; dy++) {
      for (let dx = -spreadRadius; dx <= spreadRadius && placed < scaleFactor; dx++) {
        const pi = wrapY(oy + dy, gridH) * gridW + wrapX(ox + dx, gridW);
        if (species[pi] === 0) {
          species[pi] = newId;
          hunger[pi] = hungerBuffer;
          age[pi] = 0;
          placed++;
        }
      }
    }

    if (placed > 0 && bsp) {
      const es = evoStats[newId];
      const traitNames = es.traits.length > 0
        ? ' [' + es.traits.map(t => TRAITS[t] ? TRAITS[t].name : t).join(', ') + ']'
        : '';
      const novelNames = es.novelAdapts.length > 0
        ? ' +' + es.novelAdapts.map(k => NOVEL_ADAPTATIONS[k].name).join(', ')
        : '';
      addEvoEvent(
        history,
        generation,
        bsp.name + ' immigrated (pre-adapted)! ' + placed + ' ind.' + traitNames + novelNames,
      );
    }

    const preyList = IMMIGRATION_PREY_SEED[tier];
    if (preyList && preyList.length) {
      const preyTier: LivingTier | null =
        tier === 'herbivore' ? 'producer' : tier === 'consumer' ? 'herbivore' : tier === 'apex' ? 'consumer' : null;
      let preyId: number | null = null;
      if (preyTier) {
        preyId = createImmigrantSpecies(preyTier, ctx);
      }
      if (!preyId) {
        preyId = preyList[(Math.random() * preyList.length) | 0];
      }
      const psp = SPECIES[preyId];
      if (psp) {
        let preyPlaced = 0;
        for (let dy = -3; dy <= 3 && preyPlaced < scaleFactor; dy++) {
          for (let dx = -3; dx <= 3 && preyPlaced < scaleFactor; dx++) {
            const pi = wrapY(oy + dy, gridH) * gridW + wrapX(ox + dx, gridW);
            if (species[pi] === 0) {
              species[pi] = preyId;
              hunger[pi] = hungerBuffer;
              age[pi] = 0;
              preyPlaced++;
            }
          }
        }
        if (preyPlaced > 0) {
          addEvoEvent(
            history,
            generation,
            psp.name + ' co-migrated with ' + SPECIES[newId].name + '! (' + preyPlaced + ' ind.)',
          );
        }
        if (evoStats[newId] && evoStats[newId].eats.indexOf(preyId) === -1) {
          evoStats[newId].eats.push(preyId);
        }
      }
    }
  }
}
