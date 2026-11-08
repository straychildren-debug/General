import { advanceYear } from '../src/ai/year';
import { ensureDiplomacy } from '../src/core/diplomacy';
import { createGame, DEFAULT_SETTINGS } from '../src/core/game';
const g = createGame({ ...DEFAULT_SETTINGS, seed: 4, humans: [] });
for (const c of g.countries) { c.science.level.push(3, 2); c.science.progress.push(10, 5); c.science.alloc.push(10, 10); }
const old = JSON.parse(JSON.stringify(g));
const s = ensureDiplomacy(old);
console.log('Наук после загрузки:', s.countries[0].science.level.length);
const next = advanceYear(s, {});
console.log('Год обработан:', next.year, 'наук:', next.countries[0].science.level.length);