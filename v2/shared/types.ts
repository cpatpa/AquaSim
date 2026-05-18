// ============================================================================
// Shared types used by both @aquasim/client and @aquasim/server
// ============================================================================

// ---------------------------------------------------------------------------
// Simulation domain types
// ---------------------------------------------------------------------------

export type Tier =
  | 'none'
  | 'environment'
  | 'transient'
  | 'producer'
  | 'herbivore'
  | 'consumer'
  | 'apex'
  | 'megafauna'
  | 'decomposer';

export type LivingTier = Exclude<Tier, 'none' | 'environment' | 'transient'>;

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type GeneKey =
  | 'bodySize' | 'bodyArmour' | 'bodyShape' | 'pigment'
  | 'metabolicRate' | 'fertility' | 'hungerEfficiency' | 'growthRate'
  | 'aggression' | 'sociality' | 'curiosity' | 'flightResponse'
  | 'visionRange' | 'chemosensory' | 'thermalAdapt' | 'pressureAdapt';

export interface DiploidGene {
  a1: number;
  a2: number;
  dom: number;
}

export type Gene = DiploidGene | number;
export type GeneSet = Record<GeneKey, Gene>;
export type ExpressedGenes = Record<GeneKey, number>;

export interface SimConfig {
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  gridGap: number;
  evolveEnabled: boolean;
  tickInterval: number;
  maxTraitsPerSpecies: number;
  mutationRateMult: number;
  speciationRateMult: number;
}

export interface PopSnapshot {
  [speciesId: number]: number;
}

export interface EvoLogEntry {
  generation: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Serialised save format (JSON-safe, stored in DB as JSONB)
// ---------------------------------------------------------------------------

export type RLEPair = [number, number];

export interface SerialisedGrid {
  width: number;
  height: number;
  species: RLEPair[];
  hunger: RLEPair[];
  age: RLEPair[];
  currents: RLEPair[];
}

export interface SerialisedGeneSet {
  [key: string]: Gene;
}

export interface SerialisedEvoStats {
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

export interface SerialisedHistory {
  popHistory: PopSnapshot[];
  evoLog: EvoLogEntry[];
  graphHistory: PopSnapshot[];
  graphEventMarkers: Array<{ gen: number; type: string; label: string }>;
}

export interface SerialisedSeasonState {
  current: Season;
  tick: number;
}

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

// ---------------------------------------------------------------------------
// API request/response types
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  code?: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  mfaCode?: string;
}

export interface LoginResponse {
  token: string;
  user: UserPublic;
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface UserPublic {
  id: string;
  username: string;
  role: 'user' | 'admin' | 'guest';
  mfaEnabled: boolean;
  saveCount: number;
  saveLimit: number;
  createdAt: string;
}

export interface SimulationSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: 'private' | 'public' | 'link';
  generation: number;
  createdAt: string;
  updatedAt: string;
  ownerUsername: string;
}

export interface SimulationDetail extends SimulationSummary {
  state: SaveData;
  shareToken: string | null;
}

export interface CreateSimulationRequest {
  name: string;
  description?: string;
  visibility?: 'private' | 'public' | 'link';
  state: SaveData;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  generation: number;
  achievedAt: string;
  simulationName: string;
}

export type LeaderboardType =
  | 'biodiversity'
  | 'speciations'
  | 'longest_species'
  | 'max_population'
  | 'generations';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: boolean;
  uptime: number;
  activeRooms: number;
  liveUsers: number;
  buildCommit: string;
  buildTime: string;
}

// ---------------------------------------------------------------------------
// WebSocket protocol
// ---------------------------------------------------------------------------

export interface RoomInfo {
  id: string;
  name: string;
  hostId: string;
  simulationId: string;
  users: PresenceInfo[];
  maxUsers: number;
}

export interface PresenceInfo {
  userId: string;
  username: string;
  role: 'host' | 'collaborator' | 'spectator';
  cursor?: { x: number; y: number };
}

export interface PaintOp {
  x: number;
  y: number;
  speciesId: number;
}

export interface StateDelta {
  generation: number;
  changedCells: Array<{ idx: number; species: number; hunger: number }>;
  evoStats?: Record<string, SerialisedEvoStats>;
}

export type WSClientMessage =
  | { type: 'join_room'; roomId: string; token: string }
  | { type: 'leave_room' }
  | { type: 'sync_snapshot'; data: SaveData }
  | { type: 'sync_delta'; delta: StateDelta }
  | { type: 'paint'; cells: PaintOp[] }
  | { type: 'chat'; message: string }
  | { type: 'cursor'; x: number; y: number };

export type WSServerMessage =
  | { type: 'room_state'; room: RoomInfo }
  | { type: 'sync_snapshot'; data: SaveData }
  | { type: 'sync_delta'; delta: StateDelta }
  | { type: 'paint'; cells: PaintOp[]; userId: string }
  | { type: 'chat'; message: string; username: string; timestamp: string }
  | { type: 'presence'; users: PresenceInfo[] }
  | { type: 'error'; code: string; message: string };
