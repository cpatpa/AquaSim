import type { GridState } from '../types';
import { wrapX, wrapY, planeSize } from '../core/grid';
import { SPECIES } from '../species/registry';

export interface Shockwave {
  cx: number;
  cy: number;
  maxRadius: number;
  startTime: number;
  duration: number;
}

export interface Whirlpool {
  cx: number;
  cy: number;
  maxRadius: number;
  startTime: number;
  duration: number;
}

export interface IceWave {
  cx: number;
  cy: number;
  maxRadius: number;
  startTime: number;
  duration: number;
}

export interface ToxicPulse {
  cx: number;
  cy: number;
  maxRadius: number;
  startTime: number;
  duration: number;
}

export interface VolcanoEffect {
  cx: number;
  cy: number;
  maxRadius: number;
  embers: Array<{ x: number; y: number; vx: number; vy: number; life: number }>;
  startTime: number;
  duration: number;
}

export interface ActiveVent {
  x: number;
  y: number;
  ticksLeft: number;
  radius: number;
  angles: number[];
}

export interface DisasterState {
  shockwaves: Shockwave[];
  whirlpools: Whirlpool[];
  iceWaves: IceWave[];
  toxicPulses: ToxicPulse[];
  volcanoEffects: VolcanoEffect[];
  activeVents: ActiveVent[];
}

export function createDisasterState(): DisasterState {
  return {
    shockwaves: [],
    whirlpools: [],
    iceWaves: [],
    toxicPulses: [],
    volcanoEffects: [],
    activeVents: [],
  };
}

/** Resolve the home z of a transient/environment species id, clamped. */
function homeZ(sid: number, layers: number): number {
  const sp = SPECIES[sid];
  const z = sp?.layer ?? 0;
  if (z < 0) return 0;
  if (z >= layers) return layers - 1;
  return z;
}

/** Iterate all xy cells within a radius and call fn(xyIdx). */
function forEachInRadius(
  grid: GridState,
  cellX: number,
  cellY: number,
  radius: number,
  fn: (xyIdx: number, x: number, y: number) => void,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      fn(y * grid.width + x, x, y);
    }
  }
}

export function triggerBomb(
  grid: GridState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const plane = planeSize(grid);
  const rockZ = homeZ(1, grid.layers);
  forEachInRadius(grid, cellX, cellY, radius, (xy) => {
    // Wipe all layers in the xy column
    for (let z = 0; z < grid.layers; z++) {
      const idx = z * plane + xy;
      grid.species[idx] = 0;
      grid.hunger[idx] = 0;
      grid.age[idx] = 0;
    }
    // Place rock at abyssal floor
    const rockIdx = rockZ * plane + xy;
    grid.species[rockIdx] = 1;
    // Clear currents at all layers
    for (let z = 0; z < grid.layers; z++) {
      grid.currents[z * plane + xy] = 0;
    }
  });
}

export function triggerOilSpill(
  grid: GridState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const plane = planeSize(grid);
  const oilZ = homeZ(4, grid.layers);
  const zOff = oilZ * plane;
  forEachInRadius(grid, cellX, cellY, radius, (xy) => {
    const idx = zOff + xy;
    grid.species[idx] = 4;
    grid.hunger[idx] = 0;
    grid.age[idx] = 0;
  });
}

export function triggerHeatwave(
  grid: GridState,
  evoStats: Record<number, any>,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const plane = planeSize(grid);
  forEachInRadius(grid, cellX, cellY, radius, (xy) => {
    // Kill animals across all layers
    for (let z = 0; z < grid.layers; z++) {
      const idx = z * plane + xy;
      const sid = grid.species[idx];
      if (sid >= 20) {
        const es = evoStats[sid];
        const hasWarm = es?.traits?.indexOf('warmadapt') !== -1;
        const hasThermal = es?.traits?.indexOf('thermosensing') !== -1;
        if (hasWarm || hasThermal) {
          if (Math.random() < 0.5) continue;
        }
        grid.species[idx] = 3;
        grid.age[idx] = 0;
      }
    }
  });
}

export function triggerIceAge(
  grid: GridState,
  evoStats: Record<number, any>,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const plane = planeSize(grid);
  const iceZ = grid.layers - 1; // freeze at top layer (Canopy)
  const zOff = iceZ * plane;
  forEachInRadius(grid, cellX, cellY, radius, (xy) => {
    // Kill animals across all layers (cold spreads down)
    for (let z = 0; z < grid.layers; z++) {
      const idx = z * plane + xy;
      const sid = grid.species[idx];
      if (sid === 0 || sid === 1) continue;
      const es = evoStats[sid];
      const hasCold = es?.traits?.indexOf('coldadapt') !== -1;
      if (hasCold) continue;
      grid.species[idx] = 3;
      grid.hunger[idx] = 0;
      grid.age[idx] = 0;
    }
    // Place ice at top layer
    const iceIdx = zOff + xy;
    if (grid.species[iceIdx] !== 1) {
      grid.species[iceIdx] = 5;
      grid.hunger[iceIdx] = 0;
      grid.age[iceIdx] = 0;
    }
  });
}

export function triggerToxicBloom(
  grid: GridState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const plane = planeSize(grid);
  const bloomZ = homeZ(6, grid.layers);
  const zOff = bloomZ * plane;
  forEachInRadius(grid, cellX, cellY, radius, (xy) => {
    const idx = zOff + xy;
    if (grid.species[idx] !== 1) {
      grid.species[idx] = 6;
      grid.age[idx] = 0;
    }
  });
}

export function triggerVolcano(
  grid: GridState,
  state: DisasterState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const plane = planeSize(grid);
  const layers = grid.layers;

  // Build a cone shape: full radius at z=0 (Abyssal), tapering to ~30% at top layers.
  // Each layer gets a progressively smaller radius, creating a volcanic cone.
  for (let z = 0; z < layers; z++) {
    const layerFrac = z / Math.max(1, layers - 1);
    const layerRadius = Math.max(1, Math.round(radius * (1.0 - layerFrac * 0.7)));
    const zOff = z * plane;

    // Only fill the cone volume: lower layers wider, upper layers narrower
    const r2 = layerRadius * layerRadius;
    for (let dy = -layerRadius; dy <= layerRadius; dy++) {
      for (let dx = -layerRadius; dx <= layerRadius; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;
        const x = wrapX(grid, cellX + dx);
        const y = wrapY(grid, cellY + dy);
        const idx = zOff + y * grid.width + x;
        // Core of the cone is lava, outer ring is rock (cooled lava)
        const distFrac = Math.sqrt(dist2) / Math.max(1, layerRadius);
        if (z <= 1 && distFrac > 0.7) {
          grid.species[idx] = 1; // Rock shell at base layers
          grid.age[idx] = 0;
        } else {
          grid.species[idx] = 7; // Lava
          grid.age[idx] = 0;
        }
        grid.hunger[idx] = 0;
      }
    }
  }

  // Place vents near the summit (top layers) for ongoing eruption
  const ventCount = 1 + ((Math.random() * 3) | 0);
  for (let v = 0; v < ventCount; v++) {
    const spread = radius * 0.3;
    const vx = wrapX(grid, cellX + ((Math.random() - 0.5) * spread) | 0);
    const vy = wrapY(grid, cellY + ((Math.random() - 0.5) * spread) | 0);
    const angles: number[] = [];
    const numAngles = 3 + ((Math.random() * 5) | 0);
    for (let a = 0; a < numAngles; a++) {
      angles.push(Math.random() * Math.PI * 2);
    }
    state.activeVents.push({
      x: vx,
      y: vy,
      ticksLeft: 60 + ((Math.random() * 30) | 0),
      radius: radius,
      angles,
    });
  }
}
