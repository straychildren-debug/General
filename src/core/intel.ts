import { S_MIL, SCIENCE_COUNT, type GameState, type ScoutReport } from './types';

/**
 * То, что одна страна знает о другой.
 * Своя страна — всё точно. О чужих видны территория и население; военные сведения
 * (солдаты, военная мощь, генералы) — только из донесений разведчика, и они устаревают.
 * Без донесения поля заполнены догадкой («у них примерно как у нас») с большой погрешностью —
 * ею пользуется компьютер, а игроку показывается «?».
 */
export interface Intel {
  visible: boolean; // есть ли военные сведения (своя страна или донесение разведки)
  known: boolean; // то же — сведения из донесения, а не догадка
  exact: boolean;
  age: number | null; // сколько лет донесению
  quality: 'full' | 'partial' | null;
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

/** Последнее донесение разведки observer о стране target. */
export function scoutReport(state: GameState, observer: number, target: number): ScoutReport | undefined {
  return (state.intel ?? []).find((r) => r.by === observer && r.target === target);
}

export function estimate(state: GameState, observer: number, target: number, _neighbor = true): Intel {
  const t = state.countries[target];
  const me = state.countries[observer];
  if (observer === target) {
    let bestExp = 0;
    for (const g of t.generals) bestExp = Math.max(bestExp, g.exp);
    return {
      visible: true,
      known: true,
      exact: true,
      age: 0,
      quality: 'full',
      err: 0,
      cells: t.cells,
      population: t.population,
      soldiers: t.soldiers,
      scientists: t.scientists,
      money: t.money,
      happiness: t.happiness,
      levels: t.science.level.slice(),
      generals: t.generals.length,
      bestExp,
    };
  }
  const levels = new Array(SCIENCE_COUNT).fill(0);
  const rep = scoutReport(state, observer, target);
  if (rep) {
    // Донесение «на конец года rep.year»; каждый следующий год сведения всё менее надёжны
    const age = Math.max(0, state.year - 1 - rep.year);
    levels[S_MIL] = rep.milLevel;
    return {
      visible: true,
      known: true,
      exact: false,
      age,
      quality: rep.quality,
      err: Math.min(0.8, (rep.quality === 'full' ? 0.04 : 0.2) + 0.12 * age),
      cells: t.cells,
      population: t.population,
      soldiers: rep.soldiers,
      scientists: 0,
      money: 0,
      happiness: 50,
      levels,
      generals: rep.generals.length,
      bestExp: rep.generals.reduce((a, g) => Math.max(a, g.exp), 0),
    };
  }
  // Сведений нет — догадка: «армия и наука у них примерно как у нас»
  const ratio = me.population > 0 ? me.soldiers / me.population : 0.05;
  levels[S_MIL] = me.science.level[S_MIL];
  return {
    visible: false,
    known: false,
    exact: false,
    age: null,
    quality: null,
    err: 0.5,
    cells: t.cells,
    population: t.population,
    soldiers: t.population * Math.max(0.03, ratio),
    scientists: 0,
    money: 0,
    happiness: 50,
    levels,
    generals: 1,
    bestExp: 20,
  };
}

/** Видит ли наблюдатель подробности сражения: участвует сам или его сосед. */
export function battleVisible(observer: number | null, neighbors: number[], attacker: number, defender: number): boolean {
  if (observer == null) return true;
  return (
    attacker === observer || defender === observer || neighbors.includes(attacker) || neighbors.includes(defender)
  );
}
