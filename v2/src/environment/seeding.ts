import type { GridState } from '../types';
import { wrapX, wrapY } from '../core/grid';

const SEED_TARGETS: Array<[number, number]> = [
  [1,  0.020],
  [10, 0.085],
  [11, 0.025],
  [12, 0.008],
  [20, 0.014],
  [21, 0.006],
  [22, 0.006],
  [23, 0.003],
  [30, 0.005],
  [31, 0.003],
  [32, 0.002],
  [40, 0.002],
  [41, 0.002],
  [42, 0.001],
  [43, 0.0015],
  [50, 0.007],
  [51, 0.003],
];

export function seedGrid(grid: GridState): void {
  const total = grid.width * grid.height;
  for (const [sid, frac] of SEED_TARGETS) {
    let count = Math.max(2, (total * frac) | 0);
    let attempts = 0;
    while (count > 0 && attempts < total * 2) {
      const idx = (Math.random() * total) | 0;
      if (grid.species[idx] === 0) {
        grid.species[idx] = sid;
        grid.hunger[idx] = 0;
        grid.age[idx] = 0;
        count--;
      }
      attempts++;
    }
  }
}

export function seedBalancedRockReefs(grid: GridState): void {
  const total = grid.width * grid.height;
  const rockBudget = (total * 0.03) | 0;
  const numClusters = 3 + ((Math.random() * 4) | 0);

  for (let c = 0; c < numClusters; c++) {
    const cx = (Math.random() * grid.width) | 0;
    const cy = (Math.random() * grid.height) | 0;
    const radius = 4 + ((Math.random() * 8) | 0);
    const budget = (rockBudget / numClusters) | 0;
    let placed = 0;

    for (let dy = -radius; dy <= radius && placed < budget; dy++) {
      for (let dx = -radius; dx <= radius && placed < budget; dx++) {
        const dist = dx * dx + dy * dy;
        if (dist > radius * radius) continue;
        if (Math.random() > 0.6) continue;
        const x = wrapX(grid, cx + dx);
        const y = wrapY(grid, cy + dy);
        const idx = y * grid.width + x;
        if (grid.species[idx] === 0) {
          grid.species[idx] = 1;
          placed++;
        }
      }
    }
  }
}

export function seedSpeciesCluster(
  grid: GridState,
  sid: number,
  cx: number,
  cy: number,
  count: number,
  radius: number,
): number {
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 10;

  while (placed < count && attempts < maxAttempts) {
    const dx = ((Math.random() - 0.5) * radius * 2) | 0;
    const dy = ((Math.random() - 0.5) * radius * 2) | 0;
    if (dx * dx + dy * dy > radius * radius) { attempts++; continue; }
    const x = wrapX(grid, cx + dx);
    const y = wrapY(grid, cy + dy);
    const idx = y * grid.width + x;
    if (grid.species[idx] === 0) {
      grid.species[idx] = sid;
      grid.hunger[idx] = 0;
      grid.age[idx] = 0;
      placed++;
    }
    attempts++;
  }

  return placed;
}
