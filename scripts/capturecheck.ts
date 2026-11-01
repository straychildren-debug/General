import { captureAmount, battleLosses } from '../src/core/balance';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
const s = createGame({ ...DEFAULT_SETTINGS, seed: 1, humans: [] });
const c = s.countries[0];
const g = { ...c.generals[0], speed: 6 };
const ppc = c.population / c.cells;
console.log(`Клеток в стране ${c.cells}, жителей на клетку ${Math.round(ppc)}`);
for (const army of [2000, 5000, 10000, 20000, 40000, 80000]) {
  const row = [1.2, 2, 4].map((ratio) => {
    const surv = army * (1 - battleLosses(Math.min(ratio, 1 / ratio)).win);
    return `перевес ×${ratio}: ${captureAmount(s.cellsPerCountry, c.cells, g, ratio, 0.5, surv, ppc)}`;
  });
  console.log(`Армия ${army}: ${row.join(', ')}`);
}