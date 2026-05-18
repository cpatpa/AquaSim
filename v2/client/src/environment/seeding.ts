import type { GridState } from '../types';
import { wrapX, wrapY } from '../core/grid';
import { noiseSeed, noise2D, fbm } from './terrain';
import { CARDINAL } from '../constants';

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

const NEIGHBOURS_8: readonly [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Procedural biome generator: realistic marine environment with noise-driven
 * terrain, currents, coral reefs, kelp forests, plankton blooms and
 * habitat-aware animal placement.
 */
export function seedBiome(grid: GridState): void {
  const total = grid.width * grid.height;
  const cw = grid.width;
  const ch = grid.height;
  const seed = (Math.random() * 2147483647) | 0;
  noiseSeed(seed);

  const { species, hunger, age, currents } = grid;

  // Noise helpers
  const F = (x: number, y: number, scale: number, oct?: number): number =>
    fbm(x / scale, y / scale, oct ?? 5, 2.0, 0.5);

  // ==================================================================
  // 1. SEAFLOOR TOPOLOGY -- noise-driven rock formations
  // ==================================================================
  const rockThresh = 0.32;
  const ridgeScale = cw * 0.22;
  const detailScale = cw * 0.06;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const broad = F(x, y, ridgeScale, 4);
      const detail = F(x + 500, y + 500, detailScale, 3) * 0.4;
      // Edge affinity: rocks favour top/bottom walls
      const edgeDist = Math.min(y, ch - 1 - y) / (ch * 0.12);
      const edgeBias = Math.max(0, 1.0 - edgeDist) * 0.45;
      const h = broad + detail + edgeBias;
      if (h > rockThresh) {
        const p = Math.min(1.0, (h - rockThresh) * 3.0);
        if (Math.random() < p) species[y * cw + x] = 1;
      }
    }
  }

  // Reef ridges: 1-3 meandering formations
  const numReefs = 1 + ((Math.random() * 2.5) | 0);
  for (let r = 0; r < numReefs; r++) {
    const ry0 = ch * (0.25 + Math.random() * 0.5);
    const reefAmp = ch * (0.06 + Math.random() * 0.08);
    const reefFreq = 0.02 + Math.random() * 0.03;
    const reefThick = 2 + ((Math.random() * 4) | 0);
    const offsetX = Math.random() * 1000;
    for (let x = 0; x < cw; x++) {
      const centerY = ry0 + reefAmp * noise2D((x + offsetX) * reefFreq, r * 7.7);
      for (let dy = -reefThick; dy <= reefThick; dy++) {
        const wy = wrapY(grid, Math.round(centerY + dy));
        const idx = wy * cw + x;
        if (Math.random() < 0.12) continue; // gaps for passages
        if (species[idx] === 0) species[idx] = 1;
      }
    }
  }

  // ==================================================================
  // 2. OCEAN CURRENTS -- meandering streams + natural gyres
  // ==================================================================
  const numStreams = 4 + ((Math.random() * 4) | 0);
  for (let s = 0; s < numStreams; s++) {
    const horizontal = Math.random() < 0.6;
    let cx0: number, cy0: number, mainDir: number;
    if (horizontal) {
      cx0 = 0;
      cy0 = (ch * (0.1 + Math.random() * 0.8)) | 0;
      mainDir = Math.random() < 0.5 ? 2 : 4; // E or W
    } else {
      cx0 = (cw * (0.1 + Math.random() * 0.8)) | 0;
      cy0 = 0;
      mainDir = Math.random() < 0.5 ? 3 : 1; // S or N
    }
    const cd = CARDINAL[mainDir - 1];
    const len = (Math.max(cw, ch) * (0.5 + Math.random() * 0.6)) | 0;
    const width = 4 + ((Math.random() * 8) | 0);
    const meander = 0.015 + Math.random() * 0.02;
    const amp = 6 + Math.random() * 12;
    const noiseOff = Math.random() * 1000;

    for (let step = 0; step < len; step++) {
      const perpNoise = noise2D((step + noiseOff) * meander, s * 13.3) * amp;
      for (let w = -width; w <= width; w++) {
        const edgeFade = 1.0 - Math.abs(w) / (width + 1);
        if (Math.random() > edgeFade * 0.9 + 0.1) continue;
        let px: number, py: number;
        if (horizontal) {
          px = wrapX(grid, cx0 + step * cd[0]);
          py = wrapY(grid, Math.round(cy0 + step * cd[1] + perpNoise + w));
        } else {
          px = wrapX(grid, Math.round(cx0 + step * cd[0] + perpNoise + w));
          py = wrapY(grid, cy0 + step * cd[1]);
        }
        currents[py * cw + px] = mainDir;
      }
    }
  }

  // Natural gyres: elliptical with noise-perturbed boundaries
  const numGyres = 2 + ((Math.random() * 2) | 0);
  for (let g = 0; g < numGyres; g++) {
    const gx = (cw * (0.2 + Math.random() * 0.6)) | 0;
    const gy = (ch * (0.2 + Math.random() * 0.6)) | 0;
    const rx = 18 + ((Math.random() * 30) | 0);
    const ry = 14 + ((Math.random() * 25) | 0);
    const thick = 3 + ((Math.random() * 4) | 0);
    const cwDir = Math.random() < 0.5 ? 1 : -1; // clockwise or counter
    const noiseOff = Math.random() * 1000;

    for (let dy = -(ry + thick + 3); dy <= ry + thick + 3; dy++) {
      for (let dx = -(rx + thick + 3); dx <= rx + thick + 3; dx++) {
        const normDist = Math.sqrt(
          (dx / rx) * (dx / rx) + (dy / ry) * (dy / ry),
        );
        const nPerturb =
          noise2D((dx + noiseOff) * 0.08, (dy + noiseOff) * 0.08) * 0.15;
        const innerEdge = 1.0 - thick / Math.max(rx, ry) + nPerturb;
        const outerEdge = 1.0 + thick / Math.max(rx, ry) + nPerturb;
        if (normDist < innerEdge || normDist > outerEdge) continue;

        const wx = wrapX(grid, gx + dx);
        const wy = wrapY(grid, gy + dy);
        const angle = Math.atan2(dy, dx);
        const tang = angle + cwDir * Math.PI / 2;
        const tdx = Math.cos(tang);
        const tdy = Math.sin(tang);
        let dir: number;
        if (Math.abs(tdx) > Math.abs(tdy)) dir = tdx > 0 ? 2 : 4;
        else dir = tdy > 0 ? 3 : 1;
        currents[wy * cw + wx] = dir;
      }
    }
  }

  // ==================================================================
  // 3. CORAL -- grows naturally around rock formations
  // ==================================================================
  const coralNoise = (x: number, y: number): number =>
    F(x + 1234, y + 5678, cw * 0.12, 3);

  for (let i = 0; i < total; i++) {
    if (species[i] !== 1) continue;
    const cx3 = i % cw;
    const cy3 = (i / cw) | 0;
    for (const [dx, dy] of NEIGHBOURS_8) {
      const nx = wrapX(grid, cx3 + dx);
      const ny = wrapY(grid, cy3 + dy);
      const ni = ny * cw + nx;
      if (species[ni] !== 0) continue;
      const cn = (coralNoise(nx, ny) + 1) * 0.5;
      if (Math.random() < cn * 0.30) species[ni] = 12;
    }
  }

  // Extra coral in warm shallow zones
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = y * cw + x;
      if (species[idx] !== 0) continue;
      const warmZone = (F(x + 2000, y + 2000, cw * 0.18, 3) + 1) * 0.5;
      if (warmZone > 0.72 && Math.random() < 0.04) species[idx] = 12;
    }
  }

  // ==================================================================
  // 4. KELP FORESTS -- noise-field growth with natural clustering
  // ==================================================================
  const kelpNoise = (x: number, y: number): number =>
    F(x + 3456, y + 7890, cw * 0.10, 4);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = y * cw + x;
      if (species[idx] !== 0) continue;
      const kn = (kelpNoise(x, y) + 1) * 0.5;
      if (kn > 0.62) {
        const density = (kn - 0.62) / 0.38;
        if (Math.random() < density * 0.55) species[idx] = 11;
      }
    }
  }

  // ==================================================================
  // 5. PHYTOPLANKTON -- gradient bloom zones boosted near currents
  // ==================================================================
  const plankNoise = (x: number, y: number): number =>
    F(x + 6789, y + 1234, cw * 0.16, 5);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = y * cw + x;
      if (species[idx] !== 0) continue;
      let pn = (plankNoise(x, y) + 1) * 0.5;
      if (currents[idx] > 0) pn += 0.12;
      if (pn > 0.52) {
        const density = (pn - 0.52) / 0.48;
        if (Math.random() < density * 0.45) species[idx] = 10;
      }
    }
  }

  // ==================================================================
  // 6. ANIMAL PLACEMENT -- habitat-aware seeding
  // ==================================================================
  function nearbyHas(idx: number, sid: number, radius: number): boolean {
    const cx4 = idx % cw;
    const cy4 = (idx / cw) | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ni = wrapY(grid, cy4 + dy) * cw + wrapX(grid, cx4 + dx);
        if (species[ni] === sid) return true;
      }
    }
    return false;
  }

  const animalSeeds: Array<[number, number, [number, number, number] | null]> = [
    [20, 0.018, [10, 4, 3.0]],  // Shrimp near phytoplankton
    [21, 0.008, [11, 4, 3.0]],  // Snail near seaweed
    [22, 0.006, [1,  5, 2.0]],  // Crab near rocks
    [23, 0.003, [12, 4, 3.0]],  // Sea Urchin near coral
    [30, 0.008, [10, 5, 2.0]],  // Small Fish near plankton
    [31, 0.005, null],           // Squid -- open water
    [32, 0.004, [12, 5, 2.0]],  // Pufferfish near reef
    [40, 0.003, null],           // Shark -- open water
    [41, 0.003, [1,  5, 2.5]],  // Octopus near rocks
    [42, 0.002, null],           // Whale -- open water
    [43, 0.003, null],           // Dolphin -- open water
    [50, 0.010, null],           // Bacteria -- everywhere
    [51, 0.005, [1,  4, 2.0]],  // Sea Worm near rocks
  ];

  for (const [sid, frac, habitat] of animalSeeds) {
    let count = Math.max(4, (total * frac) | 0);
    let attempts = 0;
    const maxAttempts = total * 3;
    while (count > 0 && attempts < maxAttempts) {
      const idx = (Math.random() * total) | 0;
      if (species[idx] !== 0) { attempts++; continue; }
      if (habitat) {
        const [hSid, hRad, hBoost] = habitat;
        const near = nearbyHas(idx, hSid, hRad);
        if (!near && Math.random() > 1.0 / hBoost) { attempts++; continue; }
      }
      species[idx] = sid;
      hunger[idx] = 0;
      age[idx] = 0;
      count--;
      attempts++;
    }
  }
}
