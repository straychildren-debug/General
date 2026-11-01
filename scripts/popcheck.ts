import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
import { computeGeo } from '../src/core/geo';
import { econOf } from '../src/core/econ';
import { resolveTurn } from '../src/core/turn';
import { defaultOrders } from '../src/core/game';
let s = createGame({ ...DEFAULT_SETTINGS, seed: 5, humans: [] });
for (let y = 0; y < 7; y++) {
  const geo = computeGeo(s);
  const row = s.countries.slice(0, 5).map((c) => { const e = econOf(s, geo, c); return `${Math.round(c.population / 1000)}k/${Math.round(e.maxPop / 1000)}k`; });
  console.log(`Год ${s.year}: ` + row.join('  '));
  const o: Record<number, ReturnType<typeof defaultOrders>> = {};
  for (const c of s.countries) o[c.id] = defaultOrders(c);
  s = resolveTurn(s, o);
}