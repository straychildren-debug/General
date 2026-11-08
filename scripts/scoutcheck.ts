import { advanceYear } from '../src/ai/year';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
let s = createGame({ ...DEFAULT_SETTINGS, seed: 5, humans: [] });
let reports = 0, battles = 0, wins = 0;
for (let y = 0; y < 60; y++) {
  s = advanceYear(s, {});
  const r = s.reports[s.reports.length - 1];
  battles += r.battles.length; wins += r.battles.filter((b) => b.attackerWon).length;
  reports += s.countries.filter((c) => c.alive && c.scoutTarget != null && c.hasScout).length;
}
const withScout = s.countries.filter((c) => c.alive && c.hasScout).length;
console.log(`60 лет: донесений всего в памяти ${s.intel.length}, со шпионом сейчас ${withScout} из ${s.countries.filter((c) => c.alive).length}, боёв ${battles}, побед атакующих ${wins} (${Math.round(100 * wins / Math.max(1, battles))}%)`);