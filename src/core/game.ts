import { B, costScale } from './balance';
import { computeGeoFor } from './geo';
import { econOf } from './econ';
import { generateMap } from './mapgen';
import { assignColors, COUNTRY_NAMES, generalName } from './names';
import { Rng } from './rng';
import {
  SCIENCE_COUNT,
  type Country,
  type GameSettings,
  type GameState,
  type General,
  type GeneralOffer,
  type Orders,
  type PersonalityId,
  type TraitId,
} from './types';

export const MAP_CPC: Record<GameSettings['mapSize'], number> = { small: 110, normal: 170, large: 250 };

export const DEFAULT_SETTINGS: GameSettings = {
  numCountries: 30,
  mapSize: 'normal',
  difficulty: 'hard',
  seed: 1,
  humans: ['Игрок'],
  victory: 'conquest',
  territoryPct: 60,
  maxYears: 120,
  events: true,
  truceYears: 15,
};

const PERSONALITIES: PersonalityId[] = ['aggressor', 'scientist', 'merchant', 'cunning', 'balanced'];
const TRAITS: TraitId[] = ['cautious', 'dashing', 'beloved', 'strategist', 'defender', 'scholar', 'veteran', 'sickly', 'hardy'];
const CONFLICTS: [TraitId, TraitId][] = [
  ['cautious', 'dashing'],
  ['sickly', 'hardy'],
];

export function randomGeneral(rng: Rng, id: number): General {
  let exp = Math.round(rng.next() ** 2 * 32);
  if (rng.chance(0.07)) exp += rng.int(15, 30);
  const traits: TraitId[] = [];
  if (rng.chance(0.55)) traits.push(rng.pick(TRAITS));
  if (rng.chance(0.15)) {
    const t = rng.pick(TRAITS);
    const clash = CONFLICTS.some(([a, b]) => (traits.includes(a) && t === b) || (traits.includes(b) && t === a));
    if (!traits.includes(t) && !clash) traits.push(t);
  }
  return {
    id,
    name: generalName(rng),
    age: rng.int(23, 52),
    exp,
    speed: rng.int(1, 10),
    intellect: rng.int(1, 10),
    traits,
    battles: 0,
    wins: 0,
    task: { type: 'defend' },
  };
}

export function generalPrice(g: General, year: number, cpc: number): number {
  let p = 12000 + g.exp * 900 + g.speed * 3000 + g.intellect * 3500;
  for (const t of g.traits) p += t === 'sickly' ? -6000 : 7000;
  if (g.age > 48) p *= 0.75;
  return Math.round((p * costScale(cpc) * (1 + 0.02 * (year - 1))) / 100) * 100;
}

export function generateOffers(rng: Rng, state: GameState, c: Country): void {
  c.offers = [];
  for (let k = 0; k < B.offersPerYear; k++) {
    const g = randomGeneral(rng, state.nextGeneralId++);
    const offer: GeneralOffer = { ...g, price: generalPrice(g, state.year, state.cellsPerCountry) };
    c.offers.push(offer);
  }
}

export function createGame(settings: GameSettings): GameState {
  const rng = new Rng(settings.seed);
  const n = settings.numCountries;
  const cpc = MAP_CPC[settings.mapSize];
  const map = generateMap(rng, n, cpc);
  const geo = computeGeoFor({ ...map }, n);
  const colors = assignColors(n, geo.neighbors, rng);
  const names = rng.shuffle([...COUNTRY_NAMES]).slice(0, n);

  // Люди получают случайные страны
  const humanIds = rng.shuffle([...Array(n).keys()]).slice(0, settings.humans.length);

  const realCpc = map.landCells / n;
  const countries: Country[] = [];
  for (let id = 0; id < n; id++) {
    const hIdx = humanIds.indexOf(id);
    const cells = geo.cells[id];
    // Стартовые параметры зависят только от площади (одинаковой у всех), не от рельефа
    const pop = Math.round(cells * B.popPerCell * B.startPopFrac);
    countries.push({
      id,
      name: names[id],
      color: colors[id],
      controller: hIdx >= 0 ? 'human' : 'ai',
      playerName: hIdx >= 0 ? settings.humans[hIdx] : null,
      personality: rng.pick(PERSONALITIES),
      alive: true,
      eliminatedYear: null,
      eliminatedBy: null,
      capital: map.capitals[id],
      cells,
      population: pop,
      soldiers: Math.round(pop * B.startSoldierFrac),
      scientists: Math.round(pop * B.startSciFrac),
      money: Math.round(cells * B.startMoneyPerCell),
      grain: 0,
      taxRate: 0.15,
      happiness: 60,
      happyMod: 0,
      warWeariness: 0,
      science: {
        level: new Array(SCIENCE_COUNT).fill(0),
        progress: new Array(SCIENCE_COUNT).fill(0),
        alloc: [40, 40, 0, 20, 0, 0, 0, 0],
      },
      generals: [],
      offers: [],
      forts: {},
    });
  }

  const state: GameState = {
    version: 1,
    settings,
    year: 1,
    rng: 0,
    map: { w: map.w, h: map.h, terrain: map.terrain, owner: map.owner, landCells: map.landCells },
    cellsPerCountry: realCpc,
    countries,
    market: { price: B.basePrice, history: [B.basePrice], d0: 0, pop0: 0, shock: 1, lastSupply: 0, lastDemand: 0 },
    nextGeneralId: 1,
    reports: [],
    history: [{ year: 1, cells: geo.cells.slice() }],
    chronicle: { initialOwner: map.owner.slice(), changes: [] },
    over: false,
    winner: null,
  };

  // Одинаковый стартовый генерал у всех
  for (const c of countries) {
    c.generals.push({
      id: state.nextGeneralId++,
      name: generalName(rng),
      age: 34,
      exp: 10,
      speed: 4,
      intellect: 4,
      traits: [],
      battles: 0,
      wins: 0,
      task: { type: 'defend' },
    });
    generateOffers(rng, state, c);
  }

  // Мировой спрос подбирается так, чтобы при продаже всех излишков цена была ≈ базовой
  let surplus = 0;
  let worldPop = 0;
  for (const c of countries) {
    const e = econOf(state, geo, c);
    surplus += Math.max(0, e.surplus);
    worldPop += c.population;
  }
  state.market.d0 = surplus;
  state.market.pop0 = worldPop;
  state.rng = rng.s;
  return state;
}

export function defaultOrders(c: Country): Orders {
  const tasks: Orders['tasks'] = {};
  for (const g of c.generals) tasks[g.id] = g.task.type === 'attack' ? { type: 'defend' } : g.task;
  return {
    taxRate: c.taxRate,
    sellGrain: 0,
    buyGrain: 0,
    hireSoldiers: 0,
    hireScientists: 0,
    scienceAlloc: c.science.alloc.slice(),
    buyOffers: [],
    dismissGenerals: [],
    tasks,
    buildForts: [],
  };
}

export function humanIds(state: GameState): number[] {
  return state.countries.filter((c) => c.controller === 'human').map((c) => c.id);
}
