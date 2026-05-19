import type { GridState, Particle, EvoStats } from '../types';
import { CELL_SIZE, GRID_GAP, MAX_PARTICLES, LAVA_COOL_AGE, LAYER_COLORS } from '../constants';
import { COLOR_RGB, getSpecies, layerOf } from '../species/registry';
import { TRAIT_BITS } from '../evolution/traits';

// Pre-parse LAYER_COLORS to RGB tuples for fast Pass 5 access
const LAYER_RGB: [number, number, number][] = LAYER_COLORS.map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
});

// ---------------------------------------------------------------------------
// Renderer state
// ---------------------------------------------------------------------------

export interface RendererState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imgData: ImageData;
  imgPixels: Uint8ClampedArray;
  highlightSpecies: number;
  particles: Particle[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a RendererState bound to the given canvas element.
 * Call `initCanvas` afterwards whenever the grid dimensions change.
 */
export function createRenderer(canvas: HTMLCanvasElement): RendererState {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.createImageData(1, 1); // placeholder, initCanvas sets real size
  return {
    canvas,
    ctx,
    imgData,
    imgPixels: imgData.data,
    highlightSpecies: -1,
    particles: [],
  };
}

// ---------------------------------------------------------------------------
// Canvas initialisation
// ---------------------------------------------------------------------------

/**
 * Resize the canvas to match grid dimensions and allocate the pixel buffer.
 */
export function initCanvas(rs: RendererState, gridWidth: number, gridHeight: number): void {
  const canvasW = gridWidth * CELL_SIZE;
  const canvasH = gridHeight * CELL_SIZE;
  rs.canvas.width = canvasW;
  rs.canvas.height = canvasH;
  rs.imgData = rs.ctx.createImageData(canvasW, canvasH);
  rs.imgPixels = rs.imgData.data;
}

// ---------------------------------------------------------------------------
// Particle system
// ---------------------------------------------------------------------------

/**
 * Spawn a burst of death particles at the cell position `idx` using the
 * colour of species `sid`.
 */
export function spawnDeathParticles(
  rs: RendererState,
  idx: number,
  sid: number,
  gridWidth: number,
): void {
  if (rs.particles.length >= MAX_PARTICLES) return;

  const cx = (idx % gridWidth) * CELL_SIZE + 3;
  const cy = ((idx / gridWidth) | 0) * CELL_SIZE + 3;
  const rgb = COLOR_RGB[sid];
  if (!rgb) return;

  const count = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < count && rs.particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 1.2;
    rs.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: rgb[0],
      g: rgb[1],
      b: rgb[2],
      life: 8 + ((Math.random() * 8) | 0),
    });
  }
}

/**
 * Advance every particle by one tick. Dead particles are removed.
 */
export function tickParticles(rs: RendererState): void {
  for (let i = rs.particles.length - 1; i >= 0; i--) {
    const p = rs.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.04;
    p.life--;
    if (p.life <= 0) {
      rs.particles.splice(i, 1);
    }
  }
}

/**
 * Draw surviving particles onto the canvas via the 2D context (not the
 * ImageData buffer, since particles float above the grid).
 */
export function drawParticles(rs: RendererState): void {
  if (rs.particles.length === 0) return;
  for (let i = 0; i < rs.particles.length; i++) {
    const p = rs.particles[i];
    const alpha = Math.min(1, p.life / 6);
    rs.ctx.fillStyle =
      'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + alpha.toFixed(2) + ')';
    rs.ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
  }
}

// ---------------------------------------------------------------------------
// Main render pipeline
// ---------------------------------------------------------------------------

/**
 * Four-pass render of the entire grid into the offscreen ImageData buffer,
 * then blit to screen.
 *
 * Pass 1 - depth-gradient background
 * Pass 2 - water caustics on empty cells
 * Pass 3 - per-cell species rendering (hunger dimming, noise variation,
 *           bevel, trait glows, special effects)
 * Pass 4 - current overlay with directional arrows
 */
export function render(
  rs: RendererState,
  grid: GridState,
  evoStats: Record<number, EvoStats>,
  _season: string,
  generation: number,
  focusLayer: number = -1,
): void {
  const cw = grid.width;
  const ch = grid.height;
  const cs = CELL_SIZE;
  const gap = GRID_GAP;
  const pw = rs.canvas.width;
  const ph = rs.canvas.height;
  const data = rs.imgPixels;
  const bgBase = COLOR_RGB[0]; // empty-cell colour
  const innerSize = cs - gap;
  const gen = generation;
  const hlSid = rs.highlightSpecies;
  const lastInner = innerSize - 1;

  const { species, hunger, age, currents, cellNoise, cellNoise2 } = grid;

  // --- Pass 1: depth-gradient background --------------------------------
  for (let py = 0; py < ph; py++) {
    const dt = py / ph;
    const bgR = Math.max(0, (bgBase[0] + 8 * (1 - dt)) | 0);
    const bgG = Math.max(0, (bgBase[1] + 14 * (1 - dt)) | 0);
    const bgB = Math.max(0, (bgBase[2] + 20 * (1 - dt) - 4 * dt) | 0);
    const rowOff = py * pw * 4;
    for (let px = 0; px < pw; px++) {
      const off = rowOff + px * 4;
      data[off] = bgR;
      data[off + 1] = bgG;
      data[off + 2] = bgB;
      data[off + 3] = 255;
    }
  }

  // --- Pass 2: water caustics on empty cells ----------------------------
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const idx = cy * cw + cx;
      if (species[idx] !== 0) continue;

      const nv = cellNoise[idx];
      if (nv < 0.15) continue;
      const bright = ((nv - 0.15) * 12) | 0;
      if (bright <= 0) continue;

      const px0 = cx * cs;
      const py0 = cy * cs;
      const cx2 = ((cellNoise2[idx] + 1) * 3.5) | 0;
      const cy2 = (cellNoise[idx] * 3.5) | 0;
      const cpx = px0 + Math.min(cx2, lastInner);
      const cpy = py0 + Math.min(Math.abs(cy2), lastInner);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ppx = cpx + dx;
          const ppy = cpy + dy;
          if (
            ppx >= px0 &&
            ppx < px0 + innerSize &&
            ppy >= py0 &&
            ppy < py0 + innerSize
          ) {
            const off = (ppy * pw + ppx) * 4;
            const falloff = dx === 0 && dy === 0 ? 1.0 : 0.5;
            const b = (bright * falloff) | 0;
            data[off] += b;
            data[off + 1] += ((b * 1.2) | 0);
            data[off + 2] += ((b * 1.5) | 0);
          }
        }
      }
    }
  }

  // --- Pass 3: cell rendering with noise, bevel, effects ----------------
  for (let cy = 0; cy < ch; cy++) {
    const depthDim = 1.0 - (cy / ch) * 0.12;

    for (let cx = 0; cx < cw; cx++) {
      const idx = cy * cw + cx;
      const sid = species[idx];
      if (sid === 0) continue;

      const rgb = COLOR_RGB[sid];
      if (!rgb) continue;
      let baseR = rgb[0];
      let baseG = rgb[1];
      let baseB = rgb[2];

      const nv = cellNoise[idx];
      const nv2 = cellNoise2[idx];
      const sp = getSpecies(sid);

      // Hunger dimming for animals
      let hungerF = 1.0;
      if (sp && sp.hungerMax) {
        const es = evoStats[sid];
        if (es) {
          hungerF = Math.max(0.35, 1 - hunger[idx] / es.hungerMax);
        }
      }

      // Noise colour variation: per-cell subtle shift
      let noiseShift = nv * 0.1;

      // Species-specific rendering adjustments
      let glowR = 0;
      let glowG = 0;
      let glowB = 0;
      let bevelStrength = 16;
      let isLava = false;
      let isIce = false;

      if (sid === 1) {
        // Rock: heavier noise for natural stone appearance
        noiseShift = nv * 0.18;
        const stoneHue = nv2 * 8;
        baseR += stoneHue | 0;
        baseG += ((stoneHue * 0.7) | 0);
        bevelStrength = 22;
      } else if (sid === 7) {
        // Lava: pulsing glow, warm centre
        isLava = true;
        const lavaAge = age[idx];
        const pulse = 0.8 + 0.2 * Math.sin(lavaAge * 0.25 + nv * 3);
        noiseShift = nv * 0.08;
        baseR = Math.min(
          255,
          ((baseR * pulse + 40 * (1 - lavaAge / LAVA_COOL_AGE)) | 0),
        );
        baseG = Math.min(
          255,
          ((baseG * pulse + 25 * Math.max(0, 1 - lavaAge / 20)) | 0),
        );
        glowR = 60;
        glowG = 15;
        bevelStrength = 10;
      } else if (sid === 5) {
        // Ice: crystalline shimmer
        isIce = true;
        const shimmer =
          0.92 + 0.08 * Math.sin(cx * 1.5 + cy * 0.9 + gen * 0.15);
        baseR = (baseR * shimmer) | 0;
        baseG = (baseG * shimmer) | 0;
        baseB = (baseB * shimmer) | 0;
        noiseShift = nv2 * 0.06;
        bevelStrength = 24;
      } else if (sid === 6) {
        // Toxic Bloom: eerie pulsing glow
        const tPulse = 0.88 + 0.12 * Math.sin(gen * 0.2 + nv * 5);
        baseG = Math.min(255, (baseG * tPulse) | 0);
        glowG = 30;
        bevelStrength = 12;
      } else if (sid === 3) {
        // Dead: muted, low variation
        noiseShift = nv * 0.05;
        bevelStrength = 8;
      } else if (sid === 4) {
        // Oil: dark with subtle iridescence
        const iriShift = (nv2 * 6) | 0;
        baseR += iriShift;
        baseB += ((iriShift * 0.8) | 0);
        bevelStrength = 6;
      } else if (sp && sp.tier === 'producer') {
        // Producers: organic variation
        noiseShift = nv * 0.14;
        const organicWave = Math.sin(cx * 0.8 + cy * 0.5) * 4;
        baseG = Math.min(255, Math.max(0, baseG + organicWave));
      }

      // Trait-based visual flair
      if (sp && sp.tier !== 'environment' && sp.tier !== 'transient') {
        const es = evoStats[sid];
        if (es && es.traits && es.traits.length > 0) {
          for (let ti = 0; ti < es.traits.length; ti++) {
            const tr = es.traits[ti];
            if (tr === 'bioluminesc') {
              const bioPulse = 0.6 + 0.4 * Math.sin(gen * 0.15 + nv * 4);
              glowR += ((15 * bioPulse) | 0);
              glowG += ((20 * bioPulse) | 0);
              glowB += ((30 * bioPulse) | 0);
            } else if (tr === 'toxic') {
              baseG = Math.min(255, baseG + 12);
            } else if (tr === 'armored' || tr === 'shell') {
              bevelStrength += 8;
            } else if (tr === 'chromatophores') {
              const chromShift =
                Math.sin(gen * 0.08 + cx * 0.3 + cy * 0.2) * 12;
              baseR = Math.min(255, Math.max(0, baseR + chromShift));
              baseB = Math.min(255, Math.max(0, baseB - chromShift));
            } else if (tr === 'streamlined') {
              bevelStrength -= 4;
            } else if (tr === 'hypermetabolism') {
              const hyperPulse = 0.9 + 0.1 * Math.sin(gen * 0.3 + nv * 3);
              baseR = Math.min(255, ((baseR * hyperPulse + 8) | 0));
            } else if (tr === 'cooperativehunt' || tr === 'schooling') {
              glowB += 6;
            }
          }
        }
      }

      // Apply combined factor
      const factor = hungerF * depthDim * (1 + noiseShift);
      let r = Math.min(255, Math.max(0, (baseR * factor) | 0));
      let g = Math.min(255, Math.max(0, (baseG * factor) | 0));
      let b = Math.min(255, Math.max(0, (baseB * factor) | 0));

      // Highlight dimming
      if (hlSid >= 0 && sid !== hlSid) {
        r = (r * 0.15) | 0;
        g = (g * 0.15) | 0;
        b = (b * 0.15) | 0;
      }

      // Fill inner cell with bevel effect
      const px0 = cx * cs;
      const py0 = cy * cs;
      const hiR = Math.min(255, r + bevelStrength);
      const hiG = Math.min(255, g + bevelStrength);
      const hiB = Math.min(255, b + bevelStrength);
      const shR = Math.max(0, r - bevelStrength);
      const shG = Math.max(0, g - bevelStrength);
      const shB = Math.max(0, b - bevelStrength);

      for (let ly = 0; ly < innerSize; ly++) {
        const rowOff = (py0 + ly) * pw * 4;
        const isTop = ly === 0;
        const isBot = ly === lastInner;
        for (let lx = 0; lx < innerSize; lx++) {
          const off = rowOff + (px0 + lx) * 4;
          if (isTop || lx === 0) {
            data[off] = hiR;
            data[off + 1] = hiG;
            data[off + 2] = hiB;
          } else if (isBot || lx === lastInner) {
            data[off] = shR;
            data[off + 1] = shG;
            data[off + 2] = shB;
          } else {
            data[off] = r;
            data[off + 1] = g;
            data[off + 2] = b;
          }
        }
      }

      // Glow: bleed light into gap pixels for lava, toxic bloom, bioluminescent
      if (glowR | glowG | glowB) {
        if (gap > 0) {
          for (let ly = 0; ly < innerSize; ly++) {
            const gapOff = ((py0 + ly) * pw + px0 + innerSize) * 4;
            data[gapOff] = Math.min(255, data[gapOff] + glowR);
            data[gapOff + 1] = Math.min(255, data[gapOff + 1] + glowG);
            data[gapOff + 2] = Math.min(255, data[gapOff + 2] + glowB);
          }
          for (let lx = 0; lx <= innerSize; lx++) {
            const gapOff = ((py0 + innerSize) * pw + px0 + lx) * 4;
            data[gapOff] = Math.min(255, data[gapOff] + glowR);
            data[gapOff + 1] = Math.min(255, data[gapOff + 1] + glowG);
            data[gapOff + 2] = Math.min(255, data[gapOff + 2] + glowB);
          }
        }
      }

      // Trait cell indicators: subtle per-cell markers
      if (sp && sp.hungerMax && innerSize >= 5) {
        const es = evoStats[sid];
        if (es) {
          const tBM = es._traitBitmask || 0;
          // Shell: bright centre dot
          if (tBM & TRAIT_BITS['shell']) {
            const cmid = innerSize >> 1;
            const coff = ((py0 + cmid) * pw + px0 + cmid) * 4;
            data[coff] = Math.min(255, data[coff] + 60);
            data[coff + 1] = Math.min(255, data[coff + 1] + 60);
            data[coff + 2] = Math.min(255, data[coff + 2] + 60);
          }
          // Toxic: green tint pixel at noise position
          if (tBM & TRAIT_BITS['toxic']) {
            const tnpx = px0 + ((nv * (innerSize - 1)) | 0);
            const tnpy = py0 + (((nv2 * 0.5 + 0.5) * (innerSize - 1)) | 0);
            const tnoff = (tnpy * pw + tnpx) * 4;
            data[tnoff + 1] = Math.min(255, data[tnoff + 1] + 40);
          }
        }
      }

      // Lava: centre hot-spot (inner 3x3 brighter)
      if (isLava && age[idx] < 20) {
        const cStart = (innerSize - 3) >> 1;
        const heat = Math.max(0, 1 - age[idx] / 20);
        const addR = (40 * heat) | 0;
        const addG = (20 * heat) | 0;
        for (let ly = cStart; ly < cStart + 3; ly++) {
          const rowOff = (py0 + ly) * pw * 4;
          for (let lx = cStart; lx < cStart + 3; lx++) {
            const off = rowOff + (px0 + lx) * 4;
            data[off] = Math.min(255, data[off] + addR);
            data[off + 1] = Math.min(255, data[off + 1] + addG);
          }
        }
      }

      // Ice: bright centre pixel for sparkle
      if (isIce) {
        const sparkle = Math.sin(cx * 2.7 + cy * 1.3 + gen * 0.3) > 0.6;
        if (sparkle) {
          const mid = innerSize >> 1;
          const off = ((py0 + mid) * pw + px0 + mid) * 4;
          data[off] = 255;
          data[off + 1] = 255;
          data[off + 2] = 255;
        }
      }
    }
  }

  // --- Pass 4: current overlay + arrows ---------------------------------
  const curRGB = COLOR_RGB[2]; // Current colour
  const curR = curRGB[0];
  const curG = curRGB[1];
  const curB = curRGB[2];
  const alpha = 0.25;
  const inv = 1 - alpha;
  const arwR = 80;
  const arwG = 160;
  const arwB = 255;

  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const idx = cy * cw + cx;
      const cdir = currents[idx];
      if (!cdir) continue;

      const px0 = cx * cs;
      const py0 = cy * cs;

      // Tint cell with current colour
      for (let py = py0; py < py0 + innerSize; py++) {
        const rowOff = py * pw * 4;
        for (let px = px0; px < px0 + innerSize; px++) {
          const off = rowOff + px * 4;
          data[off] = ((data[off] * inv + curR * alpha) | 0);
          data[off + 1] = ((data[off + 1] * inv + curG * alpha) | 0);
          data[off + 2] = ((data[off + 2] * inv + curB * alpha) | 0);
        }
      }

      // Direction arrow: 1=up, 2=right, 3=down, 4=left
      const mid = (innerSize / 2) | 0;
      const mcx = px0 + mid;
      const mcy = py0 + mid;
      let arrowPx: [number, number][];
      if (cdir === 1) {
        arrowPx = [[0, -1], [0, 0], [-1, 0], [1, 0], [0, 1]];
      } else if (cdir === 2) {
        arrowPx = [[-1, 0], [0, 0], [0, -1], [0, 1], [1, 0]];
      } else if (cdir === 3) {
        arrowPx = [[0, 1], [0, 0], [-1, 0], [1, 0], [0, -1]];
      } else {
        arrowPx = [[1, 0], [0, 0], [0, -1], [0, 1], [-1, 0]];
      }

      for (const [adx, ady] of arrowPx) {
        const apx = mcx + adx;
        const apy = mcy + ady;
        if (
          apx >= px0 &&
          apx < px0 + innerSize &&
          apy >= py0 &&
          apy < py0 + innerSize
        ) {
          const off = (apy * pw + apx) * 4;
          data[off] = arwR;
          data[off + 1] = arwG;
          data[off + 2] = arwB;
        }
      }
    }
  }

  // --- Pass 5: layer filter dimming ------------------------------------
  if (focusLayer >= 0 && focusLayer < LAYER_RGB.length) {
    const dim = 0.18;
    const tintR = LAYER_RGB[focusLayer][0];
    const tintG = LAYER_RGB[focusLayer][1];
    const tintB = LAYER_RGB[focusLayer][2];
    const tintAlpha = 0.08;
    const tintInv = 1 - tintAlpha;
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const idx = cy * cw + cx;
        const sid = species[idx];
        const sLayer = sid === 0 ? -1 : layerOf(sid);
        const matches = sLayer === focusLayer || sLayer === -1;
        const px0 = cx * cs;
        const py0 = cy * cs;
        for (let py = py0; py < py0 + cs; py++) {
          const rowOff = py * pw * 4;
          for (let px = px0; px < px0 + cs; px++) {
            const off = rowOff + px * 4;
            if (!matches) {
              data[off] = (data[off] * dim) | 0;
              data[off + 1] = (data[off + 1] * dim) | 0;
              data[off + 2] = (data[off + 2] * dim) | 0;
            } else if (sid === 0) {
              data[off] = (data[off] * tintInv + tintR * tintAlpha) | 0;
              data[off + 1] = (data[off + 1] * tintInv + tintG * tintAlpha) | 0;
              data[off + 2] = (data[off + 2] * tintInv + tintB * tintAlpha) | 0;
            }
          }
        }
      }
    }
  }

  // Blit the pixel buffer to canvas
  rs.ctx.putImageData(rs.imgData, 0, 0);
}
