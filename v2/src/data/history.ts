import type { PopSnapshot, EvoLogEntry } from '../types';
import { EVO_HISTORY_LEN, GRAPH_HISTORY_MAX } from '../constants';

const EVO_LOG_MAX = 30;

export interface SimHistory {
  popHistory: PopSnapshot[];
  evoLog: EvoLogEntry[];
  graphHistory: PopSnapshot[];
  graphEventMarkers: Array<{ gen: number; type: string; label: string }>;
}

export function createHistory(): SimHistory {
  return {
    popHistory: [],
    evoLog: [],
    graphHistory: [],
    graphEventMarkers: [],
  };
}

export function recordPopSnapshot(
  history: SimHistory,
  speciesArray: Uint8Array,
  total: number,
): PopSnapshot {
  const counts: PopSnapshot = {};
  for (let i = 0; i < total; i++) {
    const s = speciesArray[i];
    if (s !== 0) counts[s] = (counts[s] || 0) + 1;
  }
  history.popHistory.push(counts);
  if (history.popHistory.length > EVO_HISTORY_LEN) {
    history.popHistory.shift();
  }
  return counts;
}

export function addEvoEvent(history: SimHistory, generation: number, message: string): void {
  history.evoLog.unshift({ generation, message: `G${generation}: ${message}` });
  if (history.evoLog.length > EVO_LOG_MAX) {
    history.evoLog.pop();
  }
}

export function recordGraphSnapshot(
  history: SimHistory,
  snapshot: PopSnapshot,
): void {
  history.graphHistory.push(snapshot);
  if (history.graphHistory.length > GRAPH_HISTORY_MAX) {
    history.graphHistory.shift();
  }
}

export function addGraphEventMarker(
  history: SimHistory,
  gen: number,
  type: string,
  label: string,
): void {
  history.graphEventMarkers.push({ gen, type, label });
}

export function resetHistory(history: SimHistory): void {
  history.popHistory.length = 0;
  history.evoLog.length = 0;
  history.graphHistory.length = 0;
  history.graphEventMarkers.length = 0;
}
