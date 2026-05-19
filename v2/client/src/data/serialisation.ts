import type {
  GridState,
  SimConfig,
  EvoStats,
  GeneKey,
  GeneSet,
  Gene,
  PopSnapshot,
  EvoLogEntry,
  Season,
  ExpressedGenes,
} from '../types';
import type { SimState } from '../core/simulation';
import type { SeasonState } from '../environment/seasons';
import type { SimHistory } from './history';
import { GENE_KEYS } from '../constants';
import { noise2D } from '../environment/terrain';
import { getTierEmptyGens, setTierEmptyGens } from '../evolution/immigration';
import { SPECIES } from '../species/registry';

// ---------------------------------------------------------------------------
// RLE encoding for typed arrays
// ---------------------------------------------------------------------------

type RLEPair<T> = [T, number];

function rleEncode<T extends number>(arr: ArrayLike<T>): RLEPair<T>[] {
  if (arr.length === 0) return [];
  const runs: RLEPair<T>[] = [];
  let current = arr[0];
  let count = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === current) {
      count++;
    } else {
      runs.push([current, count]);
      current = arr[i];
      count = 1;
    }
  }
  runs.push([current, count]);
  return runs;
}

function rleDecode<A extends Uint8Array | Int16Array | Uint16Array>(
  runs: RLEPair<number>[],
  into: A,
): void {
  let offset = 0;
  for (const [value, count] of runs) {
    for (let i = 0; i < count; i++) {
      into[offset++] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Serialised sub-types
// ---------------------------------------------------------------------------

interface SerialisedGrid {
  width: number;
  height: number;
  /** Number of depth layers in the 3D grid. Older v1 saves have no layers field; assumed 1. */
  layers?: number;
  species: RLEPair<number>[];
  hunger: RLEPair<number>[];
  age: RLEPair<number>[];
  currents: RLEPair<number>[];
}

interface SerialisedGeneSet {
  [key: string]: Gene;
}

interface SerialisedEvoStats {
  breedRate: number;
  moveRate: number;
  hungerMax: number;
  eats: number[];
  traits: string[];
  traitAge: Record<string, number>;
  traitStrengths: Record<string, number>;
  _traitBitmask: number;
  genes: SerialisedGeneSet;
  geneVar: Record<string, number>;
  baseGenes: SerialisedGeneSet;
  novelAdapts: string[];
  _expressed?: ExpressedGenes;
}

interface SerialisedHistory {
  popHistory: PopSnapshot[];
  evoLog: EvoLogEntry[];
  graphHistory: PopSnapshot[];
  graphEventMarkers: Array<{ gen: number; type: string; label: string }>;
}

interface SerialisedSeasonState {
  current: Season;
  tick: number;
}

// ---------------------------------------------------------------------------
// SaveData -- the top-level versioned container
// ---------------------------------------------------------------------------

export interface SaveData {
  version: number;
  timestamp: string;
  config: SimConfig;
  generation: number;
  season: SerialisedSeasonState;
  history: SerialisedHistory;
  grid: SerialisedGrid;
  evoStats: Record<string, SerialisedEvoStats>;
  evolveEnabled: boolean;
  evoCooldown: number;
  lastEvoGen: number;
  radiationBoost: number;
  prevLivingCount: number;
  maxTraitsPerSpecies: number;
  tierEmptyGens?: Record<string, number>;
}

const CURRENT_VERSION = 2;

const SAVE_MAGIC = new Uint8Array([0x41, 0x51, 0x53, 0x4D]); // "AQSM"
const ENCRYPTION_PASSPHRASE = 'aq-s1m-2026-v2-enc-k3y';
const IV_LENGTH = 12;

let _cachedKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(ENCRYPTION_PASSPHRASE), 'PBKDF2', false, ['deriveKey'],
  );
  _cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('AquaSim-v2-salt'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return _cachedKey;
}

async function encryptSave(data: SaveData): Promise<ArrayBuffer> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const output = new Uint8Array(SAVE_MAGIC.length + IV_LENGTH + ciphertext.byteLength);
  output.set(SAVE_MAGIC, 0);
  output.set(iv, SAVE_MAGIC.length);
  output.set(new Uint8Array(ciphertext), SAVE_MAGIC.length + IV_LENGTH);
  return output.buffer;
}

async function decryptSave(buffer: ArrayBuffer): Promise<SaveData> {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < SAVE_MAGIC.length; i++) {
    if (bytes[i] !== SAVE_MAGIC[i]) throw new Error('Not a valid AquaSim save file.');
  }
  const iv = bytes.slice(SAVE_MAGIC.length, SAVE_MAGIC.length + IV_LENGTH);
  const ciphertext = bytes.slice(SAVE_MAGIC.length + IV_LENGTH);
  const key = await getEncryptionKey();
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Save file is corrupted or has been tampered with.');
  }
  const json = new TextDecoder().decode(plaintext);
  const data = JSON.parse(json) as SaveData;
  if (typeof data.version !== 'number') throw new Error('Invalid save file: missing version field.');
  return data;
}

// ---------------------------------------------------------------------------
// serialise
// ---------------------------------------------------------------------------

function serialiseGeneSet(gs: GeneSet): SerialisedGeneSet {
  const out: SerialisedGeneSet = {};
  for (const key of GENE_KEYS) {
    out[key] = gs[key];
  }
  return out;
}

function serialiseGrid(grid: GridState): SerialisedGrid {
  return {
    width: grid.width,
    height: grid.height,
    layers: grid.layers,
    species: rleEncode(grid.species),
    hunger: rleEncode(grid.hunger),
    age: rleEncode(grid.age),
    currents: rleEncode(grid.currents),
  };
}

function serialiseEvoStats(
  stats: Record<number, EvoStats>,
): Record<string, SerialisedEvoStats> {
  const out: Record<string, SerialisedEvoStats> = {};
  for (const idStr of Object.keys(stats)) {
    const s = stats[parseInt(idStr)];
    out[idStr] = {
      breedRate: s.breedRate,
      moveRate: s.moveRate,
      hungerMax: s.hungerMax,
      eats: s.eats.slice(),
      traits: s.traits.slice(),
      traitAge: { ...s.traitAge },
      traitStrengths: { ...s.traitStrengths },
      _traitBitmask: s._traitBitmask,
      genes: serialiseGeneSet(s.genes),
      geneVar: { ...s.geneVar },
      baseGenes: serialiseGeneSet(s.baseGenes),
      novelAdapts: s.novelAdapts.slice(),
      ...(s._expressed ? { _expressed: { ...s._expressed } } : {}),
    };
  }
  return out;
}

function serialiseHistory(h: SimHistory): SerialisedHistory {
  return {
    popHistory: h.popHistory.map(snap => ({ ...snap })),
    evoLog: h.evoLog.map(e => ({ ...e })),
    graphHistory: h.graphHistory.map(snap => ({ ...snap })),
    graphEventMarkers: h.graphEventMarkers.map(m => ({ ...m })),
  };
}

export function serialise(sim: SimState): SaveData {
  return {
    version: CURRENT_VERSION,
    timestamp: new Date().toISOString(),
    config: { ...sim.config },
    generation: sim.generation,
    season: { current: sim.season.current, tick: sim.season.tick },
    history: serialiseHistory(sim.history),
    grid: serialiseGrid(sim.grid),
    evoStats: serialiseEvoStats(sim.evoStats),
    evolveEnabled: sim.evolveEnabled,
    evoCooldown: sim.evoCooldown,
    lastEvoGen: sim.lastEvoGen,
    radiationBoost: sim.radiationBoost,
    prevLivingCount: sim.prevLivingCount,
    maxTraitsPerSpecies: sim.maxTraitsPerSpecies,
    tierEmptyGens: getTierEmptyGens(),
  };
}

// ---------------------------------------------------------------------------
// deserialise
// ---------------------------------------------------------------------------

function deserialiseGeneSet(raw: SerialisedGeneSet): GeneSet {
  const gs = {} as GeneSet;
  for (const key of GENE_KEYS) {
    gs[key] = raw[key];
  }
  return gs;
}

function regenerateCellNoise(grid: GridState): void {
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      const i = cy * grid.width + cx;
      grid.cellNoise[i] = noise2D(cx * 0.35, cy * 0.35);
      grid.cellNoise2[i] = noise2D(cx * 0.6 + 50, cy * 0.6 + 50);
    }
  }
}

function deserialiseGrid(sg: SerialisedGrid, grid: GridState): void {
  const savedLayers = sg.layers ?? 1;
  const plane = grid.width * grid.height;

  // Reset all arrays first
  grid.species.fill(0);
  grid.hunger.fill(0);
  grid.age.fill(0);
  grid.currents.fill(0);

  if (savedLayers === grid.layers) {
    // Direct decode
    rleDecode(sg.species, grid.species);
    rleDecode(sg.hunger, grid.hunger);
    rleDecode(sg.age, grid.age);
    rleDecode(sg.currents, grid.currents);
  } else if (savedLayers === 1) {
    // Migrate old 2D save into 3D grid:
    // each saved cell carries a species with a known home layer.
    const tmpSpecies = new Uint8Array(plane);
    const tmpHunger = new Int16Array(plane);
    const tmpAge = new Uint16Array(plane);
    rleDecode(sg.species, tmpSpecies);
    rleDecode(sg.hunger, tmpHunger);
    rleDecode(sg.age, tmpAge);
    rleDecode(sg.currents, grid.currents);

    for (let xy = 0; xy < plane; xy++) {
      const sid = tmpSpecies[xy];
      if (sid === 0) continue;
      // Use species' home layer if defined, otherwise z=0
      const sp = SPECIES[sid];
      let z = sp?.layer ?? 0;
      if (z < 0) z = 0;
      if (z >= grid.layers) z = grid.layers - 1;
      const idx = z * plane + xy;
      grid.species[idx] = sid;
      grid.hunger[idx] = tmpHunger[xy];
      grid.age[idx] = tmpAge[xy];
    }
  } else {
    // Differing layer counts: best-effort direct decode (truncated/extended).
    rleDecode(sg.species, grid.species);
    rleDecode(sg.hunger, grid.hunger);
    rleDecode(sg.age, grid.age);
    rleDecode(sg.currents, grid.currents);
  }

  // cellNoise / cellNoise2 are deterministic; regenerate them.
  regenerateCellNoise(grid);
}

function deserialiseEvoStats(
  raw: Record<string, SerialisedEvoStats>,
): Record<number, EvoStats> {
  const out: Record<number, EvoStats> = {};
  for (const idStr of Object.keys(raw)) {
    const r = raw[idStr];
    const entry: EvoStats = {
      breedRate: r.breedRate,
      moveRate: r.moveRate,
      hungerMax: r.hungerMax,
      eats: r.eats.slice(),
      traits: r.traits.slice(),
      traitAge: { ...r.traitAge },
      traitStrengths: { ...r.traitStrengths },
      _traitBitmask: r._traitBitmask,
      genes: deserialiseGeneSet(r.genes),
      geneVar: { ...r.geneVar } as Record<GeneKey, number>,
      baseGenes: deserialiseGeneSet(r.baseGenes),
      novelAdapts: r.novelAdapts.slice(),
    };
    if (r._expressed) {
      entry._expressed = { ...r._expressed };
    }
    out[parseInt(idStr)] = entry;
  }
  return out;
}

function deserialiseHistory(raw: SerialisedHistory): SimHistory {
  return {
    popHistory: raw.popHistory.map(snap => ({ ...snap })),
    evoLog: raw.evoLog.map(e => ({ ...e })),
    graphHistory: raw.graphHistory.map(snap => ({ ...snap })),
    graphEventMarkers: raw.graphEventMarkers.map(m => ({ ...m })),
  };
}

function deserialiseSeasonState(raw: SerialisedSeasonState): SeasonState {
  return { current: raw.current, tick: raw.tick };
}

export function deserialise(data: SaveData, sim: SimState): void {
  // Config
  Object.assign(sim.config, data.config);

  // Scalars
  sim.generation = data.generation;
  sim.evolveEnabled = data.evolveEnabled;
  sim.evoCooldown = data.evoCooldown;
  sim.lastEvoGen = data.lastEvoGen;
  sim.radiationBoost = data.radiationBoost;
  sim.prevLivingCount = data.prevLivingCount;
  sim.maxTraitsPerSpecies = data.maxTraitsPerSpecies;

  // Season
  const restoredSeason = deserialiseSeasonState(data.season);
  sim.season.current = restoredSeason.current;
  sim.season.tick = restoredSeason.tick;

  // History
  const restoredHistory = deserialiseHistory(data.history);
  sim.history.popHistory = restoredHistory.popHistory;
  sim.history.evoLog = restoredHistory.evoLog;
  sim.history.graphHistory = restoredHistory.graphHistory;
  sim.history.graphEventMarkers = restoredHistory.graphEventMarkers;

  // Grid (typed arrays are overwritten in-place)
  deserialiseGrid(data.grid, sim.grid);

  // EvoStats
  sim.evoStats = deserialiseEvoStats(data.evoStats);

  // Immigration state
  if (data.tierEmptyGens) {
    setTierEmptyGens(data.tierEmptyGens);
  }
}

// ---------------------------------------------------------------------------
// downloadSave -- encrypts the save and triggers a browser file download
// ---------------------------------------------------------------------------

export async function downloadSave(data: SaveData): Promise<void> {
  const encrypted = await encryptSave(data);
  const blob = new Blob([encrypted], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `aquasim-save-${data.generation}.aqsim`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// uploadSave -- opens a file picker, decrypts, then returns data
// ---------------------------------------------------------------------------

export function uploadSave(): Promise<SaveData> {
  return new Promise<SaveData>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.aqsim';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const buffer = reader.result as ArrayBuffer;
          const data = await decryptSave(buffer);
          resolve(data);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(`Failed to load save file: ${err}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });

    input.addEventListener('cancel', () => {
      reject(new Error('File selection cancelled'));
    });

    input.click();
  });
}
