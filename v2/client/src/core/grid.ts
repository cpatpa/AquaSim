import type { GridState } from '../types';
import { CELL_SIZE, LAYER_COUNT } from '../constants';
import { noise2D } from '../environment/terrain';

export function allocGrid(width: number, height: number): GridState {
  const layers = LAYER_COUNT;
  const planeSize = width * height;
  const totalCells = planeSize * layers;
  const grid: GridState = {
    width,
    height,
    layers,
    species: new Uint8Array(totalCells),
    hunger: new Int16Array(totalCells),
    age: new Uint16Array(totalCells),
    currents: new Uint8Array(totalCells),
    cellNoise: new Float32Array(planeSize),
    cellNoise2: new Float32Array(planeSize),
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

/** 2D index within the xy plane. */
export function cellIdx(grid: GridState, x: number, y: number): number {
  return y * grid.width + x;
}

/** 3D index into species/hunger/age arrays. */
export function cellIdx3D(grid: GridState, x: number, y: number, z: number): number {
  return z * grid.width * grid.height + y * grid.width + x;
}

/** Offset for the start of a given z-layer in the 3D arrays. */
export function layerOffset(grid: GridState, z: number): number {
  return z * grid.width * grid.height;
}

export function planeSize(grid: GridState): number {
  return grid.width * grid.height;
}

export function totalCells(grid: GridState): number {
  return grid.width * grid.height * grid.layers;
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

export function getSpeciesAt(grid: GridState, x: number, y: number, z: number = 0): number {
  return grid.species[cellIdx3D(grid, x, y, z)];
}

export function setSpeciesAt(grid: GridState, x: number, y: number, z: number, sid: number): void {
  grid.species[cellIdx3D(grid, x, y, z)] = sid;
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
