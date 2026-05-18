import type { GridState } from '../types';
import { clearGrid, wrapX, wrapY } from '../core/grid';
import { seedSpeciesCluster, seedGrid, seedBalancedRockReefs } from './seeding';

export interface Scenario {
  id: string;
  name: string;
  desc: string;
  apply: (grid: GridState) => void;
}

/**
 * Place a dense rock reef cluster at a given centre point.
 * Used internally by scenarios that need custom rock formations.
 */
function placeRockCluster(
  grid: GridState,
  cx: number,
  cy: number,
  radius: number,
  density: number,
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      if (Math.random() > density) continue;
      const x = wrapX(grid, cx + dx);
      const y = wrapY(grid, cy + dy);
      const idx = y * grid.width + x;
      if (grid.species[idx] === 0) {
        grid.species[idx] = 1; // Rock
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

const balanced: Scenario = {
  id: 'balanced',
  name: 'Balanced Reef',
  desc: 'The default setup with all trophic tiers represented and scattered rock reefs.',
  apply(grid: GridState): void {
    clearGrid(grid);
    seedGrid(grid);
    seedBalancedRockReefs(grid);
  },
};

const producersOnly: Scenario = {
  id: 'producers_only',
  name: 'Producer Paradise',
  desc: 'Only producers seeded densely. No animals. Great for observing producer competition and evolution.',
  apply(grid: GridState): void {
    clearGrid(grid);
    const w = grid.width;
    const h = grid.height;
    const total = w * h;

    // Phytoplankton (10) - heavy coverage across the grid
    const phytoCount = (total * 0.16) | 0;
    seedSpeciesCluster(grid, 10, (w * 0.5) | 0, (h * 0.5) | 0, phytoCount, Math.max(w, h));

    // Seaweed (11) - moderate clusters
    seedSpeciesCluster(grid, 11, (w * 0.25) | 0, (h * 0.25) | 0, (total * 0.04) | 0, (w * 0.3) | 0);
    seedSpeciesCluster(grid, 11, (w * 0.75) | 0, (h * 0.75) | 0, (total * 0.04) | 0, (w * 0.3) | 0);

    // Coral (12) - smaller reef patches
    seedSpeciesCluster(grid, 12, (w * 0.5) | 0, (h * 0.3) | 0, (total * 0.015) | 0, (w * 0.15) | 0);
    seedSpeciesCluster(grid, 12, (w * 0.3) | 0, (h * 0.7) | 0, (total * 0.015) | 0, (w * 0.15) | 0);
  },
};

const predatorPit: Scenario = {
  id: 'predator_pit',
  name: 'Predator Pit',
  desc: 'Heavy herbivore population with very few consumers and apex. Tests top-down ecological control.',
  apply(grid: GridState): void {
    clearGrid(grid);
    const w = grid.width;
    const h = grid.height;
    const total = w * h;

    // Producers - moderate base
    seedSpeciesCluster(grid, 10, (w * 0.5) | 0, (h * 0.5) | 0, (total * 0.08) | 0, Math.max(w, h));
    seedSpeciesCluster(grid, 11, (w * 0.3) | 0, (h * 0.5) | 0, (total * 0.02) | 0, (w * 0.4) | 0);

    // Herbivores - very heavy
    seedSpeciesCluster(grid, 20, (w * 0.4) | 0, (h * 0.3) | 0, (total * 0.05) | 0, (w * 0.4) | 0);
    seedSpeciesCluster(grid, 21, (w * 0.6) | 0, (h * 0.6) | 0, (total * 0.03) | 0, (w * 0.3) | 0);
    seedSpeciesCluster(grid, 22, (w * 0.3) | 0, (h * 0.7) | 0, (total * 0.03) | 0, (w * 0.3) | 0);
    seedSpeciesCluster(grid, 23, (w * 0.7) | 0, (h * 0.4) | 0, (total * 0.015) | 0, (w * 0.2) | 0);

    // Consumers - very few
    seedSpeciesCluster(grid, 30, (w * 0.5) | 0, (h * 0.5) | 0, 4, 8);
    seedSpeciesCluster(grid, 31, (w * 0.2) | 0, (h * 0.2) | 0, 3, 6);

    // Apex - tiny presence
    seedSpeciesCluster(grid, 40, (w * 0.5) | 0, (h * 0.5) | 0, 2, 5);

    // Decomposers - light
    seedSpeciesCluster(grid, 50, (w * 0.5) | 0, (h * 0.8) | 0, (total * 0.005) | 0, (w * 0.3) | 0);

    // Some rocks
    seedBalancedRockReefs(grid);
  },
};

const extinctionRecovery: Scenario = {
  id: 'extinction_recovery',
  name: 'Post-Extinction',
  desc: 'Sparse survivors: only 2-3 species with tiny populations. Tests adaptive radiation and immigration.',
  apply(grid: GridState): void {
    clearGrid(grid);
    const w = grid.width;
    const h = grid.height;

    // A handful of phytoplankton - the primary survivor
    seedSpeciesCluster(grid, 10, (w * 0.5) | 0, (h * 0.5) | 0, 12, 6);

    // A tiny pocket of shrimp
    seedSpeciesCluster(grid, 20, (w * 0.3) | 0, (h * 0.4) | 0, 6, 4);

    // A couple of bacteria to decompose the dead
    seedSpeciesCluster(grid, 50, (w * 0.7) | 0, (h * 0.6) | 0, 5, 4);

    // Scattered rocks as remnant reef structure
    placeRockCluster(grid, (w * 0.5) | 0, (h * 0.5) | 0, 8, 0.3);
    placeRockCluster(grid, (w * 0.2) | 0, (h * 0.8) | 0, 5, 0.4);
  },
};

const reefFortress: Scenario = {
  id: 'reef_fortress',
  name: 'Reef Fortress',
  desc: 'Dense rock formations covering 30% of the grid with species clustered in reef gaps. Tests spatial dynamics.',
  apply(grid: GridState): void {
    clearGrid(grid);
    const w = grid.width;
    const h = grid.height;
    const total = w * h;

    // Place dense rock formations totalling roughly 30% of grid
    const targetRock = (total * 0.30) | 0;
    const numClusters = 8 + ((Math.random() * 6) | 0);
    const budgetPerCluster = (targetRock / numClusters) | 0;

    for (let c = 0; c < numClusters; c++) {
      const cx = (Math.random() * w) | 0;
      const cy = (Math.random() * h) | 0;
      const radius = 6 + ((Math.random() * 10) | 0);
      let placed = 0;

      for (let dy = -radius; dy <= radius && placed < budgetPerCluster; dy++) {
        for (let dx = -radius; dx <= radius && placed < budgetPerCluster; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          if (Math.random() > 0.75) continue;
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

    // Seed species in the gaps between rock formations
    // Producers tucked into reef pockets
    seedSpeciesCluster(grid, 10, (w * 0.5) | 0, (h * 0.5) | 0, (total * 0.04) | 0, Math.max(w, h));
    seedSpeciesCluster(grid, 11, (w * 0.3) | 0, (h * 0.3) | 0, (total * 0.015) | 0, (w * 0.25) | 0);
    seedSpeciesCluster(grid, 12, (w * 0.6) | 0, (h * 0.7) | 0, (total * 0.01) | 0, (w * 0.2) | 0);

    // Herbivores
    seedSpeciesCluster(grid, 20, (w * 0.4) | 0, (h * 0.6) | 0, (total * 0.01) | 0, (w * 0.3) | 0);
    seedSpeciesCluster(grid, 22, (w * 0.7) | 0, (h * 0.3) | 0, (total * 0.008) | 0, (w * 0.2) | 0);
    seedSpeciesCluster(grid, 23, (w * 0.5) | 0, (h * 0.5) | 0, (total * 0.004) | 0, (w * 0.15) | 0);

    // Consumers and apex - small pockets
    seedSpeciesCluster(grid, 30, (w * 0.5) | 0, (h * 0.4) | 0, (total * 0.005) | 0, (w * 0.2) | 0);
    seedSpeciesCluster(grid, 40, (w * 0.5) | 0, (h * 0.5) | 0, 3, 10);

    // Decomposers
    seedSpeciesCluster(grid, 50, (w * 0.5) | 0, (h * 0.5) | 0, (total * 0.005) | 0, Math.max(w, h));
  },
};

const deepAbyss: Scenario = {
  id: 'deep_abyss',
  name: 'Abyssal Plain',
  desc: 'Mostly decomposers and deep-water species with sparse producers. Tests bottom-up food web dynamics.',
  apply(grid: GridState): void {
    clearGrid(grid);
    const w = grid.width;
    const h = grid.height;
    const total = w * h;

    // Sparse producers - only a thin scattering of phytoplankton near the "surface"
    seedSpeciesCluster(grid, 10, (w * 0.5) | 0, (h * 0.15) | 0, (total * 0.01) | 0, (w * 0.4) | 0);

    // Decomposers - dominant life form
    seedSpeciesCluster(grid, 50, (w * 0.5) | 0, (h * 0.5) | 0, (total * 0.04) | 0, Math.max(w, h));
    seedSpeciesCluster(grid, 51, (w * 0.4) | 0, (h * 0.6) | 0, (total * 0.02) | 0, Math.max(w, h));

    // Deep-water species: squid (layer 2), octopus (layer 1, apex)
    seedSpeciesCluster(grid, 31, (w * 0.6) | 0, (h * 0.5) | 0, (total * 0.008) | 0, (w * 0.3) | 0);
    seedSpeciesCluster(grid, 41, (w * 0.4) | 0, (h * 0.7) | 0, (total * 0.005) | 0, (w * 0.25) | 0);

    // Bottom-dwelling herbivores - snails and crabs scavenging
    seedSpeciesCluster(grid, 21, (w * 0.3) | 0, (h * 0.5) | 0, (total * 0.008) | 0, (w * 0.25) | 0);
    seedSpeciesCluster(grid, 22, (w * 0.7) | 0, (h * 0.4) | 0, (total * 0.006) | 0, (w * 0.2) | 0);

    // Whale - deep diver
    seedSpeciesCluster(grid, 42, (w * 0.5) | 0, (h * 0.3) | 0, 3, 10);

    // Scattered rocky outcrops on the abyssal floor
    placeRockCluster(grid, (w * 0.2) | 0, (h * 0.7) | 0, 6, 0.35);
    placeRockCluster(grid, (w * 0.8) | 0, (h * 0.6) | 0, 5, 0.3);
    placeRockCluster(grid, (w * 0.5) | 0, (h * 0.9) | 0, 7, 0.25);
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const SCENARIOS: Scenario[] = [
  balanced,
  producersOnly,
  predatorPit,
  extinctionRecovery,
  reefFortress,
  deepAbyss,
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
