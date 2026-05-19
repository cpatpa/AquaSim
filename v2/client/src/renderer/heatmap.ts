import type { GridState, EvoStats } from '../types';
import { CELL_SIZE } from '../constants';
import { getSpecies } from '../species/registry';
import { speciesGeneticDiversity } from '../evolution/genetics';

// ---------------------------------------------------------------------------
// Heatmap mode type and metadata
// ---------------------------------------------------------------------------

export type HeatmapMode =
  | 'none'
  | 'hunger'
  | 'age'
  | 'density'
  | 'traits'
  | 'genetic_diversity';

export const HEATMAP_MODES: Array<{
  id: HeatmapMode;
  label: string;
  desc: string;
}> = [
  { id: 'none', label: 'None', desc: 'No overlay' },
  { id: 'hunger', label: 'Hunger', desc: 'Green (low) to red (high hunger)' },
  { id: 'age', label: 'Age', desc: 'Blue (young) to yellow (old)' },
  { id: 'density', label: 'Density', desc: 'Same-species neighbour count, cold blue to hot red' },
  { id: 'traits', label: 'Traits', desc: 'Number of active traits per species' },
  { id: 'genetic_diversity', label: 'Genetic Diversity', desc: 'Per-species heterozygosity, blue to magenta' },
];

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function rgba(r: number, g: number, b: number, a: number): string {
  return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a.toFixed(2) + ')';
}

/** Linearly interpolate between two RGB colours at parameter t in [0,1]. */
function lerpRgb(
  r0: number, g0: number, b0: number,
  r1: number, g1: number, b1: number,
  t: number,
): [number, number, number] {
  return [
    r0 + (r1 - r0) * t,
    g0 + (g1 - g0) * t,
    b0 + (b1 - b0) * t,
  ];
}

// ---------------------------------------------------------------------------
// Per-mode colour computation
// ---------------------------------------------------------------------------

function hungerColour(intensity: number): string {
  // green (0) -> yellow (0.5) -> red (1)
  const t = Math.max(0, Math.min(1, intensity));
  const [r, g, b] =
    t < 0.5
      ? lerpRgb(0, 200, 0, 220, 220, 0, t * 2)
      : lerpRgb(220, 220, 0, 220, 0, 0, (t - 0.5) * 2);
  return rgba(r, g, b, 0.45);
}

function ageColour(intensity: number): string {
  // blue (0) -> cyan (0.33) -> yellow (1)
  const t = Math.max(0, Math.min(1, intensity));
  const [r, g, b] =
    t < 0.33
      ? lerpRgb(30, 80, 220, 30, 200, 220, t / 0.33)
      : lerpRgb(30, 200, 220, 240, 230, 40, (t - 0.33) / 0.67);
  return rgba(r, g, b, 0.45);
}

function densityColour(count: number): string {
  // 0-1 cold blue, 2-3 cyan, 4-5 yellow, 6+ hot red
  const t = Math.max(0, Math.min(1, count / 8));
  let r: number, g: number, b: number;
  if (t < 0.25) {
    [r, g, b] = lerpRgb(30, 60, 200, 30, 180, 220, t / 0.25);
  } else if (t < 0.5) {
    [r, g, b] = lerpRgb(30, 180, 220, 200, 220, 60, (t - 0.25) / 0.25);
  } else if (t < 0.75) {
    [r, g, b] = lerpRgb(200, 220, 60, 230, 160, 30, (t - 0.5) / 0.25);
  } else {
    [r, g, b] = lerpRgb(230, 160, 30, 220, 30, 20, (t - 0.75) / 0.25);
  }
  return rgba(r, g, b, 0.5);
}

function traitsColour(traitCount: number): string {
  if (traitCount === 0) return rgba(120, 120, 120, 0.35);
  if (traitCount <= 2) return rgba(40, 190, 60, 0.45);
  if (traitCount <= 4) return rgba(220, 200, 30, 0.45);
  return rgba(220, 50, 30, 0.5);
}

function geneticDiversityColour(heterozygosity: number): string {
  // blue (low, ~0) -> purple (mid) -> magenta (high, ~1)
  const t = Math.max(0, Math.min(1, heterozygosity * 4)); // scale up since typical values are 0-0.25
  const [r, g, b] =
    t < 0.5
      ? lerpRgb(40, 60, 220, 160, 40, 200, t * 2)
      : lerpRgb(160, 40, 200, 230, 30, 180, (t - 0.5) * 2);
  return rgba(r, g, b, 0.45);
}

// ---------------------------------------------------------------------------
// Main overlay drawing
// ---------------------------------------------------------------------------

export function drawHeatmapOverlay(
  ctx: CanvasRenderingContext2D,
  grid: GridState,
  evoStats: Record<number, EvoStats>,
  mode: HeatmapMode,
): void {
  if (mode === 'none') return;

  const { width, height, species, hunger, age } = grid;
  const cs = CELL_SIZE;

  // Pre-compute per-species genetic diversity for the genetic_diversity mode
  let diversityCache: Map<number, number> | undefined;
  if (mode === 'genetic_diversity') {
    diversityCache = new Map();
    for (const sidStr in evoStats) {
      const sid = Number(sidStr);
      diversityCache.set(sid, speciesGeneticDiversity(evoStats[sid].genes));
    }
  }

  const plane = width * height;
  const gridLayers = grid.layers;
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const xyIdx = cy * width + cx;
      // Find topmost non-empty species at this xy column
      let sid = 0;
      let idx = xyIdx;
      for (let z = gridLayers - 1; z >= 0; z--) {
        const tryIdx = z * plane + xyIdx;
        if (species[tryIdx] !== 0) { sid = species[tryIdx]; idx = tryIdx; break; }
      }
      if (sid === 0) continue;

      const sp = getSpecies(sid);
      if (!sp) continue;

      let fill: string | undefined;

      switch (mode) {
        case 'hunger': {
          const es = evoStats[sid];
          if (es && es.hungerMax > 0) {
            fill = hungerColour(hunger[idx] / es.hungerMax);
          }
          break;
        }

        case 'age': {
          fill = ageColour(Math.min(1, age[idx] / 200));
          break;
        }

        case 'density': {
          let count = 0;
          // Pick the layer where the visible species lives
          const sidLayer = ((idx - xyIdx) / plane) | 0;
          const layerOff = sidLayer * plane;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              const nx = cx + dx;
              if (nx < 0 || nx >= width) continue;
              if (species[layerOff + ny * width + nx] === sid) count++;
            }
          }
          fill = densityColour(count);
          break;
        }

        case 'traits': {
          const es = evoStats[sid];
          const traitCount = es ? es.traits.length : 0;
          fill = traitsColour(traitCount);
          break;
        }

        case 'genetic_diversity': {
          const div = diversityCache!.get(sid) ?? 0;
          fill = geneticDiversityColour(div);
          break;
        }
      }

      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(cx * cs, cy * cs, cs, cs);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Legend generation
// ---------------------------------------------------------------------------

export function heatmapLegend(
  mode: HeatmapMode,
): Array<{ color: string; label: string }> {
  switch (mode) {
    case 'none':
      return [];

    case 'hunger':
      return [
        { color: rgba(0, 200, 0, 0.8), label: 'Low' },
        { color: rgba(110, 210, 0, 0.8), label: '25%' },
        { color: rgba(220, 220, 0, 0.8), label: '50%' },
        { color: rgba(220, 110, 0, 0.8), label: '75%' },
        { color: rgba(220, 0, 0, 0.8), label: 'Max' },
      ];

    case 'age':
      return [
        { color: rgba(30, 80, 220, 0.8), label: 'Young' },
        { color: rgba(30, 200, 220, 0.8), label: '~65' },
        { color: rgba(135, 215, 130, 0.8), label: '~100' },
        { color: rgba(240, 230, 40, 0.8), label: '200+' },
      ];

    case 'density':
      return [
        { color: rgba(30, 60, 200, 0.8), label: '0-1' },
        { color: rgba(30, 180, 220, 0.8), label: '2-3' },
        { color: rgba(200, 220, 60, 0.8), label: '4-5' },
        { color: rgba(230, 160, 30, 0.8), label: '6-7' },
        { color: rgba(220, 30, 20, 0.8), label: '8' },
      ];

    case 'traits':
      return [
        { color: rgba(120, 120, 120, 0.8), label: '0' },
        { color: rgba(40, 190, 60, 0.8), label: '1-2' },
        { color: rgba(220, 200, 30, 0.8), label: '3-4' },
        { color: rgba(220, 50, 30, 0.8), label: '5+' },
      ];

    case 'genetic_diversity':
      return [
        { color: rgba(40, 60, 220, 0.8), label: 'Low' },
        { color: rgba(100, 50, 210, 0.8), label: 'Moderate' },
        { color: rgba(160, 40, 200, 0.8), label: 'High' },
        { color: rgba(230, 30, 180, 0.8), label: 'Very high' },
      ];
  }
}
