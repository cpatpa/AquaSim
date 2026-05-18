import type { NovelAdaptation, GeneKey } from '../types';

export const NOVEL_ADAPTATIONS: Record<string, NovelAdaptation> = {
  jetpropulsion:    { name: 'Jet Propulsion',   icon: '>', desc: 'Burst-moves 3 tiles when fleeing predators',      eligible: t => t === 'consumer' || t === 'herbivore' },
  flyingfish:       { name: 'Flying Fish',      icon: '^', desc: 'Leaps over obstacles when moving',                eligible: t => t === 'consumer' || t === 'herbivore' },
  burrowing:        { name: 'Burrowing',        icon: 'v', desc: 'Digs in to hide from predators',                  eligible: t => t === 'herbivore' || t === 'decomposer' },
  electricorgan:    { name: 'Electric Organ',   icon: 'Z', desc: 'Stuns attackers with hunger penalty',             eligible: t => t === 'consumer' || t === 'apex' },
  calcification:    { name: 'Calcification',    icon: '#', desc: 'Leaves rock instead of dead matter on death',     eligible: () => true },
  autotomy:         { name: 'Autotomy',         icon: '%', desc: 'Sheds body part to escape, predator still eats',  eligible: t => t === 'herbivore' || t === 'consumer' },
  mucuscoat:        { name: 'Mucus Coating',    icon: '~', desc: 'Slippery body, hard to catch',                    eligible: t => t !== 'apex' && t !== 'megafauna' && t !== 'producer' },
  kleptoplasty:     { name: 'Kleptoplasty',     icon: 'K', desc: 'Gains temp photosynthesis from eaten algae',      eligible: t => t === 'herbivore' || t === 'consumer' },
  aestivation:      { name: 'Aestivation',      icon: 'z', desc: 'Goes dormant when starving, extending survival',  eligible: t => t !== 'producer' },
  chemosynthesis:   { name: 'Chemosynthesis',   icon: 'W', desc: 'Feeds on minerals near rock and lava',            eligible: t => t === 'producer' || t === 'decomposer' },
  broodparasite:    { name: 'Brood Parasite',   icon: 'Q', desc: 'Converts rival species cells when breeding',     eligible: t => t === 'herbivore' || t === 'consumer' },
  budding:          { name: 'Budding',          icon: 'Y', desc: 'Sometimes breeds into two cells at once',         eligible: t => t === 'producer' || t === 'decomposer' },
  neoteny:          { name: 'Neoteny',          icon: 'o', desc: 'Breeds faster but more vulnerable to predation',  eligible: t => t !== 'producer' },
  electroreception: { name: 'Electroreception', icon: 'E', desc: 'Detects hidden prey through bioelectric fields',  eligible: t => t === 'apex' || t === 'consumer' },
  hivemind:         { name: 'Hive Mind',        icon: 'H', desc: 'Colony coordinates defence and breeding as one',  eligible: t => t === 'herbivore' || t === 'decomposer' || t === 'producer' },
};

export const NOVEL_ADAPT_KEYS = Object.keys(NOVEL_ADAPTATIONS);

export const NOVEL_GENE_REQS: Record<string, Array<{ g: GeneKey; min: number }>> = {
  jetpropulsion:    [{ g: 'bodyShape', min: 0.70 }, { g: 'flightResponse', min: 0.65 }],
  flyingfish:       [{ g: 'bodyShape', min: 0.65 }, { g: 'curiosity', min: 0.60 }],
  burrowing:        [{ g: 'bodySize', min: 0.55 }, { g: 'pressureAdapt', min: 0.55 }],
  electricorgan:    [{ g: 'aggression', min: 0.75 }, { g: 'chemosensory', min: 0.60 }],
  calcification:    [{ g: 'bodyArmour', min: 0.70 }, { g: 'pressureAdapt', min: 0.50 }],
  autotomy:         [{ g: 'flightResponse', min: 0.70 }, { g: 'growthRate', min: 0.50 }],
  mucuscoat:        [{ g: 'chemosensory', min: 0.55 }, { g: 'flightResponse', min: 0.55 }],
  kleptoplasty:     [{ g: 'hungerEfficiency', min: 0.65 }, { g: 'chemosensory', min: 0.55 }],
  aestivation:      [{ g: 'hungerEfficiency', min: 0.60 }, { g: 'thermalAdapt', min: 0.55 }],
  chemosynthesis:   [{ g: 'chemosensory', min: 0.65 }, { g: 'pressureAdapt', min: 0.55 }],
  broodparasite:    [{ g: 'aggression', min: 0.55 }, { g: 'fertility', min: 0.60 }],
  budding:          [{ g: 'fertility', min: 0.70 }, { g: 'growthRate', min: 0.55 }],
  neoteny:          [{ g: 'growthRate', min: 0.70 }, { g: 'metabolicRate', min: 0.55 }],
  electroreception: [{ g: 'visionRange', min: 0.70 }, { g: 'aggression', min: 0.60 }],
  hivemind:         [{ g: 'sociality', min: 0.75 }, { g: 'chemosensory', min: 0.50 }],
};
