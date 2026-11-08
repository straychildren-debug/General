// Первый ход с наймом учёных и распределением «по 10 тысяч» — не должен падать или зависать.
import { advanceYear } from '../src/ai/year';
import { createGame, DEFAULT_SETTINGS, defaultOrders } from '../src/core/game';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 1745, humans: ['Игрок'] });
const me = s.countries.find((c) => c.controller === 'human')!;
const o = defaultOrders(me);
o.hireScientists = 20000;
o.scienceAlloc = [0, 0, 50, 0, 0, 50];
const t0 = Date.now();
try {
  const n = advanceYear(s, { [me.id]: o });
  const c = n.countries[me.id];
  console.log('ok за', Date.now() - t0, 'мс; уровни', c.science.level.join(','), 'прогресс', c.science.progress.map((x) => Math.round(x)).join(','));
} catch (e) {
  console.log('ОШИБКА:', e);
}
