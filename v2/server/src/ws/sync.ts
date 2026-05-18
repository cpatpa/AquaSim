import type { StateDelta, SaveData } from '#shared/types.js';

export function validateSnapshot(data: SaveData): boolean {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.version !== 'number') return false;
  if (typeof data.generation !== 'number' || data.generation < 0) return false;
  if (!data.config || typeof data.config.gridWidth !== 'number') return false;
  if (!data.grid || !Array.isArray(data.grid.species)) return false;
  return true;
}

export function validateDelta(delta: StateDelta, expectedGeneration?: number): boolean {
  if (!delta || typeof delta !== 'object') return false;
  if (typeof delta.generation !== 'number' || delta.generation < 0) return false;
  if (expectedGeneration !== undefined && delta.generation <= expectedGeneration) return false;
  if (!Array.isArray(delta.changedCells)) return false;
  return true;
}
