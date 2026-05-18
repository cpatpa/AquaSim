import type { GridState, EvoStats, GeneClusterName } from '../types';
import { CELL_SIZE, LAYER_NAMES, GENE_CLUSTERS } from '../constants';
import { SPECIES } from '../species/registry';
import { expressAllGenes, speciesGeneticDiversity } from '../evolution/genetics';
import { TRAITS } from '../evolution/traits';
import { NOVEL_ADAPTATIONS } from '../evolution/novel-adaptations';
import { screenToWorld } from './camera';
import type { CameraState } from './camera';
import { isMobile } from './mobile';

const DIR_NAMES = ['', 'North', 'East', 'South', 'West'];

const TIER_COLORS: Record<string, string> = {
  producer: '#00FF88',
  herbivore: '#FF9944',
  consumer: '#44CCFF',
  apex: '#FF4466',
  megafauna: '#6688CC',
  decomposer: '#88FFCC',
  environment: '#4A7A8A',
  transient: '#8B7355',
};

let tooltipEl: HTMLDivElement | null = null;
let visible = false;
let lastIdx = -1;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureTooltip(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'cell-tooltip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function hide(): void {
  if (tooltipEl) tooltipEl.style.display = 'none';
  visible = false;
  lastIdx = -1;
}

function scheduleHide(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 120);
}

function cancelHide(): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

function buildContent(
  sid: number,
  grid: GridState,
  idx: number,
  evoStats: Record<number, EvoStats>,
): string {
  const sp = SPECIES[sid];
  const curDir = grid.currents[idx];
  const hunger = grid.hunger[idx];
  const age = grid.age[idx];

  if (!sp && curDir === 0) return '';

  const parts: string[] = [];

  if (sp) {
    const tc = TIER_COLORS[sp.tier] || '#7EE8FA';
    parts.push(`<div class="tt-name" style="color:${sp.color}">${sp.name}</div>`);

    if (sp.tier !== 'none') {
      parts.push(`<div class="tt-tier" style="color:${tc}">${sp.tier}${sp.layer >= 0 ? ` · ${LAYER_NAMES[sp.layer as 0|1|2|3]}` : ''}</div>`);
    }
  } else if (curDir > 0) {
    parts.push(`<div class="tt-name" style="color:#003D88">Current</div>`);
  }

  if (curDir > 0 && curDir <= 4) {
    parts.push(`<div class="tt-stat">Flow: ${DIR_NAMES[curDir]}</div>`);
  }

  if (sp && sp.tier === 'transient' && age > 0) {
    parts.push(`<div class="tt-stat">Age: ${age} ticks</div>`);
  }

  const es = evoStats[sid];
  if (!sp || !es) {
    if (sp?.desc) parts.push(`<div class="tt-desc">${sp.desc}</div>`);
    return parts.join('');
  }

  const isAnimal = es.hungerMax > 0;
  const isProducer = sp.tier === 'producer';

  if (isAnimal) {
    const hPct = Math.round((hunger / es.hungerMax) * 100);
    const hColor = hPct > 75 ? '#FF4444' : hPct > 40 ? '#FFAA44' : '#88FF88';
    parts.push(`<div class="tt-stat">Hunger: <span style="color:${hColor}">${hunger}/${es.hungerMax}</span></div>`);
    parts.push(`<div class="tt-stat">Speed: ${Math.round(es.moveRate * 100)}% · Breed: ${(es.breedRate * 100).toFixed(1)}%</div>`);
  } else if (isProducer) {
    parts.push(`<div class="tt-stat">Breed: ${(es.breedRate * 100).toFixed(1)}%</div>`);
  }

  if (es.eats?.length) {
    const dietNames = es.eats.slice(0, 5).map(eid => SPECIES[eid]?.name || `#${eid}`);
    const suffix = es.eats.length > 5 ? ` +${es.eats.length - 5}` : '';
    parts.push(`<div class="tt-stat">Diet: ${dietNames.join(', ')}${suffix}</div>`);
  }

  if (es.traits?.length) {
    const traitHtml = es.traits.map(t => {
      const def = TRAITS[t];
      return def ? `<span class="tt-trait">${def.icon} ${def.name}</span>` : '';
    }).filter(Boolean).join(' ');
    if (traitHtml) parts.push(`<div class="tt-traits">${traitHtml}</div>`);
  }

  if (es.novelAdapts?.length) {
    const novelHtml = es.novelAdapts.map(k => {
      const def = NOVEL_ADAPTATIONS[k];
      return def ? `<span class="tt-novel">${def.icon} ${def.name}</span>` : '';
    }).filter(Boolean).join(' ');
    if (novelHtml) parts.push(`<div class="tt-traits">${novelHtml}</div>`);
  }

  if (es.genes) {
    const expressed = es._expressed || expressAllGenes(es.genes);
    const clusterNames = Object.keys(GENE_CLUSTERS) as GeneClusterName[];
    const bars: string[] = [];
    for (const cl of clusterNames) {
      const genes = GENE_CLUSTERS[cl];
      const avg = genes.reduce((s, g) => s + (expressed[g] || 0), 0) / genes.length;
      const pct = Math.round(avg * 100);
      bars.push(`<div class="tt-gene-row"><span class="tt-gene-label">${cl.slice(0, 5)}</span><div class="tt-gene-track"><div class="tt-gene-fill" style="width:${pct}%"></div></div><span class="tt-gene-pct">${pct}</span></div>`);
    }
    parts.push(`<div class="tt-genes">${bars.join('')}</div>`);

    const diversity = speciesGeneticDiversity(es.genes);
    const dPct = Math.round(diversity * 100);
    const dColor = dPct > 25 ? '#88FF88' : dPct > 10 ? '#FFAA44' : '#FF4444';
    parts.push(`<div class="tt-stat">Diversity: <span style="color:${dColor}">${dPct}%</span></div>`);
  }

  const spAny = sp as any;
  if (spAny.parentId !== undefined) {
    const parent = SPECIES[spAny.parentId];
    if (parent) {
      const depth = spAny.depth || 1;
      parts.push(`<div class="tt-lineage">Evolved from ${parent.name}${depth > 1 ? ` (depth ${depth})` : ''}</div>`);
    }
  }

  return parts.join('');
}

export function setupCellTooltip(
  canvas: HTMLCanvasElement,
  cam: CameraState,
  grid: GridState,
  evoStats: Record<number, EvoStats>,
  isPainting: () => boolean,
): void {
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (isMobile()) return;
    if (isPainting()) { hide(); return; }

    cancelHide();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const [wx, wy] = screenToWorld(cam, canvasX, canvasY);
    const cellX = (wx / CELL_SIZE) | 0;
    const cellY = (wy / CELL_SIZE) | 0;

    if (cellX < 0 || cellX >= grid.width || cellY < 0 || cellY >= grid.height) {
      hide();
      return;
    }

    const idx = cellY * grid.width + cellX;
    const sid = grid.species[idx];
    const curDir = grid.currents[idx];

    if (sid === 0 && curDir === 0) {
      hide();
      return;
    }

    if (idx === lastIdx && visible) return;
    lastIdx = idx;

    const content = buildContent(sid, grid, idx, evoStats);
    if (!content) { hide(); return; }

    const tip = ensureTooltip();
    tip.innerHTML = content;
    tip.style.display = 'block';
    visible = true;

    const tipRect = tip.getBoundingClientRect();
    const pad = 14;
    let tx = e.clientX + pad;
    let ty = e.clientY + pad;

    if (tx + tipRect.width > window.innerWidth - 8) {
      tx = e.clientX - tipRect.width - pad;
    }
    if (ty + tipRect.height > window.innerHeight - 8) {
      ty = e.clientY - tipRect.height - pad;
    }
    tx = Math.max(4, tx);
    ty = Math.max(4, ty);

    tip.style.left = tx + 'px';
    tip.style.top = ty + 'px';
  });

  canvas.addEventListener('mouseleave', () => {
    scheduleHide();
  });

  canvas.addEventListener('mousedown', () => {
    hide();
  });
}

export function injectTooltipStyles(): void {
  if (document.getElementById('cell-tooltip-styles')) return;
  const style = document.createElement('style');
  style.id = 'cell-tooltip-styles';
  style.textContent = `
    #cell-tooltip {
      position: fixed;
      pointer-events: none;
      z-index: 999;
      background: rgba(4, 9, 15, 0.95);
      border: 1px solid #0C2D40;
      border-radius: 5px;
      padding: 8px 10px;
      max-width: 220px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.72rem;
      color: #7EE8FA;
      backdrop-filter: blur(6px);
      display: none;
      line-height: 1.4;
    }
    .tt-name {
      font-weight: bold;
      font-size: 0.82rem;
      margin-bottom: 2px;
    }
    .tt-tier {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .tt-stat {
      color: #8AB4C4;
      margin-bottom: 1px;
    }
    .tt-desc {
      color: #4A7A8A;
      font-style: italic;
      font-size: 0.68rem;
      margin-top: 4px;
    }
    .tt-traits {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-top: 4px;
    }
    .tt-trait {
      color: #DDBB44;
      font-size: 0.65rem;
      background: rgba(221, 187, 68, 0.1);
      border-radius: 3px;
      padding: 1px 4px;
    }
    .tt-novel {
      color: #FFD700;
      font-size: 0.65rem;
      background: rgba(255, 215, 0, 0.1);
      border-radius: 3px;
      padding: 1px 4px;
    }
    .tt-genes {
      margin-top: 5px;
      border-top: 1px solid #0C2D40;
      padding-top: 4px;
    }
    .tt-gene-row {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 2px;
    }
    .tt-gene-label {
      color: #4A7A8A;
      font-size: 0.6rem;
      width: 36px;
      text-align: right;
      flex-shrink: 0;
    }
    .tt-gene-track {
      flex: 1;
      height: 4px;
      background: #0D1B2A;
      border-radius: 2px;
      overflow: hidden;
    }
    .tt-gene-fill {
      height: 100%;
      background: #00E5FF;
      border-radius: 2px;
    }
    .tt-gene-pct {
      color: #4A7A8A;
      font-size: 0.6rem;
      width: 20px;
      text-align: right;
    }
    .tt-lineage {
      color: #4A7A8A;
      font-size: 0.65rem;
      margin-top: 4px;
      border-top: 1px solid #0C2D40;
      padding-top: 3px;
    }
  `;
  document.head.appendChild(style);
}
