import { LAYER_NAMES, LAYER_COLORS, LAYER_COUNT } from '../constants';

export interface DepthViewState {
  focusLayer: number;
  tiltEnabled: boolean;
  tiltAngle: number;
  layerSpacing: number;
}

export function createDepthViewState(): DepthViewState {
  return {
    focusLayer: -1,
    tiltEnabled: false,
    tiltAngle: 22,
    layerSpacing: 32,
  };
}

export function buildDepthSliderHtml(): string {
  const zones: string[] = [];
  for (let i = LAYER_COUNT - 1; i >= 0; i--) {
    const colour = LAYER_COLORS[i];
    const name = LAYER_NAMES[i];
    zones.push(
      `<div class="depth-zone" data-layer="${i}" title="${name} layer (press ${i + 1} to focus)">
        <span class="depth-swatch" style="background:${colour}"></span>
        <span class="depth-name">${name}</span>
        <span class="depth-count" data-layer-count="${i}">0</span>
      </div>`,
    );
  }
  return `
    <div id="depth-slider">
      <div class="depth-header">DEPTH</div>
      ${zones.join('')}
      <button id="btn-tilt" title="Toggle 3D depth view (D)">3D</button>
      <button id="btn-depth-all" title="Show all layers (0)">All</button>
    </div>
  `;
}

export const DEPTH_SLIDER_CSS = `
#depth-slider {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 110px;
  background: rgba(13, 31, 53, 0.88);
  border: 1px solid #1a3a5c;
  border-radius: 4px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 5;
  font-size: 11px;
  user-select: none;
  pointer-events: auto;
}
#depth-slider .depth-header {
  font-weight: bold;
  font-size: 10px;
  letter-spacing: 1px;
  color: #88aacc;
  text-align: center;
  margin-bottom: 2px;
}
#depth-slider .depth-zone {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 5px;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid transparent;
  color: #e0e8f0;
  transition: background 0.15s;
}
#depth-slider .depth-zone:hover {
  background: rgba(77, 166, 255, 0.15);
}
#depth-slider .depth-zone.active {
  border-color: #4da6ff;
  background: rgba(77, 166, 255, 0.25);
}
#depth-slider .depth-swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}
#depth-slider .depth-name {
  flex: 1;
  font-size: 11px;
}
#depth-slider .depth-count {
  font-size: 10px;
  color: #88aacc;
  font-variant-numeric: tabular-nums;
}
#depth-slider .depth-count.low { color: #d97706; }
#depth-slider .depth-count.empty { color: #ef4444; }
#depth-slider .depth-count.healthy { color: #4ade80; }
#depth-slider button {
  background: #1a3a5c;
  color: #e0e8f0;
  border: 1px solid #2a4a6c;
  border-radius: 3px;
  padding: 4px;
  cursor: pointer;
  font-size: 10px;
  margin-top: 2px;
}
#depth-slider button:hover {
  background: #2a4a6c;
}
#depth-slider button.active {
  background: #4da6ff;
  color: #0a1628;
  border-color: #4da6ff;
}
`;

export function injectDepthSliderStyles(): void {
  if (document.getElementById('depth-slider-styles')) return;
  const style = document.createElement('style');
  style.id = 'depth-slider-styles';
  style.textContent = DEPTH_SLIDER_CSS;
  document.head.appendChild(style);
}

export function setActiveLayer(state: DepthViewState, layer: number): void {
  state.focusLayer = layer;
  const zones = document.querySelectorAll('#depth-slider .depth-zone');
  zones.forEach((z) => {
    const zl = parseInt((z as HTMLElement).dataset.layer || '-1', 10);
    z.classList.toggle('active', zl === layer);
  });
}

export function setTiltActive(state: DepthViewState, enabled: boolean): void {
  state.tiltEnabled = enabled;
  const btn = document.getElementById('btn-tilt');
  if (btn) btn.classList.toggle('active', enabled);
}

/**
 * Count living species per actual z-layer in the 3D grid.
 * `planeSize` is gridW * gridH; the species array contains LAYER_COUNT planes.
 */
export function updateDepthCounts(species: Uint8Array, planeSize: number): void {
  const counts = new Array(LAYER_COUNT).fill(0);
  let totalLiving = 0;
  for (let z = 0; z < LAYER_COUNT; z++) {
    const zOff = z * planeSize;
    for (let xy = 0; xy < planeSize; xy++) {
      const sid = species[zOff + xy];
      if (sid < 10) continue;
      counts[z]++;
      totalLiving++;
    }
  }
  for (let i = 0; i < LAYER_COUNT; i++) {
    const el = document.querySelector(`[data-layer-count="${i}"]`) as HTMLElement | null;
    if (!el) continue;
    el.textContent = counts[i].toLocaleString();
    el.classList.remove('empty', 'low', 'healthy');
    if (counts[i] === 0) el.classList.add('empty');
    else if (totalLiving > 0 && counts[i] / totalLiving < 0.03) el.classList.add('low');
    else if (totalLiving > 0 && counts[i] / totalLiving > 0.10) el.classList.add('healthy');
  }
}

export function attachDepthSliderHandlers(
  state: DepthViewState,
  onLayerChange: (layer: number) => void,
  onTiltToggle: (enabled: boolean) => void,
): void {
  const zones = document.querySelectorAll('#depth-slider .depth-zone');
  zones.forEach((z) => {
    z.addEventListener('click', () => {
      const layer = parseInt((z as HTMLElement).dataset.layer || '-1', 10);
      const newFocus = state.focusLayer === layer ? -1 : layer;
      setActiveLayer(state, newFocus);
      onLayerChange(newFocus);
    });
  });
  const btnAll = document.getElementById('btn-depth-all');
  if (btnAll) {
    btnAll.addEventListener('click', () => {
      setActiveLayer(state, -1);
      onLayerChange(-1);
    });
  }
  const btnTilt = document.getElementById('btn-tilt');
  if (btnTilt) {
    btnTilt.addEventListener('click', () => {
      setTiltActive(state, !state.tiltEnabled);
      onTiltToggle(state.tiltEnabled);
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'd' || e.key === 'D') {
      setTiltActive(state, !state.tiltEnabled);
      onTiltToggle(state.tiltEnabled);
      e.preventDefault();
    } else if (e.key >= '1' && e.key <= '6') {
      const layer = parseInt(e.key, 10) - 1;
      const newFocus = state.focusLayer === layer ? -1 : layer;
      setActiveLayer(state, newFocus);
      onLayerChange(newFocus);
      e.preventDefault();
    } else if (e.key === '0') {
      setActiveLayer(state, -1);
      onLayerChange(-1);
      e.preventDefault();
    }
  });
}
