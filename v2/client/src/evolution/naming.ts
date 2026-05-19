import type { GeneKey, GeneSet } from '../types';
import { GENE_KEYS } from '../constants';
import { geneVal } from './genetics';

export const GENE_NAME_POOLS: Record<GeneKey, string[]> = {
  bodySize: ['Massive', 'Hulking', 'Titan', 'Colossal', 'Bulky', 'Enormous', 'Miniature', 'Towering'],
  bodyArmour: ['Plated', 'Spiny', 'Shielded', 'Thorned', 'Mailed', 'Scaled', 'Hardened', 'Carapaced'],
  bodyShape: ['Swift', 'Darting', 'Fleet', 'Agile', 'Racing', 'Sleek', 'Streamlined', 'Torpedo'],
  pigment: ['Vivid', 'Bright', 'Painted', 'Chromatic', 'Iridescent', 'Luminous', 'Neon', 'Dazzling'],
  metabolicRate: ['Blazing', 'Active', 'Restless', 'Energetic', 'Burning', 'Tireless', 'Relentless', 'Hyperactive'],
  fertility: ['Prolific', 'Thriving', 'Fecund', 'Blooming', 'Verdant', 'Bountiful', 'Swarmer', 'Spawning'],
  hungerEfficiency: ['Hardy', 'Stalwart', 'Ironclad', 'Enduring', 'Rugged', 'Frugal', 'Efficient', 'Lean'],
  growthRate: ['Precocious', 'Rapid', 'Budding', 'Surging', 'Vigorous', 'Explosive', 'Bursting', 'Rocketing'],
  aggression: ['Fierce', 'Razor', 'Fanged', 'Savage', 'Vicious', 'Ruthless', 'Marauding', 'Cunning'],
  sociality: ['Swarming', 'Herding', 'Colonial', 'Gregarious', 'Social', 'Flocking', 'Solitary', 'Communal'],
  curiosity: ['Roaming', 'Wandering', 'Explorer', 'Nomadic', 'Drifting', 'Adventurous', 'Questing', 'Seeking'],
  flightResponse: ['Elusive', 'Wary', 'Skittish', 'Cautious', 'Phantom', 'Fleeting', 'Vanishing', 'Ghostly'],
  visionRange: ['Keen', 'Watchful', 'Sharp-eyed', 'Sentinel', 'Scanning', 'Eagle-eyed', 'Perceptive', 'Hawkeye'],
  chemosensory: ['Sensing', 'Chemical', 'Tasting', 'Olfactory', 'Sensing', 'Tracking', 'Scenting', 'Probing'],
  thermalAdapt: ['Thermal', 'Adapted', 'Temperate', 'Hardened', 'Resilient', 'Volcanic', 'Frostborn', 'Tempered'],
  pressureAdapt: ['Deep', 'Abyssal', 'Benthic', 'Crushing', 'Pressure', 'Ironhull', 'Depthborn', 'Submariner'],
};

export const NICHE_SHIFT_NAMES: Record<string, string[]> = {
  consumer: ['Hunter', 'Predatory', 'Prowling', 'Raptor'],
  apex: ['Alpha', 'Apex', 'Dominant', 'Supreme'],
  megafauna: ['Titan', 'Giant', 'Colossal', 'Leviathan'],
  herbivore: ['Grazer', 'Foraging', 'Browsing', 'Pastoral'],
};

export const SIZE_VARIANT_NAMES: Record<string, string[]> = {
  large: ['Greater', 'Grand', 'Large', 'Hefty', 'Broad'],
  small: ['Lesser', 'Minor', 'Slim', 'Petite', 'Pygmy'],
};

export const LAYER_NAMES_POOL: Record<number, string[]> = {
  0: ['Abyssal', 'Deep', 'Hadal', 'Trench'],
  1: ['Benthic', 'Bottom', 'Seafloor', 'Burrowing'],
  2: ['Reef', 'Coral', 'Lagoon', 'Shoal'],
  3: ['Pelagic', 'Open-water', 'Midwater', 'Drifting'],
  4: ['Surface', 'Sunlit', 'Coastal', 'Tidal'],
  5: ['Canopy', 'Skimming', 'Breaching', 'Cresting'],
};

export const COMPOUND_NAMES: string[] = [
  'Reefback', 'Boneshark', 'Stalker', 'Gasopod', 'Peeper',
  'Boomerang', 'Spadefish', 'Hoverfish', 'Bladderfish', 'Garryfish',
  'Mesmer', 'Crabsnake', 'Warper', 'Ghostray', 'Ampeel',
  'Sandshark', 'Crashfish', 'Floater', 'Shocker', 'Biter',
  'Bleeder', 'Blighter', 'Shuttlebug', 'Rockpuncher', 'Lavazone',
];

export const DIVERGENT_NAMES: Record<string, string> = {
  coldadapt: 'Frost', warmadapt: 'Sun', nocturnal: 'Night', diurnal: 'Day',
  camouflage: 'Shadow', bioluminesc: 'Glowing', mimicry: 'Mimic',
  shell: 'Shelled', softshell: 'Soft', armored: 'Armoured',
  dwarfism: 'Dwarf', gigantism: 'Giant', ambush: 'Lurking', stalker: 'Stalking',
  thorns: 'Thorned', allelopathy: 'Chemical', deeproot: 'Rooted',
  regrowth: 'Budding', nitrofix: 'Nitrogen', packhunter: 'Pack', trapjaw: 'Jaw',
  inkcloud: 'Ink', poddefense: 'Pod',
};

export function generateSpeciesName(
  _parentName: string,
  rootName: string,
  genes: GeneSet,
  parentGenes: GeneSet | null,
  existingNames: Set<string>,
  context?: string,
  extraData?: string,
): string {
  let adj = '';

  if (context === 'sizeshift' && extraData && SIZE_VARIANT_NAMES[extraData]) {
    const pool = SIZE_VARIANT_NAMES[extraData];
    adj = pool[(Math.random() * pool.length) | 0];
  } else if (context === 'niche' && extraData && NICHE_SHIFT_NAMES[extraData]) {
    const pool = NICHE_SHIFT_NAMES[extraData];
    adj = pool[(Math.random() * pool.length) | 0];
  } else if (context === 'divergent' && extraData && DIVERGENT_NAMES[extraData]) {
    adj = DIVERGENT_NAMES[extraData];
  } else {
    let maxDrift = 0;
    let maxGene: GeneKey = GENE_KEYS[0];
    if (parentGenes) {
      for (const g of GENE_KEYS) {
        const drift = Math.abs(geneVal(genes[g] ?? 0.5) - geneVal(parentGenes[g] ?? 0.5));
        if (drift > maxDrift) {
          maxDrift = drift;
          maxGene = g;
        }
      }
    } else {
      maxGene = GENE_KEYS[(Math.random() * GENE_KEYS.length) | 0];
    }
    const pool = GENE_NAME_POOLS[maxGene];
    adj = pool[(Math.random() * pool.length) | 0];
  }

  let candidate = adj + ' ' + rootName;

  // 10% chance to use a compound name for speciation events
  if (context === 'speciation' && Math.random() < 0.10 && COMPOUND_NAMES.length > 0) {
    candidate = COMPOUND_NAMES[(Math.random() * COMPOUND_NAMES.length) | 0];
  }

  let attempt = 0;
  while (existingNames.has(candidate) && attempt < 10) {
    const fallbackGene = GENE_KEYS[(Math.random() * GENE_KEYS.length) | 0];
    const fallbackPool = GENE_NAME_POOLS[fallbackGene];
    adj = fallbackPool[(Math.random() * fallbackPool.length) | 0];
    candidate = adj + ' ' + rootName;
    attempt++;
  }
  if (existingNames.has(candidate)) {
    candidate = adj + ' ' + rootName + ' ' + ((Math.random() * 99 + 1) | 0);
  }

  return candidate;
}
