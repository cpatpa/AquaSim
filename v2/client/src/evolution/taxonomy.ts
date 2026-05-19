import type { GeneKey, GeneSet } from '../types';
import { GENE_KEYS } from '../constants';
import { geneVal } from './genetics';
import { SPECIES } from '../species/registry';

export const GENUS_TABLE: Record<number, string> = {
  10: 'Phytoplanktos',
  11: 'Fucus',
  12: 'Corallium',
  20: 'Caridea',
  21: 'Gastropoda',
  22: 'Brachyura',
  23: 'Echinoidea',
  30: 'Piscis',
  31: 'Teuthida',
  32: 'Tetraodontidae',
  40: 'Carcharias',
  41: 'Octopoda',
  42: 'Balaenoptera',
  43: 'Delphinus',
  50: 'Bacterium',
  51: 'Polychaeta',
  60: 'Medusozoa',      // Jellyfish
  61: 'Chelonia',       // Sea Turtle
  62: 'Mobula',         // Manta Ray
  63: 'Lophius',        // Anglerfish
  64: 'Hippocampus',    // Sea Horse
  65: 'Laminaria',      // Kelp
  66: 'Actinia',        // Anemone
  67: 'Asteroidea',     // Starfish
};

interface EpithetRule {
  gene: GeneKey;
  ranges: Array<{ max: number; epithet: string }>;
}

const EPITHET_RULES: EpithetRule[] = [
  {
    gene: 'bodySize',
    ranges: [
      { max: 0.25, epithet: 'minimus' },
      { max: 0.40, epithet: 'parvus' },
      { max: 0.60, epithet: 'mediocris' },
      { max: 0.80, epithet: 'magnus' },
      { max: Infinity, epithet: 'maximus' },
    ],
  },
  {
    gene: 'bodyShape',
    ranges: [
      { max: 0.30, epithet: 'tardus' },
      { max: 0.50, epithet: 'moderatus' },
      { max: Infinity, epithet: 'velox' },
    ],
  },
  {
    gene: 'aggression',
    ranges: [
      { max: 0.30, epithet: 'placidus' },
      { max: 0.50, epithet: 'audax' },
      { max: Infinity, epithet: 'ferox' },
    ],
  },
  {
    gene: 'pressureAdapt',
    ranges: [
      { max: 0.60, epithet: 'mediocris' },
      { max: Infinity, epithet: 'profundus' },
    ],
  },
  {
    gene: 'thermalAdapt',
    ranges: [
      { max: 0.60, epithet: 'mediocris' },
      { max: Infinity, epithet: 'calidus' },
    ],
  },
  {
    gene: 'sociality',
    ranges: [
      { max: 0.60, epithet: 'mediocris' },
      { max: Infinity, epithet: 'gregarius' },
    ],
  },
  {
    gene: 'pigment',
    ranges: [
      { max: 0.70, epithet: 'mediocris' },
      { max: Infinity, epithet: 'splendidus' },
    ],
  },
];

// Special epithets derived from trait-like conditions rather than simple gene ranges
interface SpecialEpithetRule {
  epithet: string;
  test: (genes: Record<GeneKey, number>, traits: string[]) => boolean;
  priority: number;
}

const SPECIAL_EPITHETS: SpecialEpithetRule[] = [
  {
    epithet: 'vorax',
    test: (g) => g.hungerEfficiency > 0.70,
    priority: 0.8,
  },
  {
    epithet: 'armatus',
    test: (g) => g.bodyArmour > 0.70,
    priority: 0.8,
  },
  {
    epithet: 'invisibilis',
    test: (g) => g.pigment < 0.20 && g.flightResponse > 0.60,
    priority: 0.9,
  },
  {
    epithet: 'luminosus',
    test: (_g, traits) => traits.includes('bioluminesc'),
    priority: 1.0,
  },
  {
    epithet: 'venenatus',
    test: (_g, traits) => traits.includes('venomous') || traits.includes('venom'),
    priority: 1.0,
  },
  {
    epithet: 'regalis',
    test: (_g, _traits) => false, // handled separately via tier check
    priority: 0.0,
  },
];

function resolveEpithetFromRanges(rule: EpithetRule, value: number): string {
  for (const range of rule.ranges) {
    if (value < range.max || range.max === Infinity) {
      return range.epithet;
    }
  }
  return rule.ranges[rule.ranges.length - 1].epithet;
}

function findRootSpeciesId(speciesId: number): number {
  if (speciesId < 100) return speciesId;

  // Dynamic species (id >= 100) inherit the genus of their base species.
  // The base species is encoded in the species definition's eats or tier.
  // Walk the registry to find a matching base genus.
  const sp = SPECIES[speciesId];
  if (!sp) return speciesId;

  // Try to find the closest base species by tier
  const tier = sp.tier;
  for (const baseId of Object.keys(GENUS_TABLE).map(Number)) {
    const baseSp = SPECIES[baseId];
    if (baseSp && baseSp.tier === tier) return baseId;
  }

  return speciesId;
}

function getTierDefaultForGene(speciesId: number, _gene: GeneKey): number {
  const sp = SPECIES[speciesId];
  if (!sp) return 0.5;

  const tierMidpoints: Record<string, number> = {
    producer: 0.35, herbivore: 0.40, consumer: 0.40,
    apex: 0.40, megafauna: 0.40, decomposer: 0.35,
  };
  return tierMidpoints[sp.tier] ?? 0.5;
}

export function getBaseScientificName(speciesId: number): string {
  const genus = GENUS_TABLE[speciesId];
  if (!genus) return 'Incognita species';
  return genus + ' ' + 'vulgaris';
}

export function getScientificName(
  speciesId: number,
  genes?: GeneSet | null,
  traits?: string[],
): string {
  const rootId = findRootSpeciesId(speciesId);
  const genus = GENUS_TABLE[rootId];
  if (!genus) return 'Incognita species';

  if (!genes) return genus + ' vulgaris';

  const expressed: Record<GeneKey, number> = {} as Record<GeneKey, number>;
  for (const g of GENE_KEYS) {
    expressed[g] = geneVal(genes[g] ?? 0.5);
  }

  const safeTraits = traits ?? [];

  // Check special epithets first
  for (const special of SPECIAL_EPITHETS) {
    if (special.priority >= 1.0 && special.test(expressed, safeTraits)) {
      return genus + ' ' + special.epithet;
    }
  }

  // Check for regalis: apex or megafauna tier
  const sp = SPECIES[speciesId];
  if (sp && (sp.tier === 'apex' || sp.tier === 'megafauna')) {
    // Only apply regalis if the species is notably large
    if (expressed.bodySize > 0.65) {
      return genus + ' regalis';
    }
  }

  // Check high-priority special epithets (non-trait based)
  for (const special of SPECIAL_EPITHETS) {
    if (special.priority >= 0.8 && special.priority < 1.0 && special.test(expressed, safeTraits)) {
      return genus + ' ' + special.epithet;
    }
  }

  // Standard epithet selection: pick the gene with the highest deviation from the tier default
  let bestDeviation = -1;
  let bestEpithet = 'vulgaris';

  for (const rule of EPITHET_RULES) {
    const val = expressed[rule.gene];
    const baseline = getTierDefaultForGene(rootId, rule.gene);
    const deviation = Math.abs(val - baseline);

    const epithet = resolveEpithetFromRanges(rule, val);
    // Skip the generic 'mediocris' result since it is uninformative
    if (epithet === 'mediocris') continue;

    if (deviation > bestDeviation) {
      bestDeviation = deviation;
      bestEpithet = epithet;
    }
  }

  return genus + ' ' + bestEpithet;
}
