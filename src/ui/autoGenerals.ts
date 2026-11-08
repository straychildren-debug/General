import { attackFactor, defendFactor } from '../core/balance';
import type { Country, General, GeneralTask, Orders } from '../core/types';

/**
 * Генералы страны с учётом приказов этого года: уволенные убраны, купленные на рынке — уже
 * в строю (ход добавляет их до сражений, им можно сразу дать задачу, в том числе поход).
 */
export function rosterOf(c: Country, dismissed: number[] = [], bought: number[] = []): General[] {
  const own = c.generals.filter((g) => !dismissed.includes(g.id));
  const fresh = c.offers.filter((o) => bought.includes(o.id)).map(({ price: _p, ...g }) => ({ ...g, task: { type: 'study' } as GeneralTask }));
  return [...own, ...fresh];
}

/**
 * Задачи генералов, которые не в походе: выбор игрока (оборона / учёба) сохраняется;
 * если обороной никто не командует — её возглавит лучший по обороне, остальные учатся.
 */
export function autoTasks(c: Country, tasks: Orders['tasks'], dismissed: number[] = [], bought: number[] = []): Orders['tasks'] {
  const res: Orders['tasks'] = { ...tasks };
  const home = rosterOf(c, dismissed, bought).filter((g) => res[g.id]?.type !== 'attack');
  for (const g of home) {
    const cur = res[g.id] ?? g.task;
    res[g.id] = cur.type === 'attack' ? { type: 'study' } : cur;
  }
  if (home.length && !home.some((g) => res[g.id].type === 'defend')) {
    const best = home.reduce((a, g) => (defendFactor(g) > defendFactor(a) ? g : a));
    res[best.id] = { type: 'defend' };
  }
  return res;
}

/** Кого отправить в поход: лучший наступающий, но по возможности не тот, кто держит оборону. */
export function pickAttacker(c: Country, tasks: Orders['tasks'], roster: General[] = c.generals): General | null {
  const taskOf = (g: General): GeneralTask => tasks[g.id] ?? g.task;
  const free = roster
    .filter((g) => taskOf(g).type !== 'attack')
    .sort((a, b) => attackFactor(b) * (1 + 0.04 * b.speed) - attackFactor(a) * (1 + 0.04 * a.speed));
  if (!free.length) return null;
  if (free.length === 1) return free[0];
  const defender = free.reduce((a, g) => (defendFactor(g) > defendFactor(a) ? g : a));
  return free.find((g) => g !== defender) ?? free[0];
}
