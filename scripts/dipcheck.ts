import { advanceYear } from '../src/ai/year';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
let s = createGame({ ...DEFAULT_SETTINGS, seed: Number(process.argv[2] ?? 1), humans: [] });
let betray = 0, unpaid = 0;
const kinds: Record<string, number> = {};
for (let y = 0; y < 120 && !s.over; y++) {
  const ids = new Set(s.treaties.map((t) => t.id));
  s = advanceYear(s, {});
  for (const t of s.treaties) if (!ids.has(t.id)) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
  const r = s.reports[s.reports.length - 1];
  betray += r.events.filter((e) => e.text.includes('нарушило договор')).length;
  unpaid += r.events.filter((e) => e.text.includes('не смогло заплатить')).length;
}
console.log(`Итог: год ${s.year - 1}, живых ${s.countries.filter((c) => c.alive).length}, победитель ${s.winner != null ? s.countries[s.winner].name : '-'}`);
console.log('Новых договоров:', kinds, '| предательств:', betray, '| неуплат дани:', unpaid, '| честь мин:', Math.min(...s.honor.filter((_, i) => s.countries[i].alive)));