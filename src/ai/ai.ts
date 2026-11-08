// Компьютерный противник. Видит только то, что видел бы человек на его месте:
// свою страну точно, соседей — через разведку (estimate), остальное — из новостей (отчёты о сражениях).
import {
  attackFactor,
  B,
  battleLosses,
  captureAmount,
  defendFactor,
  genFactor,
  levelCost,
  maxRecruits,
  milDefAt,
  recruitCost,
  recruitPrice,
  morale,
  retireAge,
  sciMult,
  sciRel,
  studyGain,
} from '../core/balance';
import { econOf, staffRoom } from '../core/econ';
import { defaultOrders } from '../core/game';
import { allianceAgainst, rel, treatyBetween } from '../core/diplomacy';
import { borderDefense, frontFactorGeo, type Geo } from '../core/geo';
import { battleVisible, estimate, type Intel } from '../core/intel';
import { hash01, Rng } from '../core/rng';
import {
  S_AGRI,
  S_DENS,
  S_ECON,
  S_GROW,
  S_MIL,
  S_SCI,
  SCIENCE_COUNT,
  type Difficulty,
  type GameState,
  type General,
  type Orders,
  type PersonalityId,
} from '../core/types';

interface Skill {
  noise: number; // случайные ошибки в оценках
  horizon: number; // горизонт планирования, лет
  opp: number; // оппортунизм: учёт ослабленных соседей
  train: number; // доля свободных генералов, отправляемых учиться
  sciOpt: number; // вероятность оптимального распределения науки
  market: boolean; // придерживает зерно при низкой цене
  samples: number; // число прогонов Монте-Карло
  thrAdj: number; // поправка к требуемой вероятности победы
}

const SKILL: Record<Difficulty, Skill> = {
  easy: { noise: 0.35, horizon: 8, opp: 0.2, train: 0.4, sciOpt: 0.3, market: false, samples: 24, thrAdj: 0.08 },
  normal: { noise: 0.15, horizon: 12, opp: 0.6, train: 0.8, sciOpt: 0.75, market: false, samples: 48, thrAdj: 0.02 },
  hard: { noise: 0.05, horizon: 16, opp: 1.0, train: 1.0, sciOpt: 1, market: true, samples: 64, thrAdj: -0.02 },
  master: { noise: 0, horizon: 20, opp: 1.3, train: 1.0, sciOpt: 1, market: true, samples: 96, thrAdj: -0.04 },
};

interface Persona {
  aggression: number;
  caution: number;
  science: number;
  opportunism: number;
  milShare: number;
  winThr: number;
  sciW: number[];
}

const PERSONA: Record<PersonalityId, Persona> = {
  aggressor: { aggression: 1.4, caution: 0.9, science: 0.85, opportunism: 1.0, milShare: 0.6, winThr: 0.62, sciW: [1, 1, 1, 1, 1.5, 1] },
  scientist: { aggression: 0.8, caution: 1.15, science: 1.4, opportunism: 0.8, milShare: 0.38, winThr: 0.78, sciW: [1, 1, 1, 1, 0.9, 1.3] },
  merchant: { aggression: 0.85, caution: 1.1, science: 1.1, opportunism: 0.9, milShare: 0.4, winThr: 0.75, sciW: [1.4, 1.2, 1, 1, 0.9, 1] },
  cunning: { aggression: 1.05, caution: 1.0, science: 1.0, opportunism: 1.7, milShare: 0.48, winThr: 0.7, sciW: [1, 1, 1, 1, 1.1, 1] },
  balanced: { aggression: 1.0, caution: 1.0, science: 1.0, opportunism: 1.0, milShare: 0.48, winThr: 0.7, sciW: [1, 1, 1, 1, 1, 1] },
};

export const PERSONALITY_NAMES: Record<PersonalityId, string> = {
  aggressor: 'Агрессор',
  scientist: 'Учёный',
  merchant: 'Торговец',
  cunning: 'Хитрец',
  balanced: 'Уравновешенный',
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function inc(m: Map<number, number>, k: number, v: number): void {
  m.set(k, (m.get(k) ?? 0) + v);
}

interface Candidate {
  target: number;
  gen: General;
  soldiers: number;
  ev: number;
  p: number;
}

export function aiOrders(state: GameState, id: number, geo: Geo): Orders {
  const c = state.countries[id];
  const o = defaultOrders(c);
  if (!c.alive) return o;

  const sk = SKILL[state.settings.difficulty];
  const ps = PERSONA[c.personality];
  const rng = new Rng(Math.floor(hash01(state.settings.seed, state.year, id, 4242) * 4294967296));
  const jit = () => 1 + (rng.next() * 2 - 1) * sk.noise;
  const cpc = state.cellsPerCountry;
  const H = sk.horizon;
  const econ = econOf(state, geo, c);
  const price = state.market.price;
  const econM = sciMult(c, S_ECON);
  const pop = Math.max(1, c.population);
  // Годовой доход: деньги с крестьян плюс продажа излишков зерна (или минус докупка)
  const grainBalance = econ.surplus > 0 ? econ.surplus * price : econ.surplus * price * B.buyMarkup;
  const incomeNow = Math.max(1, econ.taxes + grainBalance);
  // Цена солдата растёт с размером армии — потери большой армии обходятся дороже
  const soldierPrice = recruitPrice('soldier', c.soldiers, pop);
  const soldierValue = soldierPrice + B.soldierUpkeep * 2;

  // ── Новости последних лет ──
  const attacksBy = new Map<number, number>();
  const attackedLastYear = new Map<number, number>();
  const grudge = new Map<number, number>();
  let attackedRecently = false;
  const myNbs = geo.neighbors[id];
  for (const rep of state.reports) {
    const age = state.year - 1 - rep.year;
    for (const b of rep.battles) {
      if (!battleVisible(id, myNbs, b.attacker, b.defender)) continue;
      if (age < 3) inc(attacksBy, b.attacker, 1);
      if (age === 0 && b.attacker !== id) inc(attackedLastYear, b.defender, 1);
      if (b.defender === id && age < 10) {
        inc(grudge, b.attacker, Math.pow(0.8, age));
        if (age < 2) attackedRecently = true;
      }
      if (b.attacker === id && age < 2) attackedRecently = true;
    }
  }

  const aliveCount = state.countries.filter((x) => x.alive).length;
  const avgCells = state.map.landCells / aliveCount;
  const leaderF = (t: number) => Math.max(0, state.countries[t].cells / avgCells - 1.4) * 0.5;

  const nbs = geo.neighbors[id].filter((n) => state.countries[n].alive);
  const intel = new Map<number, Intel>();
  for (const n of nbs) intel.set(n, estimate(state, id, n, true));

  // ── Угрозы ──
  const generals = [...c.generals];
  const defGen = generals.reduce<General | null>((a, g) => (!a || defendFactor(g) > defendFactor(a) ? g : a), null);
  const myMil = sciMult(c, S_MIL);
  const myMorale = morale(c.happiness);
  const myDefPer = (n: number) =>
    milDefAt(c.science.level[S_MIL]) * frontFactorGeo(geo, n, id) * defendFactor(defGen) * borderDefense(geo, n, id) * myMorale;
  // Затишье: давно не воевали и казна полна — пора рискнуть
  let lastWar = 99;
  for (const rep of state.reports)
    for (const b of rep.battles) if (b.attacker === id || b.defender === id) lastWar = Math.min(lastWar, state.year - 1 - rep.year);
  const stagnation = clamp((lastWar - 4) / 8, 0, 1) * clamp(c.money / Math.max(1, incomeNow * 5), 0, 1) * sk.opp;

  const threat = new Map<number, number>();
  for (const n of nbs) {
    const it = intel.get(n)!;
    // Соседу тоже надо стеречь свои границы: чем у него больше соседей, тем меньшую часть армии он бросит на нас
    const theirFronts = geo.neighbors[n].filter((x) => state.countries[x].alive).length;
    const commit = 0.85 / Math.sqrt(Math.max(1, theirFronts));
    const strike = it.soldiers * commit * (1 + 0.1 * it.levels[S_MIL]) * genFactor(it.bestExp) * morale(it.happiness);
    const hostility =
      clamp(0.45 + 0.12 * (attacksBy.get(n) ?? 0) + 0.35 * Math.min(2, grudge.get(n) ?? 0) + 0.3 * leaderF(n), 0.3, 1.3) *
      ps.caution *
      (treatyBetween(state, id, n) ? 0.3 : 1) *
      (1 + Math.max(0, -rel(state, id, n)) / 250);
    threat.set(n, (strike / myDefPer(n)) * hostility * jit());
  }
  const defNeedExcl = (excl: Set<number>) => {
    const arr = nbs.filter((n) => !excl.has(n)).map((n) => threat.get(n)!).sort((a, b) => b - a);
    return (arr[0] ?? 0) * 1.05 + (arr[1] ?? 0) * 0.35 * ps.caution + (arr[2] ?? 0) * 0.1;
  };
  // Пока длится перемирие, армия не нужна — копим её за 2–3 года до конца мира
  const truceLeft = (state.settings.truceYears ?? 0) - state.year;
  const peaceful = truceLeft > 3;
  const defNeed = Math.max(peaceful ? 0 : defNeedExcl(new Set()), pop * 0.012);

  // ── Оценка целей ──
  const S = sk.samples;
  const u1: number[] = [];
  const u2: number[] = [];
  const u3: number[] = [];
  for (let j = 0; j < S; j++) {
    u1.push(rng.next() * 2 - 1);
    u2.push(rng.next() * 2 - 1);
    u3.push(rng.next() * 2 - 1);
  }
  const R = B.battleRand;
  const winProb = (per: number, s: number, D: number, err: number) => {
    let w = 0;
    for (let j = 0; j < S; j++) if (s * per * (1 + u1[j] * R) > D * (1 + u2[j] * err) * (1 + u3[j] * R)) w++;
    return w / S;
  };
  // Конец игры: держав мало — меньше страховки дома, больше риска (решительно добиваем)
  const endgame = clamp((9 - aliveCount) / 7, 0, 1) * sk.opp;
  const boldness = 1 + 0.6 * endgame;
  const thr = clamp(ps.winThr + sk.thrAdj - 0.12 * stagnation - 0.12 * endgame, 0.45, 0.93);
  const cellValue = (incomeNow / Math.max(1, c.cells)) * H * 0.6;
  const elimCells = Math.max(3, Math.round(cpc * B.elimFrac));

  const attackGens = generals
    .filter((g) => g !== defGen || generals.length === 1)
    .sort((a, b) => attackFactor(b) * (1 + 0.04 * b.speed) - attackFactor(a) * (1 + 0.04 * a.speed))
    .slice(0, 4);
  const loneGeneral = generals.length === 1;
  const homeNeedFor = (excl: Set<number>) =>
    defNeedExcl(excl) * Math.max(0.35, 1 - 0.3 * stagnation - 0.35 * endgame) * (loneGeneral && defGen ? defendFactor(defGen) / B.noGeneral : 1);

  interface Target {
    t: number;
    D: number;
    err: number;
  }
  const targets: Target[] = nbs.map((t) => {
    const it = intel.get(t)!;
    const bd = borderDefense(geo, id, t);
    const tDefPer =
      milDefAt(it.levels[S_MIL]) *
      (it.generals > 0 ? genFactor(it.bestExp) : B.noGeneral) *
      bd *
      morale(it.happiness);
    const outFrac = Math.min(0.4, 0.1 * (attacksBy.get(t) ?? 0)) * sk.opp;
    const jackal = Math.min(3, attackedLastYear.get(t) ?? 0);
    const poolF = Math.max(0.5, 1 - outFrac * 0.6 - 0.08 * jackal * ps.opportunism * sk.opp);
    const allied = allianceAgainst(state, id, t) ? 0.7 : 1;
    const D = (it.soldiers * poolF * allied * frontFactorGeo(geo, id, t) + it.population * 0.002) * tDefPer;
    return { t, D, err: it.err };
  });

  const evalAttack = (tg: Target, g: General, s: number, damageW = 0.3, cellsNow?: number) => {
    const it = intel.get(tg.t)!;
    const tc = state.countries[tg.t];
    const per = myMil * attackFactor(g) * myMorale;
    const p = winProb(per, s, tg.D, tg.err);
    const ratio = Math.max(0.01, (s * per) / tg.D);
    const rr = Math.min(ratio, 1 / ratio);
    const tCells = Math.max(1, cellsNow ?? tc.cells);
    const lw = battleLosses(rr);
    const survivors = s * (1 - lw.win);
    const cells = captureAmount(cpc, tCells, g, ratio, 0.5, survivors, it.population / Math.max(1, tc.cells));
    const lossFrac = p * lw.win + (1 - p) * lw.lose;
    const lossCost = s * lossFrac * soldierValue;
    // Уничтожение соседа: забираем всё и избавляемся от угрозы навсегда
    const elimBonus = tCells - cells <= elimCells ? tCells * cellValue + it.money * 0.5 + (threat.get(tg.t) ?? 0) * soldierValue : 0;
    const gain =
      cells * cellValue * (1 + leaderF(tg.t)) * (1 + 0.3 * Math.min(2, grudge.get(tg.t) ?? 0)) + elimBonus;
    // Ожидаемые потери противника: при нашей победе он теряет больше, при поражении — меньше
    const damage = it.soldiers * (p * lw.lose + (1 - p) * lw.win) * soldierValue * damageW;
    // Дипломатия: враждебных бьём охотнее, друзей — неохотно; предательство дорого стоит,
    // обещанный союзнику поход надо выполнить
    const r = rel(state, id, tg.t);
    const relF = 1 + Math.max(0, -r) / 200 - Math.max(0, r) / 300;
    const treaty = treatyBetween(state, id, tg.t);
    // В концовке, когда держав мало, честь значит меньше — победа важнее
    const betrayCost = treaty ? incomeNow * (ps.opportunism >= 1.5 ? 1.5 : ps.aggression >= 1.3 ? 2.5 : 6) * (1 - 0.7 * endgame) : 0;
    const promise = allianceAgainst(state, id, tg.t) && p >= 0.3 ? incomeNow * 0.5 : 0;
    return { p, ev: ((p * gain + damage) * relF - lossCost - betrayCost + promise) * ps.aggression * boldness * jit() };
  };

  /** Минимальная армия, побеждающая с вероятностью ≥ thr, или -1. */
  const minArmy = (tg: Target, g: General, maxS: number) => {
    const per = myMil * attackFactor(g) * myMorale;
    if (maxS <= 0 || winProb(per, maxS, tg.D, tg.err) < thr) return -1;
    let lo = 0;
    let hi = maxS;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      if (winProb(per, mid, tg.D, tg.err) >= thr) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  // План войны: какую армию нужно иметь, чтобы выгодно ударить по лучшей цели
  let planNeed = 0;
  if (attackGens.length) {
    let bestScore = 0;
    const g = attackGens[0];
    for (const tg of targets) {
      const s = minArmy(tg, g, c.soldiers * 4 + pop * 0.05);
      if (s < 0) continue;
      const army = s * 1.15;
      const { ev } = evalAttack(tg, g, army);
      if (ev <= 0) continue;
      const need = army + homeNeedFor(new Set([tg.t]));
      const score = ev / need;
      if (score > bestScore) {
        bestScore = score;
        planNeed = need;
      }
    }
  }

  if (peaceful) planNeed = 0;

  // ── Бюджет ──
  const cashMargin = econ.upkeep * 0.1;
  let budget = c.money + econ.taxes + grainBalance - econ.upkeep - cashMargin;
  // Нельзя забрать с полей столько людей, что не хватит зерна; богатая страна может позволить себе докупать
  const buyAllowance = Math.max(0, c.money - econ.upkeep * 2) / (price * B.buyMarkup * H);
  let room = Math.max(0, Math.min(staffRoom(c), econ.foodRoom + buyAllowance));
  let hiredS = 0;
  let hiredSci = 0;

  // Найм с нелинейной ценой: учитываем цену найма и жалованье первого года
  const hireSoldiers = (want: number, share: number) => {
    if (want <= 0 || budget <= 0) return 0;
    const have = c.soldiers + hiredS;
    const n = Math.floor(Math.min(want, room, maxRecruits('soldier', have, pop, budget * share, B.soldierUpkeep)));
    if (n <= 0) return 0;
    budget -= recruitCost('soldier', have, pop, n) + n * B.soldierUpkeep;
    room -= n;
    return n;
  };
  const hireScientists = (want: number, money: number) => {
    if (want <= 0 || money <= 0) return 0;
    const have = c.scientists + hiredSci;
    const n = Math.floor(Math.min(want, room, maxRecruits('scientist', have, pop, money, B.sciUpkeep)));
    if (n <= 0) return 0;
    budget -= recruitCost('scientist', have, pop, n) + n * B.sciUpkeep;
    room -= n;
    hiredSci += n;
    return n;
  };

  const savings = Math.max(0, c.money - econ.upkeep) / H;
  const maxSustain =
    Math.max(0, (incomeNow + savings) * ps.milShare * (attackedRecently ? 1.25 : 1) - econ.upkeepGenerals) / B.soldierUpkeep;

  // 1. Оборона — в первую очередь
  hiredS += hireSoldiers(defNeed - c.soldiers, 0.9);

  // 2. Минимум генералов
  const buyGeneral = () => {
    const offers = c.offers.filter((x) => !o.buyOffers.includes(x.id));
    if (!offers.length || c.generals.length + o.buyOffers.length >= B.maxGenerals) return false;
    const score = (g: General) => {
      const years = clamp(retireAge(g) - g.age - 2, 0, 10);
      const future = g.exp + studyGain(g) * years * 0.5 * sk.train;
      let sc = genFactor(future) * (1 + 0.05 * g.speed);
      return sc;
    };
    const best = offers.reduce((a, b) => (score(b) / b.price > score(a) / a.price ? b : a));
    const cost = best.price + B.genUpkeep;
    if (budget < cost) return false;
    budget -= cost;
    o.buyOffers.push(best.id);
    o.tasks[best.id] = rng.next() < sk.train ? { type: 'study' } : { type: 'defend' };
    return true;
  };
  if (c.generals.length < 2) buyGeneral();

  // 3. Наука и 4. Армия под план — порядок зависит от характера
  const doScience = () => {
    const rel = (i: number) => sciRel(c, i);
    const perCapita = incomeNow / pop;
    const popRatio = c.population / Math.max(1, econ.maxPop);
    const v = new Array(SCIENCE_COUNT).fill(0);
    v[S_ECON] = rel(S_ECON) * incomeNow;
    v[S_AGRI] = rel(S_AGRI) * econ.harvest * price * econM;
    v[S_DENS] = rel(S_DENS) * econ.maxPop * perCapita * clamp((popRatio - 0.55) / 0.4, 0, 1) * 0.5;
    v[S_GROW] = rel(S_GROW) * Math.max(0, econ.growth) * perCapita * 6 * (popRatio < 0.92 ? 1 : 0.2);
    const milNeed = 0.6 + 0.4 * ps.aggression + (attackedRecently ? 0.5 : 0);
    v[S_MIL] = rel(S_MIL) * c.soldiers * (B.soldierUpkeep + soldierPrice * 0.25) * milNeed;
    v[S_SCI] = rel(S_SCI) * c.scientists * B.sciUpkeep * 1.1;
    const vpp = v.map(
      (x, i) => (x * ps.sciW[i] * H * jit()) / Math.max(1, levelCost(c.science.level[i], cpc) - c.science.progress[i]),
    );

    let w: number[];
    if (rng.next() < sk.sciOpt) w = vpp.map((x) => x * x);
    else w = vpp.map((x) => Math.sqrt(Math.max(0, x)) + 0.3 * (rng.next() + 0.1));
    const total = w.reduce((a, b) => a + b, 0) || 1;
    let alloc = w.map((x) => (x * 100) / total);
    alloc = alloc.map((x) => (x < 3 ? 0 : x));
    const s2 = alloc.reduce((a, b) => a + b, 0) || 1;
    o.scienceAlloc = alloc.map((x) => Math.round((x * 100) / s2));

    const vppAvg = vpp.reduce((a, x, i) => a + (x * o.scienceAlloc[i]) / 100, 0);
    const ptsPer = B.ptsPerSci * sciMult(c, S_SCI);
    const sciValue = ptsPer * vppAvg * H * 0.4 * ps.science;
    const sciCost = recruitPrice('scientist', c.scientists, pop) + B.sciUpkeep * H;
    if (sciValue > sciCost * 1.1) {
      const want = Math.min(c.scientists * 0.15 + pop * 0.003, pop * 0.12 - c.scientists);
      const n = hireScientists(want, Math.max(0, budget) * 0.45 * ps.science);
      if (n > 0) o.hireScientists = n;
    } else if (sciValue < sciCost * 0.5 && sk.noise < 0.2) {
      o.hireScientists = -Math.floor(c.scientists * 0.1);
    }
  };
  const doArmy = () => {
    const desired = Math.min(Math.max(planNeed, defNeed), Math.max(defNeed, maxSustain));
    hiredS += hireSoldiers(desired - c.soldiers - hiredS, ps.aggression > 1.2 ? 0.8 : 0.6);
  };
  if (ps.aggression > 1.2) {
    doArmy();
    doScience();
  } else {
    doScience();
    doArmy();
  }

  // Роспуск лишней армии в мирное время
  if (!attackedRecently && hiredS === 0 && sk.noise < 0.2) {
    const desired = Math.max(defNeed, planNeed) * 1.4;
    if (c.soldiers > desired && c.soldiers > maxSustain) o.hireSoldiers = -Math.floor((c.soldiers - desired) * 0.5);
  }
  if (hiredS > 0) o.hireSoldiers = hiredS;

  // 6. Дополнительные генералы
  const desiredGens = 2 + (ps.aggression > 1.2 ? 1 : 0) + (H >= 16 ? 1 : 0);
  if (c.generals.length + o.buyOffers.length < desiredGens && budget > 0) buyGeneral();

  // 7. Деньги не должны лежать мёртвым грузом: излишки — в армию (до порога недовольства) и науку
  if (sk.noise < 0.3 && budget > incomeNow * 1.5) {
    const spare = budget - incomeNow * 1.5;
    const rich = Math.min(1, budget / Math.max(1, incomeNow * 8));
    const milCap = pop * (0.15 + 0.05 * (ps.aggression - 1) + 0.2 * rich) - c.soldiers - hiredS;
    const sciCap = pop * 0.12 - c.scientists - Math.max(0, o.hireScientists);
    const sciShare = 0.35 * ps.science;
    const ns = hireScientists(sciCap, spare * sciShare);
    if (ns > 0) o.hireScientists = Math.max(0, o.hireScientists) + ns;
    const nm = hireSoldiers(milCap, Math.min(1, (spare * (1 - sciShare)) / Math.max(1, budget)));
    if (nm > 0) {
      if (o.hireSoldiers < 0) o.hireSoldiers = 0;
      o.hireSoldiers += nm;
      hiredS += nm;
    }
    if (c.generals.length + o.buyOffers.length < B.maxGenerals - 2) buyGeneral();
  }

  // ── Наступление ──
  // Новобранцы прибудут только к концу года — воюем тем, что есть.
  // Атаки выбираются по одной: после каждой учитываем, насколько ослабнет оборона цели,
  // поэтому на слабеющую страну можно бросить ещё армию — так её добивают за год.
  const usedGen = new Set<number>();
  const attacksOn = new Map<number, number>();
  const curD = new Map(targets.map((tg) => [tg.t, tg.D]));
  const curCells = new Map(targets.map((tg) => [tg.t, state.countries[tg.t].cells]));
  let sent = 0;
  for (let round = 0; round < attackGens.length; round++) {
    let best: Candidate | null = null;
    for (const g of attackGens) {
      if (usedGen.has(g.id)) continue;
      for (const base of targets) {
        if ((attacksOn.get(base.t) ?? 0) >= 3) continue;
        const tg: Target = { ...base, D: curD.get(base.t)! };
        const excl = new Set([...attacksOn.keys(), tg.t]);
        const maxSend = c.soldiers - sent - homeNeedFor(excl) * 0.9;
        if (maxSend <= 0) continue;
        const sMin = minArmy(tg, g, maxSend);
        let cand: Candidate | null = null;
        if (sMin < 0) {
          // Война на истощение: при экономическом перевесе выгодно размениваться солдатами
          const econEdge = c.population / Math.max(1, intel.get(tg.t)!.population);
          if ((stagnation > 0.3 || endgame > 0.5) && econEdge > 1.2 && maxSend > c.soldiers * 0.2) {
            const s = Math.floor(maxSend * 0.9);
            const { p, ev } = evalAttack(tg, g, s, Math.min(2, econEdge * 0.8), curCells.get(tg.t));
            cand = { target: tg.t, gen: g, soldiers: s, ev: ev * 0.5, p };
          }
        } else {
          for (const k of [1.1, 1.35, 1.7, 2.2, 3]) {
            const s = Math.min(maxSend, sMin * k);
            const { p, ev } = evalAttack(tg, g, s, 0.3, curCells.get(tg.t));
            if (!cand || ev > cand.ev) cand = { target: tg.t, gen: g, soldiers: Math.floor(s), ev, p };
          }
        }
        // Повторная атака на ту же цель ценна, только если её реально можно сломить
        if (cand && (attacksOn.get(tg.t) ?? 0) > 0 && cand.p < thr) cand = null;
        if (cand && (!best || cand.ev > best.ev)) best = cand;
      }
    }
    if (!best || best.ev <= 0) break;
    o.tasks[best.gen.id] = { type: 'attack', target: best.target, soldiers: best.soldiers };
    sent += best.soldiers;
    usedGen.add(best.gen.id);
    attacksOn.set(best.target, (attacksOn.get(best.target) ?? 0) + 1);
    // Ожидаемое ослабление цели после этого боя
    const D = curD.get(best.target)!;
    const per = myMil * attackFactor(best.gen) * myMorale;
    const ratio = Math.max(0.01, (best.soldiers * per) / D);
    const lw = battleLosses(Math.min(ratio, 1 / ratio));
    curD.set(best.target, D * (1 - (best.p * lw.lose + (1 - best.p) * lw.win)));
    const tc = state.countries[best.target];
    const surv = best.soldiers * (1 - lw.win);
    curCells.set(best.target, curCells.get(best.target)! - best.p * captureAmount(cpc, tc.cells, best.gen, ratio, 0.5, surv, tc.population / Math.max(1, tc.cells)));
  }
  // ── Остальные генералы: оборона и учёба ──
  for (const g of generals) {
    if (usedGen.has(g.id)) continue;
    if (g === defGen) o.tasks[g.id] = { type: 'defend' };
    else o.tasks[g.id] = rng.next() < sk.train && g.exp < 160 ? { type: 'study' } : { type: 'defend' };
  }

  return o;
}

/** Приказы всех компьютерных стран. */
export function allAiOrders(state: GameState, geo: Geo): Record<number, Orders> {
  const res: Record<number, Orders> = {};
  for (const c of state.countries) if (c.alive && c.controller === 'ai') res[c.id] = aiOrders(state, c.id, geo);
  return res;
}
