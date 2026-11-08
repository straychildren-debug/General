// Полное донесение о сражении. Исход, потери и захват посчитаны ядром игры; здесь они
// раскладываются на рода войск и дни боя и описываются словами. Состав войск — шаблон,
// зависящий от уровня военной мощи (чем выше уровень, тем «новее» эпоха вооружения).
import { fmt, fmtShort, years } from '../core/format';
import { Rng } from '../core/rng';
import type { BattleReport, GameState } from '../core/types';
import { battleStory } from './battleStory';
import type { IconName } from './icons';

export type UnitKey = 'inf' | 'rng' | 'cav' | 'art' | 'mil';

export interface Unit {
  key: UnitKey;
  name: string;
  icon: IconName;
  count: number;
  lost: number;
}

export interface SideInfo {
  id: number;
  role: 'attack' | 'defend';
  general: string | null;
  exp: number | null;
  age?: number;
  speed?: number;
  level?: number;
  expGain?: number;
  died: boolean;
  units: Unit[];
  total: number;
  lost: number;
  morale0: number;
  moraleEnd: number;
}

export interface Line {
  text: string;
  tone?: 'a' | 'd' | 'note' | 'good' | 'bad' | 'quote';
}

export interface Day {
  title: string;
  weather?: string;
  lines: Line[];
  aLoss: number;
  dLoss: number;
  aArmy: number;
  dArmy: number;
  aMorale: number;
  dMorale: number;
}

export interface Chronicle {
  intro: Line[];
  a: SideInfo;
  d: SideInfo;
  days: Day[];
  outcome: Line[];
  terrain: string;
  /** С точки зрения зрителя: true — победа, false — поражение, null — чужой бой */
  good: boolean | null;
}

interface Era {
  inf: string;
  rng: string;
  cav: string;
  art: string | null;
  rngAct: string; // «осыпали стрелами ряды» + кого (род. падеж)
  artAct: string; // «метали камни в ряды» + кого
}

/** Вооружение по уровню военной мощи. Названия — во мн. числе, со строчной буквы. */
const ERAS: { min: number; era: Era }[] = [
  { min: 0, era: { inf: 'копейщики', rng: 'лучники', cav: 'всадники', art: null, rngAct: 'осыпали стрелами ряды', artAct: '' } },
  { min: 2, era: { inf: 'латники', rng: 'арбалетчики', cav: 'рыцари', art: 'катапульты', rngAct: 'засыпали болтами ряды', artAct: 'метали камни в ряды' } },
  { min: 4, era: { inf: 'пикинёры', rng: 'мушкетёры', cav: 'кирасиры', art: 'бомбарды', rngAct: 'дали залп по рядам', artAct: 'ударили по позициям' } },
  { min: 6, era: { inf: 'гренадеры', rng: 'стрелки', cav: 'драгуны', art: 'пушки', rngAct: 'открыли частый огонь по рядам', artAct: 'накрыли картечью позиции' } },
  { min: 9, era: { inf: 'гвардейцы', rng: 'егеря', cav: 'гусары', art: 'батареи', rngAct: 'встретили залпами ряды', artAct: 'обрушили огонь на позиции' } },
];

function eraOf(level: number): Era {
  let e = ERAS[0].era;
  for (const x of ERAS) if (level >= x.min) e = x.era;
  return e;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Как называть стороны в тексте: «наши / вражеские» для игрока, нейтрально — для наблюдателя. */
interface Voice {
  adj: string; // «наши» (с прилагательным согласуются названия во мн. ч.)
  gen: string; // «противника» — когда эту сторону атакуют
}

function voices(b: BattleReport, viewer: number | null): { A: Voice; D: Voice } {
  const we = { adj: 'наши', gen: 'наших войск' };
  const they = { adj: 'вражеские', gen: 'противника' };
  if (viewer === b.attacker) return { A: we, D: they };
  if (viewer === b.defender) return { A: they, D: we };
  return { A: { adj: 'атакующие', gen: 'атакующих' }, D: { adj: 'обороняющиеся', gen: 'защитников' } };
}

/** Раскладываем армию по родам войск. */
function compose(rng: Rng, total: number, level: number, speed: number | undefined, defending: boolean, militia: number): Unit[] {
  const e = eraOf(level);
  const w = {
    inf: 0.42 + rng.next() * 0.14 + (defending ? 0.06 : 0),
    rng: 0.18 + rng.next() * 0.1,
    cav: 0.12 + rng.next() * 0.1 + (speed ?? 3) * 0.012 - (defending ? 0.04 : 0),
    art: e.art ? 0.03 + rng.next() * 0.05 : 0,
  };
  const s = w.inf + w.rng + w.cav + w.art;
  const units: Unit[] = [];
  let left = total;
  const push = (key: UnitKey, name: string, icon: IconName, f: number) => {
    const n = Math.round((total * f) / s / 10) * 10;
    if (n <= 0) return;
    units.push({ key, name, icon, count: n, lost: 0 });
    left -= n;
  };
  push('cav', e.cav, 'horse', w.cav);
  push('rng', e.rng, 'bow', w.rng);
  if (e.art) push('art', e.art, 'cannon', w.art);
  // Остаток — пехоте, чтобы сумма сошлась точно
  units.unshift({ key: 'inf', name: e.inf, icon: 'shield', count: Math.max(0, left), lost: 0 });
  if (militia > 0) units.push({ key: 'mil', name: 'ополченцы', icon: 'people', count: militia, lost: 0 });
  return units.filter((u) => u.count > 0);
}

/** Распределяем потери по родам войск (конница и пехота гибнут чаще, артиллерия — реже). */
function spreadLosses(rng: Rng, units: Unit[], lost: number, won: boolean): void {
  const base: Record<UnitKey, number> = { inf: 1.1, rng: 0.8, cav: won ? 0.9 : 1.3, art: 0.45, mil: 0.6 };
  const regular = units.filter((u) => u.key !== 'mil');
  const wts = regular.map((u) => u.count * base[u.key] * (0.75 + rng.next() * 0.5));
  const sum = wts.reduce((a, b) => a + b, 0) || 1;
  let left = lost;
  regular.forEach((u, k) => {
    const n = k === regular.length - 1 ? left : Math.min(u.count, Math.round((lost * wts[k]) / sum));
    u.lost = Math.max(0, Math.min(u.count, n));
    left -= u.lost;
  });
  // Если последнему роду не хватило «места» — добираем с остальных
  for (const u of regular) {
    if (left <= 0) break;
    const add = Math.min(left, u.count - u.lost);
    u.lost += add;
    left -= add;
  }
  const mil = units.find((u) => u.key === 'mil');
  if (mil) mil.lost = Math.round(mil.count * (won ? 0.04 : 0.15) * (0.6 + rng.next() * 0.8));
}

function pickUnit(rng: Rng, units: Unit[], prefer?: UnitKey[]): Unit {
  const pool = units.filter((u) => u.key !== 'mil' && u.count - u.lost > 0);
  const list = pool.length ? pool : units;
  if (prefer) {
    const p = list.filter((u) => prefer.includes(u.key));
    if (p.length && rng.chance(0.7)) return rng.pick(p);
  }
  const tot = list.reduce((a, u) => a + u.count, 0);
  let r = rng.next() * tot;
  for (const u of list) {
    r -= u.count;
    if (r <= 0) return u;
  }
  return list[0];
}

function attackLine(rng: Rng, u: Unit, era: Era, S: Voice, O: Voice): string {
  const who = `${cap(S.adj)} ${u.name}`;
  switch (u.key) {
    case 'rng':
      return `${who} ${era.rngAct} ${O.gen}.`;
    case 'cav':
      return rng.pick([`${who} ударили во фланг ${O.gen}.`, `${who} попытались прорваться в тыл ${O.gen}.`, `${who} лавиной понеслись на позиции ${O.gen}.`]);
    case 'art':
      return `${who} ${era.artAct} ${O.gen}.`;
    default:
      return rng.pick([`${who} сомкнутым строем двинулись на позиции ${O.gen}.`, `${who} пошли в лобовую атаку на позиции ${O.gen}.`, `${who} навалились на позиции ${O.gen} по всему фронту.`]);
  }
}

function defendLine(rng: Rng, u: Unit, era: Era, S: Voice, O: Voice, field: boolean): string {
  const who = `${cap(S.adj)} ${u.name}`;
  switch (u.key) {
    case 'rng':
      return `${who} ${era.rngAct} ${O.gen}${field ? '' : ' с заранее подготовленных позиций'}.`;
    case 'cav':
      return rng.pick([`${who} контратаковали во фланг ${O.gen}.`, `${who} ударили по растянувшимся колоннам ${O.gen}.`]);
    case 'art':
      return `${who} ${era.artAct} ${O.gen}.`;
    default:
      return rng.pick([`${who} стойко держали строй.`, `${who} отбивались, не уступая ни шагу.`, `${who} бросились в контратаку.`]);
  }
}

const GOOD = (O: Voice) => [`Удар достиг цели — строй ${O.gen} дрогнул.`, `Атака удалась: ряды ${O.gen} заметно поредели.`, `Ряды ${O.gen} смешались.`, 'Натиск оказался неудержим.'];
const BAD = ['Атака захлебнулась.', 'Наступающих встретили плотным огнём и отбросили назад.', 'Удар не принёс успеха.', 'Пришлось отойти на исходные позиции.'];
const HOLD = ['Оборона выстояла.', 'Натиск удалось отбить.', 'Защитники отбросили наступающих.'];
const CRACK = ['Оборона трещит по швам.', 'Пришлось отступить на вторую линию.', 'Защитники с трудом сдерживают натиск.'];
const WEATHER = ['С утра лил дождь, поле превратилось в грязь.', 'Над полем стоял густой туман.', 'Стояла изнуряющая жара.', 'Дул сильный ветер.', 'Ночью ударил мороз.'];
const SHOUTS = ['«Ни шагу назад!»', '«За мной, братцы!»', '«Сегодня решится судьба нашей земли!»', '«Держать строй!»', '«Вперёд, и победа будет за нами!»'];

function terrainWord(t: number, field: boolean): string {
  if (field) return 'открытое поле';
  if (t >= 1.3) return 'горы и холмы';
  if (t >= 1.12) return 'лесистая граница';
  return 'равнина';
}

export function battleChronicle(game: GameState, b: BattleReport, viewer: number | null): Chronicle {
  const A = game.countries[b.attacker];
  const D = game.countries[b.defender];
  const det = b.details;
  const story = battleStory(game, b);
  const rng = new Rng(((det?.seed ?? 12345) ^ 0x5bd1e995) >>> 0);
  const { A: VA, D: VD } = voices(b, viewer);
  const aLevel = det?.atk.level ?? 0;
  const dLevel = det?.def.level ?? 0;
  const eA = eraOf(aLevel);
  const eD = eraOf(dLevel);
  const militia = det?.def.militia ?? 0;
  const aWon = b.attackerWon;

  const aUnits = compose(rng, b.attackerSoldiers, aLevel, det?.atk.speed, false, 0);
  const dUnits = compose(rng, b.defenderSoldiers, dLevel, det?.def.speed, true, militia);
  spreadLosses(rng, aUnits, b.attackerLosses, aWon);
  spreadLosses(rng, dUnits, b.defenderLosses, !aWon);

  const last = story.rounds[story.rounds.length - 1];
  const a: SideInfo = {
    id: A.id,
    role: 'attack',
    general: b.attackerGeneral,
    exp: det?.atk.exp ?? null,
    age: det?.atk.age,
    speed: det?.atk.speed,
    level: det?.atk.level,
    expGain: det?.atk.expGain,
    died: b.generalLost === 'attacker',
    units: aUnits,
    total: b.attackerSoldiers,
    lost: b.attackerLosses,
    morale0: story.start.aMorale,
    moraleEnd: last?.aMorale ?? story.start.aMorale,
  };
  const d: SideInfo = {
    id: D.id,
    role: 'defend',
    general: b.defenderGeneral,
    exp: b.defenderGeneral ? (det?.def.exp ?? null) : null,
    age: det?.def.age,
    speed: det?.def.speed,
    level: det?.def.level,
    expGain: det?.def.expGain,
    died: b.generalLost === 'defender',
    units: dUnits,
    total: b.defenderSoldiers + militia,
    lost: b.defenderLosses + (dUnits.find((u) => u.key === 'mil')?.lost ?? 0),
    morale0: story.start.dMorale,
    moraleEnd: last?.dMorale ?? story.start.dMorale,
  };

  const terrainT = det?.def.terrain ?? 1;
  const terrain = terrainWord(terrainT, b.field);

  // ── Вступление ──
  const intro: Line[] = [];
  if (b.field) intro.push({ text: `Армии государств ${A.name} и ${D.name} выступили друг другу навстречу и сошлись в открытом поле.` });
  else intro.push({ text: `Войска государства ${A.name} перешли границу государства ${D.name}.` });
  if (!b.field) {
    if (terrainT >= 1.3) intro.push({ text: 'Граница проходит по горам и холмам — наступать придётся по узким тропам и перевалам.', tone: 'note' });
    else if (terrainT >= 1.12) intro.push({ text: 'Граница поросла густыми лесами — защитникам есть где укрыться.', tone: 'note' });
    else intro.push({ text: 'Бой развернулся на равнине — укрыться негде ни тем, ни другим.', tone: 'note' });
  }
  intro.push({ text: `Наступление возглавил генерал ${b.attackerGeneral}${a.age ? ` (${years(a.age)})` : ''}.` });
  if (rng.chance(0.6)) intro.push({ text: `Перед боем он обратился к войскам: ${rng.pick(SHOUTS)}`, tone: 'quote' });
  if (b.defenderGeneral) {
    intro.push({ text: `${b.field ? 'Навстречу армию вёл' : 'Оборону держал'} генерал ${b.defenderGeneral}${d.age ? ` (${years(d.age)})` : ''}.` });
    if (det && !b.field && det.def.gen >= 1.3) intro.push({ text: 'Опытный командир заранее подготовил позиции — нападающим не позавидуешь.', tone: 'note' });
  } else {
    intro.push({ text: 'Обороной никто не командовал — гарнизон воевал вполсилы.', tone: 'bad' });
  }
  if (b.defenderSoldiers === 0 && !b.field) intro.push({ text: 'Регулярной армии у защитников не было — землю защищало только ополчение.', tone: 'bad' });
  else if (det && !b.field && det.def.front < 0.98 && det.def.total > 0)
    intro.push({
      text: `На этом участке стояло ${Math.round(det.def.front * 100)}% гарнизона (${fmt(b.defenderSoldiers)} из ${fmt(det.def.total)}) — остальные стерегли другие границы.`,
      tone: 'note',
    });
  if (militia > 0) intro.push({ text: `На помощь солдатам вышло ополчение из окрестных деревень — ${fmt(militia)} чел.`, tone: 'note' });
  if (aLevel > dLevel + 1) intro.push({ text: `Нападающие вооружены заметно лучше: у них — ${eA.rng}, у защитников — ${eD.rng}.`, tone: 'note' });
  else if (dLevel > aLevel + 1) intro.push({ text: `Защитники вооружены заметно лучше: у них — ${eD.rng}, у нападающих — ${eA.rng}.`, tone: 'note' });
  const ratio = b.attackerStrength / Math.max(1, b.defenderStrength);
  const r = Math.min(ratio, 1 / Math.max(0.0001, ratio));
  if (ratio > 2.2) intro.push({ text: 'Силы явно неравны — у нападающих огромный перевес.', tone: 'note' });
  else if (ratio < 0.45) intro.push({ text: 'Нападающие явно переоценили свои силы.', tone: 'note' });
  else if (r > 0.85) intro.push({ text: 'Силы почти равны — исход решат мелочи.', tone: 'note' });

  // ── Дни сражения ──
  const days: Day[] = [];
  let prevA = story.start.aArmy;
  let prevD = story.start.dArmy;
  story.rounds.forEach((rd, k) => {
    const n = story.rounds.length;
    const aLoss = prevA - rd.aArmy;
    const dLoss = prevD - rd.dArmy;
    prevA = rd.aArmy;
    prevD = rd.dArmy;
    const lastDay = k === n - 1;
    // Чей день: по долям потерь; без регулярной армии у защитников и в последний день — по исходу боя
    let aGood = aLoss / Math.max(1, rd.aArmy + aLoss) < dLoss / Math.max(1, rd.dArmy + dLoss);
    if (b.defenderSoldiers === 0 || lastDay) aGood = aWon;
    const lines: Line[] = [];
    const weather = k === 0 ? 'Рассвет. Войска выстроились друг против друга.' : rng.chance(0.22) ? rng.pick(WEATHER) : undefined;

    const ua = pickUnit(rng, aUnits, k === 0 ? ['art', 'rng'] : undefined);
    lines.push({ text: attackLine(rng, ua, eA, VA, VD), tone: 'a' });
    if (k === 0 && ratio > 2 && aGood) lines.push({ text: 'Генерал бросил в бой все силы разом, не давая защитникам опомниться.' });
    else if (rng.chance(0.18)) lines.push({ text: `Генерал ${b.attackerGeneral} лично возглавил атаку.` });
    lines.push({ text: rng.pick(aGood ? GOOD(VD) : BAD), tone: aGood ? (viewer === b.defender ? 'bad' : 'good') : viewer === b.defender ? 'good' : 'bad' });

    const ud = pickUnit(rng, dUnits);
    lines.push({ text: defendLine(rng, ud, eD, VD, VA, b.field), tone: 'd' });
    if (!b.field && terrainT >= 1.3 && rng.chance(0.3)) lines.push({ text: 'Узкие перевалы не давали нападающим развернуться.', tone: 'note' });
    if (militia > 0 && rng.chance(0.2)) lines.push({ text: 'Ополченцы подносили припасы и чинили завалы.', tone: 'note' });
    lines.push({ text: rng.pick(aGood ? CRACK : HOLD), tone: aGood ? (viewer === b.defender ? 'bad' : 'good') : viewer === b.defender ? 'good' : 'bad' });

    if (lastDay) {
      if (b.field) lines.push({ text: aWon ? `Армия государства ${D.name} дрогнула и отступила. Поле боя осталось за государством ${A.name}.` : `Армия государства ${A.name} дрогнула и отступила. Поле боя осталось за государством ${D.name}.` });
      else if (aWon) lines.push({ text: `Оборона прорвана! Войска государства ${A.name} входят в земли противника.` });
      else lines.push({ text: `Боевой дух нападающих иссяк, и они отступили. Государство ${D.name} отстояло свои земли.` });
      if (b.generalLost === 'attacker') lines.push({ text: `Генерал ${b.attackerGeneral} пал в бою.`, tone: viewer === b.attacker ? 'bad' : 'good' });
      if (b.generalLost === 'defender') lines.push({ text: `Генерал ${b.defenderGeneral} пал в бою.`, tone: viewer === b.defender ? 'bad' : 'good' });
    }
    days.push({ title: `День ${k + 1}`, weather, lines, aLoss, dLoss, aArmy: rd.aArmy, dArmy: rd.dArmy, aMorale: rd.aMorale, dMorale: rd.dMorale });
  });

  // ── Итог ──
  const outcome: Line[] = [];
  const winner = aWon ? A : D;
  outcome.push({ text: `Сражение длилось ${days.length} ${dayWord(days.length)}. Победа за государством ${winner.name}.` });
  if (!b.field && aWon) {
    outcome.push({
      text: `Захвачено земли: ${b.cellsTaken} ${cellWord(b.cellsTaken)}${det?.popTaken ? `, на ней жили около ${fmt(Math.round(det.popTaken / 1000) * 1000)} человек` : ''}.`,
      tone: viewer === b.defender ? 'bad' : 'good',
    });
    if (b.capitalTaken) outcome.push({ text: `Взята столица государства ${D.name}!${det?.loot ? ` Добыча в казну: ${fmtShort(det.loot)}.` : ''}`, tone: viewer === b.defender ? 'bad' : 'good' });
    if (b.eliminated) outcome.push({ text: `Государство ${D.name} прекратило существование.`, tone: viewer === b.defender ? 'bad' : 'good' });
  }
  if (!b.field && !aWon) outcome.push({ text: 'Граница осталась прежней.' });
  return { intro, a, d, days, outcome, terrain, good: viewer == null || (viewer !== b.attacker && viewer !== b.defender) ? null : (viewer === b.attacker) === aWon };
}

export function dayWord(n: number): string {
  const a = n % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'дней';
  if (b === 1) return 'день';
  if (b >= 2 && b <= 4) return 'дня';
  return 'дней';
}

export function cellWord(n: number): string {
  const a = n % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'клеток';
  if (b === 1) return 'клетка';
  if (b >= 2 && b <= 4) return 'клетки';
  return 'клеток';
}
