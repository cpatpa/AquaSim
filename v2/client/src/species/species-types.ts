import type { SpeciesDefinition, DisasterDefinition, Tier, LivingTier } from '../types';

export const SPECIES: Record<number, SpeciesDefinition> = {
  0:  { name: 'Empty',          color: '#0A1628', tier: 'none',        layer: -1 },
  1:  { name: 'Rock',           color: '#4A5A6A', tier: 'environment', layer: 0, desc: 'Impassable terrain blocker' },
  2:  { name: 'Current',        color: '#003D88', tier: 'environment', layer: -1, desc: 'Drag to paint — sweeps creatures in drag direction' },
  3:  { name: 'Dead',           color: '#8B7355', tier: 'transient',   layer: -1, desc: 'Decays to empty after 14 ticks' },
  4:  { name: 'Oil',            color: '#2A1800', tier: 'transient',   layer: 5, desc: 'Toxic sludge — spreads, kills life, then decays' },
  5:  { name: 'Ice',            color: '#AADDFF', tier: 'transient',   layer: -1, desc: 'Frozen water — blocks movement, thaws over time' },
  6:  { name: 'Toxic Bloom',    color: '#99FF00', tier: 'transient',   layer: 4, desc: 'Poisonous algae — damages non-toxic species, spreads' },
  7:  { name: 'Lava',           color: '#FF4400', tier: 'transient',   layer: 0, desc: 'Molten rock — kills on contact, cools into permanent rock' },
  10: { name: 'Phytoplankton',  color: '#00FF88', tier: 'producer',    layer: 4, breedRate: 0.20, desc: 'Fast-spreading surface producer' },
  11: { name: 'Seaweed',        color: '#00CC44', tier: 'producer',    layer: 1, breedRate: 0.06, desc: 'Slow-growing benthic plant, food for snails' },
  12: { name: 'Coral',          color: '#FF6EC7', tier: 'producer',    layer: 2, breedRate: 0.03, desc: 'Rare reef-builder, very slow growth' },
  20: { name: 'Shrimp',         color: '#FF9944', tier: 'herbivore',   layer: 2, breedRate: 0.10, moveRate: 0.70, hungerMax: 22, eats: [10],      desc: 'Reef-zone plankton grazer', layerReach: 2 },
  21: { name: 'Snail',          color: '#CC88FF', tier: 'herbivore',   layer: 1, breedRate: 0.06, moveRate: 0.22, hungerMax: 30, eats: [11, 3],   desc: 'Slow-moving seaweed consumer, scavenges dead' },
  22: { name: 'Crab',           color: '#FF5533', tier: 'herbivore',   layer: 1, breedRate: 0.06, moveRate: 0.42, hungerMax: 28, eats: [11, 3],   desc: 'Benthic omnivore - eats plants and dead matter' },
  23: { name: 'Sea Urchin',     color: '#BB4466', tier: 'herbivore',   layer: 2, breedRate: 0.035, moveRate: 0.18, hungerMax: 36, eats: [12],     desc: 'Slow reef grazer - the only coral predator' },
  30: { name: 'Small Fish',     color: '#44CCFF', tier: 'consumer',    layer: 3, breedRate: 0.06, moveRate: 0.85, hungerMax: 30, eats: [20, 3],   desc: 'Fast pelagic schooling fish — eats shrimp, scavenges', layerReach: 2 },
  31: { name: 'Squid',          color: '#AA44FF', tier: 'consumer',    layer: 3, breedRate: 0.04, moveRate: 0.62, hungerMax: 28, eats: [20, 21],  desc: 'Agile pelagic predator — dives deep for prey', layerReach: 3 },
  32: { name: 'Pufferfish',     color: '#FFEE22', tier: 'consumer',    layer: 2, breedRate: 0.035, moveRate: 0.38, hungerMax: 32, eats: [22, 21, 23], desc: 'Reef consumer of crabs, snails, urchins', layerReach: 2 },
  40: { name: 'Shark',          color: '#8899CC', tier: 'apex',        layer: 5, breedRate: 0.02, moveRate: 0.90, hungerMax: 50, eats: [30, 31, 32], desc: 'Top predator — hunts consumers across the column', layerReach: 4 },
  41: { name: 'Octopus',        color: '#CC3366', tier: 'apex',        layer: 1, breedRate: 0.02, moveRate: 0.58, hungerMax: 44, eats: [30, 31, 32], desc: 'Benthic apex — hunts consumers above', layerReach: 2 },
  42: { name: 'Whale',          color: '#6688AA', tier: 'megafauna',   layer: 4, breedRate: 0.008, moveRate: 0.30, hungerMax: 60, eats: [30, 31, 10, 3], desc: 'Filter feeder — eats consumers and plankton', layerReach: 5 },
  43: { name: 'Dolphin',        color: '#55BBEE', tier: 'megafauna',   layer: 5, breedRate: 0.012, moveRate: 0.92, hungerMax: 42, eats: [30, 31, 32], desc: 'Fast social hunter — hunts consumers', layerReach: 4 },
  50: { name: 'Bacteria',       color: '#88FFCC', tier: 'decomposer',  layer: 0, breedRate: 0.10, moveRate: 0.28, hungerMax: 32, eats: [3],       desc: 'Consumes dead matter in the abyss' },
  51: { name: 'Sea Worm',       color: '#DDBB44', tier: 'decomposer',  layer: 1, breedRate: 0.025, moveRate: 0.34, hungerMax: 30, eats: [3, 50],   desc: 'Benthic decomposer — feeds on dead cells and bacteria' },
};

export const DISASTERS: Record<string, DisasterDefinition> = {
  '-1': { name: 'Bomb',        color: '#FF4400', desc: 'Obliterates all life and terrain in blast radius' },
  '-2': { name: 'Oil Spill',   color: '#2A1800', desc: 'Toxic sludge that spreads, kills, and slowly decays' },
  '-3': { name: 'Heatwave',    color: '#FF8800', desc: 'Kills all animals in radius — plants survive' },
  '-4': { name: 'Ice Age',     color: '#AADDFF', desc: 'Freezing wave — Cold Adapted survive, ice thaws over time' },
  '-5': { name: 'Toxic Bloom', color: '#99FF00', desc: 'Poison algae — Toxic species immune & thrive, spreads and decays' },
  '-6': { name: 'Volcano',     color: '#FF4400', desc: 'Subsea eruption — lava spreads, cools to rock, reshapes terrain' },
};

export const TIER_ORDER: Array<{ label: string; ids: number[] }> = [
  { label: 'ENVIRONMENT', ids: [0, 1, 2] },
  { label: 'PRODUCERS',   ids: [10, 11, 12] },
  { label: 'HERBIVORES',  ids: [20, 21, 22, 23] },
  { label: 'CONSUMERS',   ids: [30, 31, 32] },
  { label: 'APEX',        ids: [40, 41] },
  { label: 'MEGAFAUNA',   ids: [42, 43] },
  { label: 'DECOMPOSERS', ids: [50, 51] },
];

export const TIER_TO_LABEL: Partial<Record<Tier, string>> = {
  producer: 'PRODUCERS',
  herbivore: 'HERBIVORES',
  consumer: 'CONSUMERS',
  apex: 'APEX',
  megafauna: 'MEGAFAUNA',
  decomposer: 'DECOMPOSERS',
};

export const TIER_PROMOTE: Partial<Record<LivingTier, LivingTier>> = {
  herbivore: 'consumer',
  consumer: 'apex',
  decomposer: 'herbivore',
  apex: 'megafauna',
};

export const TIER_PROMOTE_EXTENDED: Partial<Record<LivingTier, LivingTier[]>> = {
  producer:   ['herbivore'],
  herbivore:  ['consumer', 'apex'],
  consumer:   ['apex', 'megafauna'],
  decomposer: ['herbivore', 'consumer'],
  apex:       ['megafauna'],
};

export const BIO_TIERS: LivingTier[] = [
  'producer', 'herbivore', 'consumer', 'apex', 'megafauna', 'decomposer',
];

export const SEASON_COLORS: Record<string, string> = {
  Spring: '#88FF88',
  Summer: '#FFDD44',
  Autumn: '#FF8844',
  Winter: '#88CCFF',
};
