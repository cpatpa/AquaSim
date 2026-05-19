import type { GridState } from '../types';
import { wrapX, wrapY, planeSize, layerOffset } from '../core/grid';
import { noiseSeed, noise2D, fbm } from './terrain';
import { CARDINAL } from '../constants';
import { SPECIES } from '../species/registry';

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
  [60, 0.004],
  [61, 0.003],
  [62, 0.003],
  [63, 0.003],
  [64, 0.004],
  [65, 0.020],
  [66, 0.006],
  [67, 0.003],
];

/** Resolve the home layer for a species ID, clamped to valid range. */
function homeLayer(sid: number, layers: number): number {
  const sp = SPECIES[sid];
  if (!sp) return 0;
  const z = sp.layer;
  if (z < 0) return 0;
  if (z >= layers) return layers - 1;
  return z;
}

export function seedGrid(grid: GridState): void {
  const plane = planeSize(grid);
  for (const [sid, frac] of SEED_TARGETS) {
    const z = homeLayer(sid, grid.layers);
    const zOff = layerOffset(grid, z);
    let count = Math.max(2, (plane * frac) | 0);
    let attempts = 0;
    while (count > 0 && attempts < plane * 2) {
      const xy = (Math.random() * plane) | 0;
      const idx = zOff + xy;
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
  const plane = planeSize(grid);
  const rockBudget = (plane * 0.03) | 0;
  const numClusters = 3 + ((Math.random() * 4) | 0);
  const rockZ = homeLayer(1, grid.layers);
  const zOff = layerOffset(grid, rockZ);

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
        const idx = zOff + y * grid.width + x;
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
  const z = homeLayer(sid, grid.layers);
  const zOff = layerOffset(grid, z);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 10;

  while (placed < count && attempts < maxAttempts) {
    const dx = ((Math.random() - 0.5) * radius * 2) | 0;
    const dy = ((Math.random() - 0.5) * radius * 2) | 0;
    if (dx * dx + dy * dy > radius * radius) { attempts++; continue; }
    const x = wrapX(grid, cx + dx);
    const y = wrapY(grid, cy + dy);
    const idx = zOff + y * grid.width + x;
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
 *
 * All species are placed at their home layer (species.layer).
 */
export function seedBiome(grid: GridState): void {
  const plane = planeSize(grid);
  const cw = grid.width;
  const ch = grid.height;
  const seed = (Math.random() * 2147483647) | 0;
  noiseSeed(seed);

  const { species, hunger, age, currents } = grid;

  // Helper: write a species at its home layer
  const placeSpecies = (xy: number, sid: number): boolean => {
    const z = homeLayer(sid, grid.layers);
    const idx = z * plane + xy;
    if (species[idx] !== 0) return false;
    species[idx] = sid;
    hunger[idx] = 0;
    age[idx] = 0;
    return true;
  };

  const F = (x: number, y: number, scale: number, oct?: number): number =>
    fbm(x / scale, y / scale, oct ?? 5, 2.0, 0.5);

  // ==================================================================
  // 1. SEAFLOOR TOPOLOGY -- rocks at abyssal layer
  // ==================================================================
  const rockZ = homeLayer(1, grid.layers);
  const rockZOff = rockZ * plane;
  const rockThresh = 0.32;
  const ridgeScale = cw * 0.22;
  const detailScale = cw * 0.06;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const broad = F(x, y, ridgeScale, 4);
      const detail = F(x + 500, y + 500, detailScale, 3) * 0.4;
      const edgeDist = Math.min(y, ch - 1 - y) / (ch * 0.12);
      const edgeBias = Math.max(0, 1.0 - edgeDist) * 0.45;
      const h = broad + detail + edgeBias;
      if (h > rockThresh) {
        const p = Math.min(1.0, (h - rockThresh) * 3.0);
        if (Math.random() < p) species[rockZOff + y * cw + x] = 1;
      }
    }
  }

  // Reef ridges
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
        const idx = rockZOff + wy * cw + x;
        if (Math.random() < 0.12) continue;
        if (species[idx] === 0) species[idx] = 1;
      }
    }
  }

  // ==================================================================
  // 2. OCEAN CURRENTS (3D, varying by depth layer)
  // ==================================================================
  // Surface/Canopy get strong currents; deeper layers get weaker,
  // shifted-direction currents. Abyssal has almost no current.
  const layerCurrentChance = [0.05, 0.15, 0.3, 0.5, 0.85, 1.0]; // z=0..5
  const numStreams = 4 + ((Math.random() * 4) | 0);
  for (let s = 0; s < numStreams; s++) {
    const horizontal = Math.random() < 0.6;
    let cx0: number, cy0: number, mainDir: number;
    if (horizontal) {
      cx0 = 0;
      cy0 = (ch * (0.1 + Math.random() * 0.8)) | 0;
      mainDir = Math.random() < 0.5 ? 2 : 4;
    } else {
      cx0 = (cw * (0.1 + Math.random() * 0.8)) | 0;
      cy0 = 0;
      mainDir = Math.random() < 0.5 ? 3 : 1;
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
        const xyI = py * cw + px;
        for (let z = 0; z < grid.layers; z++) {
          const chance = z < layerCurrentChance.length ? layerCurrentChance[z] : 0.5;
          if (Math.random() < chance) {
            currents[z * plane + xyI] = mainDir;
          }
        }
      }
    }
  }

  // Gyres (surface/pelagic layers only)
  const numGyres = 2 + ((Math.random() * 2) | 0);
  for (let g = 0; g < numGyres; g++) {
    const gx = (cw * (0.2 + Math.random() * 0.6)) | 0;
    const gy = (ch * (0.2 + Math.random() * 0.6)) | 0;
    const rx = 18 + ((Math.random() * 30) | 0);
    const ry = 14 + ((Math.random() * 25) | 0);
    const thick = 3 + ((Math.random() * 4) | 0);
    const cwDir = Math.random() < 0.5 ? 1 : -1;
    const noiseOff = Math.random() * 1000;

    for (let dy = -(ry + thick + 3); dy <= ry + thick + 3; dy++) {
      for (let dx = -(rx + thick + 3); dx <= rx + thick + 3; dx++) {
        const normDist = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry));
        const nPerturb = noise2D((dx + noiseOff) * 0.08, (dy + noiseOff) * 0.08) * 0.15;
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
        const xyI = wy * cw + wx;
        // Gyres affect upper layers (Pelagic, Surface, Canopy)
        for (let z = 3; z < grid.layers; z++) {
          currents[z * plane + xyI] = dir;
        }
      }
    }
  }

  // ==================================================================
  // 3. CORAL -- grows at reef layer adjacent to rocks below
  // ==================================================================
  const coralZ = homeLayer(12, grid.layers);
  const coralZOff = coralZ * plane;
  const coralNoise = (x: number, y: number): number =>
    F(x + 1234, y + 5678, cw * 0.12, 3);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const rockIdx = rockZOff + y * cw + x;
      if (species[rockIdx] !== 1) continue;
      // Try placing coral in reef layer above adjacent rocks
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = wrapX(grid, x + dx);
        const ny = wrapY(grid, y + dy);
        const coralIdx = coralZOff + ny * cw + nx;
        if (species[coralIdx] !== 0) continue;
        const cn = (coralNoise(nx, ny) + 1) * 0.5;
        if (Math.random() < cn * 0.30) species[coralIdx] = 12;
      }
    }
  }
  // Extra coral in warm zones
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = coralZOff + y * cw + x;
      if (species[idx] !== 0) continue;
      const warmZone = (F(x + 2000, y + 2000, cw * 0.18, 3) + 1) * 0.5;
      if (warmZone > 0.72 && Math.random() < 0.04) species[idx] = 12;
    }
  }

  // ==================================================================
  // 4. KELP / SEAWEED -- benthic layer
  // ==================================================================
  const kelpZ = homeLayer(11, grid.layers);
  const kelpZOff = kelpZ * plane;
  const kelpNoise = (x: number, y: number): number =>
    F(x + 3456, y + 7890, cw * 0.10, 4);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = kelpZOff + y * cw + x;
      if (species[idx] !== 0) continue;
      const kn = (kelpNoise(x, y) + 1) * 0.5;
      if (kn > 0.62) {
        const density = (kn - 0.62) / 0.38;
        if (Math.random() < density * 0.55) species[idx] = 11;
      }
    }
  }

  // Kelp (65) -- grows alongside seaweed in benthic layer
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = kelpZOff + y * cw + x;
      if (species[idx] !== 0) continue;
      const kn = (kelpNoise(x, y) + 1) * 0.5;
      if (kn > 0.66 && Math.random() < 0.15) species[idx] = 65;
    }
  }

  // Anemone (66) -- grows near coral in reef layer
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const coralIdx = coralZOff + y * cw + x;
      if (species[coralIdx] !== 12) continue;
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = wrapX(grid, x + dx);
        const ny = wrapY(grid, y + dy);
        const nIdx = coralZOff + ny * cw + nx;
        if (species[nIdx] === 0 && Math.random() < 0.06) species[nIdx] = 66;
      }
    }
  }

  // ==================================================================
  // 5. PHYTOPLANKTON -- surface layer
  // ==================================================================
  const plankZ = homeLayer(10, grid.layers);
  const plankZOff = plankZ * plane;
  const plankNoise = (x: number, y: number): number =>
    F(x + 6789, y + 1234, cw * 0.16, 5);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = plankZOff + y * cw + x;
      if (species[idx] !== 0) continue;
      let pn = (plankNoise(x, y) + 1) * 0.5;
      if (currents[plankZOff + y * cw + x] > 0) pn += 0.12;
      if (pn > 0.52) {
        const density = (pn - 0.52) / 0.48;
        if (Math.random() < density * 0.45) species[idx] = 10;
      }
    }
  }

  // ==================================================================
  // 6. ANIMAL PLACEMENT -- habitat-aware seeding at home layers
  // ==================================================================
  function nearbyHas(xyIdx: number, targetSid: number, radius: number): boolean {
    const targetZ = homeLayer(targetSid, grid.layers);
    const targetZOff = targetZ * plane;
    const cx4 = xyIdx % cw;
    const cy4 = (xyIdx / cw) | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ni = targetZOff + wrapY(grid, cy4 + dy) * cw + wrapX(grid, cx4 + dx);
        if (species[ni] === targetSid) return true;
      }
    }
    return false;
  }

  const animalSeeds: Array<[number, number, [number, number, number] | null]> = [
    [20, 0.018, [10, 4, 3.0]],
    [21, 0.008, [11, 4, 3.0]],
    [22, 0.006, [1,  5, 2.0]],
    [23, 0.003, [12, 4, 3.0]],
    [30, 0.008, [10, 5, 2.0]],
    [31, 0.005, null],
    [32, 0.004, [12, 5, 2.0]],
    [40, 0.003, null],
    [41, 0.003, [1,  5, 2.5]],
    [42, 0.002, null],
    [43, 0.003, null],
    [50, 0.010, null],
    [51, 0.005, [1,  4, 2.0]],
    [60, 0.004, null],
    [61, 0.003, [11, 5, 2.0]],
    [62, 0.003, [10, 5, 2.0]],
    [63, 0.003, null],
    [64, 0.004, [12, 4, 2.5]],
    [67, 0.003, [1,  4, 2.0]],
  ];

  for (const [sid, frac, habitat] of animalSeeds) {
    let count = Math.max(4, (plane * frac) | 0);
    let attempts = 0;
    const maxAttempts = plane * 3;
    while (count > 0 && attempts < maxAttempts) {
      const xy = (Math.random() * plane) | 0;
      if (habitat) {
        const [hSid, hRad, hBoost] = habitat;
        const near = nearbyHas(xy, hSid, hRad);
        if (!near && Math.random() > 1.0 / hBoost) { attempts++; continue; }
      }
      if (placeSpecies(xy, sid)) count--;
      attempts++;
    }
  }
}
