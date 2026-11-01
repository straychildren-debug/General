import { advanceYear } from '../src/ai/year';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
let s = createGame({ ...DEFAULT_SETTINGS, seed: Number(process.argv[2] ?? 1), humans: [] });
for (let y = 0; y < 120 && !s.over; y++) {
  s = advanceYear(s, {});
  if (s.year > 85 && s.year % 5 === 0) {
    const alive = s.countries.filter((c) => c.alive);
    const r = s.reports[s.reports.length - 1];
    const tr = s.treaties.filter((t) => s.countries[t.a].alive && s.countries[t.b].alive).map((t) => `${t.kind}:${s.countries[t.a].name}-${s.countries[t.b].name}${t.target != null ? '>' + s.countries[t.target].name : ''}(до ${t.until})`);
    console.log(`Год ${s.year - 1}: ${alive.map((c) => c.name + ' ' + c.cells + ' солд ' + Math.round(c.soldiers / 1000) + 'k').join(', ')} | боёв ${r.battles.length} | ${tr.join('; ')}`);
  }
}