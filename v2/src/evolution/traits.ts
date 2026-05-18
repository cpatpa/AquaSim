import type {
  TraitDefinition,
  TraitPolygenicReq,
  TraitSynergy,
  SpeciesDefinition,
  EvoStats,
  GeneSet,
  ExpressedGenes,
} from '../types';

export const TRAITS: Record<string, TraitDefinition> = {
  camouflage:  { name: 'Camouflage',   icon: '~', desc: 'Predators have 40% miss chance',           eligible: t => t !== 'producer' && t !== 'apex' },
  toxic:       { name: 'Toxic',         icon: '!', desc: 'Predator takes hunger damage when eating', eligible: t => t === 'producer' || t === 'herbivore' || t === 'decomposer' },
  schooling:   { name: 'Schooling',     icon: '#', desc: '+50% breed rate near 3+ same species',     eligible: t => t !== 'producer' && t !== 'apex' },
  shell:       { name: 'Shell',         icon: '@', desc: '+40% hunger tolerance, -30% move speed',   eligible: t => t === 'herbivore' || t === 'consumer' },
  ambush:      { name: 'Ambush',        icon: '^', desc: '2-tile attack range on cardinal axes',     eligible: t => t === 'consumer' || t === 'apex' },
  symbiosis:   { name: 'Symbiosis',     icon: '+', desc: 'Heals hunger near producers',              eligible: t => t === 'herbivore' || t === 'decomposer' },
  bioluminesc: { name: 'Bioluminescent', icon: '*', desc: 'Attracts prey within 3 tiles',            eligible: t => t === 'consumer' || t === 'apex' },
  spore:       { name: 'Spore Burst',   icon: '%', desc: 'Can spread 2 tiles away',                  eligible: t => t === 'producer' },
  lithivore:   { name: 'Lithivore',     icon: '&', desc: 'Can eat rock — clears terrain, restores hunger', eligible: t => t === 'herbivore' || t === 'decomposer' },
  thorns:      { name: 'Thorns',        icon: '/', desc: 'Predators take heavy hunger penalty when grazing', eligible: t => t === 'producer' },
  deeproot:    { name: 'Deep Root',     icon: 'r', desc: '35% chance to survive being eaten',               eligible: t => t === 'producer' },
  regrowth:    { name: 'Rapid Regrowth', icon: 'g', desc: 'When eaten, spreads to 2 adjacent empty tiles', eligible: t => t === 'producer' },
  softshell:   { name: 'Soft Shell',    icon: 's', desc: 'Vulnerable phase — same-tier species can consume this creature', eligible: t => t === 'herbivore' },
  coldadapt:   { name: 'Cold Adapted',  icon: '❄', desc: 'Thrives in winter — no breed/speed penalty in cold seasons', eligible: () => true },
  warmadapt:   { name: 'Warm Adapted',  icon: '☀', desc: 'Thrives in summer — bonus breed rate in warm seasons', eligible: () => true },
  migratory:   { name: 'Migratory',     icon: '→', desc: 'Moves faster during seasonal transitions', eligible: t => t === 'megafauna' || t === 'consumer' || t === 'apex' },
  bulkfeeder:  { name: 'Bulk Feeder',   icon: 'B', desc: 'Eats up to 3 prey per tick in adjacent cells', eligible: t => t === 'megafauna' },
  echoloc:     { name: 'Echolocation',  icon: '◎', desc: 'Detects prey within 4 tiles, moves toward nearest', eligible: t => t === 'megafauna' },
  poddefense:  { name: 'Pod Defense',   icon: '⊕', desc: 'Predators have 50% miss chance when 2+ same species nearby', eligible: t => t === 'megafauna' },
  packhunter:  { name: 'Pack Hunter',   icon: 'P', desc: 'Ignores camouflage and pod defense when 2+ allies adjacent to prey', eligible: t => t === 'consumer' || t === 'apex' },
  venomous:    { name: 'Venomous',      icon: 'V', desc: 'Prey takes 3 hunger damage even if hunt fails; successful kills poison area', eligible: t => t === 'consumer' || t === 'apex' },
  stalker:     { name: 'Stalker',       icon: '▸', desc: 'Moves 2 tiles toward nearest prey per tick instead of 1', eligible: t => t === 'consumer' || t === 'apex' },
  trapjaw:     { name: 'Trap Jaw',      icon: 'J', desc: 'First attack each tick is instant kill — ignores all prey defenses', eligible: t => t === 'apex' },
  armored:     { name: 'Armored',       icon: 'A', desc: '30% chance to survive being eaten, predator still gets partial food', eligible: t => t === 'herbivore' || t === 'consumer' },
  inkcloud:    { name: 'Ink Cloud',     icon: '●', desc: '50% chance to dodge attack and teleport 2 tiles away', eligible: t => t === 'consumer' || t === 'herbivore' },
  mimicry:     { name: 'Mimicry',       icon: 'M', desc: 'Appears dangerous — predators have 45% chance to skip this prey', eligible: t => t === 'herbivore' || t === 'consumer' },
  regen:       { name: 'Regeneration',  icon: '♥', desc: 'Heals 1 hunger every 3 ticks passively', eligible: t => t !== 'producer' },
  nocturnal:   { name: 'Nocturnal',     icon: '☽', desc: '+40% breed and move in Winter/Autumn, -20% in Summer/Spring', eligible: t => t !== 'producer' },
  diurnal:     { name: 'Diurnal',       icon: '☼', desc: '+40% breed and move in Summer/Spring, -20% in Winter/Autumn', eligible: t => t !== 'producer' },
  parasite:    { name: 'Parasitic',     icon: '⊘', desc: 'Steals 2 hunger from adjacent non-same species without killing', eligible: t => t === 'herbivore' || t === 'consumer' || t === 'decomposer' },
  scavenger:   { name: 'Scavenger',     icon: 'S', desc: 'Can eat dead matter as fallback food for 60% hunger restore', eligible: t => t === 'consumer' || t === 'apex' || t === 'herbivore' },
  photosyn:    { name: 'Photosynthetic', icon: '◇', desc: 'Slowly restores hunger (1 per 4 ticks) in open water', eligible: t => t === 'herbivore' },
  nitrofix:    { name: 'Nitrogen Fix',  icon: 'N', desc: 'Breeds 2x faster when adjacent to dead matter', eligible: t => t === 'producer' },
  filterfeeder: { name: 'Filter Feeder', icon: 'F', desc: 'Passively feeds from any producer within 2 tiles', eligible: t => t === 'herbivore' || t === 'consumer' },
  dwarfism:    { name: 'Dwarfism',      icon: 'd', desc: '-35% hunger needed but can be eaten by same tier', eligible: t => t !== 'producer' && t !== 'decomposer' },
  gigantism:   { name: 'Gigantism',     icon: 'G', desc: '+40% hunger needed but 30% chance predators miss', eligible: t => t !== 'producer' && t !== 'decomposer' },
  colonial:    { name: 'Colonial',      icon: 'C', desc: 'Adjacent same-species share hunger, averages across cluster', eligible: t => t === 'producer' || t === 'decomposer' || t === 'herbivore' },
  territorial: { name: 'Territorial',   icon: 'T', desc: 'Kills same-species neighbours when crowded, but +60% breed when alone', eligible: t => t === 'apex' || t === 'consumer' },
  maternal:    { name: 'Maternal',      icon: '♀', desc: 'Offspring start well-fed (0 hunger) and get +15% stats', eligible: t => t !== 'producer' },
  biofilm:     { name: 'Biofilm',       icon: 'b', desc: 'Forms protective clusters, 35% damage reduction when 3+ adjacent', eligible: t => t === 'decomposer' || t === 'producer' },
  allelopathy: { name: 'Allelopathy',   icon: 'X', desc: 'Inhibits other producer species growth within 2 tiles', eligible: t => t === 'producer' },
  streamlined: { name: 'Streamlined',   icon: '»', desc: '+30% speed, +15% hunt success, -20% armour', eligible: t => t === 'consumer' || t === 'apex' || t === 'megafauna' },
  chromatophores: { name: 'Chromatophores', icon: '◈', desc: 'Active camouflage, better than static camo', eligible: t => t !== 'producer' },
  torpor:      { name: 'Torpor',        icon: '◌', desc: 'Low-metabolism state when starving, survives longer', eligible: t => t !== 'producer' },
  hypermetabolism: { name: 'Hypermetabolism', icon: '⚡', desc: '2x breed rate but 2x hunger rate', eligible: t => t !== 'producer' && t !== 'decomposer' },
  cooperativehunt: { name: 'Co-op Hunt', icon: '⊕', desc: 'Group feeds entire pack on successful kill', eligible: t => t === 'consumer' || t === 'apex' },
  parentalinvest: { name: 'Parental',   icon: '◇', desc: 'Offspring start at 0 hunger with +20% stats', eligible: t => t !== 'producer' },
  thermosensing: { name: 'Thermosense', icon: '◎', desc: 'Detects warm-blooded prey, immune to temperature events', eligible: t => t === 'apex' || t === 'consumer' },
  lateralline: { name: 'Lateral Line',  icon: '≈', desc: 'Detects movement within 3 tiles', eligible: t => t !== 'producer' && t !== 'decomposer' },
};

export const TRAIT_KEYS = Object.keys(TRAITS);

export const EXCLUSIVE_TRAIT_GROUPS: string[][] = [
  ['coldadapt', 'warmadapt'],
  ['nocturnal', 'diurnal'],
  ['camouflage', 'bioluminesc', 'mimicry', 'chromatophores'],
  ['shell', 'softshell', 'armored'],
  ['dwarfism', 'gigantism'],
  ['ambush', 'stalker'],
  ['thorns', 'allelopathy'],
  ['deeproot', 'regrowth', 'nitrofix'],
  ['packhunter', 'trapjaw', 'cooperativehunt'],
  ['inkcloud', 'poddefense'],
  ['maternal', 'parentalinvest'],
  ['torpor', 'hypermetabolism'],
  ['echoloc', 'lateralline', 'thermosensing'],
  ['regen', 'photosyn'],
];

export const PRODUCER_DEFENCE_TRAITS = ['thorns', 'toxic', 'deeproot', 'allelopathy', 'biofilm'];
export const MAX_PRODUCER_DEFENCE_TRAITS = 2;

export function getExclusiveConflict(traitKey: string, currentTraits: string[]): string | null {
  for (const group of EXCLUSIVE_TRAIT_GROUPS) {
    if (group.indexOf(traitKey) === -1) continue;
    for (const t of currentTraits) {
      if (t !== traitKey && group.indexOf(t) !== -1) return t;
    }
  }
  return null;
}

export const TRAIT_POLYGENIC: Record<string, TraitPolygenicReq> = {
  camouflage:   { requires: [{ g: 'pigment', min: 0.50 }, { g: 'flightResponse', min: 0.35 }], inhibits: [{ g: 'aggression', max: 0.40 }], strength: e => 0.6 * e.pigment + 0.4 * e.flightResponse },
  toxic:        { requires: [{ g: 'chemosensory', min: 0.45 }, { g: 'bodyArmour', min: 0.35 }], inhibits: [], strength: e => 0.5 * e.chemosensory + 0.5 * e.bodyArmour },
  shell:        { requires: [{ g: 'bodyArmour', min: 0.60 }, { g: 'bodySize', min: 0.30 }], inhibits: [{ g: 'bodyShape', max: 0.55 }], strength: e => 0.8 * e.bodyArmour + 0.2 * e.bodySize },
  thorns:       { requires: [{ g: 'bodyArmour', min: 0.50 }, { g: 'chemosensory', min: 0.30 }], inhibits: [], strength: e => 0.7 * e.bodyArmour + 0.3 * e.chemosensory },
  deeproot:     { requires: [{ g: 'pressureAdapt', min: 0.50 }, { g: 'hungerEfficiency', min: 0.40 }], inhibits: [], strength: e => 0.6 * e.pressureAdapt + 0.4 * e.hungerEfficiency },
  regrowth:     { requires: [{ g: 'fertility', min: 0.60 }, { g: 'growthRate', min: 0.50 }], inhibits: [{ g: 'bodyArmour', max: 0.45 }], strength: e => 0.5 * e.fertility + 0.5 * e.growthRate },
  softshell:    { requires: [{ g: 'bodyShape', min: 0.45 }, { g: 'curiosity', min: 0.35 }], inhibits: [{ g: 'bodyArmour', max: 0.25 }], strength: e => 0.5 * e.bodyShape + 0.5 * e.curiosity },
  armored:      { requires: [{ g: 'bodyArmour', min: 0.55 }, { g: 'bodySize', min: 0.35 }, { g: 'bodyShape', min: 0.30 }], inhibits: [], strength: e => 0.6 * e.bodyArmour + 0.2 * e.bodySize + 0.2 * e.bodyShape },
  inkcloud:     { requires: [{ g: 'flightResponse', min: 0.50 }, { g: 'bodyShape', min: 0.40 }], inhibits: [{ g: 'sociality', max: 0.45 }], strength: e => 0.6 * e.flightResponse + 0.4 * e.bodyShape },
  mimicry:      { requires: [{ g: 'pigment', min: 0.45 }, { g: 'aggression', min: 0.30 }], inhibits: [], strength: e => 0.6 * e.pigment + 0.4 * e.aggression },
  regen:        { requires: [{ g: 'hungerEfficiency', min: 0.55 }, { g: 'fertility', min: 0.40 }], inhibits: [], strength: e => 0.6 * e.hungerEfficiency + 0.4 * e.fertility },
  ambush:       { requires: [{ g: 'aggression', min: 0.55 }, { g: 'visionRange', min: 0.35 }], inhibits: [{ g: 'curiosity', max: 0.40 }], strength: e => 0.6 * e.aggression + 0.4 * e.visionRange },
  bioluminesc:  { requires: [{ g: 'pigment', min: 0.50 }, { g: 'visionRange', min: 0.35 }], inhibits: [{ g: 'bodyArmour', max: 0.45 }], strength: e => 0.5 * e.pigment + 0.5 * e.visionRange },
  echoloc:      { requires: [{ g: 'visionRange', min: 0.55 }, { g: 'curiosity', min: 0.35 }], inhibits: [], strength: e => 0.7 * e.visionRange + 0.3 * e.curiosity },
  packhunter:   { requires: [{ g: 'aggression', min: 0.45 }, { g: 'sociality', min: 0.50 }, { g: 'visionRange', min: 0.30 }], inhibits: [], strength: e => 0.4 * e.aggression + 0.4 * e.sociality + 0.2 * e.visionRange },
  venomous:     { requires: [{ g: 'chemosensory', min: 0.50 }, { g: 'aggression', min: 0.40 }], inhibits: [], strength: e => 0.5 * e.chemosensory + 0.5 * e.aggression },
  stalker:      { requires: [{ g: 'aggression', min: 0.55 }, { g: 'curiosity', min: 0.50 }, { g: 'bodyShape', min: 0.45 }], inhibits: [], strength: e => 0.4 * e.aggression + 0.3 * e.curiosity + 0.3 * e.bodyShape },
  trapjaw:      { requires: [{ g: 'aggression', min: 0.75 }, { g: 'bodySize', min: 0.40 }], inhibits: [{ g: 'sociality', max: 0.35 }], strength: e => 0.8 * e.aggression + 0.2 * e.bodySize },
  bulkfeeder:   { requires: [{ g: 'bodySize', min: 0.55 }, { g: 'hungerEfficiency', min: 0.45 }], inhibits: [], strength: e => 0.5 * e.bodySize + 0.5 * e.hungerEfficiency },
  symbiosis:    { requires: [{ g: 'sociality', min: 0.45 }, { g: 'chemosensory', min: 0.35 }], inhibits: [], strength: e => 0.5 * e.sociality + 0.5 * e.chemosensory },
  lithivore:    { requires: [{ g: 'pressureAdapt', min: 0.45 }, { g: 'hungerEfficiency', min: 0.35 }], inhibits: [], strength: e => 0.5 * e.pressureAdapt + 0.5 * e.hungerEfficiency },
  parasite:     { requires: [{ g: 'chemosensory', min: 0.40 }, { g: 'aggression', min: 0.30 }], inhibits: [{ g: 'sociality', max: 0.35 }], strength: e => 0.5 * e.chemosensory + 0.5 * e.aggression },
  scavenger:    { requires: [{ g: 'chemosensory', min: 0.40 }, { g: 'hungerEfficiency', min: 0.35 }], inhibits: [], strength: e => 0.5 * e.chemosensory + 0.5 * e.hungerEfficiency },
  photosyn:     { requires: [{ g: 'hungerEfficiency', min: 0.50 }, { g: 'pigment', min: 0.35 }], inhibits: [], strength: e => 0.5 * e.hungerEfficiency + 0.5 * e.pigment },
  nitrofix:     { requires: [{ g: 'fertility', min: 0.55 }, { g: 'chemosensory', min: 0.40 }], inhibits: [{ g: 'bodyArmour', max: 0.50 }], strength: e => 0.5 * e.fertility + 0.5 * e.chemosensory },
  filterfeeder: { requires: [{ g: 'hungerEfficiency', min: 0.45 }, { g: 'sociality', min: 0.30 }], inhibits: [], strength: e => 0.6 * e.hungerEfficiency + 0.4 * e.sociality },
  coldadapt:    { requires: [{ g: 'thermalAdapt', min: 0.55 }, { g: 'hungerEfficiency', min: 0.35 }], inhibits: [{ g: 'metabolicRate', max: 0.55 }], strength: e => 0.7 * e.thermalAdapt + 0.3 * e.hungerEfficiency },
  warmadapt:    { requires: [{ g: 'metabolicRate', min: 0.50 }, { g: 'thermalAdapt', min: 0.35 }], inhibits: [{ g: 'hungerEfficiency', max: 0.55 }], strength: e => 0.5 * e.metabolicRate + 0.5 * e.thermalAdapt },
  nocturnal:    { requires: [{ g: 'visionRange', min: 0.40 }, { g: 'flightResponse', min: 0.30 }], inhibits: [{ g: 'curiosity', max: 0.50 }], strength: e => 0.6 * e.visionRange + 0.4 * e.flightResponse },
  diurnal:      { requires: [{ g: 'fertility', min: 0.40 }, { g: 'curiosity', min: 0.40 }], inhibits: [], strength: e => 0.5 * e.fertility + 0.5 * e.curiosity },
  migratory:    { requires: [{ g: 'curiosity', min: 0.55 }, { g: 'bodyShape', min: 0.45 }], inhibits: [], strength: e => 0.5 * e.curiosity + 0.5 * e.bodyShape },
  dwarfism:     { requires: [{ g: 'bodyShape', min: 0.50 }], inhibits: [{ g: 'bodySize', max: 0.35 }], strength: e => 0.6 * e.bodyShape + 0.4 * (1 - e.bodySize) },
  gigantism:    { requires: [{ g: 'bodySize', min: 0.65 }, { g: 'hungerEfficiency', min: 0.40 }], inhibits: [{ g: 'fertility', max: 0.40 }], strength: e => 0.7 * e.bodySize + 0.3 * e.hungerEfficiency },
  colonial:     { requires: [{ g: 'sociality', min: 0.50 }, { g: 'growthRate', min: 0.35 }], inhibits: [], strength: e => 0.6 * e.sociality + 0.4 * e.growthRate },
  schooling:    { requires: [{ g: 'sociality', min: 0.55 }, { g: 'flightResponse', min: 0.30 }], inhibits: [], strength: e => 0.6 * e.sociality + 0.4 * e.flightResponse },
  territorial:  { requires: [{ g: 'aggression', min: 0.50 }, { g: 'bodySize', min: 0.35 }], inhibits: [{ g: 'sociality', max: 0.35 }], strength: e => 0.6 * e.aggression + 0.4 * e.bodySize },
  maternal:     { requires: [{ g: 'sociality', min: 0.45 }, { g: 'fertility', min: 0.35 }], inhibits: [], strength: e => 0.5 * e.sociality + 0.5 * e.fertility },
  biofilm:      { requires: [{ g: 'sociality', min: 0.40 }, { g: 'chemosensory', min: 0.30 }], inhibits: [], strength: e => 0.5 * e.sociality + 0.5 * e.chemosensory },
  allelopathy:  { requires: [{ g: 'chemosensory', min: 0.45 }, { g: 'aggression', min: 0.25 }], inhibits: [{ g: 'bodyArmour', max: 0.45 }], strength: e => 0.6 * e.chemosensory + 0.4 * e.aggression },
  spore:        { requires: [{ g: 'fertility', min: 0.50 }, { g: 'growthRate', min: 0.35 }], inhibits: [], strength: e => 0.5 * e.fertility + 0.5 * e.growthRate },
  poddefense:   { requires: [{ g: 'sociality', min: 0.55 }, { g: 'flightResponse', min: 0.40 }], inhibits: [], strength: e => 0.5 * e.sociality + 0.5 * e.flightResponse },
  streamlined:  { requires: [{ g: 'bodyShape', min: 0.60 }, { g: 'curiosity', min: 0.40 }], inhibits: [{ g: 'bodyArmour', max: 0.35 }], strength: e => 0.6 * e.bodyShape + 0.4 * e.curiosity },
  chromatophores: { requires: [{ g: 'pigment', min: 0.55 }, { g: 'flightResponse', min: 0.45 }], inhibits: [], strength: e => 0.5 * e.pigment + 0.5 * e.flightResponse },
  torpor:       { requires: [{ g: 'hungerEfficiency', min: 0.55 }, { g: 'pressureAdapt', min: 0.40 }], inhibits: [{ g: 'metabolicRate', max: 0.35 }], strength: e => 0.6 * e.hungerEfficiency + 0.4 * e.pressureAdapt },
  hypermetabolism: { requires: [{ g: 'metabolicRate', min: 0.65 }, { g: 'fertility', min: 0.50 }], inhibits: [], strength: e => 0.5 * e.metabolicRate + 0.5 * e.fertility },
  cooperativehunt: { requires: [{ g: 'sociality', min: 0.60 }, { g: 'aggression', min: 0.45 }, { g: 'visionRange', min: 0.35 }], inhibits: [], strength: e => 0.4 * e.sociality + 0.4 * e.aggression + 0.2 * e.visionRange },
  parentalinvest: { requires: [{ g: 'sociality', min: 0.45 }, { g: 'growthRate', min: 0.35 }], inhibits: [{ g: 'fertility', max: 0.45 }], strength: e => 0.5 * e.sociality + 0.5 * e.growthRate },
  thermosensing: { requires: [{ g: 'thermalAdapt', min: 0.55 }, { g: 'chemosensory', min: 0.40 }], inhibits: [], strength: e => 0.6 * e.thermalAdapt + 0.4 * e.chemosensory },
  lateralline:  { requires: [{ g: 'pressureAdapt', min: 0.45 }, { g: 'visionRange', min: 0.40 }], inhibits: [], strength: e => 0.5 * e.pressureAdapt + 0.5 * e.visionRange },
};

export const TRAIT_SYNERGIES: TraitSynergy[] = [
  { traits: ['schooling', 'cooperativehunt'], name: 'Wolfpack', bonus: 'hunt', mult: 1.8 },
  { traits: ['shell', 'torpor'], name: 'Fortress Mode', bonus: 'defence', mult: 0.7 },
  { traits: ['toxic', 'bioluminesc'], name: 'Aposematic Warning', bonus: 'avoid', mult: 0.6 },
  { traits: ['chromatophores', 'ambush'], name: 'Perfect Ambush', bonus: 'hunt', mult: 1.5 },
  { traits: ['streamlined', 'lateralline'], name: 'Pursuit Predator', bonus: 'speed', mult: 1.25 },
  { traits: ['parentalinvest', 'territorial'], name: 'Stronghold', bonus: 'breed', mult: 1.3 },
];

export function getSpeciesSynergies(traits: string[]): TraitSynergy[] {
  const active: TraitSynergy[] = [];
  for (const syn of TRAIT_SYNERGIES) {
    if (syn.traits.every(t => traits.indexOf(t) !== -1)) {
      active.push(syn);
    }
  }
  return active;
}

export function hasSynergy(synergies: TraitSynergy[], bonusType: string): number {
  for (const syn of synergies) {
    if (syn.bonus === bonusType) return syn.mult;
  }
  return 0;
}

export function traitStr(strengths: Record<string, number> | undefined, trait: string): number {
  return strengths?.[trait] ?? 1;
}

export function expressTraits(
  sp: SpeciesDefinition,
  es: EvoStats,
  maxTraits: number,
  expressAllGenesFn: (genes: GeneSet) => ExpressedGenes,
  logFn?: (msg: string) => void,
): void {
  if (!es.genes) return;

  const exp = expressAllGenesFn(es.genes);
  es._expressed = exp;

  const expressed: Array<{ trait: string; strength: number }> = [];
  for (const tk of TRAIT_KEYS) {
    if (!TRAITS[tk].eligible(sp.tier)) continue;
    const req = TRAIT_POLYGENIC[tk];
    if (!req) continue;
    let qualifies = true;
    for (const r of req.requires) {
      if ((exp[r.g] || 0) < r.min) { qualifies = false; break; }
    }
    if (qualifies && req.inhibits) {
      for (const inh of req.inhibits) {
        if ((exp[inh.g] || 0) >= inh.max) { qualifies = false; break; }
      }
    }
    if (qualifies) {
      const strength = Math.max(0.5, Math.min(1.5, req.strength(exp)));
      expressed.push({ trait: tk, strength });
    }
  }

  for (let ei = expressed.length - 1; ei >= 0; ei--) {
    const conflict = getExclusiveConflict(
      expressed[ei].trait,
      expressed.filter((_, xi) => xi < ei).map(x => x.trait),
    );
    if (conflict) expressed.splice(ei, 1);
  }

  expressed.sort((a, b) => b.strength - a.strength);
  let candidates = expressed.slice(0, maxTraits);

  if (sp.tier === 'producer') {
    let defCount = 0;
    candidates = candidates.filter(e => {
      if (PRODUCER_DEFENCE_TRAITS.indexOf(e.trait) !== -1) {
        defCount++;
        if (defCount > MAX_PRODUCER_DEFENCE_TRAITS) return false;
      }
      return true;
    });
    while (candidates.length < maxTraits && expressed.length > candidates.length) {
      const next = expressed.find(e =>
        candidates.indexOf(e) === -1 &&
        (PRODUCER_DEFENCE_TRAITS.indexOf(e.trait) === -1 || defCount < MAX_PRODUCER_DEFENCE_TRAITS),
      );
      if (!next) break;
      if (PRODUCER_DEFENCE_TRAITS.indexOf(next.trait) !== -1) defCount++;
      candidates.push(next);
    }
  }

  const newTraits = candidates.map(e => e.trait);
  const oldTraits = es.traits || [];
  if (logFn) {
    for (const nt of newTraits) {
      if (oldTraits.indexOf(nt) === -1) logFn(sp.name + ' expressed ' + TRAITS[nt].name);
    }
    for (const ot of oldTraits) {
      if (newTraits.indexOf(ot) === -1) logFn(sp.name + ' lost ' + TRAITS[ot].name);
    }
  }

  es.traits = newTraits;
  es.traitStrengths = {};
  let bm = 0;
  for (const c of candidates) {
    es.traitStrengths[c.trait] = c.strength;
    const bit = TRAIT_BITS[c.trait];
    if (bit) bm |= bit;
  }
  es._traitBitmask = bm;
}

// Trait bitmask system for hot-path lookups
export const TRAIT_BITS: Record<string, number> = {};
export const TRAIT_BITS2: Record<string, number> = {};
for (let i = 0; i < TRAIT_KEYS.length; i++) {
  if (i < 30) TRAIT_BITS[TRAIT_KEYS[i]] = 1 << i;
  else TRAIT_BITS2[TRAIT_KEYS[i]] = 1 << (i - 30);
}
