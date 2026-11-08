import {
  attackFactor,
  B,
  battleLosses,
  bestDefender,
  captureAmount,
  defendFactor,
  levelCost,
  maxRecruits,
  milDefAt,
  recruitCost,
  morale,
  retireAge,
  sciMult,
  SCIENCE_INFO,
  scoutPrice,
  studyGain,
  TERRAIN_INFO,
} from './balance';
import { addRel, ensureDiplomacy, onBetrayal, treatyBetween, yearlyDiplomacy } from './diplomacy';
import { econOf, settle, staffRoom, starvationDeaths, type Econ } from './econ';
import { fmt, fmtShort } from './format';
import { defaultOrders, generateOffers, randomGeneral } from './game';
import { areNeighbors, computeGeo, frontFactor, type Geo } from './geo';
import { cellX, cellY, neighborTable } from './hex';
import { Rng } from './rng';
import {
  S_GROW,
  S_MIL,
  type BattleReport,
  type Country,
  type GameState,
  type General,
  type GeneralTask,
  type Orders,
  type ScoutReport,
  type YearReport,
} from './types';

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function normalizeAlloc(a: unknown): number[] {
  const arr = Array.isArray(a) ? a : [];
  const v = Array.from({ length: SCIENCE_INFO.length }, (_, i) => Math.max(0, num(arr[i])));
  // Доли учёных в процентах; сумма меньше 100 — часть учёных свободна и не работает
  const s = v.reduce((p, q) => p + q, 0);
  if (s <= 100) return v;
  return v.map((x) => (x * 100) / s);
}

function sanitizeTask(t: GeneralTask | undefined): GeneralTask {
  if (!t) return { type: 'defend' };
  if (t.type === 'attack') return { type: 'attack', target: Math.floor(num(t.target)), soldiers: Math.max(0, num(t.soldiers)) };
  if (t.type === 'study') return { type: 'study' };
  return { type: 'defend' };
}

/** Главная функция: обрабатывает один год по приказам всех стран. */
export function resolveTurn(prev: GameState, ordersIn: Record<number, Orders>): GameState {
  if (prev.over) return prev;
  const s: GameState = ensureDiplomacy(structuredClone(prev));
  const rng = new Rng(s.rng);
  const report: YearReport = { year: s.year, battles: [], events: [], eliminated: [], price: 0, supply: 0, demand: 0 };
  report.events.push(...(s.pendingEvents ?? []));
  s.pendingEvents = [];
  const alive = s.countries.filter((c) => c.alive);
  const orders = new Map<number, Orders>();
  for (const c of alive) orders.set(c.id, ordersIn[c.id] ?? defaultOrders(c));
  let geo = computeGeo(s);
  const ownerBefore = s.map.owner.slice();

  // 1. Распределение учёных по наукам
  for (const c of alive) c.science.alloc = normalizeAlloc(orders.get(c.id)!.scienceAlloc);

  // 2. Закупки: генералы, учёные, задачи
  for (const c of alive) applyPurchases(s, c, orders.get(c.id)!, report);

  // 3. Война
  runWar(s, rng, geo, report);

  // Новобранцы и укрепления готовы только к концу года
  for (const c of alive) if (c.alive) applyMobilization(c, orders.get(c.id)!, report);
  geo = computeGeo(s);

  // 4. События
  const harvestMult = new Map<number, number>();
  if (s.settings.events) rollEvents(s, rng, report, harvestMult);

  // 5. Хозяйство: доход, урожай, рынок зерна, жалованье, рост населения
  yearEconomy(s, geo, harvestMult, rng, report);

  // Дипломатия: дань, обязательства союзников, истечение договоров, отношения, честь
  yearlyDiplomacy(s, report);

  // Разведка: донесения о положении дел на конец года
  runScouts(s, rng, report);

  // 6. Итоги года
  for (const c of s.countries) {
    if (!c.alive) continue;
    generateOffers(rng, s, c);
  }

  const changed: number[] = [];
  const owners: number[] = [];
  for (let i = 0; i < ownerBefore.length; i++) {
    if (ownerBefore[i] !== s.map.owner[i]) {
      changed.push(i);
      owners.push(s.map.owner[i]);
    }
  }
  if (changed.length) s.chronicle.changes.push({ year: s.year, cells: changed, owners });

  s.reports.push(report);
  if (s.reports.length > 30) s.reports.shift();

  checkVictory(s);
  s.year++;
  s.history.push({ year: s.year, cells: s.countries.map((c) => c.cells) });
  s.rng = rng.s;
  return s;
}

/** Мировая цена зерна: все излишки продаются, все недостачи докупаются одновременно. */
function marketPrice(s: GameState, supply: number, deficits: number, worldPop: number, report: YearReport): number {
  const m = s.market;
  const demand = m.d0 * (worldPop / m.pop0) * Math.pow(1 + B.demandGrowth, s.year - 1) * m.shock + deficits;
  const cushion = m.d0 * 0.3;
  const price = clamp(B.basePrice * Math.pow((demand + cushion) / (supply + cushion), B.priceElasticity), B.basePrice * 0.3, B.basePrice * 3);
  m.price = price;
  m.history.push(price);
  if (m.history.length > 80) m.history.shift();
  m.lastSupply = supply;
  m.lastDemand = demand;
  m.shock = 1;
  report.price = price;
  report.supply = supply;
  report.demand = demand;
  return price;
}

function applyPurchases(s: GameState, c: Country, o: Orders, report: YearReport): void {
  if (o.scout?.hire && !c.hasScout) {
    const price = scoutPrice(s.cellsPerCountry, s.year);
    if (c.money >= price) {
      c.money -= price;
      c.hasScout = true;
      note(report, c, `Нанят разведчик за ${fmtShort(price)}`, true);
    }
  }
  if (o.scout) {
    const t = o.scout.target;
    c.scoutTarget = t != null && t !== c.id && s.countries[t]?.alive ? t : null;
  }
  const dismiss = new Set(Array.isArray(o.dismissGenerals) ? o.dismissGenerals : []);
  for (const g of c.generals) if (dismiss.has(g.id)) note(report, c, `Генерал ${g.name} уволен`);
  c.generals = c.generals.filter((g) => !dismiss.has(g.id));

  for (const id of new Set(Array.isArray(o.buyOffers) ? o.buyOffers : [])) {
    const off = c.offers.find((x) => x.id === id);
    if (!off || c.generals.length >= B.maxGenerals || c.money < off.price) continue;
    c.money -= off.price;
    const { price: _price, ...g } = off;
    c.generals.push({ ...g, task: { type: 'defend' } });
    c.offers = c.offers.filter((x) => x !== off);
    note(report, c, `Нанят генерал ${g.name} за ${fmtShort(off.price)}`, true);
  }

  let hsc = Math.round(num(o.hireScientists));
  if (hsc > 0) {
    hsc = Math.min(hsc, staffRoom(c), maxRecruits('scientist', c.scientists, c.population, c.money));
    const cost = recruitCost('scientist', c.scientists, c.population, hsc);
    c.money -= cost;
    c.scientists += hsc;
    if (hsc > 0) note(report, c, `Нанято ${fmt(hsc)} учёных за ${fmtShort(cost)}`, true);
  } else if (hsc < 0) {
    const n = Math.min(c.scientists, -hsc);
    c.scientists -= n;
    note(report, c, `Уволено ${fmt(n)} учёных`);
  }

  const tasks = o.tasks ?? {};
  for (const g of c.generals) g.task = sanitizeTask(tasks[g.id]);
}

function applyMobilization(c: Country, o: Orders, report: YearReport): void {
  let hs = Math.round(num(o.hireSoldiers));
  if (hs > 0) {
    hs = Math.min(hs, staffRoom(c), maxRecruits('soldier', c.soldiers, c.population, c.money));
    const cost = recruitCost('soldier', c.soldiers, c.population, hs);
    c.money -= cost;
    c.soldiers += hs;
    if (hs > 0) note(report, c, `Прибыло ${fmt(hs)} новобранцев, их набор обошёлся в ${fmtShort(cost)}`, true);
    if (hs < Math.round(num(o.hireSoldiers))) note(report, c, 'Денег хватило не на всех новобранцев', false);
  } else if (hs < 0) {
    const n = Math.min(c.soldiers, -hs);
    c.soldiers -= n;
    note(report, c, `Распущено ${fmt(n)} солдат`);
  }
}

// ───────────────────────────── Война ─────────────────────────────

interface Army {
  country: number;
  gen: General;
  soldiers: number;
  target: number;
}

function runWar(s: GameState, rng: Rng, geo: Geo, report: YearReport): void {
  const armies: Army[] = [];
  for (const c of s.countries) {
    if (!c.alive) continue;
    let avail = c.soldiers;
    for (const g of c.generals) {
      if (g.task.type !== 'attack') continue;
      const t = g.task.target;
      const tc = s.countries[t];
      const send = Math.min(Math.floor(g.task.soldiers), avail);
      if (s.year <= (s.settings.truceYears ?? 0) || !tc || !tc.alive || t === c.id || !areNeighbors(geo, c.id, t) || send < 100) {
        g.task = { type: 'defend' };
        continue;
      }
      avail -= send;
      // Нападение на партнёра по договору — предательство
      const treaty = treatyBetween(s, c.id, t);
      if (treaty) onBetrayal(s, report, c.id, t, treaty);
      armies.push({ country: c.id, gen: g, soldiers: send, target: t });
    }
    c.soldiers = avail;
  }

  const returning = new Map<number, number>();
  const ret = (id: number, n: number) => returning.set(id, (returning.get(id) ?? 0) + n);

  // Встречные бои: армии, идущие друг на друга, сталкиваются в поле
  for (let i = 0; i < armies.length; i++) {
    for (let j = i + 1; j < armies.length; j++) {
      const a = armies[i];
      const b = armies[j];
      if (a.soldiers > 0 && b.soldiers > 0 && a.country === b.target && b.country === a.target) {
        fieldBattle(s, rng, a, b, report, ret);
      }
    }
  }

  rng.shuffle(armies);
  for (const a of armies) {
    if (a.soldiers <= 0) continue;
    const att = s.countries[a.country];
    const def = s.countries[a.target];
    if (!att.alive) continue;
    if (!def.alive) {
      ret(att.id, a.soldiers);
      continue;
    }
    siegeBattle(s, rng, a, report, ret);
  }

  for (const [id, n] of returning) {
    const c = s.countries[id];
    if (c.alive) c.soldiers += n;
  }
  for (const c of s.countries) for (const g of c.generals) if (g.task.type === 'attack') g.task = { type: 'defend' };
}

function casualties(c: Country, n: number): void {
  c.population = Math.max(0, c.population - n);
  c.warWeariness += (n / Math.max(1, c.population)) * 300;
}

function gainExp(g: General, won: boolean, r: number): number {
  g.battles++;
  if (won) g.wins++;
  let e = won ? 4 + 8 * r : 2 + 3 * r;
  g.exp += e;
  return e;
}

/** Событие для журнала страны игрока (компьютерам подробный журнал не нужен). */
function note(report: YearReport, c: Country, text: string, good: boolean | null = null): void {
  if (c.controller === 'human') report.events.push({ country: c.id, text, good });
}

function side(c: Country, g: General | null, mil: number, gen: number) {
  return { mil, gen, exp: g ? Math.round(g.exp) : null, morale: morale(c.happiness) };
}

function removeGeneral(c: Country, g: General): void {
  c.generals = c.generals.filter((x) => x.id !== g.id);
}

function fieldBattle(
  s: GameState,
  rng: Rng,
  a: Army,
  b: Army,
  report: YearReport,
  ret: (id: number, n: number) => void,
): void {
  const ca = s.countries[a.country];
  const cb = s.countries[b.country];
  const R = B.battleRand;
  const battleSeed = Math.floor(rng.next() * 1e9);
  const pa = a.soldiers * sciMult(ca, S_MIL) * attackFactor(a.gen) * morale(ca.happiness) * (1 + rng.range(-R, R));
  const pb = b.soldiers * sciMult(cb, S_MIL) * attackFactor(b.gen) * morale(cb.happiness) * (1 + rng.range(-R, R));
  const sideA = side(ca, a.gen, sciMult(ca, S_MIL), attackFactor(a.gen));
  const sideB = side(cb, b.gen, sciMult(cb, S_MIL), attackFactor(b.gen));
  const aWon = pa >= pb;
  const r = Math.min(pa, pb) / Math.max(pa, pb);
  const { win, lose } = battleLosses(r);
  const sa = a.soldiers;
  const sb = b.soldiers;
  const la = Math.round(sa * (aWon ? win : lose));
  const lb = Math.round(sb * (aWon ? lose : win));
  a.soldiers -= la;
  b.soldiers -= lb;
  casualties(ca, la);
  casualties(cb, lb);
  const winner = aWon ? a : b;
  const loser = aWon ? b : a;
  const ew = gainExp(winner.gen, true, r);
  const el = gainExp(loser.gen, false, r);
  note(report, s.countries[winner.country], `Генерал ${winner.gen.name} набрал в бою ${ew.toFixed(1)} опыта`, true);
  note(report, s.countries[loser.country], `Генерал ${loser.gen.name} набрал в бою ${el.toFixed(1)} опыта`, true);
  s.countries[winner.country].happyMod += 2;
  s.countries[loser.country].happyMod -= 3;
  ret(loser.country, loser.soldiers);
  loser.soldiers = 0;
  let generalLost: BattleReport['generalLost'] = null;
  if (rng.chance(0.1)) {
    removeGeneral(s.countries[loser.country], loser.gen);
    generalLost = aWon ? 'defender' : 'attacker';
    note(report, s.countries[loser.country], `Генерал ${loser.gen.name} погиб в бою в возрасте ${loser.gen.age} лет`, false);
  }
  report.battles.push({
    attacker: a.country,
    defender: b.country,
    attackerGeneral: a.gen.name,
    defenderGeneral: b.gen.name,
    attackerSoldiers: sa,
    defenderSoldiers: sb,
    attackerLosses: la,
    defenderLosses: lb,
    attackerStrength: pa,
    defenderStrength: pb,
    attackerWon: aWon,
    cellsTaken: 0,
    capitalTaken: false,
    eliminated: false,
    field: true,
    generalLost,
    details: {
      atk: sideA,
      def: { ...sideB, terrain: 1, front: 1, total: sb, militia: 0 },
      seed: battleSeed,
    },
  });
}

function liveBorder(s: GameState, att: number, def: number): { count: number; defAvg: number; front: number } {
  const { w, h, owner, terrain } = s.map;
  const nb = neighborTable(w, h);
  let count = 0;
  let sum = 0;
  let frontier = 0;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== def) continue;
    let touchesAtt = false;
    let touchesAny = false;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j < 0 || owner[j] < 0 || owner[j] === def) continue;
      touchesAny = true;
      if (owner[j] === att) touchesAtt = true;
    }
    if (touchesAny) frontier++;
    if (touchesAtt) {
      count++;
      sum += TERRAIN_INFO[terrain[i]].def;
    }
  }
  return { count, defAvg: count ? sum / count : 1, front: frontFactor(count, frontier) };
}

function siegeBattle(
  s: GameState,
  rng: Rng,
  a: Army,
  report: YearReport,
  ret: (id: number, n: number) => void,
): void {
  const att = s.countries[a.country];
  const def = s.countries[a.target];
  const border = liveBorder(s, att.id, def.id);
  if (border.count === 0) {
    ret(att.id, a.soldiers);
    return;
  }
  const R = B.battleRand;
  const battleSeed = Math.floor(rng.next() * 1e9);
  const dg = bestDefender(def);
  const A = a.soldiers * sciMult(att, S_MIL) * attackFactor(a.gen) * morale(att.happiness) * (1 + rng.range(-R, R));
  const defPer =
    milDefAt(def.science.level[S_MIL]) *
    defendFactor(dg) *
    border.defAvg *
    morale(def.happiness);
  const militia = def.population * 0.002;
  // На этом участке границы обороняется только часть гарнизона — остальные стерегут другие границы
  const sd = Math.round(def.soldiers * border.front);
  const D = Math.max(1, (sd + militia) * defPer * (1 + rng.range(-R, R)));
  const sideA = side(att, a.gen, sciMult(att, S_MIL), attackFactor(a.gen));
  const sideD = side(def, dg, milDefAt(def.science.level[S_MIL]), defendFactor(dg));
  const attackerWon = A > D;
  const r = Math.min(A, D) / Math.max(A, D);
  const { win, lose } = battleLosses(r);
  const sa = a.soldiers;
  const la = Math.round(sa * (attackerWon ? win : lose));
  const ld = Math.round(sd * (attackerWon ? lose : win));
  a.soldiers -= la;
  def.soldiers -= ld;
  casualties(att, la);
  casualties(def, ld);
  const ea = gainExp(a.gen, attackerWon, r);
  note(report, att, `Генерал ${a.gen.name} набрал в бою ${ea.toFixed(1)} опыта`, true);
  if (dg) {
    const ed = gainExp(dg, !attackerWon, r);
    note(report, def, `Генерал ${dg.name} набрал в бою ${ed.toFixed(1)} опыта`, true);
  }
  const totalGarrison = def.soldiers + ld;

  let generalLost: BattleReport['generalLost'] = null;
  if (!attackerWon && rng.chance(0.08)) {
    removeGeneral(att, a.gen);
    generalLost = 'attacker';
    note(report, att, `Генерал ${a.gen.name} погиб в бою в возрасте ${a.gen.age} лет`, false);
  } else if (attackerWon && dg && rng.chance(0.06)) {
    removeGeneral(def, dg);
    generalLost = 'defender';
    note(report, def, `Генерал ${dg.name} погиб в бою, защищая родину, в возрасте ${dg.age} лет`, false);
  }

  let cellsTaken = 0;
  let capitalTaken = false;
  let eliminated = false;
  if (attackerWon) {
    const before = def.cells;
    // a.soldiers здесь — уже уцелевшие после боя: они и занимают землю
    const n = captureAmount(s.cellsPerCountry, def.cells, a.gen, A / D, rng.next(), a.soldiers, def.population / Math.max(1, def.cells));
    const res = capture(s, rng, att, def, n);
    cellsTaken = res.taken;
    capitalTaken = res.capital;
    def.happyMod -= 4 + (30 * cellsTaken) / Math.max(1, before);
    att.happyMod += 3;
    if (def.cells <= Math.max(3, Math.round(s.cellsPerCountry * B.elimFrac))) {
      eliminate(s, def, att, report);
      eliminated = true;
    }
  } else {
    att.happyMod -= 3;
    def.happyMod += 3;
  }
  ret(att.id, a.soldiers);
  a.soldiers = 0;

  report.battles.push({
    attacker: att.id,
    defender: def.id,
    attackerGeneral: a.gen.name,
    defenderGeneral: dg ? dg.name : null,
    attackerSoldiers: sa,
    defenderSoldiers: sd,
    attackerLosses: la,
    defenderLosses: ld,
    attackerStrength: A,
    defenderStrength: D,
    details: {
      atk: sideA,
      def: {
        ...sideD,
        terrain: border.defAvg,
        front: border.front,
        total: totalGarrison,
        militia: Math.round(militia),
      },
      seed: battleSeed,
    },
    attackerWon,
    cellsTaken,
    capitalTaken,
    eliminated,
    field: false,
    generalLost,
  });
}

/** Захват клеток: «клин» от случайной точки фронта вглубь территории защитника. */
function capture(s: GameState, rng: Rng, att: Country, def: Country, n: number): { taken: number; capital: boolean } {
  const { w, h, owner } = s.map;
  const nb = neighborTable(w, h);
  const front: number[] = [];
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== def.id) continue;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j >= 0 && owner[j] === att.id) {
        front.push(i);
        break;
      }
    }
  }
  if (!front.length || n <= 0) return { taken: 0, capital: false };
  const focus = rng.pick(front);
  const visited = new Uint8Array(owner.length);
  const queue = [focus];
  visited[focus] = 1;
  const taken: number[] = [];
  const dirs = [0, 1, 2, 3, 4, 5];
  for (let qi = 0; qi < queue.length && taken.length < n; qi++) {
    const c = queue[qi];
    taken.push(c);
    rng.shuffle(dirs);
    for (const d of dirs) {
      const j = nb[c * 6 + d];
      if (j >= 0 && !visited[j] && owner[j] === def.id) {
        visited[j] = 1;
        queue.push(j);
      }
    }
  }

  let capital = false;
  for (const c of taken) {
    owner[c] = att.id;
    if (c === def.capital) capital = true;
  }
  const frac = taken.length / Math.max(1, def.cells);
  att.cells += taken.length;
  def.cells -= taken.length;
  const civ = Math.max(0, def.population - def.soldiers - def.scientists);
  const moved = civ * frac;
  def.population -= moved;
  att.population += moved * 0.7;
  const g = def.grain * frac;
  def.grain -= g;
  att.grain += g * 0.5;
  if (capital) {
    const loot = Math.max(0, def.money) * 0.25;
    def.money -= loot;
    att.money += loot;
    def.happyMod -= 12;
    relocateCapital(s, def);
  }
  return { taken: taken.length, capital };
}

function relocateCapital(s: GameState, c: Country): void {
  const { w, owner } = s.map;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== c.id) continue;
    sx += cellX(i, w);
    sy += cellY(i, w);
    n++;
  }
  if (!n) {
    c.capital = -1;
    return;
  }
  sx /= n;
  sy /= n;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== c.id) continue;
    const dx = cellX(i, w) - sx;
    const dy = cellY(i, w) - sy;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  c.capital = best;
}

function eliminate(s: GameState, def: Country, att: Country, report: YearReport): void {
  const owner = s.map.owner;
  for (let i = 0; i < owner.length; i++) if (owner[i] === def.id) owner[i] = att.id;
  att.cells += def.cells;
  att.population += Math.max(0, def.population - def.soldiers) * 0.6;
  att.money += Math.max(0, def.money) * 0.5;
  def.alive = false;
  def.cells = 0;
  def.eliminatedYear = s.year;
  def.eliminatedBy = att.id;
  def.soldiers = 0;
  def.scientists = 0;
  def.population = 0;
  def.money = 0;
  def.grain = 0;
  def.generals = [];
  def.offers = [];
  def.capital = -1;
  report.eliminated.push(def.id);
}

// ───────────────────────────── События ─────────────────────────────

function rollEvents(s: GameState, rng: Rng, report: YearReport, harvestMult: Map<number, number>): void {
  if (rng.chance(0.06)) {
    if (rng.chance(0.5)) {
      s.market.shock = 1.5;
      report.events.push({ country: -1, text: 'Мировой неурожай: в следующем году спрос на зерно вырастет', good: null });
    } else {
      s.market.shock = 0.7;
      report.events.push({ country: -1, text: 'Перепроизводство зерна в мире: в следующем году цены упадут', good: null });
    }
  }
  for (const c of s.countries) {
    if (!c.alive || !rng.chance(0.13)) continue;
    const ev = (text: string, good: boolean) => report.events.push({ country: c.id, text, good });
    switch (rng.int(0, 7)) {
      case 0:
        harvestMult.set(c.id, 0.6);
        ev('Засуха погубила часть урожая', false);
        break;
      case 1:
        harvestMult.set(c.id, 1.3);
        ev('Небывалый урожай!', true);
        break;
      case 2: {
        const loss = (c.population * 0.05) / (1 + 0.1 * c.science.level[S_GROW]);
        c.population -= loss;
        ev(`Эпидемия унесла ${fmt(loss)} жизней`, false);
        break;
      }
      case 3: {
        const opts = c.science.alloc.map((a, i) => (a > 0 ? i : -1)).filter((i) => i >= 0);
        const i = opts.length ? rng.pick(opts) : rng.int(0, SCIENCE_INFO.length - 1);
        c.science.progress[i] += 0.6 * levelCost(c.science.level[i], s.cellsPerCountry);
        ev(`Научный прорыв в области «${SCIENCE_INFO[i].name}»`, true);
        break;
      }
      case 4:
        c.happyMod += 10;
        ev('Народные гуляния подняли настроение', true);
        break;
      case 5: {
        if (c.generals.length >= B.maxGenerals) break;
        const g = randomGeneral(rng, s.nextGeneralId++);
        g.exp = rng.int(15, 35);
        c.generals.push(g);
        ev(`На вашу сторону перешёл генерал ${g.name}`, true);
        break;
      }
      case 6: {
        if (c.money <= 0) break;
        const loss = c.money * 0.12;
        c.money -= loss;
        ev(`Казнокрадство: из казны пропало ${fmtShort(loss)}`, false);
        break;
      }
      case 7: {
        const gain = c.population * 0.08;
        c.money += gain;
        ev(`Удачная торговая сделка принесла ${fmtShort(gain)}`, true);
        break;
      }
    }
  }
}

// ───────────────────────────── Хозяйство ─────────────────────────────

function yearEconomy(s: GameState, geo: Geo, harvestMult: Map<number, number>, rng: Rng, report: YearReport): void {
  const cpc = s.cellsPerCountry;
  const alive = s.countries.filter((c) => c.alive);

  // Сначала урожай всех стран — из него складывается мировая цена зерна
  const econs = new Map<number, Econ>();
  let supply = 0;
  let deficits = 0;
  let worldPop = 0;
  for (const c of alive) {
    const staff = c.soldiers + c.scientists;
    if (staff > c.population * 0.9 && staff > 0) {
      const k = (c.population * 0.9) / staff;
      c.soldiers = Math.floor(c.soldiers * k);
      c.scientists = Math.floor(c.scientists * k);
    }
    const e = econOf(s, geo, c, harvestMult.get(c.id) ?? 1);
    econs.set(c.id, e);
    if (e.surplus > 0) supply += e.surplus;
    else deficits += -e.surplus;
    worldPop += c.population;
  }
  const price = marketPrice(s, supply, deficits, worldPop, report);

  for (const c of alive) {
    const e = econs.get(c.id)!;
    const ev = (text: string, good: boolean) => report.events.push({ country: c.id, text, good });
    const st = settle(c.money, e, price);
    c.money = st.money;
    const popBefore = c.population;
    note(report, c, `Крестьяне вырастили ${fmt(e.harvest)} зерна, народ съел ${fmt(e.consumption)}`);
    if (st.saleRevenue > 0) note(report, c, `Излишки зерна (${fmt(e.surplus)}) проданы на ${fmtShort(st.saleRevenue)}`, true);
    if (st.grainBought > 0) note(report, c, `Своего зерна не хватило: докуплено ${fmt(st.grainBought)} на ${fmtShort(st.grainCost)}`, false);
    note(report, c, `Крестьяне заплатили ${fmtShort(e.taxes)}`, true);
    note(
      report,
      c,
      `Жалованье: солдатам ${fmtShort(e.upkeepSoldiers)}, учёным ${fmtShort(e.upkeepScientists)}, генералам ${fmtShort(e.upkeepGenerals)}`,
    );

    // Не хватило на жалованье — солдаты, а затем учёные разбегаются
    if (st.unpaid > 0) {
      const desert = Math.min(c.soldiers, Math.ceil(st.unpaid / B.soldierUpkeep));
      c.soldiers -= desert;
      const rest = st.unpaid - desert * B.soldierUpkeep;
      let leftSci = 0;
      if (rest > 0) {
        leftSci = Math.min(c.scientists, Math.ceil(rest / B.sciUpkeep));
        c.scientists -= leftSci;
      }
      ev(`Нечем платить жалованье: разбежалось ${fmt(desert)} солдат` + (leftSci ? ` и ${fmt(leftSci)} учёных` : ''), false);
    }

    // Не хватило денег на зерно — голод; иначе население растёт
    if (st.unfed > 0) {
      const deaths = Math.min(c.population * 0.5, starvationDeaths(st.unfed));
      c.population -= deaths;
      ev(`Голод: не хватило денег на зерно, умерло ${fmt(deaths)} человек`, false);
    } else {
      c.population = Math.max(0, c.population + e.growth);
    }
    const dp = c.population - popBefore;
    if (dp >= 1) note(report, c, `Население выросло на ${fmt(dp)} человек`, true);
    else if (st.unfed <= 0 && c.population >= e.maxPop * 0.97) note(report, c, 'Населению тесно: земли больше не хватает — нужна новая территория', false);
    else if (dp <= -1 && st.unfed <= 0) note(report, c, `Население уменьшилось на ${fmt(-dp)} человек`, false);

    // Наука: работают только распределённые учёные
    for (let i = 0; i < c.science.level.length; i++) {
      c.science.progress[i] += (e.sciencePts * c.science.alloc[i]) / 100;
      let cost = levelCost(c.science.level[i], cpc);
      while (c.science.progress[i] >= cost) {
        c.science.progress[i] -= cost;
        c.science.level[i]++;
        note(report, c, `Открыт ${c.science.level[i]}-й уровень науки «${SCIENCE_INFO[i].name}»`, true);
        cost = levelCost(c.science.level[i], cpc);
      }
    }

    // Генералы: учёба, старение
    for (const g of [...c.generals]) {
      if (g.task.type === 'study') {
        const gain = studyGain(g);
        g.exp += gain;
        note(report, c, `Генерал ${g.name} учился: +${gain.toFixed(1)} опыта (теперь ${Math.round(g.exp)})`, true);
      }
      g.age++;
      // Смерть от старости: чем ближе к пределу возраста, тем вероятнее; от болезни — в любом возрасте
      const ra = retireAge(g);
      const oldAge = g.age >= ra || (g.age > ra - 12 && rng.chance((g.age - (ra - 12)) * 0.025));
      const illness = !oldAge && rng.chance(0.012);
      if (oldAge || illness) {
        removeGeneral(c, g);
        ev(`Генерал ${g.name} умер ${oldAge ? 'от старости' : 'от болезни'} в возрасте ${g.age} лет`, false);
      }
    }
  }
}
function checkVictory(s: GameState): void {
  const alive = s.countries.filter((c) => c.alive);
  const top = alive.reduce((a, b) => (b.cells > a.cells ? b : a), alive[0]);
  const st = s.settings;
  if (alive.length <= 1) {
    s.over = true;
    s.winner = top ? top.id : null;
  } else if (st.victory === 'territory' && (top.cells / s.map.landCells) * 100 >= st.territoryPct) {
    s.over = true;
    s.winner = top.id;
  } else if (s.year >= st.maxYears) {
    // Лимит лет действует во всех режимах: побеждает крупнейшая держава
    s.over = true;
    s.winner = top.id;
  }
}

// ───────────────────────────── Разведка ─────────────────────────────

/** Каждый разведчик за год изучает одну страну: точно, примерно — или попадается. */
function runScouts(s: GameState, rng: Rng, report: YearReport): void {
  for (const c of s.countries) {
    if (!c.alive || !c.hasScout || c.scoutTarget == null) continue;
    const t = s.countries[c.scoutTarget];
    if (!t?.alive) {
      c.scoutTarget = null;
      continue;
    }
    const roll = rng.next();
    if (roll < B.scoutCaught) {
      c.hasScout = false;
      c.scoutTarget = null;
      addRel(s, c.id, t.id, -10);
      note(report, c, `Наш разведчик пойман и казнён в государстве ${t.name}`, false);
      note(report, t, `Пойман и казнён разведчик государства ${c.name}`, true);
      continue;
    }
    const full = roll < B.scoutCaught + B.scoutFull;
    const fuzz = (v: number) => (full ? v : v * (0.75 + rng.next() * 0.5)); // примерно ±25%
    const gens = [...t.generals].sort((a, b) => b.exp - a.exp);
    const rep: ScoutReport = {
      by: c.id,
      target: t.id,
      year: s.year,
      quality: full ? 'full' : 'partial',
      soldiers: Math.round(fuzz(t.soldiers) / 100) * 100,
      milLevel: full ? t.science.level[S_MIL] : Math.max(0, t.science.level[S_MIL] + rng.int(-1, 1)),
      generals: (full ? gens : gens.slice(0, 1)).map((g) => ({ exp: Math.round(fuzz(g.exp)), speed: g.speed })),
    };
    s.intel = s.intel.filter((r) => !(r.by === c.id && r.target === t.id));
    s.intel.push(rep);
    const gtext = rep.generals.length ? rep.generals.map((g) => `опыт ${g.exp}`).join(', ') : 'нет';
    note(
      report,
      c,
      `Разведчик ${full ? 'доложил точно' : 'выяснил примерно'} о государстве ${t.name}: солдат ${full ? '' : '≈'}${fmt(rep.soldiers)}, военная мощь ур. ${rep.milLevel}${full ? '' : ' (±1)'}, генералы: ${gtext}`,
      true,
    );
  }
}