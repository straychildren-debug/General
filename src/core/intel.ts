import { INTEL_ERROR } from './balance';
import { hash01 } from './rng';
import type { GameState } from './types';

/**
 * То, что одна страна знает о другой.
 * Своя страна — всё точно. Соседи — через разведку с погрешностью.
 * Дальние страны — только территория и население (они видны всем).
 */
export interface Intel {
  visible: boolean; // есть ли сведения кроме территории и населения
  exact: boolean;
  err: number;
  cells: number;
  population: number;
  soldiers: number;
  scientists: number;
  money: number;
  happiness: number;
  levels: number[];
  generals: number;
  bestExp: number;
}

export function intelErrorFor(_state: GameState, observer: number, target: number): number {
  if (observer === target) return 0;
  return INTEL_ERROR;
}

export function estimate(state: GameState, observer: number, target: number, neighbor: boolean): Intel {
  const t = state.countries[target];
  const self = observer === target;
  const visible = self || neighbor;
  if (!visible) {
    return {
      visible: false,
      exact: false,
      err: 1,
      cells: t.cells,
      population: t.population,
      soldiers: 0,
      scientists: 0,
      money: 0,
      happiness: 0,
      levels: t.science.level.map(() => 0),
      generals: 0,
      bestExp: 0,
    };
  }
  const err = intelErrorFor(state, observer, target);
  const seed = state.settings.seed;
  const noisy = (v: number, k: number) => {
    if (err === 0) return v;
    const u = hash01(seed, state.year, observer, target, k) * 2 - 1;
    return v * (1 + u * err);
  };
  let bestExp = 0;
  for (const g of t.generals) bestExp = Math.max(bestExp, g.exp);
  return {
    visible: true,
    exact: err === 0,
    err,
    cells: t.cells,
    population: t.population,
    soldiers: noisy(t.soldiers, 2),
    scientists: noisy(t.scientists, 3),
    money: noisy(t.money, 4),
    happiness: Math.max(0, Math.min(100, noisy(t.happiness, 5))),
    levels: t.science.level.map((l, i) => Math.max(0, Math.round(noisy(l, 10 + i)))),
    generals: t.generals.length,
    bestExp: noisy(bestExp, 6),
  };
}

/** Видит ли наблюдатель подробности сражения: участвует сам или его сосед. */
export function battleVisible(observer: number | null, neighbors: number[], attacker: number, defender: number): boolean {
  if (observer == null) return true;
  return (
    attacker === observer || defender === observer || neighbors.includes(attacker) || neighbors.includes(defender)
  );
}
