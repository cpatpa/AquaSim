import type { GridState } from '../types';
import { CELL_SIZE, LAYER_COUNT } from '../constants';
import { wrapX, wrapY, planeSize } from '../core/grid';
import { SPECIES } from '../species/registry';
import { isMobile, isPaintMode } from './mobile';
import type { CameraState } from './camera';
import { screenToWorld } from './camera';

export interface PaintState {
  painting: boolean;
  lastPaintX: number;
  lastPaintY: number;
  currentDir: number;
  brushSize: number;
  selectedType: number;
}

export function createPaintState(): PaintState {
  return {
    painting: false,
    lastPaintX: -1,
    lastPaintY: -1,
    currentDir: 2,
    brushSize: 3,
    selectedType: 10,
  };
}

export function dragDirection(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return 0;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 2 : 4;
  return dy > 0 ? 3 : 1;
}

export function paintAt(
  state: PaintState,
  grid: GridState,
  canvasX: number,
  canvasY: number,
  focusLayer: number = -1,
): void {
  const cellX = (canvasX / CELL_SIZE) | 0;
  const cellY = (canvasY / CELL_SIZE) | 0;

  if (state.selectedType === 2 && state.lastPaintX >= 0) {
    const dir = dragDirection(state.lastPaintX, state.lastPaintY, canvasX, canvasY);
    if (dir !== 0) state.currentDir = dir;
  }
  state.lastPaintX = canvasX;
  state.lastPaintY = canvasY;

  // Determine target z layer:
  //   - Currents are 2D (no z)
  //   - Erase (sid 0): erase focused layer only if set, else whole xy column
  //   - Other species: paint at species' home layer
  const sid = state.selectedType;
  const sp = SPECIES[sid];
  let paintZ = -1;
  if (sid !== 2 && sid !== 0) {
    if (sp && sp.layer >= 0) paintZ = sp.layer;
    else if (focusLayer >= 0) paintZ = focusLayer;
    else paintZ = 0;
  }
  const plane = planeSize(grid);
  const zOff = paintZ >= 0 ? paintZ * plane : 0;

  const r = state.brushSize - 1;
  const r2 = r * r + r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = wrapX(grid, cellX + dx);
      const y = wrapY(grid, cellY + dy);
      const xyIdx = y * grid.width + x;
      if (sid === 2) {
        grid.currents[xyIdx] = state.currentDir;
      } else if (sid === 0) {
        // Erase: focused layer only, or whole column
        if (focusLayer >= 0) {
          const idx = focusLayer * plane + xyIdx;
          grid.species[idx] = 0;
          grid.hunger[idx] = 0;
          grid.age[idx] = 0;
        } else {
          for (let z = 0; z < LAYER_COUNT; z++) {
            const idx = z * plane + xyIdx;
            grid.species[idx] = 0;
            grid.hunger[idx] = 0;
            grid.age[idx] = 0;
          }
          grid.currents[xyIdx] = 0;
        }
      } else {
        const idx = zOff + xyIdx;
        grid.species[idx] = sid;
        grid.hunger[idx] = 0;
        grid.age[idx] = 0;
      }
    }
  }
}

export function getWorldCoords(
  container: HTMLElement,
  cam: CameraState,
  e: MouseEvent | Touch,
): [number, number] {
  const rect = container.getBoundingClientRect();
  return screenToWorld(cam, e.clientX - rect.left, e.clientY - rect.top);
}

export function setupPaintHandlers(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  cam: CameraState,
  state: PaintState,
  grid: GridState,
  onPaint: () => void,
  onDisaster: (worldX: number, worldY: number) => void,
  getFocusLayer: () => number = () => -1,
): void {
  canvas.addEventListener('mousedown', (e) => {
    state.painting = true;
    state.lastPaintX = -1;
    state.lastPaintY = -1;
    const [x, y] = getWorldCoords(container, cam, e);
    if (state.selectedType < 0) {
      onDisaster(x, y);
    } else {
      paintAt(state, grid, x, y, getFocusLayer());
      onPaint();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!state.painting || state.selectedType < 0) return;
    const [x, y] = getWorldCoords(container, cam, e);
    paintAt(state, grid, x, y, getFocusLayer());
    onPaint();
  });

  window.addEventListener('mouseup', () => { state.painting = false; });

  canvas.addEventListener('touchstart', (e) => {
    if (isMobile() && !isPaintMode()) return;
    e.preventDefault();
    state.painting = true;
    state.lastPaintX = -1;
    state.lastPaintY = -1;
    const touch = e.touches[0];
    const [x, y] = getWorldCoords(container, cam, touch);
    if (state.selectedType < 0) {
      onDisaster(x, y);
    } else {
      paintAt(state, grid, x, y, getFocusLayer());
      onPaint();
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (isMobile() && !isPaintMode()) return;
    e.preventDefault();
    if (!state.painting || state.selectedType < 0) return;
    const touch = e.touches[0];
    const [x, y] = getWorldCoords(container, cam, touch);
    paintAt(state, grid, x, y, getFocusLayer());
    onPaint();
  }, { passive: false });

  canvas.addEventListener('touchend', () => { state.painting = false; });
}

export function setupKeyboardShortcuts(
  handlers: {
    togglePlay: () => void;
    step: () => void;
    setSpeed: (interval: number) => void;
    toggleEvo: () => void;
    triggerMutation: () => void;
    seed: () => void;
    balance: () => void;
    biome: () => void;
    clear: () => void;
    showHelp: () => void;
  },
): void {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        handlers.togglePlay();
        break;
      case 'ArrowRight':
        handlers.step();
        break;
      case '0': handlers.setSpeed(500); break;
      case '1': handlers.setSpeed(100); break;
      case '2': handlers.setSpeed(50); break;
      case '3': handlers.setSpeed(25); break;
      case '4': handlers.setSpeed(8); break;
      case 'e': case 'E': handlers.toggleEvo(); break;
      case 'm': case 'M': handlers.triggerMutation(); break;
      case 's': case 'S': handlers.seed(); break;
      case 'b': case 'B': handlers.balance(); break;
      case 'g': case 'G': handlers.biome(); break;
      case 'c': case 'C': handlers.clear(); break;
      case '?': handlers.showHelp(); break;
    }
  });
}
