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
import { isLoggedIn, signSaveData, verifySaveData } from '../api/client';

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
}

const CURRENT_VERSION = 1;

interface SignedSaveEnvelope {
  aquasim: true;
  data: SaveData;
  signature: string;
}

const CLIENT_SIGNING_KEY = 'aq-s1m-2026-v2-k3y-f4llb4ck';

async function hmacSign(data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(CLIENT_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
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
  // Restore dimensions -- the caller must ensure the grid is already the
  // correct size (allocated via allocGrid). We overwrite the typed arrays.
  rleDecode(sg.species, grid.species);
  rleDecode(sg.hunger, grid.hunger);
  rleDecode(sg.age, grid.age);
  rleDecode(sg.currents, grid.currents);

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
}

// ---------------------------------------------------------------------------
// downloadSave -- signs the save and triggers a browser file download
// ---------------------------------------------------------------------------

export async function downloadSave(data: SaveData): Promise<void> {
  const dataJson = JSON.stringify(data);

  let signature: string;
  try {
    if (isLoggedIn()) {
      signature = await signSaveData(data);
    } else {
      signature = await hmacSign(dataJson);
    }
  } catch {
    signature = await hmacSign(dataJson);
  }

  const envelope: SignedSaveEnvelope = { aquasim: true, data, signature };
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `aquasim-save-${data.generation}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// uploadSave -- opens a file picker, verifies signature, then returns data
// ---------------------------------------------------------------------------

export function uploadSave(): Promise<SaveData> {
  return new Promise<SaveData>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const raw = reader.result as string;
          const parsed = JSON.parse(raw);

          if (parsed.aquasim === true && parsed.data && parsed.signature) {
            const envelope = parsed as SignedSaveEnvelope;
            const dataJson = JSON.stringify(envelope.data);

            let valid = false;
            try {
              if (isLoggedIn()) {
                valid = await verifySaveData(envelope.data, envelope.signature);
              }
            } catch { /* server unavailable, fall through */ }

            if (!valid) {
              valid = await hmacVerify(dataJson, envelope.signature);
            }

            if (!valid) {
              reject(new Error('Save file signature is invalid. The file may have been tampered with.'));
              return;
            }

            if (typeof envelope.data.version !== 'number') {
              reject(new Error('Invalid save file: missing version field'));
              return;
            }
            resolve(envelope.data);
          } else {
            reject(new Error('Unrecognised save format. Only signed AquaSim save files are accepted.'));
          }
        } catch (err) {
          reject(new Error(`Failed to parse save file: ${err}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });

    input.addEventListener('cancel', () => {
      reject(new Error('File selection cancelled'));
    });

    input.click();
  });
}
