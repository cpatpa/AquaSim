import { SPECIES } from '../species/registry';
import { TIER_ORDER, DISASTERS, SEASON_COLORS } from '../species/species-types';
import { LAYER_NAMES } from '../constants';
import type { Season } from '../types';

export interface PaletteState {
  selectedType: number;
  brushSize: number;
}

export function createPaletteState(): PaletteState {
  return { selectedType: 10, brushSize: 3 };
}

export function buildPalette(
  listEl: HTMLElement,
  state: PaletteState,
  onSelect: (id: number) => void,
): void {
  let html = '';
  for (const tier of TIER_ORDER) {
    html += `<div class="tier-label">${tier.label}</div>`;
    for (const id of tier.ids) {
      const sp = SPECIES[id];
      const label = id === 0 ? 'Erase' : sp.name;
      html += `<button class="sp-btn${id === state.selectedType ? ' active' : ''}" data-id="${id}">` +
        `<span class="sp-swatch" style="background:${sp.color}"></span>${label}</button>`;
    }
  }
  html += '<div class="tier-label" style="color:#FF6B6B;">DISASTERS</div>';
  for (const did in DISASTERS) {
    const d = DISASTERS[did];
    html += `<button class="sp-btn disaster${parseInt(did) === state.selectedType ? ' active' : ''}" data-id="${did}">` +
      `<span class="sp-swatch" style="background:${d.color}"></span>${d.name}</button>`;
  }

  listEl.innerHTML = html;
  listEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.sp-btn') as HTMLElement | null;
    if (!btn) return;
    const id = parseInt(btn.dataset.id!);
    onSelect(id);
  });
}

export function selectType(state: PaletteState, id: number, infoEl: HTMLElement): void {
  state.selectedType = id;
  document.querySelectorAll('.sp-btn').forEach(b => {
    (b as HTMLElement).classList.toggle('active', parseInt((b as HTMLElement).dataset.id!) === id);
  });
  const sp = id < 0 ? DISASTERS[id.toString()] : SPECIES[id];
  let desc = sp?.desc || '';
  if (sp && 'layer' in sp && (sp as any).layer >= 0 && (sp as any).layer < LAYER_NAMES.length) {
    desc = '[' + LAYER_NAMES[(sp as any).layer] + '] ' + desc;
  }
  infoEl.textContent = desc;
}

export function updateGenerationDisplay(el: HTMLElement, generation: number): void {
  el.textContent = 'GEN ' + generation;
}

export function updateSeasonDisplay(el: HTMLElement, season: Season, tick: number, length: number): void {
  const progress = ((tick / length) * 100) | 0;
  el.textContent = season + ' ' + progress + '%';
  el.style.color = SEASON_COLORS[season] || '#7EE8FA';
}

export function updateEvoLog(el: HTMLElement, evoLog: Array<{ message: string }>, evolveEnabled: boolean): void {
  if (evolveEnabled && evoLog.length > 0) {
    el.innerHTML = evoLog.map(e => `<div class="evo-entry">${e.message}</div>`).join('');
  } else if (!evolveEnabled) {
    el.innerHTML = '<div class="evo-entry" style="opacity:0.4;">EVO OFF</div>';
  } else {
    el.innerHTML = '<div class="evo-entry" style="opacity:0.4;">Waiting...</div>';
  }
}
