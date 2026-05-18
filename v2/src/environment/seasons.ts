import type { Season, SeasonModifiers } from '../types';
import { SEASON_LENGTH, SEASONS, SEASON_MODS } from '../constants';

export interface SeasonState {
  current: Season;
  tick: number;
}

export function createSeasonState(): SeasonState {
  return { current: 'Spring', tick: 0 };
}

export function advanceSeason(state: SeasonState): boolean {
  state.tick++;
  if (state.tick >= SEASON_LENGTH) {
    state.tick = 0;
    const idx = SEASONS.indexOf(state.current);
    state.current = SEASONS[(idx + 1) % SEASONS.length];
    return true;
  }
  return false;
}

export function getSeasonModifiers(season: Season): SeasonModifiers {
  return SEASON_MODS[season];
}

export function resetSeason(state: SeasonState): void {
  state.current = 'Spring';
  state.tick = 0;
}
