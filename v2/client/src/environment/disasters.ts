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
  const cw = grid.width;

  const bigR = radius * 4;

  // Build an irregular volcanic cone with noise-driven edges
  for (let z = 0; z < layers; z++) {
    const layerFrac = z / Math.max(1, layers - 1);
    const layerRadius = Math.max(2, Math.round(bigR * (1.0 - layerFrac * 0.65)));
    const zOff = z * plane;

    for (let dy = -layerRadius; dy <= layerRadius; dy++) {
      for (let dx = -layerRadius; dx <= layerRadius; dx++) {
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2);
        if (dist > layerRadius) continue;
        // Irregular edge using cheap angular hash
        const angle = Math.atan2(dy, dx);
        const edgeNoise = 0.85 + 0.30 * Math.sin(angle * 5.7 + cellX * 0.13) * Math.cos(angle * 3.1 + cellY * 0.17);
        if (dist > layerRadius * edgeNoise) continue;

        const x = wrapX(grid, cellX + dx);
        const y = wrapY(grid, cellY + dy);
        const idx = zOff + y * cw + x;
        const distFrac = dist / Math.max(1, layerRadius);

        if (z <= 1 && distFrac > 0.65) {
          grid.species[idx] = 1;
          grid.age[idx] = 0;
        } else {
          grid.species[idx] = 7;
          grid.age[idx] = z <= 1 ? 0 : ((distFrac * 15) | 0);
        }
        grid.hunger[idx] = 0;
      }
    }
  }

  // Lava rivers: 3-6 flows radiating outward from the core
  const riverCount = 3 + ((Math.random() * 4) | 0);
  for (let ri = 0; ri < riverCount; ri++) {
    let angle = (ri / riverCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    let rx = cellX;
    let ry = cellY;
    const riverLen = bigR + ((Math.random() * bigR * 0.8) | 0);
    const width = 2 + ((Math.random() * 2) | 0);

    for (let s = 0; s < riverLen; s++) {
      angle += (Math.random() - 0.5) * 0.3;
      rx += Math.cos(angle);
      ry += Math.sin(angle);
      const riverAge = Math.min(40, ((s / riverLen) * 30) | 0);

      for (let dw = -width; dw <= width; dw++) {
        const perpAngle = angle + Math.PI / 2;
        const fx = wrapX(grid, Math.round(rx + Math.cos(perpAngle) * dw));
        const fy = wrapY(grid, Math.round(ry + Math.sin(perpAngle) * dw));
        // Rivers flow at lower layers (0-2)
        const maxZ = Math.min(layers - 1, 2);
        for (let z = 0; z <= maxZ; z++) {
          const idx = z * plane + fy * cw + fx;
          if (grid.species[idx] === 1) continue;
          grid.species[idx] = 7;
          grid.age[idx] = riverAge;
          grid.hunger[idx] = 0;
        }
      }

      // Branching: 8% chance per step to fork a sub-river
      if (Math.random() < 0.08 && s > 5) {
        let branchAngle = angle + (Math.random() < 0.5 ? 0.6 : -0.6) + (Math.random() - 0.5) * 0.3;
        let bx = rx;
        let by = ry;
        const branchLen = 5 + ((Math.random() * 12) | 0);
        for (let bs = 0; bs < branchLen; bs++) {
          branchAngle += (Math.random() - 0.5) * 0.4;
          bx += Math.cos(branchAngle);
          by += Math.sin(branchAngle);
          const bfx = wrapX(grid, Math.round(bx));
          const bfy = wrapY(grid, Math.round(by));
          for (let z = 0; z <= Math.min(layers - 1, 1); z++) {
            const bIdx = z * plane + bfy * cw + bfx;
            if (grid.species[bIdx] !== 1) {
              grid.species[bIdx] = 7;
              grid.age[bIdx] = ((riverAge + bs) | 0);
              grid.hunger[bIdx] = 0;
            }
          }
        }
      }
    }
  }

  // Place multiple vents around the caldera for sustained eruption
  const ventCount = 3 + ((Math.random() * 4) | 0);
  for (let v = 0; v < ventCount; v++) {
    const ventDist = Math.random() * bigR * 0.5;
    const ventAngle = Math.random() * Math.PI * 2;
    const vx = wrapX(grid, cellX + Math.round(Math.cos(ventAngle) * ventDist));
    const vy = wrapY(grid, cellY + Math.round(Math.sin(ventAngle) * ventDist));
    const angles: number[] = [];
    const numAngles = 4 + ((Math.random() * 6) | 0);
    for (let a = 0; a < numAngles; a++) {
      angles.push(Math.random() * Math.PI * 2);
    }
    state.activeVents.push({
      x: vx,
      y: vy,
      ticksLeft: 80 + ((Math.random() * 60) | 0),
      radius: bigR,
      angles,
    });
  }
}
