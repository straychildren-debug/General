import { allAiOrders } from '../src/ai/ai';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
import { computeGeo } from '../src/core/geo';
import { resolveTurn } from '../src/core/turn';
let s = createGame({ ...DEFAULT_SETTINGS, seed: 3, humans: [] });
const counts: Record<string, number> = {};
let battleDeaths = 0;
for (let y = 0; y < 60; y++) {
  s = resolveTurn(s, allAiOrders(s, computeGeo(s)));
  const r = s.reports[s.reports.length - 1];
  for (const e of r.events) { const m = e.text.match(/умер (от \S+)/); if (m) counts[m[1]] = (counts[m[1]] ?? 0) + 1; }
  battleDeaths += r.battles.filter((b) => b.generalLost).length;
}
const ages = s.countries.filter((c) => c.alive).flatMap((c) => c.generals.map((g) => g.age));
console.log('За 60 лет:', counts, 'погибли в бою:', battleDeaths, '| возраст живых генералов: мин', Math.min(...ages), 'макс', Math.max(...ages));