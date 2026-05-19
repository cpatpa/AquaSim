import type { EvoStats, GeneKey, ExpressedGenes, SpeciesDefinition } from '../types';
import { GENE_KEYS, TIER_DEFAULT_GENES } from '../constants';
import { expressAllGenes, clamp } from '../evolution/genetics';

// ---------------------------------------------------------------------------
// Internal cache
// ---------------------------------------------------------------------------

const _creatureCache: Record<number, string> = {};

export function clearPortraitCache(): void {
  for (const k of Object.keys(_creatureCache)) {
    delete _creatureCache[k as unknown as number];
  }
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32-style)
// ---------------------------------------------------------------------------

function _seedRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

interface PortraitPalette {
  base: number[];
  dark: number[];
  light: number[];
  secondary: number[];
  belly: number[];
  outline: number[];
}

function _portraitPalette(rgb: [number, number, number], expGenes: ExpressedGenes): PortraitPalette {
  const dark = [Math.max(0, rgb[0] - 60), Math.max(0, rgb[1] - 60), Math.max(0, rgb[2] - 60)];
  const light = [Math.min(255, rgb[0] + 50), Math.min(255, rgb[1] + 50), Math.min(255, rgb[2] + 50)];
  const secHue: Record<string, number[]> = {
    bodySize: [160, 160, 200], bodyArmour: [160, 160, 200], bodyShape: [60, 180, 220], pigment: [220, 120, 180],
    metabolicRate: [200, 160, 60], fertility: [40, 200, 80], hungerEfficiency: [200, 160, 60], growthRate: [80, 200, 60],
    aggression: [220, 60, 80], sociality: [180, 120, 220], curiosity: [60, 180, 220], flightResponse: [220, 200, 60],
    visionRange: [80, 200, 220], chemosensory: [80, 220, 180], thermalAdapt: [220, 120, 60], pressureAdapt: [60, 80, 180],
  };
  let highG: GeneKey = GENE_KEYS[0];
  let highV = 0;
  for (let gi = 0; gi < GENE_KEYS.length; gi++) {
    const gv = expGenes[GENE_KEYS[gi]] || 0;
    if (gv > highV) { highV = gv; highG = GENE_KEYS[gi]; }
  }
  const sh = secHue[highG] || [128, 128, 128];
  const secondary = [
    Math.round(rgb[0] * 0.55 + sh[0] * 0.45),
    Math.round(rgb[1] * 0.55 + sh[1] * 0.45),
    Math.round(rgb[2] * 0.55 + sh[2] * 0.45),
  ];
  const belly = [Math.min(255, rgb[0] + 70), Math.min(255, rgb[1] + 70), Math.min(255, rgb[2] + 50)];
  return { base: rgb, dark, light, secondary, belly, outline: dark };
}

// ---------------------------------------------------------------------------
// Body-plan resolver
// ---------------------------------------------------------------------------

function resolveBody(bid: number, tier: string): number {
  if ([10, 11, 12, 20, 21, 22, 23, 30, 31, 32, 40, 41, 42, 43, 50, 51, 60, 61, 62, 63, 64, 65, 66, 67].includes(bid)) return bid;
  const maps: Record<string, number[]> = {
    producer: [10, 11, 12], herbivore: [20, 21, 22, 23], consumer: [30, 31, 32],
    apex: [40, 41], megafauna: [42, 43], decomposer: [50, 51],
  };
  const arr = maps[tier] || maps.consumer;
  return arr[bid % arr.length];
}

// ---------------------------------------------------------------------------
// Portrait axes type
// ---------------------------------------------------------------------------

interface PortraitAxes {
  v: number;
  s: number;
  f: number;
  a: number;
  p: number;
  o: number;
  [key: string]: number;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateCreaturePortrait(
  sid: number,
  sp: SpeciesDefinition,
  es: EvoStats | undefined,
  rgb: [number, number, number],
): string | null {
  if (_creatureCache[sid]) return _creatureCache[sid];

  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  const expGenes: ExpressedGenes = es && es.genes
    ? expressAllGenes(es.genes)
    : (TIER_DEFAULT_GENES[sp.tier as keyof typeof TIER_DEFAULT_GENES] || TIER_DEFAULT_GENES.herbivore) as ExpressedGenes;

  const rng = _seedRng(sid * 2654435761);
  const pal = _portraitPalette(rgb, expGenes);
  const mid = size / 2;

  // --- Drawing helpers (local to this call, use `ctx`) ---

  function px(x: number, y: number, c: number[], a?: number): void {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    ctx!.fillStyle = a !== undefined
      ? 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'
      : 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    ctx!.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  function rect(x: number, y: number, w: number, h: number, c: number[], a?: number): void {
    if (a !== undefined) ctx!.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    else ctx!.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    ctx!.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function line(x0: number, y0: number, x1: number, y1: number, c: number[], a?: number): void {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, cx0 = x0, cy0 = y0;
    for (let i = 0; i < 64; i++) {
      px(cx0, cy0, c, a);
      if (cx0 === x1 && cy0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx0 += sx; }
      if (e2 < dx) { err += dx; cy0 += sy; }
    }
  }

  function fillCircle(fcx: number, fcy: number, r: number, c: number[], a?: number): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) px(fcx + dx, fcy + dy, c, a);
      }
    }
  }

  function outlineCircle(ocx: number, ocy: number, r: number, c: number[], a?: number): void {
    for (let dy = -r - 1; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 >= (r - 0.5) * (r - 0.5) && d2 <= (r + 1.2) * (r + 1.2)) px(ocx + dx, ocy + dy, c, a);
      }
    }
  }

  // --- Map 16 genes to 6 portrait axes ---

  const ag: PortraitAxes = {
    v: clamp(expGenes.fertility * 0.6 + expGenes.growthRate * 0.4, 0, 1),
    s: clamp(expGenes.bodyShape * 0.5 + expGenes.curiosity * 0.5, 0, 1),
    f: clamp(expGenes.bodySize * 0.4 + expGenes.hungerEfficiency * 0.6, 0, 1),
    a: clamp(expGenes.bodyArmour * 0.7 + expGenes.pigment * 0.3, 0, 1),
    p: clamp(expGenes.aggression * 0.6 + expGenes.visionRange * 0.4, 0, 1),
    o: clamp(expGenes.sociality * 0.6 + expGenes.flightResponse * 0.4, 0, 1),
  };

  // Amplify based on divergence from baseline
  const baseExpGenes: ExpressedGenes = es && es.baseGenes
    ? expressAllGenes(es.baseGenes)
    : expGenes;
  let driftSum = 0;
  for (let dg = 0; dg < GENE_KEYS.length; dg++) {
    const dd = (expGenes[GENE_KEYS[dg]] || 0.5) - (baseExpGenes[GENE_KEYS[dg]] || 0.5);
    driftSum += dd * dd;
  }
  const drift = Math.sqrt(driftSum);
  const ampFactor = 1 + drift * 3;
  const agBase: PortraitAxes = {
    v: clamp(baseExpGenes.fertility * 0.6 + baseExpGenes.growthRate * 0.4, 0, 1),
    s: clamp(baseExpGenes.bodyShape * 0.5 + baseExpGenes.curiosity * 0.5, 0, 1),
    f: clamp(baseExpGenes.bodySize * 0.4 + baseExpGenes.hungerEfficiency * 0.6, 0, 1),
    a: clamp(baseExpGenes.bodyArmour * 0.7 + baseExpGenes.pigment * 0.3, 0, 1),
    p: clamp(baseExpGenes.aggression * 0.6 + baseExpGenes.visionRange * 0.4, 0, 1),
    o: clamp(baseExpGenes.sociality * 0.6 + baseExpGenes.flightResponse * 0.4, 0, 1),
  };
  for (const agk of Object.keys(ag)) {
    ag[agk] = clamp(agBase[agk] + (ag[agk] - agBase[agk]) * ampFactor, 0, 1);
  }

  const ld: number = (sp as unknown as Record<string, number>).lineageDepth || 0;
  const evoScale = 1 + drift * 0.3;

  const baseId: number = (sp as unknown as Record<string, number>).rootAncestor || sid;
  const bodyPlan = resolveBody(baseId, sp.tier);

  // Gene-driven portrait scaling
  const _bsz = expGenes.bodySize || 0.4;
  const _bsc = 0.7 + _bsz * 0.6;
  ctx.save();
  ctx.translate(mid * (1 - _bsc), mid * (1 - _bsc));
  ctx.scale(_bsc, _bsc);

  // -----------------------------------------------------------------------
  // Body plans
  // -----------------------------------------------------------------------

  if (bodyPlan === 50) {
    // Bacteria: cluster of small cells
    const cellCount = Math.round(5 + ag.v * 3);
    const spread = Math.round(8 * evoScale);
    for (let i = 0; i < cellCount; i++) {
      const cx0 = mid + Math.round((rng() - 0.5) * spread * 2);
      const cy0 = mid + Math.round((rng() - 0.5) * spread * 2);
      const cr = Math.round(3 + rng() * 2 * evoScale);
      fillCircle(cx0, cy0, cr, pal.base);
      outlineCircle(cx0, cy0, cr, pal.dark, 0.5);
      if (rng() < 0.4) px(cx0, cy0, pal.secondary, 0.6);
    }
    const flagCount = 2 + Math.round(ag.s * 2);
    for (let i = 0; i < flagCount; i++) {
      const a0 = rng() * Math.PI * 2;
      const len = Math.round(4 + ag.v * 4);
      const fsx = mid + Math.round(Math.cos(a0) * 4);
      const fsy = mid + Math.round(Math.sin(a0) * 4);
      for (let s = 0; s < len; s++) {
        const wx = fsx + Math.round(Math.cos(a0) * s + Math.sin(s * 1.5) * 1.5);
        const wy = fsy + Math.round(Math.sin(a0) * s + Math.cos(s * 1.5) * 1.5);
        px(wx, wy, pal.dark, 0.6);
      }
    }
    const dotCount = 2 + Math.round(ag.o * 5);
    for (let d = 0; d < dotCount; d++) {
      const ddx = mid + Math.round((rng() - 0.5) * spread);
      const ddy = mid + Math.round((rng() - 0.5) * spread);
      px(ddx, ddy, pal.secondary, 0.7);
    }

  } else if (bodyPlan === 51) {
    // Sea Worm: elongated segmented body
    const wormLen = Math.round((28 + ag.v * 8) * evoScale);
    const wormW = Math.round((3 + ag.f * 2) * evoScale);
    const segLen = 3 + Math.round(ag.f);
    const startX = mid - Math.round(wormLen / 2);
    for (let x = 0; x < wormLen; x++) {
      const t = x / wormLen;
      const yOff = Math.round(Math.sin(x * 0.25) * (2 + ag.s * 2));
      const w = t < 0.1 ? Math.round(wormW * t * 10) : t > 0.85 ? Math.round(wormW * (1 - t) * 6.67) : wormW;
      const seg = Math.floor(x / segLen);
      const col = seg % 2 === 0 ? pal.base : pal.dark;
      for (let dy = -w; dy <= w; dy++) {
        px(startX + x, mid + yOff + dy, col);
      }
      px(startX + x, mid + yOff - w - 1, pal.dark);
      px(startX + x, mid + yOff + w + 1, pal.dark);
      if (x % segLen === 0 && x > 2 && x < wormLen - 3) {
        const side = seg % 2 === 0 ? -1 : 1;
        const pLen = 1 + Math.round(ag.s * 2);
        for (let p = 1; p <= pLen; p++) {
          px(startX + x, mid + yOff + side * (w + p), pal.light);
        }
      }
    }
    const headX = startX + wormLen - 1;
    const headY = mid + Math.round(Math.sin((wormLen - 1) * 0.25) * (2 + ag.s * 2));
    px(headX + 1, headY - 1, [0, 0, 0]);
    px(headX + 1, headY + 1, [0, 0, 0]);

  } else if (bodyPlan === 10) {
    // Phytoplankton: floating cell cluster
    const mainR = Math.round((8 + ag.v * 3) * evoScale);
    fillCircle(mid, mid, mainR, pal.base);
    outlineCircle(mid, mid, mainR, pal.dark);
    const orgCount = 3 + Math.round(ag.o * 4);
    for (let i = 0; i < orgCount; i++) {
      const oa = rng() * Math.PI * 2;
      const od = rng() * (mainR - 2);
      px(mid + Math.round(Math.cos(oa) * od), mid + Math.round(Math.sin(oa) * od), pal.secondary, 0.7);
    }
    fillCircle(mid, mid, Math.max(1, Math.round(mainR * 0.3)), pal.light, 0.4);
    const satCount = 3 + Math.round(ag.f * 3);
    for (let i = 0; i < satCount; i++) {
      const sa = (i / satCount) * Math.PI * 2 + rng() * 0.5;
      const sd = mainR + 3 + Math.round(rng() * 3);
      const sr = 2 + Math.round(rng() * 2);
      const sx = mid + Math.round(Math.cos(sa) * sd);
      const sy = mid + Math.round(Math.sin(sa) * sd);
      fillCircle(sx, sy, sr, pal.base);
      outlineCircle(sx, sy, sr, pal.dark, 0.6);
      if (rng() < 0.5) px(sx, sy, pal.secondary, 0.5);
    }
    const ciliaCount = 4 + Math.round(ag.s * 4);
    for (let i = 0; i < ciliaCount; i++) {
      const ca = rng() * Math.PI * 2;
      const len = 3 + Math.round(ag.v * 4);
      for (let s = 0; s < len; s++) {
        const ccx = mid + Math.round(Math.cos(ca) * (mainR + 1 + s));
        const ccy = mid + Math.round(Math.sin(ca) * (mainR + 1 + s));
        px(ccx, ccy, pal.light, 0.5 - s * 0.05);
      }
    }

  } else if (bodyPlan === 11) {
    // Seaweed: tall wavy kelp
    const stemH = Math.round((30 + ag.v * 10) * evoScale);
    const stemBase = mid + Math.round(stemH * 0.4);
    const stemTop = stemBase - stemH;
    const amp = 3 + Math.round(ag.s * 2);
    const period = 18 + Math.round(ag.f * 6);
    for (let y = 0; y < stemH; y++) {
      const yy = stemBase - y;
      const xOff = Math.round(Math.sin(y * Math.PI * 2 / period) * amp);
      const w = 1 + (y < stemH * 0.2 ? Math.round((stemH * 0.2 - y) / (stemH * 0.2) * 2) : 0);
      for (let dx = -w; dx <= w; dx++) {
        px(mid + xOff + dx, yy, dx === -w || dx === w ? pal.dark : pal.base);
      }
    }
    const bladeCount = 4 + Math.round(ag.v * 4);
    for (let i = 0; i < bladeCount; i++) {
      const by = stemBase - Math.round((i + 1) * stemH / (bladeCount + 1));
      const bxBase = mid + Math.round(Math.sin((stemBase - by) * Math.PI * 2 / period) * amp);
      const bside = i % 2 === 0 ? 1 : -1;
      const bLen = 5 + Math.round(ag.f * 4 + rng() * 3);
      const bW = 2 + Math.round(ag.v * 2);
      for (let s = 0; s < bLen; s++) {
        const bx = bxBase + bside * (1 + s);
        const droop = Math.round(s * s * 0.04);
        const cw = Math.max(1, Math.round(bW * (1 - s / bLen)));
        for (let dw = 0; dw < cw; dw++) {
          px(bx, by + droop + dw, s === 0 ? pal.dark : (dw === 0 ? pal.light : pal.base));
        }
      }
    }
    const holdCount = 3 + Math.round(ag.f * 2);
    for (let r = 0; r < holdCount; r++) {
      const rx = mid + Math.round((rng() - 0.5) * 8);
      const rLen = 2 + Math.round(rng() * 4);
      for (let rl = 0; rl < rLen; rl++) {
        px(rx + Math.round((rng() - 0.5) * 2), stemBase + 1 + rl, pal.dark);
      }
    }
    if (ag.o > 0.3) {
      for (let i = 0; i < 3; i++) {
        const ty = stemTop + Math.round(rng() * 8);
        const tx = mid + Math.round(Math.sin((stemBase - ty) * Math.PI * 2 / period) * amp);
        px(tx, ty, pal.secondary, 0.8);
        px(tx + 1, ty, pal.secondary, 0.5);
      }
    }

  } else if (bodyPlan === 12) {
    // Coral: branching reef structure
    const baseY = mid + Math.round(12 * evoScale);
    const trunkH = Math.round((10 + ag.v * 4) * evoScale);
    const trunkW = Math.round(2 + ag.f * 2);
    for (let y = 0; y < trunkH; y++) {
      for (let dx = -trunkW; dx <= trunkW; dx++) {
        px(mid + dx, baseY - y, Math.abs(dx) === trunkW ? pal.dark : pal.base);
      }
    }

    function drawBranch(bx: number, by: number, angle: number, len: number, depth: number): void {
      if (depth > 3 || len < 3) return;
      const endX = bx + Math.round(Math.cos(angle) * len);
      const endY = by - Math.round(Math.sin(angle) * len);
      line(bx, by, endX, endY, pal.base);
      if (depth < 2) {
        line(bx + 1, by, endX + 1, endY, pal.base);
        px(bx - 1, by, pal.dark); px(bx + 2, by, pal.dark);
      }
      px(endX, endY, pal.dark);
      px(endX + 1, endY, pal.dark);
      if (depth >= 1) {
        fillCircle(endX, endY, 2, pal.light);
        px(endX, endY, pal.secondary, 0.7);
      }
      const branches = 2 + (depth < 1 ? 1 : 0);
      for (let b = 0; b < branches; b++) {
        const bSpread = 0.4 + rng() * 0.5;
        const newAngle = angle + (b - (branches - 1) / 2) * bSpread;
        const newLen = Math.round(len * (0.55 + rng() * 0.25));
        drawBranch(endX, endY, newAngle, newLen, depth + 1);
      }
    }

    const topY = baseY - trunkH;
    const branchCount = 2 + Math.round(ag.f * 2);
    for (let b = 0; b < branchCount; b++) {
      const angle = Math.PI / 2 + (b - (branchCount - 1) / 2) * (0.4 + rng() * 0.3);
      const bLen = Math.round((8 + ag.v * 5) * evoScale);
      drawBranch(mid + Math.round((b - (branchCount - 1) / 2) * 2), topY, angle, bLen, 0);
    }
    const dotCount = 3 + Math.round(ag.o * 5);
    for (let d = 0; d < dotCount; d++) {
      const ddx = mid + Math.round((rng() - 0.5) * trunkW * 2);
      const ddy = baseY - Math.round(rng() * trunkH);
      px(ddx, ddy, pal.secondary, 0.5);
    }
    for (let dx = -trunkW - 2; dx <= trunkW + 2; dx++) {
      px(mid + dx, baseY + 1, pal.dark);
    }

  } else if (bodyPlan === 20) {
    // Shrimp: segmented crustacean
    const bLen = Math.round((20 + ag.f * 4) * evoScale);
    const bH = Math.round((5 + ag.f * 2) * evoScale);
    const startX = mid - Math.round(bLen * 0.4);
    const segCount = 5 + Math.round(ag.a * 2);
    const segW = bLen / segCount;
    for (let x = 0; x < bLen; x++) {
      const t = x / bLen;
      const curve = Math.round(Math.sin(t * Math.PI) * (2 + ag.s * 2));
      const h = t < 0.15 ? Math.round(bH * 0.5) : t > 0.85 ? Math.round(bH * (1 - t) * 3) : bH;
      const seg = Math.floor(x / segW);
      const col = seg % 2 === 0 ? pal.base : pal.light;
      for (let dy = -Math.floor(h / 2); dy <= Math.floor(h / 2); dy++) {
        px(startX + x, mid + curve + dy, col);
      }
      px(startX + x, mid + curve - Math.floor(h / 2) - 1, pal.dark);
      px(startX + x, mid + curve + Math.floor(h / 2) + 1, pal.dark);
    }
    const headX = startX + bLen;
    const headY = mid + Math.round(Math.sin(Math.PI) * (2 + ag.s * 2));
    const antLen = Math.round(6 + ag.s * 4);
    for (let a = 0; a < antLen; a++) {
      px(headX + a, headY - 2 - Math.round(a * 0.4), pal.dark, 0.7);
      px(headX + a, headY + 1 + Math.round(a * 0.3), pal.dark, 0.7);
    }
    px(headX - 1, headY - 1, [0, 0, 0]);
    const legPairs = 3 + Math.round(ag.f);
    for (let l = 0; l < legPairs; l++) {
      const lx = startX + Math.round((l + 1) * bLen / (legPairs + 1));
      const lt = (l + 1) / (legPairs + 1);
      const lCurve = Math.round(Math.sin(lt * Math.PI) * (2 + ag.s * 2));
      const lh = Math.floor(bH / 2);
      px(lx, mid + lCurve + lh + 2, pal.dark);
      px(lx, mid + lCurve + lh + 3, pal.dark);
    }
    const tailY = mid + Math.round(Math.sin(0) * (2 + ag.s * 2));
    px(startX - 1, tailY - 2, pal.base);
    px(startX - 2, tailY - 3, pal.dark);
    px(startX - 1, tailY + 1, pal.base);
    px(startX - 2, tailY + 2, pal.dark);
    px(startX - 1, tailY, pal.base);
    px(startX - 2, tailY, pal.dark);

  } else if (bodyPlan === 21) {
    // Snail: shelled gastropod
    const shellR = Math.round((9 + ag.a * 3) * evoScale);
    const shellX = mid - 3;
    const shellY = mid - 2;
    fillCircle(shellX, shellY, shellR, pal.light);
    outlineCircle(shellX, shellY, shellR, pal.dark);
    for (let r = shellR - 2; r >= 2; r -= 3) {
      outlineCircle(shellX + Math.round((shellR - r) * 0.3), shellY + Math.round((shellR - r) * 0.15), r, pal.dark, 0.4);
    }
    const bodyX = shellX + shellR - 2;
    const bodyY = shellY + shellR - 3;
    const bodyW = Math.round((8 + ag.f * 3) * evoScale);
    const bodyH2 = Math.round((4 + ag.f * 2) * evoScale);
    for (let x = 0; x < bodyW; x++) {
      const t = x / bodyW;
      const h = Math.round(bodyH2 * Math.sin(t * Math.PI));
      for (let dy = 0; dy < Math.max(1, h); dy++) {
        px(bodyX + x, bodyY + dy, dy === 0 ? pal.base : pal.belly);
      }
      px(bodyX + x, bodyY + Math.max(1, h), pal.dark);
    }
    const stalkLen = Math.round(4 + ag.s * 3);
    const snailHeadX = bodyX + bodyW - 2;
    for (let s = 0; s < stalkLen; s++) {
      px(snailHeadX - 1, bodyY - 1 - s, pal.base);
      px(snailHeadX + 2, bodyY - 1 - s, pal.base);
    }
    px(snailHeadX - 1, bodyY - 1 - stalkLen, [0, 0, 0]);
    px(snailHeadX + 2, bodyY - 1 - stalkLen, [0, 0, 0]);
    px(bodyX + bodyW, bodyY + 1, pal.dark);

  } else if (bodyPlan === 22) {
    // Crab: flat body with claws
    const cW = Math.round((8 + ag.f * 3) * evoScale);
    const cH = Math.round((5 + ag.f * 2) * evoScale);
    const cY = mid + 1;
    for (let y = -cH; y <= cH; y++) {
      const t = Math.abs(y) / cH;
      const w = Math.round(cW * (1 - t * 0.3));
      for (let x = -w; x <= w; x++) {
        px(mid + x, cY + y, y < 0 ? pal.base : pal.belly);
      }
      px(mid - w - 1, cY + y, pal.dark);
      px(mid + w + 1, cY + y, pal.dark);
    }
    for (let x = -cW; x <= cW; x++) {
      px(mid + x, cY - cH - 1, pal.dark);
      px(mid + x, cY + cH + 1, pal.dark);
    }
    if (ag.a > 0.3) {
      const ridgeGap = Math.max(2, 5 - Math.round(ag.a * 3));
      for (let y = -cH + ridgeGap; y < cH; y += ridgeGap) {
        const t = Math.abs(y) / cH;
        const w = Math.round(cW * (1 - t * 0.3));
        rect(mid - w + 1, cY + y, w * 2 - 1, 1, pal.dark, 0.3);
      }
    }
    const clawArm = Math.round(4 + ag.p * 3);
    const clawOpen = Math.round(2 + ag.p * 2);
    for (const cside of [-1, 1]) {
      const ax = mid + cside * (cW + 1);
      const ay = cY - cH + 2;
      for (let a = 0; a < clawArm; a++) {
        px(ax + cside * a, ay - Math.round(a * 0.5), pal.base);
        px(ax + cside * a, ay - Math.round(a * 0.5) + 1, pal.base);
        px(ax + cside * a, ay - Math.round(a * 0.5) - 1, pal.dark);
      }
      const tipX = ax + cside * (clawArm - 1);
      const tipY = ay - Math.round((clawArm - 1) * 0.5);
      for (let c = 0; c < clawOpen; c++) {
        px(tipX + cside * c, tipY - 1 - c, pal.dark);
        px(tipX + cside * c, tipY + 2 + c, pal.dark);
        px(tipX + cside * c, tipY, pal.base);
      }
    }
    const crabLegPairs = 4;
    for (let l = 0; l < crabLegPairs; l++) {
      const lx = mid + Math.round((l - 1.5) * cW * 0.5);
      for (const lside of [-1, 1]) {
        for (let s = 0; s < 3; s++) {
          px(lx + lside * s, cY + cH + 1 + s, pal.dark);
        }
      }
    }
    const eyeStalk = 2;
    for (const eside of [-1, 1]) {
      const ex = mid + eside * Math.round(cW * 0.5);
      for (let s = 0; s < eyeStalk; s++) px(ex, cY - cH - 2 - s, pal.base);
      px(ex, cY - cH - 2 - eyeStalk, [0, 0, 0]);
    }

  } else if (bodyPlan === 23) {
    // Sea Urchin: spiny sphere
    const uR = Math.round((8 + ag.f * 2) * evoScale);
    fillCircle(mid, mid, uR, pal.base);
    outlineCircle(mid, mid, uR, pal.dark);
    const dotC = 4 + Math.round(ag.o * 4);
    for (let i = 0; i < dotC; i++) {
      const da = rng() * Math.PI * 2;
      const dd = rng() * (uR - 2);
      px(mid + Math.round(Math.cos(da) * dd), mid + Math.round(Math.sin(da) * dd), pal.secondary, 0.5);
    }
    for (let a = 0; a < 5; a++) {
      const pa = a * Math.PI * 2 / 5 + 0.3;
      const pr = Math.round(uR * 0.5);
      px(mid + Math.round(Math.cos(pa) * pr), mid + Math.round(Math.sin(pa) * pr), pal.light, 0.5);
    }
    const spineCount = 12 + Math.round(ag.a * 6);
    const spineLen = Math.round((4 + ag.a * 4) * evoScale);
    for (let i = 0; i < spineCount; i++) {
      const sa = (i / spineCount) * Math.PI * 2 + rng() * 0.2;
      const sLen = spineLen + Math.round((rng() - 0.5) * 3);
      for (let s = 0; s < sLen; s++) {
        const ssx = mid + Math.round(Math.cos(sa) * (uR + s));
        const ssy = mid + Math.round(Math.sin(sa) * (uR + s));
        px(ssx, ssy, s < 2 ? pal.dark : pal.light);
      }
    }

  } else if (bodyPlan === 30) {
    // Small Fish: classic schooling fish
    const bW = Math.round((12 + ag.f * 4) * evoScale);
    const bH = Math.round((6 + ag.f * 2) * evoScale);
    const bodyOff = Math.round(mid + bW * 0.05);
    const startY = Math.round(mid - bH / 2);
    const rows: number[] = [];
    for (let y = 0; y < bH; y++) {
      const t = y / Math.max(1, bH - 1);
      rows.push(Math.max(1, Math.round(bW * Math.sin(t * Math.PI) * 0.5)));
    }
    for (let y = 0; y < bH; y++) {
      const w = rows[y];
      const col = y >= bH * 0.6 ? pal.belly : pal.base;
      rect(bodyOff - w, startY + y, w * 2, 1, col);
    }
    for (let y = 0; y < bH; y++) {
      const w = rows[y];
      px(bodyOff - w - 1, startY + y, pal.dark);
      px(bodyOff + w, startY + y, pal.dark);
    }
    for (let x = -rows[0]; x < rows[0]; x++) px(bodyOff + x, startY - 1, pal.dark);
    for (let x = -rows[bH - 1]; x < rows[bH - 1]; x++) px(bodyOff + x, startY + bH, pal.dark);
    const tailLen = 2 + Math.round(ag.s * 4);
    const forkD = Math.round(ag.s * 4);
    const tailX = bodyOff - rows[Math.round(bH / 2)] - 1;
    for (let t = 0; t < tailLen; t++) {
      if (forkD > 1 && t >= tailLen - forkD) {
        const fs = (t - (tailLen - forkD)) + 1;
        px(tailX - t, mid - fs, pal.base); px(tailX - t, mid + fs - 1, pal.base);
        px(tailX - t - 1, mid - fs, pal.dark); px(tailX - t - 1, mid + fs - 1, pal.dark);
      } else {
        rect(tailX - t, mid - 1, 1, 2, pal.base);
        px(tailX - t, mid - 2, pal.dark); px(tailX - t, mid + 1, pal.dark);
      }
    }
    const finH = 1 + Math.round(ag.s * 3);
    if (finH > 1) {
      for (let f = 0; f < 3; f++) {
        const fh = Math.round(finH * (1 - f / 3));
        rect(bodyOff - 1 + f, startY - fh, 1, fh, pal.base);
        px(bodyOff - 1 + f, startY - fh - 1, pal.dark);
      }
    }
    const pFY = startY + Math.round(bH * 0.55);
    const pFX = bodyOff + Math.round(rows[Math.min(Math.round(bH * 0.55), bH - 1)] * 0.3);
    for (let f = 0; f < 2 + Math.round(ag.s); f++) {
      px(pFX + f, pFY + f, f === 0 ? pal.dark : pal.base);
      px(pFX + f, pFY + f + 1, pal.base);
    }
    if (ag.o > 0.25) {
      const patRng2 = _seedRng(((sp as unknown as Record<string, number>).rootAncestor || sid) * 1337);
      const pT = Math.floor(patRng2() * 4);
      const alpha = 0.2 + (ag.o - 0.25) * 0.4;
      if (pT === 0) {
        for (let y = 2; y < bH - 1; y += 3) { const w = rows[y]; if (w > 1) rect(bodyOff - w + 1, startY + y, w * 2 - 2, 1, pal.secondary, alpha); }
      } else if (pT === 2) {
        for (let s = 0; s < 4 + Math.round(ag.o * 5); s++) { const sy = Math.round(rng() * (bH - 2)) + 1; const w = rows[Math.min(sy, bH - 1)]; rect(bodyOff + Math.round((rng() - 0.5) * w), startY + sy, 2, 2, pal.secondary, alpha); }
      } else {
        for (let y = 0; y < bH; y++) { const w = rows[y]; for (let x = -w + 3; x < w; x += 3) px(bodyOff + x, startY + y, pal.secondary, alpha); }
      }
    }
    const eyeX = bodyOff + rows[Math.min(2, bH - 1)] - 2;
    const eyeY = startY + Math.round(bH * 0.25);
    rect(eyeX, eyeY, 2, 2, [255, 255, 255]);
    px(eyeX + 1, eyeY + 1, [0, 0, 0]);

  } else if (bodyPlan === 31) {
    // Squid: torpedo-shaped cephalopod
    const mLen = Math.round((12 + ag.f * 4) * evoScale);
    const mW = Math.round((4 + ag.f * 2) * evoScale);
    const squidHeadX = mid + Math.round(mLen * 0.2);
    for (let x = -mLen / 2; x < mLen / 2; x++) {
      const t = (x + mLen / 2) / mLen;
      const w = t < 0.3 ? Math.round(mW * t * 3.3 * 0.8) : Math.round(mW * (1 - (t - 0.3) * 0.5) * 0.8);
      const xx = squidHeadX - Math.round(mLen / 2) + Math.round(x);
      for (let dy = -w; dy <= w; dy++) {
        px(xx, mid + dy, dy === -w || dy === w ? pal.dark : (dy > 0 ? pal.belly : pal.base));
      }
    }
    const finW = Math.round(3 + ag.s * 3);
    const finH2 = Math.round(2 + ag.s * 2);
    const finX = squidHeadX - Math.round(mLen * 0.45);
    for (let f = 0; f < finW; f++) {
      const fh = Math.round(finH2 * (1 - f / finW));
      for (let dy = 0; dy < fh; dy++) {
        px(finX - f, mid - mW - 1 - dy, pal.base);
        px(finX - f, mid + mW + 1 + dy, pal.base);
      }
      px(finX - f, mid - mW - 2 - fh, pal.dark);
      px(finX - f, mid + mW + 2 + fh, pal.dark);
    }
    const armCount = 8;
    const tentCount = 2;
    const armBaseX = squidHeadX + Math.round(mLen * 0.15);
    for (let a = 0; a < armCount; a++) {
      const armSpread = (a - 3.5) * (1.2 + ag.v * 0.5);
      const aLen = Math.round((4 + rng() * 2) * evoScale);
      for (let s = 0; s < aLen; s++) {
        const ax = armBaseX + s;
        const ay = mid + Math.round(armSpread * (0.6 + s * 0.15));
        px(ax, ay, s % 2 === 0 ? pal.base : pal.dark);
      }
    }
    for (let t = 0; t < tentCount; t++) {
      const tSpread = (t === 0 ? -2.5 : 2.5);
      const tLen = Math.round((7 + ag.p * 3) * evoScale);
      for (let s = 0; s < tLen; s++) {
        const tx = armBaseX + s;
        const ty = mid + Math.round(tSpread * (0.6 + s * 0.12));
        px(tx, ty, pal.base);
        if (s >= tLen - 2) { px(tx, ty - 1, pal.secondary); px(tx, ty + 1, pal.secondary); }
      }
    }
    for (let a = 0; a < armCount; a++) {
      const armSpread = (a - 3.5) * (1.2 + ag.v * 0.5);
      const aLen = Math.round((4 + rng() * 2) * evoScale);
      for (let s = 1; s < aLen; s += 2) {
        const ax = armBaseX + s;
        const ay = mid + Math.round(armSpread * (0.6 + s * 0.15));
        px(ax, ay + 1, pal.secondary, 0.5);
      }
    }
    const squidEyeX = squidHeadX + 1;
    const squidEyeY = mid - Math.round(mW * 0.4);
    rect(squidEyeX, squidEyeY, 3, 3, [255, 255, 255]);
    px(squidEyeX + 1, squidEyeY + 1, [0, 0, 0]);
    px(squidEyeX + 1, squidEyeY, pal.secondary);

  } else if (bodyPlan === 32) {
    // Pufferfish: round inflated body
    const pR = Math.round((10 + ag.f * 2) * evoScale);
    for (let dy = -pR; dy <= pR; dy++) {
      for (let dx = -pR; dx <= pR; dx++) {
        if (dx * dx + dy * dy <= pR * pR) {
          px(mid + dx, mid + dy, dy > pR * 0.2 ? pal.belly : pal.base);
        }
      }
    }
    outlineCircle(mid, mid, pR, pal.dark);
    const spikeC = 10 + Math.round(ag.a * 8);
    for (let i = 0; i < spikeC; i++) {
      const sa = (i / spikeC) * Math.PI * 2 + rng() * 0.3;
      const sLen = 1 + Math.round(ag.a * 2);
      for (let s = 0; s < sLen; s++) {
        px(mid + Math.round(Math.cos(sa) * (pR + 1 + s)), mid + Math.round(Math.sin(sa) * (pR + 1 + s)), pal.dark);
      }
    }
    const puffTailLen = 2 + Math.round(ag.s * 2);
    for (let t = 0; t < puffTailLen; t++) {
      px(mid - pR - 1 - t, mid - 1, pal.base);
      px(mid - pR - 1 - t, mid, pal.base);
      px(mid - pR - 1 - t, mid + 1, pal.base);
    }
    px(mid - pR - puffTailLen - 1, mid - 2, pal.dark);
    px(mid - pR - puffTailLen - 1, mid + 2, pal.dark);
    px(mid + pR + 1, mid, pal.dark);
    px(mid + pR + 2, mid, pal.dark);
    px(mid + pR + 1, mid + 1, pal.dark);
    const puffEyeX = mid + Math.round(pR * 0.3);
    const puffEyeY = mid - Math.round(pR * 0.35);
    rect(puffEyeX, puffEyeY, 3, 3, [255, 255, 255]);
    px(puffEyeX + 1, puffEyeY + 1, [0, 0, 0]);
    px(puffEyeX + 1, puffEyeY, pal.secondary);
    if (ag.o > 0.25) {
      const spotC = 3 + Math.round(ag.o * 5);
      for (let s = 0; s < spotC; s++) {
        const sa = rng() * Math.PI * 2;
        const sd = rng() * (pR - 3);
        rect(mid + Math.round(Math.cos(sa) * sd), mid + Math.round(Math.sin(sa) * sd), 2, 2, pal.secondary, 0.35);
      }
    }

  } else if (bodyPlan === 40) {
    // Shark: torpedo body with dorsal fin
    const bW = Math.round((18 + ag.f * 5) * evoScale);
    const bH = Math.round((7 + ag.f * 3) * evoScale);
    const bodyOff = Math.round(mid + bW * 0.05);
    const startY = Math.round(mid - bH / 2);
    const rows: number[] = [];
    for (let y = 0; y < bH; y++) {
      const t = y / Math.max(1, bH - 1);
      const sine = Math.sin(t * Math.PI);
      const f2 = t < 0.5 ? 0.3 + 0.7 * sine : sine;
      rows.push(Math.max(1, Math.round(bW * f2 * 0.5)));
    }
    const bellyLine = Math.round(bH * 0.45);
    for (let y = 0; y < bH; y++) {
      const w = rows[y];
      rect(bodyOff - w, startY + y, w * 2, 1, y >= bellyLine ? pal.belly : pal.base);
    }
    for (let y = 0; y < bH; y++) {
      const w = rows[y]; px(bodyOff - w - 1, startY + y, pal.dark); px(bodyOff + w, startY + y, pal.dark);
    }
    for (let x = -rows[0]; x < rows[0]; x++) px(bodyOff + x, startY - 1, pal.dark);
    for (let x = -rows[bH - 1]; x < rows[bH - 1]; x++) px(bodyOff + x, startY + bH, pal.dark);
    const snoutLen = Math.round(2 + ag.p * 3);
    const snoutY = startY + Math.round(bH * 0.4);
    for (let s = 0; s < snoutLen; s++) {
      px(bodyOff + rows[Math.round(bH * 0.4)] + s, snoutY, pal.base);
      px(bodyOff + rows[Math.round(bH * 0.4)] + s, snoutY + 1, pal.dark);
    }
    const dorsalH = Math.round((5 + ag.s * 4) * evoScale);
    const dorsalW = Math.round(3 + ag.s * 2);
    for (let f = 0; f < dorsalW; f++) {
      const fh = Math.round(dorsalH * (1 - f / (dorsalW + 1)));
      const fx = bodyOff - Math.round(bW * 0.05) + f;
      rect(fx, startY - fh, 1, fh, pal.base);
      px(fx, startY - fh - 1, pal.dark);
    }
    const tailH = Math.round((5 + ag.s * 3) * evoScale);
    const sharkTailX = bodyOff - rows[Math.round(bH / 2)] - 1;
    for (let t = 0; t < 4; t++) {
      const topH = Math.round(tailH * (1 - t / 5));
      const botH = Math.round(tailH * 0.6 * (1 - t / 5));
      px(sharkTailX - t, mid - topH, pal.dark);
      for (let h = topH - 1; h >= 1; h--) px(sharkTailX - t, mid - h, pal.base);
      px(sharkTailX - t, mid + botH, pal.dark);
      for (let h = botH - 1; h >= 1; h--) px(sharkTailX - t, mid + h, pal.base);
      rect(sharkTailX - t, mid - 1, 1, 2, pal.base);
    }
    const pFinY = startY + Math.round(bH * 0.6);
    const pFinX = bodyOff + Math.round(rows[Math.round(bH * 0.6)] * 0.3);
    for (let f = 0; f < 3; f++) {
      px(pFinX + f, pFinY + f, pal.dark);
      px(pFinX + f, pFinY + f + 1, pal.base);
      px(pFinX + f, pFinY + f + 2, pal.base);
    }
    const gillX = bodyOff + rows[3] - 3;
    const gillY = startY + 3;
    for (let g = 0; g < 3; g++) { px(gillX - g * 2, gillY, pal.dark, 0.5); px(gillX - g * 2, gillY + 1, pal.dark, 0.5); }
    const sharkEyeX = bodyOff + rows[2] - 3;
    const sharkEyeY = startY + 2;
    px(sharkEyeX, sharkEyeY, [255, 255, 255]);
    px(sharkEyeX + 1, sharkEyeY, [0, 0, 0]);
    const jawLen = Math.round(ag.p * 5);
    if (jawLen > 0) {
      const jawY = startY + Math.round(bH * 0.55);
      const jawX = bodyOff + rows[Math.round(bH * 0.55)];
      rect(jawX, jawY, jawLen, 1, pal.dark);
      if (ag.p > 0.4) {
        for (let t = 0; t < Math.round(ag.p * 3); t++) {
          px(jawX + 1 + t * 2, jawY + 1, pal.light);
          px(jawX + 1 + t * 2, jawY - 1, pal.light);
        }
      }
    }

  } else if (bodyPlan === 41) {
    // Octopus: bulbous head with eight arms
    const headR = Math.round((8 + ag.f * 3) * evoScale);
    const octoHeadY = mid - Math.round(headR * 0.5);
    fillCircle(mid, octoHeadY, headR, pal.base);
    for (let dy = 0; dy < headR; dy++) {
      const w = Math.round(Math.sqrt(headR * headR - dy * dy));
      for (let dx = -w; dx <= w; dx++) {
        if (dy > headR * 0.4) px(mid + dx, octoHeadY + dy, pal.belly);
      }
    }
    outlineCircle(mid, octoHeadY, headR, pal.dark);
    const armAngles: number[] = [];
    for (let a = 0; a < 8; a++) {
      armAngles.push(Math.PI * 0.1 + a * Math.PI * 0.8 / 7);
    }
    for (let a = 0; a < 8; a++) {
      const angle = armAngles[a];
      const aLen = Math.round((7 + rng() * 4 + ag.v * 3) * evoScale);
      const armBaseX = mid + Math.round(Math.cos(angle - Math.PI / 2) * (headR - 1));
      const armBaseY = octoHeadY + headR - 1;
      for (let s = 0; s < aLen; s++) {
        const t = s / aLen;
        const curl = Math.sin(s * 0.5 + a) * (2 + t * 3);
        const ax = armBaseX + Math.round(curl + (a - 3.5) * t * 1.5);
        const ay = armBaseY + s;
        const aw = Math.max(1, Math.round((1 - t) * 2.5));
        for (let dx = -aw; dx <= aw; dx++) {
          px(ax + dx, ay, Math.abs(dx) === aw ? pal.dark : pal.base);
        }
        if (s % 2 === 0 && s > 0) px(ax, ay + 1, pal.secondary, 0.5);
      }
    }
    const octoEyeS = 3;
    for (const eside of [-1, 1]) {
      const ex = mid + eside * Math.round(headR * 0.45);
      const ey = octoHeadY - 1;
      rect(ex, ey, octoEyeS, octoEyeS, [255, 255, 255]);
      px(ex + 1, ey + 1, [0, 0, 0]);
      px(ex + 1, ey, pal.secondary);
    }
    if (ag.o > 0.25) {
      const spotC = 3 + Math.round(ag.o * 5);
      for (let s = 0; s < spotC; s++) {
        const sa = rng() * Math.PI * 2;
        const sd = rng() * (headR - 2);
        rect(mid + Math.round(Math.cos(sa) * sd), octoHeadY + Math.round(Math.sin(sa) * sd), 2, 2, pal.secondary, 0.35);
      }
    }

  } else if (bodyPlan === 42) {
    // Whale: massive body with flukes
    const bW = Math.round((22 + ag.f * 5) * evoScale);
    const bH = Math.round((10 + ag.f * 3) * evoScale);
    const bodyOff = Math.round(mid + bW * 0.05);
    const startY = Math.round(mid - bH / 2);
    const rows: number[] = [];
    for (let y = 0; y < bH; y++) {
      const t = y / Math.max(1, bH - 1);
      const w = Math.round(bW * 0.5 * Math.sin(t * Math.PI) * (t < 0.4 ? 0.6 + t * 1.0 : 1));
      rows.push(Math.max(1, w));
    }
    const bellyLine = Math.round(bH * 0.5);
    for (let y = 0; y < bH; y++) {
      const w = rows[y];
      rect(bodyOff - w, startY + y, w * 2, 1, y >= bellyLine ? pal.belly : pal.base);
    }
    for (let y = 0; y < bH; y++) {
      const w = rows[y]; px(bodyOff - w - 1, startY + y, pal.dark); px(bodyOff + w, startY + y, pal.dark);
    }
    for (let x = -rows[0]; x < rows[0]; x++) px(bodyOff + x, startY - 1, pal.dark);
    for (let x = -rows[bH - 1]; x < rows[bH - 1]; x++) px(bodyOff + x, startY + bH, pal.dark);
    const grooveCount = 3 + Math.round(ag.f * 3);
    for (let g = 0; g < grooveCount; g++) {
      const gy = bellyLine + 1 + Math.round(g * (bH - bellyLine - 2) / grooveCount);
      if (gy < bH) {
        const w = rows[gy];
        rect(bodyOff - w + 2, startY + gy, w * 2 - 4, 1, pal.dark, 0.2);
      }
    }
    const whaleHeadX = bodyOff + rows[Math.round(bH * 0.4)];
    px(whaleHeadX, mid, pal.dark); px(whaleHeadX + 1, mid, pal.dark);
    px(bodyOff, startY - 2, pal.light);
    const flukeW = Math.round(5 + ag.s * 3);
    const flukeH = Math.round(3 + ag.s * 2);
    const whaleFlukeX = bodyOff - rows[Math.round(bH / 2)] - 1;
    for (let t = 0; t < 3; t++) { rect(whaleFlukeX - t, mid - 1, 1, 2, pal.base); }
    for (let f = 0; f < flukeW; f++) {
      const fh = Math.round(flukeH * (1 - f / flukeW * 0.5));
      px(whaleFlukeX - 3 - f, mid - fh, pal.dark);
      px(whaleFlukeX - 3 - f, mid + fh, pal.dark);
      for (let h = -fh + 1; h < fh; h++) px(whaleFlukeX - 3 - f, mid + h, pal.base);
    }
    const flipLen = Math.round(3 + ag.s * 2);
    const flipY = startY + Math.round(bH * 0.6);
    const flipX = bodyOff + Math.round(rows[Math.round(bH * 0.6)] * 0.3);
    for (let f = 0; f < flipLen; f++) {
      px(flipX + f, flipY + f, pal.dark);
      px(flipX + f, flipY + f + 1, pal.base);
    }
    const whaleEyeX = bodyOff + rows[3] - 2;
    const whaleEyeY = startY + 3;
    px(whaleEyeX, whaleEyeY, [255, 255, 255]);
    px(whaleEyeX, whaleEyeY + 1, [0, 0, 0]);
    if (ag.p > 0.3) {
      const baleenC = 2 + Math.round(ag.p * 3);
      for (let b = 0; b < baleenC; b++) {
        px(whaleHeadX, mid - Math.floor(baleenC / 2) + b, pal.light, 0.6);
      }
    }

  } else if (bodyPlan === 43) {
    // Dolphin: sleek body with beak and curved fin
    const bW = Math.round((18 + ag.f * 5) * evoScale);
    const bH = Math.round((6 + ag.f * 3) * evoScale);
    const bodyOff = Math.round(mid + bW * 0.05);
    const startY = Math.round(mid - bH / 2);
    const rows: number[] = [];
    for (let y = 0; y < bH; y++) {
      const t = y / Math.max(1, bH - 1);
      const arch = Math.sin(t * Math.PI) * (1 + 0.2 * Math.sin(t * Math.PI * 2));
      rows.push(Math.max(1, Math.round(bW * 0.5 * arch)));
    }
    const bellyLine = Math.round(bH * 0.5);
    for (let y = 0; y < bH; y++) {
      const w = rows[y];
      rect(bodyOff - w, startY + y, w * 2, 1, y >= bellyLine ? pal.belly : pal.base);
    }
    for (let y = 0; y < bH; y++) {
      const w = rows[y]; px(bodyOff - w - 1, startY + y, pal.dark); px(bodyOff + w, startY + y, pal.dark);
    }
    for (let x = -rows[0]; x < rows[0]; x++) px(bodyOff + x, startY - 1, pal.dark);
    for (let x = -rows[bH - 1]; x < rows[bH - 1]; x++) px(bodyOff + x, startY + bH, pal.dark);
    const beakLen = Math.round((3 + ag.p * 3) * evoScale);
    const beakY = startY + Math.round(bH * 0.4);
    const beakX = bodyOff + rows[Math.round(bH * 0.4)];
    for (let b = 0; b < beakLen; b++) {
      px(beakX + b, beakY, pal.base);
      px(beakX + b, beakY + 1, pal.dark);
    }
    px(beakX + beakLen, beakY, pal.dark);
    const smileY = beakY + 1;
    for (let s = 0; s < Math.round(beakLen * 0.7); s++) {
      px(beakX + s, smileY, pal.dark, 0.4);
    }
    const dolDorsalH = Math.round((4 + ag.s * 4) * evoScale);
    const dolDorsalW = Math.round(3 + ag.s * 2);
    const dolDorsalX = bodyOff - Math.round(bW * 0.05);
    for (let f = 0; f < dolDorsalW; f++) {
      const curve = Math.round(f * f * 0.15);
      const fh = Math.round(dolDorsalH * (1 - f / (dolDorsalW + 1)));
      rect(dolDorsalX + f + curve, startY - fh, 1, fh, pal.base);
      px(dolDorsalX + f + curve, startY - fh - 1, pal.dark);
    }
    const dolFlukeW = Math.round(3 + ag.s * 2);
    const dolFlukeH = Math.round(2 + ag.s * 2);
    const dolTailX = bodyOff - rows[Math.round(bH / 2)] - 1;
    for (let t = 0; t < 2; t++) { rect(dolTailX - t, mid - 1, 1, 2, pal.base); }
    for (let f = 0; f < dolFlukeW; f++) {
      const fh = Math.round(dolFlukeH * (1 - f / dolFlukeW * 0.3));
      px(dolTailX - 2 - f, mid - fh, pal.dark);
      px(dolTailX - 2 - f, mid + fh, pal.dark);
      for (let h = -fh + 1; h < fh; h++) px(dolTailX - 2 - f, mid + h, pal.base);
    }
    const dolFlipY = startY + Math.round(bH * 0.6);
    const dolFlipX = bodyOff + Math.round(rows[Math.round(bH * 0.6)] * 0.3);
    for (let f = 0; f < 2; f++) { px(dolFlipX + f, dolFlipY + f, pal.dark); px(dolFlipX + f, dolFlipY + f + 1, pal.base); }
    const dolEyeX = bodyOff + rows[2] - 2;
    const dolEyeY = startY + 2;
    rect(dolEyeX, dolEyeY, 2, 2, [255, 255, 255]);
    px(dolEyeX + 1, dolEyeY + 1, [0, 0, 0]);

  } else if (bodyPlan === 60) {
    // Jellyfish: translucent bell with trailing tentacles
    const bellR = Math.round((10 + ag.f * 3) * evoScale);
    const bellY = mid - Math.round(bellR * 0.3);
    // Semi-transparent bell dome (upper half)
    for (let dy = -bellR; dy <= 0; dy++) {
      const w = Math.round(Math.sqrt(bellR * bellR - dy * dy));
      for (let dx = -w; dx <= w; dx++) {
        const edgeDist = Math.sqrt(dx * dx + dy * dy) / bellR;
        const alpha = 0.3 + (1 - edgeDist) * 0.35;
        px(mid + dx, bellY + dy, Math.abs(dx) >= w - 1 ? pal.dark : pal.base, alpha);
      }
    }
    // Bell rim (thicker bottom edge)
    for (let dx = -bellR; dx <= bellR; dx++) {
      const d2 = dx * dx;
      if (d2 <= bellR * bellR) {
        px(mid + dx, bellY, pal.dark, 0.7);
        px(mid + dx, bellY + 1, pal.dark, 0.5);
      }
    }
    // Inner bell shading
    const innerR = Math.round(bellR * 0.6);
    for (let dy = -innerR; dy <= 0; dy++) {
      const w = Math.round(Math.sqrt(innerR * innerR - dy * dy));
      for (let dx = -w; dx <= w; dx++) {
        px(mid + dx, bellY + dy + 1, pal.light, 0.15);
      }
    }
    // Oral arms (short thick structures below bell centre)
    const oralCount = 4;
    for (let oa = 0; oa < oralCount; oa++) {
      const ox = mid + Math.round((oa - 1.5) * 3);
      const oLen = Math.round(3 + ag.s * 2);
      for (let s = 0; s < oLen; s++) {
        px(ox + Math.round(Math.sin(s * 0.8) * 1), bellY + 2 + s, pal.belly, 0.6);
      }
    }
    // Trailing tentacles
    const tentCount = 5 + Math.round(ag.v * 4);
    const tentMaxLen = Math.round((14 + ag.v * 8) * evoScale);
    for (let t = 0; t < tentCount; t++) {
      const tx = mid + Math.round((t - (tentCount - 1) / 2) * bellR * 2 / tentCount);
      const tLen = tentMaxLen - Math.round(rng() * 4);
      const phase = rng() * Math.PI * 2;
      const amp = 1.5 + rng() * 2;
      for (let s = 0; s < tLen; s++) {
        const waveX = Math.round(Math.sin(s * 0.4 + phase) * amp);
        const alpha = 0.5 - s / tLen * 0.3;
        px(tx + waveX, bellY + 2 + s, s % 3 === 0 ? pal.secondary : pal.base, Math.max(0.1, alpha));
      }
    }
    // Bioluminescent dots scattered on bell
    const glowCount = 4 + Math.round(ag.o * 6);
    for (let g = 0; g < glowCount; g++) {
      const ga = rng() * Math.PI;
      const gd = rng() * (bellR - 2);
      const gx = mid + Math.round(Math.cos(ga + Math.PI) * gd);
      const gy = bellY - Math.round(Math.sin(ga) * gd * 0.5);
      px(gx, gy, pal.light, 0.8);
      px(gx + 1, gy, pal.light, 0.4);
    }

  } else if (bodyPlan === 61) {
    // Sea Turtle: oval shell with hexagonal pattern, head and flippers
    const shellW = Math.round((13 + ag.f * 3) * evoScale);
    const shellH = Math.round((9 + ag.f * 2) * evoScale);
    const shellY = mid;
    // Shell body (filled oval)
    for (let dy = -shellH; dy <= shellH; dy++) {
      const w = Math.round(shellW * Math.sqrt(1 - (dy * dy) / (shellH * shellH)));
      for (let dx = -w; dx <= w; dx++) {
        const edgeT = Math.abs(dx) / Math.max(1, w);
        const col = edgeT > 0.8 ? pal.dark : pal.base;
        px(mid + dx, shellY + dy, col);
      }
    }
    // Shell outline
    for (let dy = -shellH; dy <= shellH; dy++) {
      const w = Math.round(shellW * Math.sqrt(1 - (dy * dy) / (shellH * shellH)));
      px(mid - w - 1, shellY + dy, pal.outline);
      px(mid + w + 1, shellY + dy, pal.outline);
    }
    for (let dx = -shellW; dx <= shellW; dx++) {
      const h = Math.round(shellH * Math.sqrt(1 - (dx * dx) / (shellW * shellW)));
      px(mid + dx, shellY - h - 1, pal.outline);
      px(mid + dx, shellY + h + 1, pal.outline);
    }
    // Hexagonal shell pattern (armour-influenced)
    const hexSize = Math.round(3 + ag.o * 2);
    const armourAlpha = 0.25 + ag.o * 0.35;
    for (let hy = -shellH + hexSize; hy < shellH; hy += hexSize + 1) {
      const rowOff = ((Math.round((hy + shellH) / (hexSize + 1))) % 2) * Math.round(hexSize * 0.8);
      for (let hx = -shellW + hexSize + rowOff; hx < shellW; hx += hexSize * 2 + 1) {
        const w = Math.round(shellW * Math.sqrt(Math.max(0, 1 - (hy * hy) / (shellH * shellH))));
        if (Math.abs(hx) < w - 1) {
          // Hex border lines
          for (let s = -hexSize; s <= hexSize; s++) {
            px(mid + hx + s, shellY + hy, pal.dark, armourAlpha);
          }
          for (let s = 0; s <= hexSize; s++) {
            px(mid + hx - hexSize, shellY + hy + s, pal.dark, armourAlpha);
            px(mid + hx + hexSize, shellY + hy + s, pal.dark, armourAlpha);
          }
        }
      }
    }
    // Head (poking out right)
    const headX = mid + shellW + 1;
    const headR = Math.round(3 + ag.s);
    fillCircle(headX + headR, shellY - 1, headR, pal.belly);
    outlineCircle(headX + headR, shellY - 1, headR, pal.outline);
    // Eye
    px(headX + headR + 1, shellY - 2, [0, 0, 0]);
    px(headX + headR + 1, shellY - 3, [255, 255, 255]);
    // Front flippers
    for (const fside of [-1, 1]) {
      const fLen = Math.round(5 + ag.s * 3);
      for (let f = 0; f < fLen; f++) {
        const fw = Math.max(1, Math.round(2 * (1 - f / fLen)));
        for (let dy = -fw; dy <= fw; dy++) {
          px(mid + Math.round(shellW * 0.4) + f, shellY + fside * (shellH + 1 + Math.round(f * 0.5)) + dy, pal.belly);
        }
        px(mid + Math.round(shellW * 0.4) + f, shellY + fside * (shellH + 1 + Math.round(f * 0.5) + 1), pal.outline);
      }
    }
    // Rear flippers (smaller)
    for (const fside of [-1, 1]) {
      const fLen = Math.round(3 + ag.s * 2);
      for (let f = 0; f < fLen; f++) {
        px(mid - Math.round(shellW * 0.5) - f, shellY + fside * (shellH + 1 + Math.round(f * 0.3)), pal.belly);
        px(mid - Math.round(shellW * 0.5) - f, shellY + fside * (shellH + 2 + Math.round(f * 0.3)), pal.outline);
      }
    }
    // Small tail
    for (let t = 0; t < 3; t++) {
      px(mid - shellW - 1 - t, shellY, pal.belly);
    }
    px(mid - shellW - 4, shellY, pal.outline);

  } else if (bodyPlan === 62) {
    // Manta Ray: wide diamond/wing shape, flat body
    const wingW = Math.round((20 + ag.f * 5) * evoScale);
    const wingH = Math.round((8 + ag.f * 2) * evoScale);
    const mantaY = mid;
    // Diamond wing body
    for (let dx = -wingW; dx <= wingW; dx++) {
      const t = Math.abs(dx) / wingW;
      const h = Math.round(wingH * (1 - t) * (t < 0.3 ? 0.8 + t * 0.67 : 1));
      // Wing tip curl upward
      const tipCurl = t > 0.85 ? -Math.round((t - 0.85) * 20) : 0;
      for (let dy = -h; dy <= h; dy++) {
        const col = dy > h * 0.3 ? pal.belly : pal.base;
        px(mid + dx, mantaY + dy + tipCurl, col);
      }
      px(mid + dx, mantaY - h - 1 + tipCurl, pal.dark);
      px(mid + dx, mantaY + h + 1 + tipCurl, pal.dark);
    }
    // Outline left and right tips
    px(mid - wingW - 1, mantaY, pal.dark);
    px(mid + wingW + 1, mantaY, pal.dark);
    // Spotted belly pattern
    const spotCount = 5 + Math.round(ag.o * 6);
    for (let s = 0; s < spotCount; s++) {
      const sx = mid + Math.round((rng() - 0.5) * wingW * 1.2);
      const sy = mantaY + Math.round(rng() * wingH * 0.5);
      fillCircle(sx, sy, 1, pal.secondary, 0.3);
    }
    // Cephalic fins (two small forward-pointing lobes near mouth)
    for (const cside of [-1, 1]) {
      const cfX = mid + cside * Math.round(wingH * 0.4);
      for (let f = 0; f < 4; f++) {
        px(cfX + cside * Math.round(f * 0.3), mantaY - wingH + 2 - f, pal.base);
        px(cfX + cside * Math.round(f * 0.3) + cside, mantaY - wingH + 2 - f, pal.dark);
      }
    }
    // Mouth slit
    const mouthW = Math.round(3 + ag.s * 2);
    for (let mx = -mouthW; mx <= mouthW; mx++) {
      px(mid + mx, mantaY - wingH + 3, pal.dark, 0.6);
    }
    // Small eyes
    for (const eside of [-1, 1]) {
      px(mid + eside * Math.round(wingH * 0.6), mantaY - Math.round(wingH * 0.5), [0, 0, 0]);
      px(mid + eside * Math.round(wingH * 0.6), mantaY - Math.round(wingH * 0.5) - 1, [255, 255, 255]);
    }
    // Thin tail
    const tailLen = Math.round(6 + ag.s * 4);
    for (let t = 0; t < tailLen; t++) {
      px(mid, mantaY + wingH + 1 + t, pal.dark, 0.7 - t / tailLen * 0.4);
    }
    // Dark dorsal shading
    for (let dx = -Math.round(wingW * 0.3); dx <= Math.round(wingW * 0.3); dx++) {
      const t = Math.abs(dx) / Math.round(wingW * 0.3);
      px(mid + dx, mantaY - Math.round(wingH * 0.3 * (1 - t)), pal.dark, 0.15);
    }

  } else if (bodyPlan === 63) {
    // Anglerfish: round bulky body, massive jaw, bioluminescent lure
    const bR = Math.round((11 + ag.f * 3) * evoScale);
    const anglerY = mid + 1;
    // Bulky round body
    for (let dy = -bR; dy <= bR; dy++) {
      for (let dx = -bR; dx <= bR; dx++) {
        if (dx * dx + dy * dy <= bR * bR) {
          // Dark colouring throughout
          const dist = Math.sqrt(dx * dx + dy * dy) / bR;
          const col = dist > 0.7 ? pal.dark : pal.base;
          px(mid + dx, anglerY + dy, col);
        }
      }
    }
    outlineCircle(mid, anglerY, bR, pal.outline);
    // Belly region (slightly lighter)
    for (let dy = Math.round(bR * 0.2); dy <= bR - 1; dy++) {
      const w = Math.round(Math.sqrt(bR * bR - dy * dy) * 0.6);
      for (let dx = -w; dx <= w; dx++) {
        px(mid + dx, anglerY + dy, pal.belly, 0.3);
      }
    }
    // Massive jaw (extends forward and down)
    const jawLen = Math.round(5 + ag.p * 4);
    const jawOpen = Math.round(3 + ag.a * 3);
    const jawX = mid + bR - 2;
    const jawY = anglerY + Math.round(bR * 0.3);
    // Upper jaw
    for (let j = 0; j < jawLen; j++) {
      px(jawX + j, jawY, pal.dark);
      px(jawX + j, jawY - 1, pal.base);
    }
    // Lower jaw
    for (let j = 0; j < jawLen; j++) {
      px(jawX + j, jawY + jawOpen, pal.dark);
      px(jawX + j, jawY + jawOpen + 1, pal.outline);
    }
    // Teeth (jagged along both jaws)
    const toothCount = Math.round(2 + ag.a * 3);
    for (let t = 0; t < toothCount; t++) {
      const tx = jawX + 1 + Math.round(t * (jawLen - 2) / Math.max(1, toothCount - 1));
      px(tx, jawY + 1, [240, 240, 230]);
      px(tx, jawY + 2, [240, 240, 230]);
      px(tx, jawY + jawOpen - 1, [240, 240, 230]);
      px(tx, jawY + jawOpen - 2, [240, 240, 230]);
    }
    // Bioluminescent lure (stalk from top of head, bright dot at end)
    const stalkLen = Math.round(8 + ag.v * 5);
    const stalkBaseX = mid + Math.round(bR * 0.3);
    const stalkBaseY = anglerY - bR;
    for (let s = 0; s < stalkLen; s++) {
      const sx = stalkBaseX + Math.round(Math.sin(s * 0.3) * 2 + s * 0.3);
      const sy = stalkBaseY - s;
      px(sx, sy, pal.dark, 0.6);
    }
    // Bright lure dot
    const lureX = stalkBaseX + Math.round(Math.sin(stalkLen * 0.3) * 2 + stalkLen * 0.3);
    const lureY = stalkBaseY - stalkLen;
    fillCircle(lureX, lureY, 2, [200, 255, 220]);
    px(lureX, lureY, [255, 255, 200]);
    px(lureX - 1, lureY - 1, [200, 255, 220], 0.5);
    px(lureX + 1, lureY - 1, [200, 255, 220], 0.5);
    // Small beady eye
    px(mid + Math.round(bR * 0.5), anglerY - Math.round(bR * 0.3), [255, 255, 255]);
    px(mid + Math.round(bR * 0.5) + 1, anglerY - Math.round(bR * 0.3), [0, 0, 0]);
    // Small pectoral fin
    const finLen = Math.round(2 + ag.s * 2);
    for (let f = 0; f < finLen; f++) {
      px(mid - bR - 1 - f, anglerY + Math.round(f * 0.5), pal.base);
      px(mid - bR - 1 - f, anglerY + Math.round(f * 0.5) + 1, pal.dark);
    }

  } else if (bodyPlan === 64) {
    // Sea Horse: curved S-shape body, curled tail, elongated snout
    const bodyH = Math.round((24 + ag.f * 6) * evoScale);
    const bodyW = Math.round((3 + ag.f * 2) * evoScale);
    const topY = mid - Math.round(bodyH * 0.35);
    // S-curve body segments
    const segCount = bodyH;
    const ridgeGap = Math.max(2, Math.round(3 - ag.o));
    for (let s = 0; s < segCount; s++) {
      const t = s / segCount;
      // S-curve: top leans right, belly curves left, tail curls right
      const sOff = Math.round(Math.sin(t * Math.PI * 1.5 - 0.3) * (5 + ag.s * 3));
      const w = t < 0.15 ? Math.round(bodyW * (0.5 + t * 3.3))
              : t > 0.7 ? Math.max(1, Math.round(bodyW * (1 - (t - 0.7) * 2.5)))
              : bodyW;
      const yy = topY + s;
      for (let dx = -w; dx <= w; dx++) {
        const isRidge = (s % ridgeGap === 0);
        const col = isRidge ? pal.dark : (dx === -w || dx === w ? pal.dark : pal.base);
        px(mid + sOff + dx, yy, col);
      }
      // Belly shading on front side
      if (t > 0.2 && t < 0.6) {
        px(mid + sOff + w + 1, yy, pal.belly, 0.3);
      }
    }
    // Curled tail (spiral at bottom)
    const tailStart = topY + segCount;
    const tailSegs = Math.round(8 + ag.s * 4);
    const lastSOff = Math.round(Math.sin(1.0 * Math.PI * 1.5 - 0.3) * (5 + ag.s * 3));
    for (let t = 0; t < tailSegs; t++) {
      const angle = t * 0.4;
      const radius = Math.max(1, 4 - t * 0.3);
      const tx = mid + lastSOff + Math.round(Math.cos(angle) * radius);
      const ty = tailStart + Math.round(Math.sin(angle) * radius) + Math.round(t * 0.3);
      px(tx, ty, pal.base);
      px(tx, ty + 1, pal.dark);
    }
    // Head and snout (at top)
    const headSOff = Math.round(Math.sin(-0.3) * (5 + ag.s * 3));
    const headX = mid + headSOff;
    const headY = topY;
    // Head bump
    fillCircle(headX, headY - 2, Math.round(3 * evoScale), pal.base);
    outlineCircle(headX, headY - 2, Math.round(3 * evoScale), pal.dark);
    // Elongated snout
    const snoutLen = Math.round(5 + ag.s * 3);
    for (let sl = 0; sl < snoutLen; sl++) {
      px(headX + 3 + sl, headY - 3, pal.base);
      px(headX + 3 + sl, headY - 2, pal.base);
      px(headX + 3 + sl, headY - 4, pal.dark);
      px(headX + 3 + sl, headY - 1, pal.dark);
    }
    px(headX + 3 + snoutLen, headY - 3, pal.dark);
    // Eye
    px(headX + 2, headY - 3, [255, 255, 255]);
    px(headX + 2, headY - 2, [0, 0, 0]);
    // Small dorsal fin (on back curve)
    const finY = topY + Math.round(bodyH * 0.3);
    const finSOff = Math.round(Math.sin(0.3 * Math.PI * 1.5 - 0.3) * (5 + ag.s * 3));
    const dorsalH = Math.round(3 + ag.s * 2);
    const dorsalW = Math.round(3 + ag.s);
    for (let f = 0; f < dorsalW; f++) {
      const fh = Math.round(dorsalH * (1 - f / dorsalW));
      for (let dy = 0; dy < fh; dy++) {
        px(mid + finSOff - bodyW - 1 - f, finY + dy, pal.secondary);
      }
      px(mid + finSOff - bodyW - 1 - f, finY - 1, pal.dark);
    }
    // Crown/coronet at top of head
    for (let c = 0; c < 3; c++) {
      px(headX - 1 + c, headY - 5 - Math.round(evoScale), pal.dark);
      px(headX - 1 + c, headY - 6 - Math.round(evoScale), pal.secondary);
    }

  } else if (bodyPlan === 65) {
    // Kelp: tall vertical strand with wavy leaf blades
    const stemH = Math.round((38 + ag.v * 8) * evoScale);
    const stemBase = mid + Math.round(stemH * 0.38);
    const stemTop = stemBase - stemH;
    const stemW = 1 + Math.round(ag.f);
    // Holdfast at base
    const holdW = Math.round(4 + ag.f * 2);
    for (let hx = -holdW; hx <= holdW; hx++) {
      const hh = Math.round(2 + Math.abs(hx) * 0.3);
      for (let hy = 0; hy < hh; hy++) {
        px(mid + hx, stemBase + 1 + hy, pal.dark);
      }
    }
    for (let hx = -holdW - 1; hx <= holdW + 1; hx++) {
      px(mid + hx, stemBase + 1, pal.outline);
    }
    // Main stem (darker, slightly wavy)
    const stemPeriod = 20 + Math.round(ag.s * 6);
    const stemAmp = 1 + Math.round(ag.s);
    for (let y = 0; y < stemH; y++) {
      const yy = stemBase - y;
      const xOff = Math.round(Math.sin(y * Math.PI * 2 / stemPeriod) * stemAmp);
      for (let dx = -stemW; dx <= stemW; dx++) {
        px(mid + xOff + dx, yy, dx === -stemW || dx === stemW ? pal.outline : pal.dark);
      }
    }
    // Multiple fronds / leaf blades branching off
    const frondCount = 5 + Math.round(ag.v * 4);
    for (let i = 0; i < frondCount; i++) {
      const fy = stemBase - Math.round((i + 1) * stemH / (frondCount + 1));
      const fxBase = mid + Math.round(Math.sin((stemBase - fy) * Math.PI * 2 / stemPeriod) * stemAmp);
      const fside = i % 2 === 0 ? 1 : -1;
      const fLen = Math.round(7 + ag.f * 5 + rng() * 3);
      const fW = Math.round(2 + ag.v * 2);
      const wavePeriod = 5 + Math.round(rng() * 3);
      for (let s = 0; s < fLen; s++) {
        const fx = fxBase + fside * (1 + s);
        const waveOff = Math.round(Math.sin(s * Math.PI * 2 / wavePeriod) * 1.5);
        const cw = Math.max(1, Math.round(fW * (1 - s / fLen * 0.6)));
        for (let dw = 0; dw < cw; dw++) {
          // Lighter leaf tips
          const tipFactor = s / fLen;
          const col = tipFactor > 0.7 ? pal.light : (dw === 0 ? pal.light : pal.base);
          px(fx, fy + waveOff + dw, col);
        }
        px(fx, fy + waveOff - 1, pal.dark, 0.4);
      }
    }
    // Gas bladders (small bubbles along stem near top)
    const bladderCount = 2 + Math.round(ag.o * 3);
    for (let b = 0; b < bladderCount; b++) {
      const by = stemTop + Math.round(rng() * stemH * 0.3);
      const bxBase = mid + Math.round(Math.sin((stemBase - by) * Math.PI * 2 / stemPeriod) * stemAmp);
      fillCircle(bxBase + (b % 2 === 0 ? 2 : -2), by, 2, pal.light);
      outlineCircle(bxBase + (b % 2 === 0 ? 2 : -2), by, 2, pal.dark, 0.4);
    }

  } else if (bodyPlan === 66) {
    // Anemone: circular base with radiating colourful tentacles
    const baseR = Math.round((6 + ag.f * 2) * evoScale);
    const baseY = mid + Math.round(6 * evoScale);
    // Foot / base column
    const colH = Math.round(6 + ag.s * 3);
    for (let y = 0; y < colH; y++) {
      const w = baseR + Math.round((colH - y) * 0.3);
      for (let dx = -w; dx <= w; dx++) {
        px(mid + dx, baseY - y, Math.abs(dx) >= w - 1 ? pal.dark : pal.base);
      }
    }
    // Base attachment
    for (let dx = -(baseR + 3); dx <= baseR + 3; dx++) {
      px(mid + dx, baseY + 1, pal.dark);
      px(mid + dx, baseY + 2, pal.outline);
    }
    // Oral disc (top of column)
    const discY = baseY - colH;
    const discR = baseR + 1;
    for (let dx = -discR; dx <= discR; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx * dx <= discR * discR) {
          px(mid + dx, discY + dy, pal.belly);
        }
      }
    }
    // Central mouth
    fillCircle(mid, discY, 2, pal.dark);
    px(mid, discY, pal.secondary, 0.6);
    // Radiating tentacles (colourful and wavy)
    const tentRings = 2 + Math.round(ag.v * 2);
    const tentsPerRing = 8 + Math.round(ag.v * 4);
    for (let ring = 0; ring < tentRings; ring++) {
      const ringR = discR * (0.5 + ring * 0.4);
      const tentLen = Math.round((8 + ag.v * 6 - ring * 2) * evoScale);
      for (let t = 0; t < tentsPerRing; t++) {
        const angle = (t / tentsPerRing) * Math.PI * 2 + ring * 0.2;
        const baseX = mid + Math.round(Math.cos(angle) * ringR);
        const baseTY = discY - Math.round(Math.sin(angle) * ringR * 0.3);
        const phase = rng() * Math.PI * 2;
        const amp = 1 + rng() * 1.5;
        // Alternate colours between base, secondary, and light
        const tentCol = t % 3 === 0 ? pal.secondary : (t % 3 === 1 ? pal.light : pal.base);
        for (let s = 0; s < tentLen; s++) {
          const tt = s / tentLen;
          const wx = Math.round(Math.sin(s * 0.5 + phase) * amp);
          const alpha = 0.8 - tt * 0.4;
          px(baseX + wx, baseTY - s, tentCol, Math.max(0.2, alpha));
          // Slight thickening at tips
          if (s >= tentLen - 2) {
            px(baseX + wx + 1, baseTY - s, tentCol, Math.max(0.15, alpha * 0.5));
          }
        }
      }
    }

  } else if (bodyPlan === 67) {
    // Starfish: five-armed star shape, textured surface
    const armLen = Math.round((12 + ag.f * 4) * evoScale);
    const armW = Math.round((3 + ag.f * 2) * evoScale);
    const centreR = Math.round(armW * 1.2);
    // Central disc
    fillCircle(mid, mid, centreR, pal.base);
    outlineCircle(mid, mid, centreR, pal.dark);
    // Five arms radiating outward
    for (let arm = 0; arm < 5; arm++) {
      const angle = arm * Math.PI * 2 / 5 - Math.PI / 2;
      for (let s = 0; s < armLen; s++) {
        const t = s / armLen;
        // Arm tapers from base to tip
        const w = Math.max(1, Math.round(armW * (1 - t * 0.7)));
        const ax = mid + Math.round(Math.cos(angle) * (centreR - 1 + s));
        const ay = mid + Math.round(Math.sin(angle) * (centreR - 1 + s));
        // Perpendicular direction for arm width
        const perpX = -Math.sin(angle);
        const perpY = Math.cos(angle);
        for (let dw = -w; dw <= w; dw++) {
          const px2 = ax + Math.round(perpX * dw);
          const py2 = ay + Math.round(perpY * dw);
          const isEdge = Math.abs(dw) >= w;
          px(px2, py2, isEdge ? pal.dark : pal.base);
        }
        // Arm tip
        if (s === armLen - 1) {
          px(ax + Math.round(Math.cos(angle)), ay + Math.round(Math.sin(angle)), pal.dark);
        }
      }
    }
    // Textured surface: small bumps/spots on arms
    const bumpCount = 8 + Math.round(ag.o * 8);
    for (let b = 0; b < bumpCount; b++) {
      const bArm = Math.floor(rng() * 5);
      const bAngle = bArm * Math.PI * 2 / 5 - Math.PI / 2;
      const bDist = centreR + Math.round(rng() * (armLen - 2));
      const bx = mid + Math.round(Math.cos(bAngle) * bDist);
      const by = mid + Math.round(Math.sin(bAngle) * bDist);
      px(bx, by, pal.secondary, 0.5);
      px(bx + 1, by, pal.secondary, 0.3);
    }
    // Tube feet suggestion: tiny dots along underside of arms
    for (let arm = 0; arm < 5; arm++) {
      const angle = arm * Math.PI * 2 / 5 - Math.PI / 2;
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);
      for (let s = 2; s < armLen - 1; s += 2) {
        const ax = mid + Math.round(Math.cos(angle) * (centreR + s));
        const ay = mid + Math.round(Math.sin(angle) * (centreR + s));
        px(ax + Math.round(perpX), ay + Math.round(perpY), pal.belly, 0.4);
        px(ax - Math.round(perpX), ay - Math.round(perpY), pal.belly, 0.4);
      }
    }
    // Central madreporite (small lighter spot on disc)
    px(mid + 1, mid - 1, pal.light, 0.6);
    px(mid + 2, mid - 1, pal.light, 0.4);

  } else {
    // Fallback: generic oval creature
    const bW = Math.round(10 * evoScale);
    const bH = Math.round(8 * evoScale);
    const startY = Math.round(mid - bH / 2);
    for (let y = 0; y < bH; y++) {
      const t = y / Math.max(1, bH - 1);
      const w = Math.max(1, Math.round(bW * Math.sin(t * Math.PI) * 0.5));
      rect(mid - w, startY + y, w * 2, 1, y > bH * 0.5 ? pal.belly : pal.base);
      px(mid - w - 1, startY + y, pal.dark); px(mid + w, startY + y, pal.dark);
    }
    px(mid + 3, mid - 1, [255, 255, 255]); px(mid + 4, mid - 1, [0, 0, 0]);
  }

  // -----------------------------------------------------------------------
  // Evolution markers for descendants
  // -----------------------------------------------------------------------

  if (ld >= 1 && drift > 0.02) {
    const markCount = Math.min(4, ld);
    const markRng = _seedRng(sid * 9973);
    for (let m = 0; m < markCount; m++) {
      const mx = mid + Math.round((markRng() - 0.5) * 16);
      const my = mid + Math.round((markRng() - 0.5) * 16);
      rect(mx, my, 2, 2, pal.secondary, 0.45 + drift * 0.3);
    }
  }

  ctx.restore();

  // -----------------------------------------------------------------------
  // Armour overlay: draw thicker border when bodyArmour is high
  // -----------------------------------------------------------------------

  const _bar = expGenes.bodyArmour || 0;
  if (_bar > 0.4 && sp.tier !== 'producer') {
    ctx.strokeStyle = 'rgba(' + pal.outline[0] + ',' + pal.outline[1] + ',' + pal.outline[2] + ',' + (0.3 + _bar * 0.5) + ')';
    ctx.lineWidth = 1 + _bar * 2;
    ctx.strokeRect(4, 4, size - 8, size - 8);
  }

  // -----------------------------------------------------------------------
  // Sociality indicator: faint extra dots for schooling species
  // -----------------------------------------------------------------------

  if ((expGenes.sociality || 0) > 0.65 && sp.tier !== 'producer') {
    const _soc = expGenes.sociality;
    const schoolCount = _soc > 0.85 ? 3 : _soc > 0.75 ? 2 : 1;
    for (let _si = 0; _si < schoolCount; _si++) {
      const sx = 4 + rng() * 8;
      const sy = size - 8 + rng() * 5;
      ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.25)';
      ctx.fillRect(sx, sy, 2, 2);
    }
  }

  const dataUrl = cv.toDataURL();
  _creatureCache[sid] = dataUrl;
  return dataUrl;
}
