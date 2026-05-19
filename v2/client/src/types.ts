export type Tier =
  | 'none'
  | 'environment'
  | 'transient'
  | 'producer'
  | 'herbivore'
  | 'consumer'
  | 'apex'
  | 'megafauna'
  | 'decomposer';

export type LivingTier = Exclude<Tier, 'none' | 'environment' | 'transient'>;

export type Layer = -1 | 0 | 1 | 2 | 3 | 4 | 5;

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type GeneKey =
  | 'bodySize' | 'bodyArmour' | 'bodyShape' | 'pigment'
  | 'metabolicRate' | 'fertility' | 'hungerEfficiency' | 'growthRate'
  | 'aggression' | 'sociality' | 'curiosity' | 'flightResponse'
  | 'visionRange' | 'chemosensory' | 'thermalAdapt' | 'pressureAdapt';

export type GeneClusterName = 'Morphology' | 'Metabolism' | 'Behaviour' | 'Sensory';

export interface DiploidGene {
  a1: number;
  a2: number;
  dom: number;
}

export type Gene = DiploidGene | number;

export type GeneSet = Record<GeneKey, Gene>;
export type ExpressedGenes = Record<GeneKey, number>;

export interface SpeciesDefinition {
  name: string;
  color: string;
  tier: Tier;
  layer: Layer;
  desc?: string;
  breedRate?: number;
  moveRate?: number;
  hungerMax?: number;
  eats?: number[];
  layerReach?: number;
}

export interface EvoStats {
  breedRate: number;
  moveRate: number;
  hungerMax: number;
  eats: number[];
  traits: string[];
  traitAge: Record<string, number>;
  traitStrengths: Record<string, number>;
  _traitBitmask: number;
  genes: GeneSet;
  geneVar: Record<GeneKey, number>;
  baseGenes: GeneSet;
  novelAdapts: string[];
  _expressed?: ExpressedGenes;
}

export interface TraitDefinition {
  name: string;
  icon: string;
  desc: string;
  eligible: (tier: Tier) => boolean;
}

export interface TraitPolygenicReq {
  requires: Array<{ g: GeneKey; min: number }>;
  inhibits: Array<{ g: GeneKey; max: number }>;
  strength: (expressed: ExpressedGenes) => number;
}

export interface NovelAdaptation {
  name: string;
  icon: string;
  desc: string;
  eligible: (tier: Tier) => boolean;
}

export interface NovelGeneReq {
  g: GeneKey;
  min: number;
}

export interface EpistasisRule {
  from: GeneKey;
  to: GeneKey;
  fn: (fromVal: number, toVal: number) => number;
}

export interface TraitSynergy {
  traits: string[];
  name: string;
  bonus: string;
  mult: number;
}

export interface DisasterDefinition {
  name: string;
  color: string;
  desc: string;
}

export interface SeasonModifiers {
  breedMult: number;
  hungerMult: number;
  moveMult: number;
  producerBreedMult: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  life: number;
}

export interface PopSnapshot {
  [speciesId: number]: number;
}

export interface EvoLogEntry {
  generation: number;
  message: string;
}

export interface GridState {
  width: number;
  height: number;
  species: Uint8Array;
  hunger: Int16Array;
  age: Uint16Array;
  currents: Uint8Array;
  cellNoise: Float32Array;
  cellNoise2: Float32Array;
}

export interface SimConfig {
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  gridGap: number;
  evolveEnabled: boolean;
  tickInterval: number;
  maxTraitsPerSpecies: number;
  mutationRateMult: number;
  speciationRateMult: number;
}
