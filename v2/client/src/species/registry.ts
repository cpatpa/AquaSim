import type { SpeciesDefinition, Tier } from '../types';
import { SPECIES, TIER_ORDER, TIER_TO_LABEL } from './species-types';

export const COLOR_RGB: Record<number, [number, number, number]> = {};

function parseHexColor(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

for (const id in SPECIES) {
  COLOR_RGB[parseInt(id)] = parseHexColor(SPECIES[parseInt(id)].color);
}

const LIVING_IDS: number[] = [];
for (const id in SPECIES) {
  if (SPECIES[parseInt(id)].breedRate !== undefined) {
    LIVING_IDS.push(parseInt(id));
  }
}

let nextSpeciesId = 100;
let dynamicSpeciesIds: number[] = [];

export function getLivingIds(): readonly number[] {
  return LIVING_IDS;
}

export function getDynamicSpeciesIds(): readonly number[] {
  return dynamicSpeciesIds;
}

export function getNextSpeciesId(): number {
  return nextSpeciesId;
}

export function getSpecies(id: number): SpeciesDefinition | undefined {
  return SPECIES[id];
}

export function registerSpecies(id: number, def: SpeciesDefinition): void {
  SPECIES[id] = def;
  COLOR_RGB[id] = parseHexColor(def.color);
  if (def.breedRate !== undefined && LIVING_IDS.indexOf(id) === -1) {
    LIVING_IDS.push(id);
  }
  if (id >= 100) {
    dynamicSpeciesIds.push(id);
  }
  addToTierGroup(id, def.tier);
}

export function allocateSpeciesId(): number {
  if (nextSpeciesId > 255) return -1;
  return nextSpeciesId++;
}

export function layerOf(sid: number): number {
  const sp = SPECIES[sid];
  return sp ? sp.layer : -1;
}

export function layersCanReach(predatorSid: number, preyLayer: number): boolean {
  if (preyLayer === -1) return true;
  const sp = SPECIES[predatorSid];
  if (!sp || sp.layer === -1) return true;
  const reach = sp.layerReach ?? 1;
  return Math.abs(sp.layer - preyLayer) <= reach;
}

export function addToTierGroup(speciesId: number, tier: Tier): void {
  const label = TIER_TO_LABEL[tier];
  if (label) {
    const group = TIER_ORDER.find(t => t.label === label);
    if (group && group.ids.indexOf(speciesId) === -1) group.ids.push(speciesId);
  }
}

export function removeFromTierGroups(speciesId: number): void {
  for (const group of TIER_ORDER) {
    const idx = group.ids.indexOf(speciesId);
    if (idx !== -1) {
      group.ids.splice(idx, 1);
      return;
    }
  }
}

export function removeDynamicSpeciesId(speciesId: number): void {
  const idx = dynamicSpeciesIds.indexOf(speciesId);
  if (idx !== -1) dynamicSpeciesIds.splice(idx, 1);
}

export function resetDynamicSpecies(): void {
  for (const did of dynamicSpeciesIds) {
    delete SPECIES[did];
    delete COLOR_RGB[did];
    removeFromTierGroups(did);
    const li = LIVING_IDS.indexOf(did);
    if (li !== -1) LIVING_IDS.splice(li, 1);
  }
  dynamicSpeciesIds = [];
  nextSpeciesId = 100;
}

export { SPECIES, LIVING_IDS };
