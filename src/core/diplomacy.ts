// Дипломатия: договоры, отношения между странами и честь.
import { fmtShort, years as yearsText } from './format';
import type { Deal, GameState, Orders, Treaty, YearReport } from './types';

export const DIP = {
  betrayHonor: 70, // потеря чести за нападение на партнёра по договору (100 → 30: ~10 лет опалы)
  unpaidHonor: 20, // за неуплату дани
  honorRegen: 2, // восстановление чести в год
  minHonor: 50, // ниже — с вами никто не договаривается
  betrayRelVictim: 80,
  betrayRelOthers: 15,
  attackRel: 25, // нападение портит отношения
  peaceRelPerYear: 3,
  drift: 0.92, // отношения понемногу возвращаются к нейтральным
};

/** Достраивает поля дипломатии в старых сохранениях. */
export function ensureDiplomacy(s: GameState): GameState {
  const n = s.countries.length;
  s.treaties ??= [];
  s.offers ??= [];
  if (!s.relations || s.relations.length !== n * n) s.relations = new Array(n * n).fill(0);
  if (!s.honor || s.honor.length !== n) s.honor = new Array(n).fill(100);
  s.nextDealId ??= 1;
  return s;
}

export function rel(s: GameState, a: number, b: number): number {
  return s.relations?.[a * s.countries.length + b] ?? 0;
}

export function addRel(s: GameState, a: number, b: number, d: number): void {
  if (a === b) return;
  const n = s.countries.length;
  const v = Math.max(-100, Math.min(100, rel(s, a, b) + d));
  s.relations[a * n + b] = v;
  s.relations[b * n + a] = v;
}

export function honorOf(s: GameState, id: number): number {
  return s.honor?.[id] ?? 100;
}

export function disgraced(s: GameState, id: number): boolean {
  return honorOf(s, id) < DIP.minHonor;
}

/** Действующий договор между двумя странами (мир или союз) в текущем году. */
export function treatyBetween(s: GameState, a: number, b: number, year = s.year): Treaty | undefined {
  return (s.treaties ?? []).find(
    (t) => ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && t.start <= year && year <= t.until,
  );
}

/** Союз в этом году против цели target (если есть). */
export function allianceAgainst(s: GameState, a: number, target: number, year = s.year): Treaty | undefined {
  return (s.treaties ?? []).find(
    (t) => t.kind === 'alliance' && t.target === target && (t.a === a || t.b === a) && t.start <= year && year <= t.until,
  );
}

export function partnerOf(t: Treaty, id: number): number {
  return t.a === id ? t.b : t.a;
}

/** Текст договора/предложения с точки зрения viewer. */
export function dealText(s: GameState, d: Deal | Treaty, viewer: number): string {
  const name = (id: number) => s.countries[id].name;
  if ('from' in d && d.kind === 'gift') return d.payer === viewer ? `Подарок ${fmtShort(d.once)}` : `Дарят вам ${fmtShort(d.once)}`;
  const other = 'from' in d ? (d.from === viewer ? d.to : d.from) : partnerOf(d, viewer);
  if (d.kind === 'alliance') return `Совместный поход на государство ${name(d.target!)} в этом году`;
  const yrs = 'from' in d ? d.years : d.until - d.start + 1;
  let s1 = `Мир на ${yearsText(yrs)}`;
  const pay: string[] = [];
  if ('once' in d && d.once > 0) pay.push(`разово ${fmtShort(d.once)}`);
  if (d.yearly > 0) pay.push(`дань ${fmtShort(d.yearly)} в год`);
  if (pay.length && d.payer != null) s1 += d.payer === viewer ? ` — вы платите: ${pay.join(' + ')}` : ` — вам платят: ${pay.join(' + ')}`;
  void other;
  return s1;
}

function note(report: YearReport | null, s: GameState, id: number, text: string, good: boolean | null): void {
  if (report && s.countries[id].controller === 'human') report.events.push({ country: id, text, good });
}

/**
 * Заключить договор по согласованному предложению: проверить деньги, перевести разовую плату,
 * создать договор. Возвращает false, если сделка уже невозможна.
 */
export function applyDeal(s: GameState, d: Deal, report: YearReport | null = null): boolean {
  const A = s.countries[d.from];
  const Bc = s.countries[d.to];
  if (!A?.alive || !Bc?.alive || d.from === d.to) return false;
  if (d.payer != null && d.once > 0) {
    const payer = s.countries[d.payer];
    if (payer.money < d.once) return false;
  }
  if (d.kind === 'alliance' && (d.target == null || !s.countries[d.target]?.alive)) return false;
  if (d.kind === 'peace' && treatyBetween(s, d.from, d.to)?.kind === 'peace') return false;

  if (d.payer != null && d.once > 0) {
    const receiver = d.payer === d.from ? d.to : d.from;
    s.countries[d.payer].money -= d.once;
    s.countries[receiver].money += d.once;
  }
  const income = (id: number) => Math.max(1, s.countries[id].population * 0.4);
  if (d.kind === 'gift') {
    const receiver = d.payer === d.from ? d.to : d.from;
    addRel(s, d.from, d.to, Math.min(40, (100 * d.once) / income(receiver)));
    note(report, s, d.to, `Государство ${A.name} прислало подарок: ${fmtShort(d.once)}`, true);
    return true;
  }
  const t: Treaty = {
    id: s.nextDealId++,
    kind: d.kind,
    a: d.from,
    b: d.to,
    start: s.year,
    until: s.year + Math.max(1, d.years) - 1,
    payer: d.payer,
    yearly: d.yearly,
    target: d.target,
    ending: false,
  };
  // Новый мир заменяет старый договор между этими странами
  s.treaties = s.treaties.filter((x) => !(x.kind === 'peace' && d.kind === 'peace' && ((x.a === t.a && x.b === t.b) || (x.a === t.b && x.b === t.a))));
  s.treaties.push(t);
  addRel(s, d.from, d.to, d.kind === 'alliance' ? 15 : 10);
  for (const id of [d.from, d.to]) {
    const other = id === d.from ? Bc : A;
    note(report, s, id, `Заключён договор с государством ${other.name}: ${dealText(s, t, id)}`, true);
  }
  return true;
}

/**
 * Перед обработкой года: договорённости игроков (с компьютером они уже согласованы),
 * принятые входящие предложения, расторжения. Возвращает новое состояние.
 */
export function applyDiplomacy(prev: GameState, orders: Record<number, Orders>): GameState {
  const s: GameState = ensureDiplomacy(structuredClone(prev));
  // События попадут в итоги этого года (их заберёт resolveTurn)
  const report: YearReport = { year: s.year, battles: [], events: [], eliminated: [], price: 0, supply: 0, demand: 0 };
  for (const [idStr, o] of Object.entries(orders)) {
    const id = Number(idStr);
    const dip = o.diplomacy;
    if (!dip || !s.countries[id]?.alive) continue;
    for (const tid of dip.cancel ?? []) {
      const t = s.treaties.find((x) => x.id === tid && (x.a === id || x.b === id));
      if (t && !t.ending) {
        t.until = Math.min(t.until, s.year);
        t.ending = true;
      }
    }
    for (const oid of dip.accept ?? []) {
      const d = s.offers.find((x) => x.id === oid && x.to === id);
      if (d) applyDeal(s, d, report);
    }
    for (const d of dip.deals ?? []) {
      if (d.from !== id) continue;
      if (s.countries[d.to]?.controller === 'human') {
        // Другому человеку — предложение на следующий год
        s.offers.push({ ...d, id: s.nextDealId++, year: s.year + 1 });
      } else applyDeal(s, { ...d, id: s.nextDealId++ }, report);
    }
  }
  // Отклонённые предложения: отвергнутый ультиматум злит, остальные слегка охлаждают
  for (const d of s.offers) {
    if (d.year !== s.year) continue;
    const accepted = orders[d.to]?.diplomacy?.accept?.includes(d.id);
    if (accepted || !s.countries[d.to]?.alive) continue;
    addRel(s, d.from, d.to, d.ultimatum ? -30 : -5);
    if (d.ultimatum) note(report, s, d.to, `Мы отвергли ультиматум государства ${s.countries[d.from].name} — жди нападения`, false);
  }
  // Предложения этого года отработаны; остаются только адресованные на следующий
  s.offers = s.offers.filter((x) => x.year > s.year);
  s.pendingEvents = [...(s.pendingEvents ?? []), ...report.events];
  return s;
}

/** Нападение на партнёра по договору — предательство. */
export function onBetrayal(s: GameState, report: YearReport, attacker: number, victim: number, t: Treaty): void {
  s.treaties = s.treaties.filter((x) => x !== t);
  s.honor[attacker] = Math.max(0, honorOf(s, attacker) - DIP.betrayHonor);
  addRel(s, attacker, victim, -DIP.betrayRelVictim);
  for (const c of s.countries) if (c.alive && c.id !== attacker && c.id !== victim) addRel(s, attacker, c.id, -DIP.betrayRelOthers);
  const A = s.countries[attacker].name;
  const V = s.countries[victim].name;
  report.events.push({ country: -1, text: `Государство ${A} нарушило договор и напало на государство ${V}!`, good: false });
  note(report, s, victim, `Предательство! Государство ${A} нарушило договор и напало на нас`, false);
  note(report, s, attacker, `Мы нарушили договор с государством ${V}. Честь потеряна — с нами долго не захотят договариваться`, false);
}

/** Ежегодно после войны и хозяйства: дань, обязательства союзников, истечение договоров, отношения, честь. */
export function yearlyDiplomacy(s: GameState, report: YearReport): void {
  ensureDiplomacy(s);
  const n = s.countries.length;

  // Отношения: сражения портят, общий враг сближает
  const attackedBy = new Map<number, Set<number>>();
  for (const b of report.battles) {
    addRel(s, b.attacker, b.defender, -DIP.attackRel);
    if (!attackedBy.has(b.attacker)) attackedBy.set(b.attacker, new Set());
    attackedBy.get(b.attacker)!.add(b.defender);
  }
  for (const victims of attackedBy.values()) {
    const v = [...victims];
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) addRel(s, v[i], v[j], 5);
  }

  for (const t of [...s.treaties]) {
    if (t.start > s.year || t.until < s.year) continue;
    const A = s.countries[t.a];
    const Bc = s.countries[t.b];
    if (!A.alive || !Bc.alive) {
      s.treaties = s.treaties.filter((x) => x !== t);
      continue;
    }
    // Дань
    if (t.kind === 'peace' && t.payer != null && t.yearly > 0) {
      const payer = s.countries[t.payer];
      const receiver = s.countries[partnerOf(t, t.payer)];
      if (payer.money >= t.yearly) {
        payer.money -= t.yearly;
        receiver.money += t.yearly;
        note(report, s, payer.id, `Уплачена дань государству ${receiver.name}: ${fmtShort(t.yearly)}`, null);
        note(report, s, receiver.id, `Государство ${payer.name} заплатило дань: ${fmtShort(t.yearly)}`, true);
      } else {
        s.treaties = s.treaties.filter((x) => x !== t);
        s.honor[payer.id] = Math.max(0, honorOf(s, payer.id) - DIP.unpaidHonor);
        addRel(s, payer.id, receiver.id, -40);
        report.events.push({ country: -1, text: `Государство ${payer.name} не смогло заплатить дань — мир с ${receiver.name} расторгнут`, good: false });
        continue;
      }
    }
    if (t.kind === 'peace') addRel(s, t.a, t.b, DIP.peaceRelPerYear);
    // Совместный поход: кто не выступил против цели — подвёл союзника
    if (t.kind === 'alliance' && t.target != null && s.countries[t.target].alive) {
      const went = (id: number) =>
        report.battles.some((b) => (b.attacker === id && b.defender === t.target) || (b.field && b.defender === id && b.attacker === t.target));
      for (const [x, y] of [
        [t.a, t.b],
        [t.b, t.a],
      ]) {
        if (!went(x) && went(y)) {
          addRel(s, x, y, -30);
          note(report, s, y, `Союзник ${s.countries[x].name} не выступил против государства ${s.countries[t.target].name}`, false);
          note(report, s, x, `Мы не выступили в обещанный поход — государство ${s.countries[y].name} недовольно`, false);
        }
      }
    }
  }

  // Истечение договоров
  for (const t of [...s.treaties]) {
    if (t.until > s.year) continue;
    s.treaties = s.treaties.filter((x) => x !== t);
    if (t.kind === 'peace') {
      for (const id of [t.a, t.b]) {
        const other = s.countries[partnerOf(t, id)];
        note(report, s, id, t.ending ? `Договор с государством ${other.name} расторгнут` : `Мирный договор с государством ${other.name} закончился`, null);
      }
    }
  }

  // Отношения понемногу остывают к нейтральным, честь восстанавливается
  for (let i = 0; i < n * n; i++) s.relations[i] *= DIP.drift;
  for (let i = 0; i < n; i++) s.honor[i] = Math.min(100, honorOf(s, i) + DIP.honorRegen);
}
