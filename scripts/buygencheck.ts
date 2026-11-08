// Купленный в этом году генерал сразу ведёт поход.
import { advanceYear } from '../src/ai/year';
import { createGame, DEFAULT_SETTINGS, defaultOrders } from '../src/core/game';
import { computeGeo } from '../src/core/geo';
let s = createGame({ ...DEFAULT_SETTINGS, seed: 3, truceYears: 0, humans: ['Игрок'] });
const me = s.countries.find((c) => c.controller === 'human')!.id;
// Год копим армию
const o0 = defaultOrders(s.countries[me]);
o0.hireSoldiers = Math.round(s.countries[me].population * 0.05);
s = advanceYear(s, { [me]: o0 });
const c = s.countries[me];
const off = c.offers[0];
const tgt = computeGeo(s).neighbors[me][0];
const o = defaultOrders(c);
o.buyOffers = [off.id];
o.tasks[off.id] = { type: 'attack', target: tgt, soldiers: Math.floor(c.soldiers * 0.6) };
s = advanceYear(s, { [me]: o });
const b = s.reports[s.reports.length - 1].battles.find((x) => x.attacker === me);
console.log('куплен:', off.name, '| бой:', b ? `${b.attackerGeneral} → ${s.countries[b.defender].name}, ${b.attackerWon ? 'победа' : 'поражение'}` : 'НЕ БЫЛО');
