import type {
  GeneKey,
  GeneClusterName,
  EpistasisRule,
  SeasonModifiers,
  Season,
  LivingTier,
} from './types';

// Grid and rendering
export const CELL_SIZE = 8;
export const GRID_GAP = 1;
export const MIN_GRID_PX = 480;
export const MAX_GRID_PX = 3200;
export const MAX_PARTICLES = 300;
export const GRAPH_HISTORY_MAX = 200;
export const GRAPH_RECORD_INTERVAL = 2;

// Transient entity decay
export const DEAD_DECAY_AGE = 14;
export const DEAD_FOSSILIZE_AGE = 60;
export const OIL_SPREAD_RATE = 0.06;
export const OIL_SPREAD_MAX_AGE = 15;
export const OIL_DECAY_AGE = 40;
export const ICE_THAW_AGE = 60;
export const TOXIC_BLOOM_SPREAD = 0.08;
export const TOXIC_BLOOM_DECAY = 50;
export const LAVA_COOL_AGE = 40;
export const LAVA_SPREAD_MAX_AGE = 20;
export const LAVA_HEAT_RADIUS = 2;

// Feeding and survival
export const HUNGER_RESTORE_FRACTION = 0.65;
export const METABOLISM: Record<LivingTier, number> = {
  producer: 1.0,
  herbivore: 0.85,
  consumer: 0.8,
  apex: 0.5,
  megafauna: 0.45,
  decomposer: 0.9,
};
export const HUNGER_RESTORE_BY_TIER: Record<LivingTier, number> = {
  producer: 1.0,
  herbivore: 0.75,
  consumer: 0.70,
  apex: 0.85,
  megafauna: 0.90,
  decomposer: 0.65,
};

// Population control
export const DOMINANCE_THRESHOLD = 0.20;
export const DOMINANCE_DEATH_BASE = 0.02;
export const DOMINANCE_HARD_CAP = 0.35;
export const DECOMPOSER_BREED_CAP = 0.08;
export const SCAVENGE_RESTORE_BY_TIER: Partial<Record<LivingTier, number>> = {
  herbivore: 0.55,
  consumer: 0.50,
  apex: 0.30,
  megafauna: 0.25,
  decomposer: 0.55,
};
export const LITHIVORE_RESTORE_BY_TIER: Partial<Record<LivingTier, number>> = {
  herbivore: 0.45,
  decomposer: 0.20,
};
export const DIETARY_POVERTY_PENALTY = 0.50;
export const IMMIGRATION_CHECK_INTERVAL = 150;
export const IMMIGRATION_CLUSTER_SIZE = 20;
export const IMMIGRATION_SCALE_GENS = 50;
export const IMMIGRATION_MAX_CLUSTER = 80;
export const IMMIGRATION_ESTABLISHMENT_TICKS = 12;
export const ROCK_EROSION_CHANCE = 0.005;
export const ROCK_ISOLATED_EROSION_CHANCE = 0.012;
export const TIER_DOMINANCE_THRESHOLD = 0.40;
export const TIER_DOMINANCE_BREED_PENALTY = 0.50;
export const GENE_VARIANCE_FLOOR = 0.06;

// Evolution
export const EVO_CHANCE_PER_GEN = 0.18;
export const EVO_COOLDOWN_MIN = 3;
export const EVO_COOLDOWN_MAX = 9;
export const EVO_MUTATION_RATE = 0.12;
export const EVO_HISTORY_LEN = 10;
export const OVERPOP_THRESHOLD = 2.5;
export const PRESSURE_HIGH = 1.5;
export const POP_SNAPSHOT_INTERVAL = 10;

// Speciation
export const SPECIATION_MIN_POP = 20;
export const SPECIATION_DRIFT = 0.12;
export const SPECIATION_CHANCE = 0.50;
export const SPECIATION_CONVERT = 0.35;
export const MAX_DYNAMIC_SPECIES = 40;

// Traits
export const TRAIT_ACQUIRE_CHANCE = 0.12;
export const DEFAULT_MAX_TRAITS_PER_SPECIES = 5;
export const TRAIT_DEGRADE_GENS = 4;
export const TRAIT_LOCAL_RADIUS = 8;

// Novel adaptations
export const NOVEL_ADAPT_CHANCE = 0.02;
export const MAX_NOVEL_ADAPTS = 2;

// Genetics
export const GENE_MUTATION_SD = 0.05;

export const GENE_KEYS: readonly GeneKey[] = [
  'bodySize', 'bodyArmour', 'bodyShape', 'pigment',
  'metabolicRate', 'fertility', 'hungerEfficiency', 'growthRate',
  'aggression', 'sociality', 'curiosity', 'flightResponse',
  'visionRange', 'chemosensory', 'thermalAdapt', 'pressureAdapt',
] as const;

export const GENE_CLUSTERS: Record<GeneClusterName, readonly GeneKey[]> = {
  Morphology: ['bodySize', 'bodyArmour', 'bodyShape', 'pigment'],
  Metabolism: ['metabolicRate', 'fertility', 'hungerEfficiency', 'growthRate'],
  Behaviour: ['aggression', 'sociality', 'curiosity', 'flightResponse'],
  Sensory: ['visionRange', 'chemosensory', 'thermalAdapt', 'pressureAdapt'],
};

export const GENE_CLUSTER_OF: Record<GeneKey, GeneClusterName> = {} as Record<GeneKey, GeneClusterName>;
for (const cl of Object.keys(GENE_CLUSTERS) as GeneClusterName[]) {
  for (const g of GENE_CLUSTERS[cl]) {
    GENE_CLUSTER_OF[g] = cl;
  }
}

export const GENE_NAMES: Record<GeneKey, string> = {
  bodySize: 'Body Size', bodyArmour: 'Armour', bodyShape: 'Streamline', pigment: 'Pigment',
  metabolicRate: 'Metabolism', fertility: 'Fertility', hungerEfficiency: 'Efficiency', growthRate: 'Growth',
  aggression: 'Aggression', sociality: 'Sociality', curiosity: 'Curiosity', flightResponse: 'Flight Resp.',
  visionRange: 'Vision', chemosensory: 'Chemosense', thermalAdapt: 'Thermal', pressureAdapt: 'Pressure',
};

export const GENE_COLORS: Record<GeneKey, string> = {
  bodySize: '#AACCEE', bodyArmour: '#AAAACC', bodyShape: '#44CCFF', pigment: '#FFAACC',
  metabolicRate: '#FF8844', fertility: '#44FF88', hungerEfficiency: '#FFAA44', growthRate: '#88FF44',
  aggression: '#FF4466', sociality: '#CC88FF', curiosity: '#44DDFF', flightResponse: '#FFDD44',
  visionRange: '#88EEFF', chemosensory: '#88FFCC', thermalAdapt: '#FF8866', pressureAdapt: '#6688CC',
};

export const EPISTASIS: EpistasisRule[] = [
  { from: 'bodySize', to: 'bodyArmour', fn: (s, a) => a * (0.7 + s * 0.6) },
  { from: 'bodySize', to: 'curiosity', fn: (s, c) => c * (1.3 - s * 0.6) },
  { from: 'metabolicRate', to: 'fertility', fn: (m, f) => f * (0.5 + m * 0.8) },
  { from: 'aggression', to: 'sociality', fn: (a, s) => s * (1.2 - a * 0.5) },
  { from: 'bodyShape', to: 'bodyArmour', fn: (sh, a) => a * (0.5 + sh * 0.8) },
];

export const TIER_DEFAULT_GENES: Record<LivingTier, Record<GeneKey, number>> = {
  producer: { bodySize: 0.35, bodyArmour: 0.25, bodyShape: 0.20, pigment: 0.50, metabolicRate: 0.30, fertility: 0.55, hungerEfficiency: 0.50, growthRate: 0.60, aggression: 0.05, sociality: 0.30, curiosity: 0.10, flightResponse: 0.10, visionRange: 0.05, chemosensory: 0.40, thermalAdapt: 0.40, pressureAdapt: 0.40 },
  herbivore: { bodySize: 0.35, bodyArmour: 0.35, bodyShape: 0.45, pigment: 0.40, metabolicRate: 0.45, fertility: 0.55, hungerEfficiency: 0.50, growthRate: 0.50, aggression: 0.15, sociality: 0.45, curiosity: 0.40, flightResponse: 0.55, visionRange: 0.30, chemosensory: 0.35, thermalAdapt: 0.40, pressureAdapt: 0.35 },
  consumer: { bodySize: 0.40, bodyArmour: 0.22, bodyShape: 0.55, pigment: 0.35, metabolicRate: 0.50, fertility: 0.32, hungerEfficiency: 0.40, growthRate: 0.40, aggression: 0.50, sociality: 0.28, curiosity: 0.50, flightResponse: 0.30, visionRange: 0.45, chemosensory: 0.30, thermalAdapt: 0.40, pressureAdapt: 0.40 },
  apex: { bodySize: 0.55, bodyArmour: 0.30, bodyShape: 0.60, pigment: 0.30, metabolicRate: 0.45, fertility: 0.20, hungerEfficiency: 0.45, growthRate: 0.30, aggression: 0.60, sociality: 0.18, curiosity: 0.45, flightResponse: 0.20, visionRange: 0.55, chemosensory: 0.35, thermalAdapt: 0.40, pressureAdapt: 0.45 },
  megafauna: { bodySize: 0.75, bodyArmour: 0.35, bodyShape: 0.45, pigment: 0.30, metabolicRate: 0.35, fertility: 0.15, hungerEfficiency: 0.55, growthRate: 0.20, aggression: 0.45, sociality: 0.45, curiosity: 0.35, flightResponse: 0.15, visionRange: 0.50, chemosensory: 0.40, thermalAdapt: 0.45, pressureAdapt: 0.50 },
  decomposer: { bodySize: 0.25, bodyArmour: 0.15, bodyShape: 0.30, pigment: 0.30, metabolicRate: 0.55, fertility: 0.50, hungerEfficiency: 0.45, growthRate: 0.55, aggression: 0.10, sociality: 0.35, curiosity: 0.30, flightResponse: 0.20, visionRange: 0.15, chemosensory: 0.50, thermalAdapt: 0.40, pressureAdapt: 0.35 },
};

// Niche shifting
export const NICHE_SHIFT_MIN_DEPTH = 1;
export const NICHE_SHIFT_MIN_DRIFT = 0.35;
export const NICHE_SHIFT_CHANCE = 0.15;
export const EMPTY_NICHE_THRESHOLD = 0.03;
export const EMPTY_NICHE_SHIFT_BOOST = 0.40;
export const EMPTY_NICHE_MIN_DRIFT = 0.08;
export const SELF_PREDATION_CHANCE = 0.18;

// Seasons
export const SEASON_LENGTH = 80;
export const SEASONS: readonly Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export const SEASON_MODS: Record<Season, SeasonModifiers> = {
  Spring: { breedMult: 1.3, hungerMult: 0.9, moveMult: 1.0, producerBreedMult: 1.5 },
  Summer: { breedMult: 1.1, hungerMult: 1.0, moveMult: 1.1, producerBreedMult: 1.0 },
  Autumn: { breedMult: 0.8, hungerMult: 1.2, moveMult: 0.9, producerBreedMult: 0.7 },
  Winter: { breedMult: 0.5, hungerMult: 1.4, moveMult: 0.7, producerBreedMult: 0.4 },
};

// Directions
export const CARDINAL: readonly [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const NEIGHBOURS_8: readonly [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

// Layer names (6 depth zones from deepest to shallowest)
export const LAYER_NAMES = ['Abyssal', 'Benthic', 'Reef', 'Pelagic', 'Surface', 'Canopy'] as const;
export const LAYER_COLORS = ['#334466', '#886644', '#44AA88', '#4488CC', '#88CCFF', '#AAEEFF'] as const;
export const LAYER_COUNT = 6;

// Per-layer environmental modifiers (indexed z=0..5: Abyssal to Canopy)
export const LAYER_LIGHT =       [0.05, 0.15, 0.40, 0.65, 0.90, 1.00] as const;
export const LAYER_TEMPERATURE = [0.60, 0.70, 0.85, 0.90, 1.00, 1.00] as const;
export const LAYER_PRESSURE =    [1.40, 1.20, 1.00, 0.90, 0.80, 0.70] as const;
