import type { Country, General, TraitId } from './types';

/** Свойства местности: плодородие, вместимость населения, оборона. */
export const TERRAIN_INFO = [
  { name: 'Вода', fert: 0, cap: 0, def: 1 },
  { name: 'Равнина', fert: 1.15, cap: 1.05, def: 1.0 },
  { name: 'Лес', fert: 0.85, cap: 0.95, def: 1.2 },
  { name: 'Холмы', fert: 0.8, cap: 0.9, def: 1.35 },
  { name: 'Горы', fert: 0.45, cap: 0.7, def: 1.7 },
];

/** Основные константы баланса. Денежные цены генералов/укреплений масштабируются размером страны. */
export const B = {
  popPerCell: 3100,
  startPopFrac: 0.88, // старт близко к пределу земли — он достигается на 3–4 ходу
  startSoldierFrac: 0, // в начале только крестьяне
  startSciFrac: 0,
  startMoneyPerCell: 1200,

  growthBase: 0.045, // рост населения в год, пока не упрётся в предел земли
  grainPerCiv: 1.25, // зерна на крестьянина в год; каждый житель съедает 1
  foodPerPerson: 1,

  basePrice: 0.35, // зерно — прежде всего еда; продажа излишков лишь небольшая добавка к доходу
  demandGrowth: 0.012,
  priceElasticity: 0.6,
  buyMarkup: 1.5,
  taxPerCapita: 0.45, // денег с крестьянина в год — основной доход

  soldierUpkeep: 2.5,
  sciUpkeep: 4,
  maxStaffFrac: 0.45,

  ptsPerSci: 0.1,
  sciCostPerCell: 6,
  sciCostGrowth: 1.4,

  genUpkeep: 2500,
  genUpkeepPerExp: 30,
  studyFee: 1500,
  maxGenerals: 8,
  offersPerYear: 3,

  fortCost: 30000,
  fortBonus: 0.1,
  maxFort: 4,

  noGeneral: 0.5,
  battleRand: 0.12,
  captureBase: 0.025,
  elimFrac: 0.07,
};

export const SCIENCE_INFO = [
  { name: 'Денежная система', step: 0.08, effect: 'доход' },
  { name: 'Сельское хозяйство', step: 0.1, effect: 'урожай' },
  { name: 'Плотность населения', step: 0.12, effect: 'предел населения' },
  { name: 'Рост населения', step: 0.15, effect: 'скорость роста' },
  { name: 'Военная мощь', step: 0.1, effect: 'сила солдат' },
  { name: 'Научный потенциал', step: 0.1, effect: 'продуктивность учёных' },
  { name: 'Фортификация', step: 0.04, effect: 'сила обороны' },
  { name: 'Разведка', step: 0, effect: 'точность сведений' },
];

export function multAt(i: number, level: number): number {
  // Фортификация с убывающей отдачей (предел +30%), иначе поздняя игра упирается в непробиваемую оборону
  if (i === 6) return 1 + 0.3 * (1 - Math.exp(-level / 9));
  return 1 + SCIENCE_INFO[i].step * level;
}

export function sciMult(c: Country, i: number): number {
  return multAt(i, c.science.level[i]);
}

/** Военное дело в обороне даёт меньше (+6%/ур.), чем в наступлении (+10%/ур.) — поздняя игра решительнее. */
export function milDefAt(level: number): number {
  return 1 + 0.06 * level;
}

/** Относительный прирост множителя от следующего уровня. */
export function sciRel(c: Country, i: number): number {
  const L = c.science.level[i];
  return multAt(i, L + 1) / multAt(i, L) - 1;
}

export function levelCost(level: number, cpc: number): number {
  return cpc * B.sciCostPerCell * Math.pow(B.sciCostGrowth, level);
}

export function intelError(level: number): number {
  return Math.max(0.03, 0.4 * Math.pow(0.82, level));
}

export function costScale(cpc: number): number {
  return cpc / 170;
}

/** Множитель командования от опыта: 0 → ×0.6, 25 → ×1.0, 80 → ×1.6, предел ×2.2 */
export function genFactor(exp: number): number {
  return 0.6 + 1.6 * (1 - Math.exp(-exp / 80));
}

/** Влияние настроения на хозяйство: 50 → ×1.0 */
export function prodFactor(h: number): number {
  return 0.75 + (0.5 * h) / 100;
}

/** Боевой дух: 50 → ×1.0 */
export function morale(h: number): number {
  return 0.85 + (0.3 * h) / 100;
}

export function generalUpkeep(g: General, cpc: number): number {
  return (B.genUpkeep + g.exp * B.genUpkeepPerExp) * costScale(cpc);
}

export function fortCost(level: number, cpc: number): number {
  return B.fortCost * (level + 1) * costScale(cpc);
}

export const TRAIT_INFO: Record<TraitId, { name: string; desc: string; good: boolean }> = {
  cautious: { name: 'Осторожный', desc: '−30% своих потерь, −25% захвата земли', good: true },
  dashing: { name: 'Лихой', desc: '+35% захвата земли, +20% своих потерь', good: true },
  beloved: { name: 'Любимец солдат', desc: '+10% к силе войска', good: true },
  strategist: { name: 'Стратег', desc: '+15% к силе в наступлении', good: true },
  defender: { name: 'Мастер обороны', desc: '+25% к силе в обороне', good: true },
  scholar: { name: 'Самоучка', desc: '+50% опыта при учёбе', good: true },
  veteran: { name: 'Закалённый', desc: '+50% опыта за сражения', good: true },
  sickly: { name: 'Слабое здоровье', desc: 'раньше уходит на покой', good: false },
  hardy: { name: 'Крепкий', desc: 'служит дольше', good: true },
};

export function has(g: General, t: TraitId): boolean {
  return g.traits.includes(t);
}

export function attackFactor(g: General): number {
  return genFactor(g.exp) * (has(g, 'beloved') ? 1.1 : 1) * (has(g, 'strategist') ? 1.15 : 1);
}

export function defendFactor(g: General | null): number {
  if (!g) return B.noGeneral;
  return genFactor(g.exp) * (has(g, 'beloved') ? 1.1 : 1) * (has(g, 'defender') ? 1.25 : 1);
}

export function lossMod(g: General | null): number {
  if (!g) return 1;
  return has(g, 'cautious') ? 0.7 : has(g, 'dashing') ? 1.2 : 1;
}

export function captureMod(g: General): number {
  return has(g, 'cautious') ? 0.75 : has(g, 'dashing') ? 1.35 : 1;
}

export function retireAge(g: General): number {
  return has(g, 'sickly') ? 58 : has(g, 'hardy') ? 76 : 67;
}

export function studyGain(g: General): number {
  return g.intellect * 1.3 * (has(g, 'scholar') ? 1.5 : 1);
}

/** Доли потерь победителя и проигравшего при соотношении сил r = слабый/сильный ∈ (0, 1]. */
export function battleLosses(r: number): { win: number; lose: number } {
  const win = 0.05 + 0.45 * r * r;
  const lose = Math.max(win + 0.15, 0.3 + 0.45 * (1 - r));
  return { win, lose: Math.min(0.95, lose) };
}

export function captureCount(cpc: number, g: General, ratio: number, rand01: number): number {
  const k = Math.min(2, Math.sqrt(Math.max(1, ratio)));
  return Math.max(1, Math.round(cpc * B.captureBase * g.speed * k * captureMod(g) * (0.85 + 0.3 * rand01)));
}

/** Лучший генерал среди назначенных на оборону. */
export function bestDefender(c: Country): General | null {
  let best: General | null = null;
  for (const g of c.generals) {
    if (g.task.type !== 'defend') continue;
    if (!best || defendFactor(g) > defendFactor(best)) best = g;
  }
  return best;
}

/** Установившееся значение настроения при текущей политике. */
export function happinessTarget(c: Country, taxRate = c.taxRate, soldiers = c.soldiers): number {
  let t = 60;
  t -= (taxRate * 100 - 10) * 1.5;
  t -= Math.min(40, c.warWeariness);
  t += c.happyMod;
  const milFrac = c.population > 0 ? soldiers / c.population : 0;
  if (milFrac > 0.1) t -= (milFrac - 0.1) * 150;
  return Math.max(0, Math.min(100, t));
}

/**
 * Нелинейная цена найма: каждый следующий человек дороже.
 * Цена зависит от доли населения, которая уже служит: price = base × (1 + (доля / f0)²).
 * Солдаты: при армии в 10% населения новобранец вдвое дороже, при 20% — впятеро.
 * Учёные: при 5% населения — вдвое, при 10% — впятеро.
 */
export const RECRUIT = {
  soldier: { base: 4, f0: 0.1 },
  scientist: { base: 8, f0: 0.05 },
};
export type RecruitKind = keyof typeof RECRUIT;

/** Цена следующего человека при текущей численности. */
export function recruitPrice(kind: RecruitKind, have: number, pop: number): number {
  const { base, f0 } = RECRUIT[kind];
  const f = pop > 0 ? Math.max(0, have) / pop : 1;
  return base * (1 + (f / f0) ** 2);
}

/** Стоимость найма n человек подряд (цена растёт внутри покупки). */
export function recruitCost(kind: RecruitKind, have: number, pop: number, n: number): number {
  if (n <= 0) return 0;
  if (pop <= 0) return Infinity;
  const { base, f0 } = RECRUIT[kind];
  const a = Math.max(0, have);
  const b = a + n;
  const k = 1 / (f0 * pop) ** 2;
  return base * (n + (k * (b * b * b - a * a * a)) / 3);
}

/** Сколько человек можно нанять на money (extraPerHead — доп. расход на каждого, например жалованье). */
export function maxRecruits(kind: RecruitKind, have: number, pop: number, money: number, extraPerHead = 0): number {
  if (money <= 0 || pop <= 0) return 0;
  const cost = (n: number) => recruitCost(kind, have, pop, n) + n * extraPerHead;
  let lo = 0;
  let hi = Math.max(1, Math.floor(pop));
  if (cost(hi) <= money) return hi;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (cost(mid) <= money) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Сколько клеток забирает победа. Растёт со скоростью генерала, перевесом сил и размером
 * побеждённой страны (крупную державу можно добить за разумное число побед).
 * Разгром (перевес втрое и больше) — вдвое больше земли.
 */
export function captureAmount(cpc: number, defCells: number, g: General, ratio: number, rand01: number): number {
  const size = Math.max(1, Math.sqrt(defCells / cpc));
  const rout = ratio >= 3 ? 2 : 1;
  const n = captureCount(cpc, g, ratio, rand01) * size * rout;
  const cap = Math.max(cpc * 0.25, defCells * 0.2) * rout;
  return Math.min(defCells, Math.round(Math.min(cap, n)));
}