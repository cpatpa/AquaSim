import type { GridState } from '../types';

export interface PaintSnapshot {
  cells: Array<{ idx: number; species: number; hunger: number; age: number; current: number }>;
  timestamp: number;
}

export interface UndoState {
  undoStack: PaintSnapshot[];
  redoStack: PaintSnapshot[];
  maxHistory: number;
  pendingCapture: PaintSnapshot | null;
}

export function createUndoState(maxHistory = 30): UndoState {
  return {
    undoStack: [],
    redoStack: [],
    maxHistory,
    pendingCapture: null,
  };
}

/**
 * Called when a paint stroke begins (mousedown).
 * Captures the BEFORE state of cells that will be affected.
 */
export function beginStroke(state: UndoState, grid: GridState, affectedIndices: number[]): void {
  const seen = new Set<number>();
  const cells: PaintSnapshot['cells'] = [];

  for (const idx of affectedIndices) {
    if (seen.has(idx)) continue;
    seen.add(idx);
    cells.push({
      idx,
      species: grid.species[idx],
      hunger: grid.hunger[idx],
      age: grid.age[idx],
      current: grid.currents[idx],
    });
  }

  state.pendingCapture = {
    cells,
    timestamp: Date.now(),
  };
}

/**
 * Called during a paint stroke to capture additional cells about to be modified.
 * Adds to the existing pendingCapture, avoiding duplicate indices.
 */
export function captureBeforePaint(state: UndoState, grid: GridState, indices: number[]): void {
  if (!state.pendingCapture) return;

  const seen = new Set<number>();
  for (const cell of state.pendingCapture.cells) {
    seen.add(cell.idx);
  }

  for (const idx of indices) {
    if (seen.has(idx)) continue;
    seen.add(idx);
    state.pendingCapture.cells.push({
      idx,
      species: grid.species[idx],
      hunger: grid.hunger[idx],
      age: grid.age[idx],
      current: grid.currents[idx],
    });
  }
}

/**
 * Called when the paint stroke ends (mouseup).
 * Pushes pendingCapture to undoStack, clears redoStack, trims if over maxHistory.
 */
export function commitStroke(state: UndoState): void {
  if (!state.pendingCapture) return;
  if (state.pendingCapture.cells.length === 0) {
    state.pendingCapture = null;
    return;
  }

  state.undoStack.push(state.pendingCapture);
  state.pendingCapture = null;
  state.redoStack.length = 0;

  if (state.undoStack.length > state.maxHistory) {
    state.undoStack.splice(0, state.undoStack.length - state.maxHistory);
  }
}

/**
 * Captures the current grid values for the given cell indices into a snapshot.
 */
function captureCurrentState(grid: GridState, indices: number[]): PaintSnapshot {
  const cells: PaintSnapshot['cells'] = [];
  for (const idx of indices) {
    cells.push({
      idx,
      species: grid.species[idx],
      hunger: grid.hunger[idx],
      age: grid.age[idx],
      current: grid.currents[idx],
    });
  }
  return { cells, timestamp: Date.now() };
}

/**
 * Restores the grid cells from a snapshot.
 */
function restoreSnapshot(grid: GridState, snapshot: PaintSnapshot): void {
  for (const cell of snapshot.cells) {
    grid.species[cell.idx] = cell.species;
    grid.hunger[cell.idx] = cell.hunger;
    grid.age[cell.idx] = cell.age;
    grid.currents[cell.idx] = cell.current;
  }
}

/**
 * Pops from undoStack, captures current state of those cells to redoStack,
 * then restores the cells to their pre-paint values.
 * Returns true if undo was performed.
 */
export function undo(state: UndoState, grid: GridState): boolean {
  const snapshot = state.undoStack.pop();
  if (!snapshot) return false;

  const indices = snapshot.cells.map((c) => c.idx);
  const redoSnapshot = captureCurrentState(grid, indices);
  state.redoStack.push(redoSnapshot);

  restoreSnapshot(grid, snapshot);
  return true;
}

/**
 * Pops from redoStack, captures current state of those cells to undoStack,
 * then restores the cells.
 * Returns true if redo was performed.
 */
export function redo(state: UndoState, grid: GridState): boolean {
  const snapshot = state.redoStack.pop();
  if (!snapshot) return false;

  const indices = snapshot.cells.map((c) => c.idx);
  const undoSnapshot = captureCurrentState(grid, indices);
  state.undoStack.push(undoSnapshot);

  restoreSnapshot(grid, snapshot);
  return true;
}

export function canUndo(state: UndoState): boolean {
  return state.undoStack.length > 0;
}

export function canRedo(state: UndoState): boolean {
  return state.redoStack.length > 0;
}
