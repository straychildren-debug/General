// Проверка генератора карт: равные площади, страны не разрезаны. npx tsx scripts/mapcheck.ts
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
import { neighborTable } from '../src/core/hex';
import type { MapSize } from '../src/core/types';

const cases: [number, number, MapSize][] = [
  [1, 30, 'normal'],
  [7, 40, 'large'],
  [3, 20, 'small'],
  [42, 40, 'normal'],
  [99, 25, 'large'],
];
for (const [seed, n, size] of cases) {
  const s = createGame({ ...DEFAULT_SETTINGS, seed, numCountries: n, mapSize: size, humans: [] });
  const nb = neighborTable(s.map.w, s.map.h);
  const o = s.map.owner;
  let split = 0;
  for (let c = 0; c < n; c++) {
    const cells = o.map((v, i) => (v === c ? i : -1)).filter((i) => i >= 0);
    const seen = new Set([cells[0]]);
    const st = [cells[0]];
    while (st.length) {
      const x = st.pop()!;
      for (let d = 0; d < 6; d++) {
        const j = nb[x * 6 + d];
        if (j >= 0 && o[j] === c && !seen.has(j)) {
          seen.add(j);
          st.push(j);
        }
      }
    }
    if (seen.size !== cells.length) split++;
  }
  let border = 0;
  for (let i = 0; i < o.length; i++)
    if (o[i] >= 0)
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j >= 0 && o[j] >= 0 && o[j] !== o[i]) border++;
      }
  const sizes = s.countries.map((c) => c.cells);
  console.log(`seed ${seed}, ${n} стран: разрезано ${split}, длина границ ${border / 2}, площади ${Math.min(...sizes)}–${Math.max(...sizes)}`);
}
