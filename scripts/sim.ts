// Прогон партии «все компьютеры» для проверки баланса: npm run sim -- [seed] [countries] [years] [difficulty]
import { allAiOrders } from '../src/ai/ai';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
import { econOf } from '../src/core/econ';
import { computeGeo } from '../src/core/geo';
import { resolveTurn } from '../src/core/turn';
import type { Difficulty } from '../src/core/types';

const [seedArg, nArg, yearsArg, diffArg] = process.argv.slice(2);
const seed = Number(seedArg ?? 1);
const n = Number(nArg ?? 30);
const years = Number(yearsArg ?? 200);
const difficulty = (diffArg ?? 'hard') as Difficulty;

const t0 = Date.now();
let s = createGame({ ...DEFAULT_SETTINGS, seed, numCountries: n, humans: [], difficulty });
console.log(`Карта ${s.map.w}×${s.map.h}, суша ${s.map.landCells}, на страну ${s.cellsPerCountry.toFixed(1)}; создано за ${Date.now() - t0} мс`);
const sizes = s.countries.map((c) => c.cells);
console.log(`Площади: мин ${Math.min(...sizes)}, макс ${Math.max(...sizes)}`);

let turnMs = 0;
let battles = 0;
let wins = 0;
const avg = (f: (c: (typeof s.countries)[number]) => number) => {
  const a = s.countries.filter((c) => c.alive);
  return a.reduce((p, c) => p + f(c), 0) / a.length;
};
for (let y = 0; y < years && !s.over; y++) {
  const t = Date.now();
  const geo = computeGeo(s);
  const orders = allAiOrders(s, geo);
  s = resolveTurn(s, orders);
  turnMs += Date.now() - t;
  const rep = s.reports[s.reports.length - 1];
  battles += rep.battles.length;
  wins += rep.battles.filter((b) => b.attackerWon).length;
  if (s.year % 10 === 1 || s.over) {
    const alive = s.countries.filter((c) => c.alive).sort((a, b) => b.cells - a.cells);
    const top = alive
      .slice(0, 3)
      .map((c) => `${c.name}(${c.personality.slice(0, 4)}) ${c.cells}`)
      .join(', ');
    console.log(
      `Год ${String(s.year - 1).padStart(3)} | живых ${String(alive.length).padStart(2)} | боёв ${String(battles).padStart(3)} (побед ${wins}) | ` +
        `цена ${s.market.price.toFixed(2)} | нас ${(avg((c) => c.population) / 1000).toFixed(0)}k | солд ${(avg((c) => c.soldiers) / 1000).toFixed(1)}k | ` +
        `учён ${(avg((c) => c.scientists) / 1000).toFixed(1)}k | деньги ${(avg((c) => c.money) / 1000).toFixed(0)}k | ` +
        `наука ${avg((c) => c.science.level.reduce((a, b) => a + b, 0)).toFixed(1)} | настр ${avg((c) => c.happiness).toFixed(0)} | ` +
        `ген.опыт ${avg((c) => Math.max(0, ...c.generals.map((g) => g.exp))).toFixed(0)} | ${top}`,
    );
    battles = 0;
    wins = 0;
  }
}
console.log(`Среднее время хода: ${(turnMs / Math.max(1, s.year - 1)).toFixed(1)} мс`);
{
  const geo = computeGeo(s);
  const top = s.countries.filter((c) => c.alive).sort((a, b) => b.cells - a.cells)[0];
  const e = econOf(s, geo, top);
  const k = (x: number) => (x / 1e6).toFixed(1) + 'M';
  console.log(
    `${top.name}: нас ${k(top.population)} (предел ${k(e.maxPop)}), крест ${k(e.civilians)}, солд ${k(top.soldiers)}, учён ${k(top.scientists)} | ` +
      `налоги ${k(e.taxes)}, урожай ${k(e.harvest)}, едят ${k(e.consumption)}, цена ${s.market.price.toFixed(2)}, содержание ${k(e.upkeep)} | ` +
      `казна ${k(top.money)} | науки ${top.science.level.join(',')}`,
  );
}
if (s.over) console.log(`Победитель: ${s.countries[s.winner!].name} на ${s.year - 1} году`);
