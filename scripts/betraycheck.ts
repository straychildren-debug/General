import { aiEvaluateDeal } from '../src/ai/diplomacyAi';
import { advanceYear } from '../src/ai/year';
import { disgraced, honorOf, treatyBetween } from '../src/core/diplomacy';
import { createGame, DEFAULT_SETTINGS, defaultOrders } from '../src/core/game';
import { computeGeo } from '../src/core/geo';
import type { Deal } from '../src/core/types';
let s = createGame({ ...DEFAULT_SETTINGS, seed: 21, truceYears: 0, humans: ['Тест'] });
const me = s.countries.find((c) => c.controller === 'human')!.id;
// Даём себе армию, чтобы было чем нападать
s.countries[me].soldiers = 60000;
const geo = computeGeo(s);
const nb = geo.neighbors[me][0];
const deal: Deal = { id: -1, from: me, to: nb, kind: 'peace', years: 5, payer: null, once: 0, yearly: 0, target: null, ultimatum: false, year: s.year };
console.log('Ответ на мир:', aiEvaluateDeal(s, geo, deal));
const o = defaultOrders(s.countries[me]);
o.diplomacy = { deals: [deal], accept: [], cancel: [] };
s = advanceYear(s, { [me]: o });
console.log('Год', s.year, 'договор есть:', !!treatyBetween(s, me, nb), 'честь:', honorOf(s, me));
// Нападаем на партнёра
const o2 = defaultOrders(s.countries[me]);
const g = s.countries[me].generals[0];
o2.tasks[g.id] = { type: 'attack', target: nb, soldiers: 40000 };
s = advanceYear(s, { [me]: o2 });
const r = s.reports[s.reports.length - 1];
console.log('После нападения: честь', honorOf(s, me), 'опозорен:', disgraced(s, me), 'договор:', !!treatyBetween(s, me, nb));
console.log(r.events.filter((e) => e.text.includes('договор')).map((e) => e.text));
const geo2 = computeGeo(s);
const other = geo2.neighbors[me].find((x) => x !== nb && s.countries[x].alive)!;
console.log('Ответ другого соседа на мир:', aiEvaluateDeal(s, geo2, { ...deal, to: other, year: s.year }).text);