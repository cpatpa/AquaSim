import type { PopSnapshot, EvoStats } from '../types';
import { GENE_CLUSTERS } from '../constants';
import { SPECIES, getLivingIds, getDynamicSpeciesIds, COLOR_RGB } from '../species/registry';
import { TIER_ORDER, BIO_TIERS } from '../species/species-types';
import { expressAllGenes } from '../evolution/genetics';

export function calcBiodiversity(
  counts: PopSnapshot,
  evoStats: Record<number, EvoStats>,
): number {
  const livingIds = getLivingIds();
  const dynamicIds = getDynamicSpeciesIds();
  let score = 0;
  const livePops: number[] = [];
  const tiersPresent = new Set<string>();
  const allTraits = new Set<string>();
  let totalPop = 0;

  for (const id of livingIds) {
    const c = counts[id] || 0;
    if (c <= 0) continue;
    livePops.push(c);
    totalPop += c;
    const sp = SPECIES[id];
    if (sp && BIO_TIERS.indexOf(sp.tier as any) !== -1) tiersPresent.add(sp.tier);
    score += dynamicIds.indexOf(id) !== -1 ? 15 : 10;
    const es = evoStats[id];
    if (es?.traits) {
      for (const t of es.traits) allTraits.add(t);
    }
  }

  score += allTraits.size * 5;
  score += tiersPresent.size * 25;

  if (livePops.length >= 2 && totalPop > 0) {
    let H = 0;
    for (const p of livePops) {
      const pi = p / totalPop;
      if (pi > 0) H -= pi * Math.log(pi);
    }
    const J = H / Math.log(livePops.length);
    score += (J * 100) | 0;
  }

  return score;
}

export function scoreColour(score: number): string {
  if (score < 100) return '#FF4444';
  if (score < 250) return '#FF8844';
  if (score < 450) return '#FFDD44';
  if (score < 650) return '#88FF88';
  return '#00FF88';
}

export function drawPopGraph(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  graphHistory: PopSnapshot[],
): void {
  if (graphHistory.length < 2) return;

  const parentEl = canvas.parentElement;
  if (!parentEl) return;
  const rect = parentEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(rect.width);
  const h = 80;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#04090F';
  ctx.fillRect(0, 0, w, h);

  const hist = graphHistory;
  const len = hist.length;

  const sidSet = new Set<number>();
  for (let i = 0; i < len; i++) {
    const snap = hist[i];
    for (const sid in snap) {
      const n = parseInt(sid);
      if (n >= 10 && snap[n] > 0) sidSet.add(n);
    }
  }

  const tierRank: Record<number, number> = {};
  for (let ti = 0; ti < TIER_ORDER.length; ti++) {
    for (const id of TIER_ORDER[ti].ids) tierRank[id] = ti * 100 + id;
  }
  const dynamicIds = getDynamicSpeciesIds();
  for (const did of dynamicIds) {
    if (!tierRank[did]) {
      const sp = SPECIES[did];
      const parentTi = sp && (sp as any).parentId ? (tierRank[(sp as any).parentId] || 500) : 500;
      tierRank[did] = parentTi + 0.5;
    }
  }

  const sids = Array.from(sidSet).sort((a, b) => (tierRank[a] || 999) - (tierRank[b] || 999));
  if (sids.length === 0) return;

  let maxTotal = 0;
  for (let i = 0; i < len; i++) {
    let t = 0;
    const snap = hist[i];
    for (const sid of sids) t += snap[sid] || 0;
    if (t > maxTotal) maxTotal = t;
  }
  if (maxTotal === 0) return;

  const colW = w / len;

  for (let si = 0; si < sids.length; si++) {
    const sid = sids[si];
    const rgb = COLOR_RGB[sid];
    if (!rgb) continue;
    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)`;
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let i = 0; i < len; i++) {
      const snap = hist[i];
      let stackBelow = 0;
      for (let s = 0; s < si; s++) stackBelow += snap[sids[s]] || 0;
      const stackTop = stackBelow + (snap[sid] || 0);
      const x = i * colW + colW * 0.5;
      const y = h - (stackTop / maxTotal) * (h - 2);
      ctx.lineTo(x, y);
    }

    for (let i = len - 1; i >= 0; i--) {
      const snap = hist[i];
      let stackBelow = 0;
      for (let s = 0; s < si; s++) stackBelow += snap[sids[s]] || 0;
      const x = i * colW + colW * 0.5;
      const y = h - (stackBelow / maxTotal) * (h - 2);
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();
  }
}

export function buildStatsHtml(
  counts: PopSnapshot,
  evoStats: Record<number, EvoStats>,
  evolveEnabled: boolean,
): string {
  const parts: string[] = [];

  for (const tier of TIER_ORDER) {
    for (const id of tier.ids) {
      if (id === 0) continue;
      const c = counts[id] || 0;
      if (c <= 0) continue;

      let geneBar = '';
      const sEs = evoStats[id];
      if (evolveEnabled && sEs?.genes) {
        const sExp = sEs._expressed || expressAllGenes(sEs.genes);
        geneBar = '<div style="display:flex;gap:0px;height:3px;margin-top:1px;pointer-events:none;">';
        const clusterNames = Object.keys(GENE_CLUSTERS) as Array<keyof typeof GENE_CLUSTERS>;
        for (const clN of clusterNames) {
          const clG = GENE_CLUSTERS[clN];
          let clAvg = 0;
          for (const g of clG) clAvg += sExp[g] || 0;
          clAvg /= clG.length;
          const clCol = clN === 'Morphology' ? '#AACCEE' : clN === 'Metabolism' ? '#FF8844' : clN === 'Behaviour' ? '#CC88FF' : '#88EEFF';
          geneBar += `<div style="flex:1;background:${clCol};opacity:${(0.3 + clAvg * 0.7).toFixed(2)};height:${Math.round(clAvg * 3)}px;align-self:flex-end;border-radius:1px;margin-right:1px;"></div>`;
        }
        geneBar += '</div>';
      }

      const sp = SPECIES[id];
      parts.push(
        `<div class="stat-row" data-sid="${id}" style="cursor:pointer;">` +
        `<span class="stat-name" style="color:${sp.color}">${sp.name}</span>` +
        `<span class="stat-count">${c}</span>${geneBar}</div>`
      );
    }
  }

  const transients: Array<[number, string, string]> = [
    [3, '#8B7355', 'Dead'],
    [4, '#2A1800', 'Oil'],
    [5, '#AADDFF', 'Ice'],
    [6, '#99FF00', 'Toxic Bloom'],
    [7, '#FF4400', 'Lava'],
  ];
  for (const [tid, col, name] of transients) {
    if (counts[tid]) {
      parts.push(
        `<div class="stat-row" data-sid="${tid}">` +
        `<span class="stat-name" style="color:${col}">${name}</span>` +
        `<span class="stat-count">${counts[tid]}</span></div>`
      );
    }
  }

  return parts.join('');
}
