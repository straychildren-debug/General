// Печатает правителей и генералов нескольких стран — проверка имён по культурам.
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
import { rulerOf } from '../src/ui/rulers';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 4, humans: [] });
for (const c of s.countries.slice(0, 14)) {
  const r = rulerOf(s, c.id);
  console.log(c.name.padEnd(12), '|', r.title, r.name, '| генерал:', c.generals[0]?.name, '| рынок:', c.offers.map((g) => g.name).join(', '));
}
