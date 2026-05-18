import type { GridState } from '../types';
import { CELL_SIZE } from '../constants';
import { noise2D } from '../environment/terrain';

export function allocGrid(width: number, height: number): GridState {
  const total = width * height;
  const grid: GridState = {
    width,
    height,
    species: new Uint8Array(total),
    hunger: new Int16Array(total),
    age: new Uint16Array(total),
    currents: new Uint8Array(total),
    cellNoise: new Float32Array(total),
    cellNoise2: new Float32Array(total),
  };

  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const i = cy * width + cx;
      grid.cellNoise[i] = noise2D(cx * 0.35, cy * 0.35);
      grid.cellNoise2[i] = noise2D(cx * 0.6 + 50, cy * 0.6 + 50);
    }
  }

  return grid;
}

export function clearGrid(grid: GridState): void {
  grid.species.fill(0);
  grid.hunger.fill(0);
  grid.age.fill(0);
  grid.currents.fill(0);
}

export function cellIdx(grid: GridState, x: number, y: number): number {
  return y * grid.width + x;
}

export function wrapX(grid: GridState, x: number): number {
  return ((x % grid.width) + grid.width) % grid.width;
}

export function wrapY(grid: GridState, y: number): number {
  return ((y % grid.height) + grid.height) % grid.height;
}

export function canvasWidth(grid: GridState): number {
  return grid.width * CELL_SIZE;
}

export function canvasHeight(grid: GridState): number {
  return grid.height * CELL_SIZE;
}

export function getSpeciesAt(grid: GridState, x: number, y: number): number {
  return grid.species[y * grid.width + x];
}

export function setSpeciesAt(grid: GridState, x: number, y: number, sid: number): void {
  grid.species[y * grid.width + x] = sid;
}

export function getHungerAt(grid: GridState, idx: number): number {
  return grid.hunger[idx];
}

export function setHungerAt(grid: GridState, idx: number, val: number): void {
  grid.hunger[idx] = val;
}

export function getAgeAt(grid: GridState, idx: number): number {
  return grid.age[idx];
}

export function setAgeAt(grid: GridState, idx: number, val: number): void {
  grid.age[idx] = val;
}
