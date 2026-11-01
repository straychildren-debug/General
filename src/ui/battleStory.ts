// Описание хода сражения. Исход и потери посчитаны ядром игры; здесь они раскладываются
// по этапам боя (с ростом потерь и падением морали), чтобы было видно, как шла битва.
import { fmt } from '../core/format';
import { hash01, Rng } from '../core/rng';
import type { BattleReport, GameState } from '../core/types';

export interface Round {
  lines: { text: string; tone?: 'a' | 'd' | 'loss' | 'note' }[];
  aArmy: number;
  dArmy: number;
  aMorale: number;
  dMorale: number;
}

export interface Story {
  intro: { text: string; tone?: 'good' | 'bad' | 'note' }[];
  rounds: Round[];
  start: { aArmy: number; dArmy: number; aMorale: number; dMorale: number };
}

function startMorale(exp: number | null, m: number): number {
  const base = exp == null ? 55 : 70 + Math.min(28, exp / 4);
  return Math.round(Math.min(99, base * m));
}

/** Делим total на n частей со случайными весами. */
function split(rng: Rng, total: number, n: number, rising: boolean): number[] {
  const w = Array.from({ length: n }, (_, k) => (0.6 + rng.next()) * (rising ? 0.7 + (k / Math.max(1, n - 1)) * 0.8 : 1));
  const s = w.reduce((a, b) => a + b, 0);
  const parts = w.map((x) => Math.floor((x / s) * total));
  parts[n - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

export function battleStory(game: GameState, b: BattleReport): Story {
  const A = game.countries[b.attacker];
  const D = game.countries[b.defender];
  const det = b.details;
  const seed = det?.seed ?? Math.floor(hash01(b.attacker, b.defender, b.attackerSoldiers, b.defenderSoldiers) * 1e9);
  const rng = new Rng(seed);
  const r = Math.min(b.attackerStrength, b.defenderStrength) / Math.max(b.attackerStrength, b.defenderStrength);
  const n = Math.max(3, Math.min(8, 2 + Math.round(r * 5) + rng.int(0, 1)));

  const aExp = det?.atk.exp ?? null;
  const dExp = det ? det.def.exp : null;
  const aM0 = startMorale(aExp, det?.atk.morale ?? 1);
  const dM0 = startMorale(b.defenderGeneral ? dExp : null, det?.def.morale ?? 1);
  const aWon = b.attackerWon;
  const aEnd = aWon ? aM0 - rng.int(5, 25) : rng.int(12, 30);
  const dEnd = aWon ? rng.int(10, 28) : dM0 - rng.int(5, 25);

  const aLoss = split(rng, b.attackerLosses, n, !aWon);
  const dLoss = split(rng, b.defenderLosses, n, aWon);

  const intro: Story['intro'] = [];
  if (b.field) intro.push({ text: `Армии государств ${A.name} и ${D.name} двинулись друг на друга и встретились в поле.` });
  else intro.push({ text: `Государство ${A.name} напало на государство ${D.name}.` });
  intro.push({ text: `Командовать атакующими войсками будет ${b.attackerGeneral}${aExp != null ? ` (опыт ${aExp})` : ''}.` });
  if (b.defenderGeneral) {
    intro.push({ text: `Командовать войсками обороны будет ${b.defenderGeneral}${dExp != null ? ` (опыт ${dExp})` : ''}.` });
    if (det && det.def.gen >= 1.3)
      intro.push({ text: 'Он хорошо подготовил войска к защите, так что нападающим не позавидуешь!', tone: 'good' });
  } else {
    intro.push({ text: 'Обороной никто не командует — гарнизон воюет вполсилы!', tone: 'bad' });
  }
  if (det && !b.field) {
    if (det.def.fort > 0) intro.push({ text: `Защитники укрылись за укреплениями ${det.def.fort}-го уровня.`, tone: 'note' });
    if (det.def.terrain >= 1.3) intro.push({ text: 'Граница проходит по холмам и горам — наступать тяжело.', tone: 'note' });
    else if (det.def.terrain >= 1.12) intro.push({ text: 'Граница поросла лесами — удобно обороняться.', tone: 'note' });
    if (det.def.front < 0.98)
      intro.push({
        text: `На этом участке границы стоит ${Math.round(det.def.front * 100)}% гарнизона (${fmt(b.defenderSoldiers)} из ${fmt(det.def.total)}), остальные стерегут другие границы.`,
        tone: 'note',
      });
  }
  const ratio = b.attackerStrength / Math.max(1, b.defenderStrength);
  if (ratio > 2.2) intro.push({ text: 'Силы явно неравны — у нападающих огромный перевес.', tone: 'note' });
  else if (ratio < 0.45) intro.push({ text: 'Нападающие явно переоценили свои силы.', tone: 'note' });
  else if (r > 0.85) intro.push({ text: 'Силы почти равны — исход решат мелочи.', tone: 'note' });

  const fort = det?.def.fort ?? 0;
  const terr = det?.def.terrain ?? 1;
  const aOrders = b.field
    ? ['Всем в атаку', 'Обойти с фланга', 'Конница — вперёд', 'Лучникам — залп']
    : [
        'Всем в атаку',
        'Обойти с фланга',
        'Конница — вперёд',
        'Обстрелять позиции',
        ...(fort > 0 ? ['Штурмовать укрепления'] : []),
        ...(terr >= 1.3 ? ['Пробиваться через перевалы'] : []),
      ];
  const dOrders = b.field
    ? ['Держать строй', 'Контратака', 'Конница — вперёд', 'Лучникам — залп']
    : [
        'Держать оборону',
        'Контратака',
        'Лучникам — залп',
        ...(fort > 0 ? ['Огонь со стен'] : []),
        ...(terr >= 1.12 ? ['Засада'] : []),
      ];

  const rounds: Round[] = [];
  let aArmy = b.attackerSoldiers;
  let dArmy = b.defenderSoldiers;
  for (let k = 0; k < n; k++) {
    const lines: Round['lines'] = [];
    const t = (k + 1) / n;
    const aMor = Math.round(aM0 + (aEnd - aM0) * t * (0.8 + rng.next() * 0.2));
    const dMor = Math.round(dM0 + (dEnd - dM0) * t * (0.8 + rng.next() * 0.2));
    const aGood = aLoss[k] / Math.max(1, aArmy) < dLoss[k] / Math.max(1, dArmy);
    const last = k === n - 1;

    lines.push({ text: `День ${k + 1}. Ходит ${A.name}.`, tone: 'a' });
    const ao = rng.pick(aOrders);
    lines.push({ text: `Приказ — ${ao}.`, tone: 'note' });
    if (k === 0 && ratio > 2) lines.push({ text: 'Генерал бросил в бой все силы, не давая противнику опомниться.' });
    else if (aGood) lines.push({ text: rng.pick(['Удар достиг цели.', 'Атака удалась.', 'Ряды противника смешались.', 'Враг понёс тяжёлые потери.']) });
    else lines.push({ text: rng.pick(['Атака захлебнулась.', 'Противник встретил наступающих плотным огнём.', 'Удар не принёс успеха.']) });

    lines.push({ text: `Ходит ${D.name}.`, tone: 'd' });
    const dor = rng.pick(dOrders);
    lines.push({ text: `Приказ — ${dor}.`, tone: 'note' });
    if (!aGood) lines.push({ text: rng.pick(['Оборона держится стойко.', 'Защитники отбросили врага.', 'Контрудар застал нападающих врасплох.']) });
    else lines.push({ text: rng.pick(['Защитники с трудом сдерживают натиск.', 'Оборона трещит по швам.', 'Пришлось отступить на вторую линию.']) });

    aArmy -= aLoss[k];
    dArmy -= dLoss[k];
    lines.push({ text: `Потери: ${A.name} — ${fmt(aLoss[k])}, ${D.name} — ${fmt(dLoss[k])}.`, tone: 'loss' });

    if (last) {
      if (b.field) {
        lines.push({
          text: aWon ? `Армия государства ${D.name} дрогнула и отступила. Поле боя за ${A.name}!` : `Армия государства ${A.name} дрогнула и отступила. Поле боя за ${D.name}!`,
        });
      } else if (aWon) {
        lines.push({ text: `Оборона прорвана! Войска государства ${A.name} входят в земли противника.` });
      } else {
        lines.push({ text: `Мораль нападающих упала, и они отступили. Государство ${D.name} отстояло свои земли.` });
      }
    }
    rounds.push({ lines, aArmy: Math.max(0, aArmy), dArmy: Math.max(0, dArmy), aMorale: aMor, dMorale: dMor });
  }
  return { intro, rounds, start: { aArmy: b.attackerSoldiers, dArmy: b.defenderSoldiers, aMorale: aM0, dMorale: dM0 } };
}
