// Индексы наук
export const S_ECON = 0;
export const S_AGRI = 1;
export const S_DENS = 2;
export const S_GROW = 3;
export const S_MIL = 4;
export const S_SCI = 5;
export const S_FORT = 6;
export const S_INTEL = 7;
export const SCIENCE_COUNT = 8;

// Типы местности
export const TER_WATER = 0;
export const TER_PLAINS = 1;
export const TER_FOREST = 2;
export const TER_HILLS = 3;
export const TER_MOUNT = 4;

export type TraitId =
  | 'cautious'
  | 'dashing'
  | 'beloved'
  | 'strategist'
  | 'defender'
  | 'scholar'
  | 'veteran'
  | 'sickly'
  | 'hardy';

export type PersonalityId = 'aggressor' | 'scientist' | 'merchant' | 'cunning' | 'balanced';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'master';
export type MapSize = 'small' | 'normal' | 'large';
export type VictoryType = 'conquest' | 'territory' | 'years';

export type GeneralTask =
  | { type: 'defend' }
  | { type: 'study' }
  | { type: 'attack'; target: number; soldiers: number };

export interface General {
  id: number;
  name: string;
  age: number;
  exp: number;
  speed: number;
  intellect: number;
  traits: TraitId[];
  battles: number;
  wins: number;
  task: GeneralTask;
}

export interface GeneralOffer extends General {
  price: number;
}

export interface Science {
  level: number[];
  progress: number[];
  alloc: number[]; // проценты, сумма 100
}

export interface Country {
  id: number;
  name: string;
  color: string;
  controller: 'human' | 'ai';
  playerName: string | null;
  personality: PersonalityId;
  alive: boolean;
  eliminatedYear: number | null;
  eliminatedBy: number | null;
  capital: number;
  cells: number;
  population: number;
  soldiers: number;
  scientists: number;
  money: number;
  grain: number;
  taxRate: number;
  happiness: number;
  happyMod: number; // временные модификаторы настроения (события, бои), затухают
  warWeariness: number;
  science: Science;
  generals: General[];
  offers: GeneralOffer[];
  forts: Record<number, number>; // id соседа -> уровень укреплений
}

export interface GameSettings {
  numCountries: number;
  mapSize: MapSize;
  difficulty: Difficulty;
  seed: number;
  humans: string[]; // имена игроков-людей (hotseat)
  victory: VictoryType;
  territoryPct: number;
  maxYears: number;
  events: boolean;
  truceYears: number; // первые годы без войн
}

export interface MapState {
  w: number;
  h: number;
  terrain: number[];
  owner: number[]; // -1 — вода
  landCells: number;
}

export interface Market {
  price: number;
  history: number[];
  d0: number;
  pop0: number;
  shock: number; // множитель спроса на следующий год (мировые события)
  lastSupply: number;
  lastDemand: number;
}

export interface BattleReport {
  attacker: number;
  defender: number;
  attackerGeneral: string;
  defenderGeneral: string | null;
  attackerSoldiers: number;
  defenderSoldiers: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerStrength: number;
  defenderStrength: number;
  attackerWon: boolean;
  cellsTaken: number;
  capitalTaken: boolean;
  eliminated: boolean;
  field: boolean;
  generalLost: 'attacker' | 'defender' | null;
  /** Из чего сложились силы сторон — для подробного описания сражения. */
  details?: BattleDetails;
}

export interface BattleSide {
  mil: number; // множитель военной мощи
  gen: number; // множитель генерала
  exp: number | null; // опыт генерала (null — без генерала)
  traits: TraitId[];
  morale: number;
}

export interface BattleDetails {
  atk: BattleSide;
  def: BattleSide & {
    terrain: number;
    fort: number; // уровень укреплений
    fortSci: number;
    front: number; // доля гарнизона на этом участке границы
    total: number; // весь гарнизон страны
    militia: number;
  };
  seed: number;
}

export interface GameEvent {
  country: number; // -1 — мировое событие
  text: string;
  good: boolean | null;
}

export interface YearReport {
  year: number;
  battles: BattleReport[];
  events: GameEvent[];
  eliminated: number[];
  price: number;
  supply: number;
  demand: number;
}

export interface ChronicleEntry {
  year: number;
  cells: number[];
  owners: number[];
}

export interface GameState {
  version: 1;
  settings: GameSettings;
  year: number;
  rng: number;
  map: MapState;
  cellsPerCountry: number;
  countries: Country[];
  market: Market;
  nextGeneralId: number;
  reports: YearReport[]; // последние годы
  history: { year: number; cells: number[] }[];
  chronicle: { initialOwner: number[]; changes: ChronicleEntry[] };
  over: boolean;
  winner: number | null;
}

export interface Orders {
  taxRate: number;
  sellGrain: number;
  buyGrain: number;
  hireSoldiers: number; // < 0 — роспуск
  hireScientists: number;
  scienceAlloc: number[];
  buyOffers: number[];
  dismissGenerals: number[];
  tasks: Record<number, GeneralTask>;
  buildForts: number[];
}
