import type { GridState } from '../types';
import { wrapX, wrapY } from '../core/grid';

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

export function triggerBomb(
  grid: GridState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      const idx = y * grid.width + x;
      grid.species[idx] = 1;
      grid.hunger[idx] = 0;
      grid.age[idx] = 0;
    }
  }
}

export function triggerOilSpill(
  grid: GridState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      const idx = y * grid.width + x;
      grid.species[idx] = 4;
      grid.hunger[idx] = 0;
      grid.age[idx] = 0;
    }
  }
}

export function triggerHeatwave(
  grid: GridState,
  evoStats: Record<number, any>,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      const idx = y * grid.width + x;
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
  }
}

export function triggerIceAge(
  grid: GridState,
  evoStats: Record<number, any>,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      const idx = y * grid.width + x;
      const sid = grid.species[idx];
      if (sid === 0 || sid === 1) continue;
      const es = evoStats[sid];
      const hasCold = es?.traits?.indexOf('coldadapt') !== -1;
      if (hasCold) continue;
      grid.species[idx] = 5;
      grid.hunger[idx] = 0;
      grid.age[idx] = 0;
    }
  }
}

export function triggerToxicBloom(
  grid: GridState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      const idx = y * grid.width + x;
      if (grid.species[idx] !== 1) {
        grid.species[idx] = 6;
        grid.age[idx] = 0;
      }
    }
  }
}

export function triggerVolcano(
  grid: GridState,
  state: DisasterState,
  cellX: number,
  cellY: number,
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      const idx = y * grid.width + x;
      grid.species[idx] = 7;
      grid.age[idx] = 0;
    }
  }

  const ventCount = 1 + ((Math.random() * 3) | 0);
  for (let v = 0; v < ventCount; v++) {
    const vx = wrapX(grid, cellX + ((Math.random() - 0.5) * radius) | 0);
    const vy = wrapY(grid, cellY + ((Math.random() - 0.5) * radius) | 0);
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
