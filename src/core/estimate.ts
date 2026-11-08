// Оценка шансов атаки по данным разведки — тот же расчёт, которым пользуется компьютер.
import { attackFactor, B, genFactor, milDefAt, morale, sciMult } from './balance';
import { borderDefense, frontFactorGeo, type Geo } from './geo';
import { estimate } from './intel';
import { hash01 } from './rng';
import { S_MIL, type GameState, type General } from './types';

export interface Odds {
  p: number; // вероятность победы
  ratio: number; // ожидаемое соотношение сил
  err: number; // погрешность разведки
  defense: number; // оценка силы обороны
  attack: number;
}

export function battleOdds(
  state: GameState,
  geo: Geo,
  me: number,
  target: number,
  gen: General,
  soldiers: number,
): Odds {
  const c = state.countries[me];
  const it = estimate(state, me, target, geo);
  const D =
    (it.soldiers * frontFactorGeo(geo, me, target) + it.population * 0.002) *
    milDefAt(it.levels[S_MIL]) *
    (it.generals > 0 ? genFactor(it.bestExp) : B.noGeneral) *
    borderDefense(geo, me, target) *
    morale(it.happiness);
  const A = soldiers * sciMult(c, S_MIL) * attackFactor(gen) * morale(c.happiness);
  const R = B.battleRand;
  const N = 200;
  let wins = 0;
  for (let j = 0; j < N; j++) {
    const u1 = hash01(j, 1, me, target) * 2 - 1;
    const u2 = hash01(j, 2, me, target) * 2 - 1;
    const u3 = hash01(j, 3, me, target) * 2 - 1;
    if (A * (1 + u1 * R) > D * (1 + u2 * it.err) * (1 + u3 * R)) wins++;
  }
  return { p: wins / N, ratio: A / Math.max(1, D), err: it.err, defense: D, attack: A };
}
