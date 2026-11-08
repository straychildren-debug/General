// Дипломатия компьютера: ответы на предложения, собственные предложения игрокам,
// договоры компьютеров между собой. Всё — по тем же сведениям, что видит игрок.
import {
  attackFactor,
  B,
  battleLosses,
  captureAmount,
  genFactor,
  milDefAt,
  morale,
  recruitPrice,
  sciMult,
} from '../core/balance';
import { applyDeal, disgraced, ensureDiplomacy, rel, treatyBetween } from '../core/diplomacy';
import { econOf } from '../core/econ';
import { fmtShort } from '../core/format';
import { areNeighbors, borderDefense, computeGeo, frontFactorGeo, type Geo } from '../core/geo';
import { estimate } from '../core/intel';
import { hash01, Rng } from '../core/rng';
import { S_MIL, type Deal, type GameState } from '../core/types';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function annualIncome(state: GameState, geo: Geo, id: number): number {
  const c = state.countries[id];
  const e = econOf(state, geo, c);
  return Math.max(1, e.taxes + Math.max(0, e.surplus) * state.market.price);
}

/**
 * Насколько стране a выгодно напасть на t прямо сейчас (оценка «в деньгах» за год).
 * helpMult < 1 — если на t одновременно нападает союзник.
 */
export function attackOpportunity(state: GameState, geo: Geo, a: number, t: number, helpMult = 1): { ev: number; p: number; ratio: number } {
  const c = state.countries[a];
  const tc = state.countries[t];
  if (!c?.alive || !tc?.alive || !areNeighbors(geo, a, t)) return { ev: 0, p: 0, ratio: 0 };
  const g = c.generals.reduce<(typeof c.generals)[number] | null>((x, y) => (!x || attackFactor(y) > attackFactor(x) ? y : x), null);
  if (!g) return { ev: 0, p: 0, ratio: 0 };
  const it = estimate(state, a, t, geo);
  const D =
    (it.soldiers * frontFactorGeo(geo, a, t) * helpMult + it.population * 0.002) *
    milDefAt(it.levels[S_MIL]) *
    (it.generals > 0 ? genFactor(it.bestExp) : B.noGeneral) *
    borderDefense(geo, a, t);
  const s = c.soldiers * 0.7;
  const A = s * sciMult(c, S_MIL) * attackFactor(g) * morale(c.happiness);
  const ratio = A / Math.max(1, D);
  const p = clamp(0.5 + (ratio - 1) / (2 * (0.12 + it.err)), 0, 1);
  const income = annualIncome(state, geo, a);
  const cellValue = (income / Math.max(1, c.cells)) * 10;
  const lw = battleLosses(Math.min(ratio, 1 / Math.max(0.01, ratio)));
  const cells = captureAmount(state.cellsPerCountry, tc.cells, g, ratio, 0.5, s * (1 - lw.win), it.population / Math.max(1, tc.cells));
  const soldierValue = recruitPrice('soldier', c.soldiers, c.population) + B.soldierUpkeep * 2;
  const lossCost = s * (p * lw.win + (1 - p) * lw.lose) * soldierValue;
  return { ev: p * cells * cellValue - lossCost, p, ratio };
}

export interface DealAnswer {
  accept: boolean;
  text: string;
  counter?: Deal; // «согласны, если…»
}

const round1000 = (x: number) => Math.max(1000, Math.ceil(x / 1000) * 1000);

/** Ответ компьютера (страна d.to) на предложение страны d.from. */
export function aiEvaluateDeal(state: GameState, geo: Geo, d: Deal): DealAnswer {
  const ai = d.to;
  const P = d.from;
  const me = state.countries[ai];
  if (!me?.alive) return { accept: false, text: 'Этой страны больше нет.' };
  if (d.kind !== 'gift' && disgraced(state, P))
    return { accept: false, text: 'После вашего предательства с вами не хотят иметь дела.' };
  const r = rel(state, ai, P);
  const income = annualIncome(state, geo, ai);
  const yrs = clamp(d.years, 1, 10);
  const paidIn = d.payer === P ? d.once + d.yearly * yrs : 0;
  const paidOut = d.payer === ai ? d.once + d.yearly * yrs : 0;
  const aggr = me.personality === 'aggressor' ? 1.4 : me.personality === 'cunning' ? 1.15 : me.personality === 'merchant' ? 0.8 : 1;

  if (d.kind === 'gift') return { accept: true, text: 'Благодарим за подарок!' };

  if (d.kind === 'peace') {
    if (treatyBetween(state, ai, P)?.kind === 'peace') return { accept: false, text: 'У нас с вами уже есть мир.' };
    const aliveCount = state.countries.filter((c) => c.alive).length;
    const leader = state.countries[P].cells > (state.map.landCells / aliveCount) * 1.6 ? 1.5 : 1;
    const my = Math.max(0, attackOpportunity(state, geo, ai, P).ev);
    const their = Math.max(0, attackOpportunity(state, geo, P, ai).ev);
    const span = Math.min(yrs, 5);
    const lost = my * span * 0.6 * leader * aggr;
    const safety = their * span * 0.5 + income * 0.08 * span;
    const value = paidIn - paidOut + safety + (r / 100) * income * 0.6 - lost;
    if (value >= 0) return { accept: true, text: d.payer === P ? 'Согласны. Мир скреплён!' : 'Согласны на мир.' };
    if (d.payer === ai) return { accept: false, text: 'Платить вам мы не согласны.' };
    const need = round1000(-value * 1.1);
    return {
      accept: false,
      text: `Мир вам нужнее, чем нам. Согласны, если заплатите ${fmtShort(need)}`,
      counter: { ...d, payer: P, once: (d.payer === P ? d.once : 0) + need },
    };
  }

  // Совместный поход
  if (state.year <= (state.settings.truceYears ?? 0)) return { accept: false, text: 'Пока всеобщий мир — воевать нельзя никому.' };
  const T = d.target;
  if (T == null || !state.countries[T]?.alive) return { accept: false, text: 'Такой цели нет.' };
  if (!areNeighbors(geo, ai, T)) return { accept: false, text: `У нас нет общей границы с государством ${state.countries[T].name}.` };
  if (treatyBetween(state, ai, T)) return { accept: false, text: `У нас договор с государством ${state.countries[T].name}.` };
  if (r < -30) return { accept: false, text: 'Мы вам не доверяем.' };
  const opp = attackOpportunity(state, geo, ai, T, 0.65);
  const value = opp.ev + paidIn - paidOut + (r / 100) * income * 0.3 - (opp.p < 0.35 ? income * 0.4 : 0);
  if (value > 0) return { accept: true, text: `Согласны! В этом году вместе выступим против государства ${state.countries[T].name}.` };
  const need = round1000(-value * 1.1);
  return {
    accept: false,
    text: `Нам этот поход невыгоден. Выступим, если заплатите ${fmtShort(need)}`,
    counter: { ...d, payer: P, once: (d.payer === P ? d.once : 0) + need },
  };
}

/**
 * После обработки года: предложения компьютеров игрокам (на новый год)
 * и договоры компьютеров между собой.
 */
export function aiDiplomacy(prev: GameState): GameState {
  const s = ensureDiplomacy(structuredClone(prev));
  if (s.over) return s;
  if (s.year <= (s.settings.truceYears ?? 0)) return s; // пока всеобщий мир, договариваться не о чем
  const geo = computeGeo(s);
  const rng = new Rng(Math.floor(hash01(s.settings.seed, s.year, 9191) * 4294967296));
  const alive = s.countries.filter((c) => c.alive);
  const offer = (d: Omit<Deal, 'id' | 'year'>) => s.offers.push({ ...d, id: s.nextDealId++, year: s.year });

  const avgCells = s.map.landCells / alive.length;
  // ── Предложения людям ──
  for (const h of alive.filter((c) => c.controller === 'human')) {
    let count = 0;
    // Сильному игроку мир не дарят: соседи скорее объединятся против него
    const hLeads = h.cells > avgCells * 1.5;
    for (const aiId of geo.neighbors[h.id]) {
      const ai = s.countries[aiId];
      if (!ai.alive || ai.controller !== 'ai' || count >= 2 || disgraced(s, aiId)) continue;
      if (treatyBetween(s, aiId, h.id)) continue;
      const my = attackOpportunity(s, geo, aiId, h.id);
      const their = attackOpportunity(s, geo, h.id, aiId);
      const income = annualIncome(s, geo, aiId);
      const r = rel(s, aiId, h.id);
      if (my.ev > income * 0.3 && my.p > 0.6 && r < 20 && rng.chance(ai.personality === 'aggressor' ? 0.5 : 0.3)) {
        // Ультиматум: плати дань — или нападём
        const hIncome = annualIncome(s, geo, h.id);
        const yearly = round1000(Math.min(my.ev * 0.4, hIncome * 0.3));
        offer({ from: aiId, to: h.id, kind: 'peace', years: 5, payer: h.id, once: 0, yearly, target: null, ultimatum: true });
        count++;
      } else if (!hLeads && !disgraced(s, h.id) && their.ev > income * 0.25 && their.p > 0.5 && my.ev <= 0 && rng.chance(0.35)) {
        // Боится нас — предлагает мир (изредка с небольшим подарком)
        const once = their.p > 0.85 && rng.chance(0.4) ? round1000(Math.min(their.ev * 0.1, income * 0.15)) : 0;
        offer({ from: aiId, to: h.id, kind: 'peace', years: 5, payer: once > 0 ? aiId : null, once, yearly: 0, target: null, ultimatum: false });
        count++;
      } else if (!hLeads && !disgraced(s, h.id) && r >= -10 && rng.chance(0.25)) {
        // Совместный поход на общего соседа
        let bestT = -1;
        let bestEv = 0;
        for (const T of geo.neighbors[aiId]) {
          if (T === h.id || !s.countries[T].alive || !geo.neighbors[h.id].includes(T)) continue;
          if (treatyBetween(s, aiId, T) || treatyBetween(s, h.id, T)) continue;
          const o = attackOpportunity(s, geo, aiId, T, 0.65);
          if (o.ev > bestEv) {
            bestEv = o.ev;
            bestT = T;
          }
        }
        if (bestT >= 0) {
          offer({ from: aiId, to: h.id, kind: 'alliance', years: 1, payer: null, once: 0, yearly: 0, target: bestT, ultimatum: false });
          count++;
        }
      }
    }
  }

  // ── Компьютеры между собой ──
  const ais = alive.filter((c) => c.controller === 'ai' && !disgraced(s, c.id));
  const avg = s.map.landCells / alive.length;
  const leader = alive.reduce((a, b) => (b.cells > a.cells ? b : a), alive[0]);
  // Коалиция против лидера: чем он больше, тем охотнее соседи объединяются — даже если поодиночке
  // нападать невыгодно, вдвоём у них есть шанс
  if (leader && leader.cells > avg * 1.5 && alive.length > 3) {
    const share = leader.cells / avg;
    const around = ais.filter((c) => c.id !== leader.id && areNeighbors(geo, c.id, leader.id) && !treatyBetween(s, c.id, leader.id));
    let made = 0;
    const maxPairs = share > 2.5 ? 5 : 3;
    for (let i = 0; i < around.length && made < maxPairs; i++) {
      for (let j = i + 1; j < around.length && made < maxPairs; j++) {
        const a = around[i].id;
        const b = around[j].id;
        if (treatyBetween(s, a, b) || rel(s, a, b) < -30 || !rng.chance(Math.min(0.85, 0.35 + 0.15 * share))) continue;
        const oa = attackOpportunity(s, geo, a, leader.id, 0.55);
        const ob = attackOpportunity(s, geo, b, leader.id, 0.55);
        if (share < 2.2 ? oa.ev <= 0 || ob.ev <= 0 : Math.max(oa.p, ob.p) < 0.25) continue;
        if (applyDeal(s, { id: 0, from: a, to: b, kind: 'alliance', years: 1, payer: null, once: 0, yearly: 0, target: leader.id, ultimatum: false, year: s.year })) made++;
      }
    }
  }
  // Мир между соседями, которым воевать друг с другом невыгодно, а кругом враги
  const lastRep = s.reports[s.reports.length - 1];
  const busy = new Set(lastRep ? lastRep.battles.map((b) => b.defender) : []);
  for (const a of alive.length > 5 ? ais : []) {
    for (const bId of geo.neighbors[a.id]) {
      if (bId <= a.id) continue;
      const b = s.countries[bId];
      if (!b.alive || b.controller !== 'ai' || disgraced(s, bId) || treatyBetween(s, a.id, bId)) continue;
      if (!(busy.has(a.id) || busy.has(bId)) || !rng.chance(0.25)) continue;
      if (attackOpportunity(s, geo, a.id, bId).ev > 0 || attackOpportunity(s, geo, bId, a.id).ev > 0) continue;
      applyDeal(s, { id: 0, from: a.id, to: bId, kind: 'peace', years: 5, payer: null, once: 0, yearly: 0, target: null, ultimatum: false, year: s.year });
    }
  }
  return s;
}
