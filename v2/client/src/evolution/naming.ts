import type { GeneKey, GeneSet } from '../types';
import { GENE_KEYS } from '../constants';
import { geneVal } from './genetics';

export const GENE_NAME_POOLS: Record<GeneKey, string[]> = {
  bodySize: ['Massive', 'Hulking', 'Titan', 'Colossal', 'Bulky'],
  bodyArmour: ['Plated', 'Spiny', 'Shielded', 'Thorned', 'Mailed'],
  bodyShape: ['Swift', 'Darting', 'Fleet', 'Agile', 'Racing'],
  pigment: ['Vivid', 'Bright', 'Painted', 'Chromatic', 'Iridescent'],
  metabolicRate: ['Blazing', 'Active', 'Restless', 'Energetic', 'Burning'],
  fertility: ['Prolific', 'Thriving', 'Fecund', 'Blooming', 'Verdant'],
  hungerEfficiency: ['Hardy', 'Stalwart', 'Ironclad', 'Enduring', 'Rugged'],
  growthRate: ['Precocious', 'Rapid', 'Budding', 'Surging', 'Vigorous'],
  aggression: ['Fierce', 'Razor', 'Fanged', 'Savage', 'Vicious'],
  sociality: ['Swarming', 'Herding', 'Colonial', 'Gregarious', 'Social'],
  curiosity: ['Roaming', 'Wandering', 'Explorer', 'Nomadic', 'Drifting'],
  flightResponse: ['Elusive', 'Wary', 'Skittish', 'Cautious', 'Phantom'],
  visionRange: ['Keen', 'Watchful', 'Sharp-eyed', 'Sentinel', 'Scanning'],
  chemosensory: ['Sensing', 'Chemical', 'Tasting', 'Olfactory', 'Sensing'],
  thermalAdapt: ['Thermal', 'Adapted', 'Temperate', 'Hardened', 'Resilient'],
  pressureAdapt: ['Deep', 'Abyssal', 'Benthic', 'Crushing', 'Pressure'],
};

export const NICHE_SHIFT_NAMES: Record<string, string[]> = {
  consumer: ['Hunter', 'Predatory', 'Prowling', 'Raptor'],
  apex: ['Alpha', 'Apex', 'Dominant', 'Supreme'],
  megafauna: ['Titan', 'Giant', 'Colossal', 'Leviathan'],
  herbivore: ['Grazer', 'Foraging', 'Browsing', 'Pastoral'],
};

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

  if (context === 'niche' && extraData && NICHE_SHIFT_NAMES[extraData]) {
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
