import type { EvoStats, ExpressedGenes, GeneKey } from '../types';
import {
  GENE_KEYS,
  GENE_CLUSTERS,
  GENE_NAMES,
  GENE_COLORS,
  LAYER_NAMES,
} from '../constants';
import { SPECIES } from '../species/registry';
import { expressAllGenes, geneVal, speciesGeneticDiversity } from '../evolution/genetics';
import { TRAITS } from '../evolution/traits';
import { NOVEL_ADAPTATIONS } from '../evolution/novel-adaptations';
import { getSpeciesSynergies } from '../evolution/traits';

export interface SpeciesInfoState {
  visible: boolean;
  speciesId: number;
  modalEl: HTMLElement | null;
}

export function createSpeciesInfoState(): SpeciesInfoState {
  return { visible: false, speciesId: -1, modalEl: null };
}

function drawRadarChart(
  canvas: HTMLCanvasElement,
  expressed: ExpressedGenes,
  geneVar: Record<GeneKey, number> | undefined,
): void {
  const dpr = window.devicePixelRatio || 1;
  const size = 200;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;
  const n = GENE_KEYS.length;
  const angleStep = (Math.PI * 2) / n;

  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, size, size);

  for (let ring = 4; ring >= 1; ring--) {
    const r = (radius * ring) / 4;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i * angleStep - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === 2 ? '#1a3a5c' : '#0d1f3c';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let i = 0; i < n; i++) {
    const a = i * angleStep - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.strokeStyle = '#0d1f3c';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (geneVar) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const gi = i % n;
      const g = GENE_KEYS[gi];
      const val = expressed[g] || 0;
      const v = geneVar[g] || 0;
      const rHigh = Math.min(1, val + v) * radius;
      const a = gi * angleStep - Math.PI / 2;
      const px = cx + Math.cos(a) * rHigh;
      const py = cy + Math.sin(a) * rHigh;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(77, 166, 255, 0.08)';
    ctx.fill();
  }

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const gi = i % n;
    const g = GENE_KEYS[gi];
    const val = expressed[g] || 0;
    const r = val * radius;
    const a = gi * angleStep - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(77, 166, 255, 0.2)';
  ctx.fill();
  ctx.strokeStyle = '#4da6ff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const g = GENE_KEYS[i];
    const val = expressed[g] || 0;
    const a = i * angleStep - Math.PI / 2;
    const dotR = val * radius;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * dotR, cy + Math.sin(a) * dotR, 3, 0, Math.PI * 2);
    ctx.fillStyle = GENE_COLORS[g];
    ctx.fill();
  }

  ctx.font = '8px Share Tech Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const g = GENE_KEYS[i];
    const a = i * angleStep - Math.PI / 2;
    const labelR = radius + 14;
    const lx = cx + Math.cos(a) * labelR;
    const ly = cy + Math.sin(a) * labelR;
    ctx.fillStyle = '#5a7a9a';
    const shortName = GENE_NAMES[g].slice(0, 4);
    ctx.fillText(shortName, lx, ly);
  }
}

function buildGeneBarHtml(es: EvoStats): string {
  const expressed = es._expressed || expressAllGenes(es.genes);
  const parts: string[] = [];
  const clusterNames = Object.keys(GENE_CLUSTERS) as Array<keyof typeof GENE_CLUSTERS>;
  const clusterColors: Record<string, string> = {
    Morphology: '#AACCEE',
    Metabolism: '#FF8844',
    Behaviour: '#CC88FF',
    Sensory: '#88EEFF',
  };

  for (const clName of clusterNames) {
    const genes = GENE_CLUSTERS[clName];
    parts.push(`<div class="gene-cluster"><div class="gene-cluster-label" style="color:${clusterColors[clName]}">${clName}</div>`);
    for (const g of genes) {
      const val = expressed[g] || 0;
      const raw = geneVal(es.genes[g]);
      const variance = es.geneVar?.[g] ?? 0;
      const pct = Math.round(val * 100);
      const barColor = GENE_COLORS[g];
      parts.push(
        `<div class="gene-row">` +
        `<span class="gene-label" style="color:${barColor}">${GENE_NAMES[g]}</span>` +
        `<div class="gene-bar-track">` +
        `<div class="gene-bar-fill" style="width:${pct}%;background:${barColor};"></div>` +
        (variance > 0.01 ? `<div class="gene-var-range" style="left:${Math.round(Math.max(0, raw - variance) * 100)}%;width:${Math.round(variance * 200)}%;border-color:${barColor};"></div>` : '') +
        `</div>` +
        `<span class="gene-val">${pct}</span>` +
        `</div>`
      );
    }
    parts.push('</div>');
  }
  return parts.join('');
}

export function openSpeciesInfo(
  state: SpeciesInfoState,
  speciesId: number,
  evoStats: Record<number, EvoStats>,
  counts: Record<number, number>,
  portraitUrl?: string | null,
): void {
  const sp = SPECIES[speciesId];
  if (!sp) return;
  const es = evoStats[speciesId];
  const pop = counts[speciesId] || 0;

  if (state.modalEl) {
    state.modalEl.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'species-modal-overlay';
  modal.innerHTML = `
    <div class="species-modal">
      <div class="species-modal-header">
        <div class="species-modal-title" style="color:${sp.color}">${sp.name}</div>
        <button class="species-modal-close">&times;</button>
      </div>
      <div class="species-modal-body">
        <div class="species-modal-left">
          ${portraitUrl ? `<img class="sip-portrait" src="${portraitUrl}" alt="${sp.name}" style="width:64px;height:64px;image-rendering:pixelated;margin-bottom:8px;">` : ''}
          <div class="species-meta">
            <div><span class="meta-label">Tier</span> ${sp.tier}</div>
            <div><span class="meta-label">Layer</span> ${sp.layer >= 0 && sp.layer < LAYER_NAMES.length ? LAYER_NAMES[sp.layer as 0 | 1 | 2 | 3] : 'N/A'}</div>
            <div><span class="meta-label">Population</span> ${pop}</div>
            ${es ? `<div><span class="meta-label">Breed</span> ${(es.breedRate * 100).toFixed(1)}%</div>` : ''}
            ${es?.moveRate ? `<div><span class="meta-label">Move</span> ${(es.moveRate * 100).toFixed(1)}%</div>` : ''}
            ${es?.hungerMax ? `<div><span class="meta-label">Hunger Max</span> ${es.hungerMax}</div>` : ''}
            ${es?.genes ? `<div><span class="meta-label">Diversity</span> ${(speciesGeneticDiversity(es.genes) * 100).toFixed(0)}%</div>` : ''}
          </div>
          ${sp.desc ? `<div class="species-desc">${sp.desc}</div>` : ''}
          ${es?.eats?.length ? `<div class="species-diet"><span class="meta-label">Diet</span> ${es.eats.map(eid => SPECIES[eid]?.name || `#${eid}`).join(', ')}</div>` : ''}
          ${buildTraitsSection(es)}
          ${buildNovelSection(es)}
          ${buildSynergySection(es)}
          ${buildLineageSection(speciesId)}
        </div>
        <div class="species-modal-right">
          <canvas id="gene-radar"></canvas>
          ${es?.genes ? buildGeneBarHtml(es) : '<div style="color:#5a7a9a;">No genetic data</div>'}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  state.modalEl = modal;
  state.visible = true;
  state.speciesId = speciesId;

  if (es?.genes) {
    const radarCanvas = modal.querySelector('#gene-radar') as HTMLCanvasElement;
    if (radarCanvas) {
      const expressed = es._expressed || expressAllGenes(es.genes);
      drawRadarChart(radarCanvas, expressed, es.geneVar);
    }
  }

  const closeBtn = modal.querySelector('.species-modal-close')!;
  closeBtn.addEventListener('click', () => closeSpeciesInfo(state));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSpeciesInfo(state);
  });
}

function buildTraitsSection(es: EvoStats | undefined): string {
  if (!es?.traits?.length) return '';
  const items = es.traits.map(t => {
    const def = TRAITS[t];
    const str = es.traitStrengths?.[t];
    const strLabel = str !== undefined ? ` (${Math.round(str * 100)}%)` : '';
    return def
      ? `<span class="trait-badge" title="${def.desc}">${def.icon} ${def.name}${strLabel}</span>`
      : `<span class="trait-badge">${t}</span>`;
  });
  return `<div class="species-traits"><span class="meta-label">Traits</span><div class="trait-list">${items.join('')}</div></div>`;
}

function buildNovelSection(es: EvoStats | undefined): string {
  if (!es?.novelAdapts?.length) return '';
  const items = es.novelAdapts.map(k => {
    const def = NOVEL_ADAPTATIONS[k];
    return def
      ? `<span class="trait-badge novel" title="${def.desc}">${def.icon} ${def.name}</span>`
      : `<span class="trait-badge novel">${k}</span>`;
  });
  return `<div class="species-traits"><span class="meta-label">Novel</span><div class="trait-list">${items.join('')}</div></div>`;
}

function buildSynergySection(es: EvoStats | undefined): string {
  if (!es?.traits?.length) return '';
  const synergies = getSpeciesSynergies(es.traits);
  if (synergies.length === 0) return '';
  const items = synergies.map(s =>
    `<span class="trait-badge synergy" title="${s.bonus} x${s.mult}">${s.name}</span>`
  );
  return `<div class="species-traits"><span class="meta-label">Synergies</span><div class="trait-list">${items.join('')}</div></div>`;
}

function buildLineageSection(speciesId: number): string {
  const sp = SPECIES[speciesId] as any;
  if (!sp?.parentId && sp?.parentId !== 0) return '';
  const chain: string[] = [];
  let current = speciesId;
  const visited = new Set<number>();
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    const csp = SPECIES[current];
    if (csp) chain.unshift(csp.name);
    current = (csp as any)?.parentId;
  }
  if (chain.length <= 1) return '';
  return `<div class="species-lineage"><span class="meta-label">Lineage</span><div class="lineage-chain">${chain.join(' &rarr; ')}</div></div>`;
}

export function closeSpeciesInfo(state: SpeciesInfoState): void {
  if (state.modalEl) {
    state.modalEl.remove();
    state.modalEl = null;
  }
  state.visible = false;
  state.speciesId = -1;
}

export function injectSpeciesInfoStyles(): void {
  if (document.getElementById('species-info-styles')) return;
  const style = document.createElement('style');
  style.id = 'species-info-styles';
  style.textContent = `
    .species-modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .species-modal {
      background: #0d1f3c; border: 1px solid #1a3a5c; border-radius: 8px;
      max-width: 700px; width: 90vw; max-height: 85vh; overflow-y: auto;
      font-family: 'Share Tech Mono', monospace; color: #e0e8f0;
    }
    .species-modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-bottom: 1px solid #1a3a5c;
    }
    .species-modal-title { font-family: 'Orbitron', monospace; font-size: 1.1rem; letter-spacing: 1px; }
    .species-modal-close {
      background: none; border: none; color: #5a7a9a; font-size: 1.5rem; cursor: pointer;
      padding: 0 4px; line-height: 1;
    }
    .species-modal-close:hover { color: #ef4444; }
    .species-modal-body {
      display: flex; gap: 16px; padding: 16px; flex-wrap: wrap;
    }
    .species-modal-left { flex: 1; min-width: 200px; }
    .species-modal-right { flex: 1; min-width: 200px; }
    .species-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 0.85rem; }
    .meta-label { color: #5a7a9a; margin-right: 6px; }
    .species-desc { color: #5a7a9a; font-size: 0.8rem; margin-bottom: 10px; font-style: italic; }
    .species-diet { font-size: 0.8rem; margin-bottom: 8px; }
    .species-traits { margin-bottom: 8px; }
    .trait-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .trait-badge {
      background: #162d4a; border: 1px solid #1a3a5c; border-radius: 4px;
      padding: 2px 8px; font-size: 0.75rem; white-space: nowrap;
    }
    .trait-badge.novel { border-color: #FFD700; color: #FFD700; }
    .trait-badge.synergy { border-color: #FF8844; color: #FF8844; }
    .species-lineage { font-size: 0.8rem; margin-bottom: 8px; }
    .lineage-chain { color: #5a7a9a; margin-top: 2px; font-size: 0.75rem; }
    .gene-cluster { margin-bottom: 8px; }
    .gene-cluster-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
    .gene-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .gene-label { font-size: 0.7rem; width: 70px; text-align: right; flex-shrink: 0; }
    .gene-bar-track {
      flex: 1; height: 6px; background: #0d1f3c; border-radius: 3px;
      position: relative; overflow: hidden;
    }
    .gene-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .gene-var-range {
      position: absolute; top: 0; height: 100%; border: 1px solid; border-radius: 3px;
      opacity: 0.3; pointer-events: none;
    }
    .gene-val { font-size: 0.7rem; color: #5a7a9a; width: 28px; text-align: right; }
    #gene-radar { display: block; margin: 0 auto 12px; }
  `;
  document.head.appendChild(style);
}
